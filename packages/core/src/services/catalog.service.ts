import { getCoreConfig } from "../config";
import { getDb, products, categories, productSupplierSnapshots } from "@arena/db";
import { and, eq } from "drizzle-orm";
import {
  calculateRetailMmk,
  calculateSellableStock,
  formatTelegramCustomEmoji,
  parseCustomEmoji,
  stripCustomEmojiPlaceholders,
  escapeHtml,
  findBrandEmojiId,
} from "@arena/shared";

export interface BotCategory {
  id: number;
  name: string;
  cleanName: string;
  emojiId: string | null;
  iconEmoji?: string | null;
  productsCount?: number;
}

export interface BotProduct {
  id: number;
  supplier?: string;
  upstreamProductId?: string | number;
  categoryId: number;
  name: string;
  cleanName: string;
  emojiId: string | null;
  description: string;
  formattedDescription: string;
  supplierPriceUsd: string;
  pricingTiers?: any;
  retailPriceMmk: number;
  formattedPriceMmk: string; // e.g. "3,900 Ks"
  stock: number;
  supplierStock: number;
  deliveryType: string;
  inStock: boolean;
}

export class BotCatalogService {
  private categoriesCache: BotCategory[] | null = null;
  private productsCache: BotProduct[] | null = null;
  private lastFetchedAt: number = 0;
  private readonly CACHE_TTL_MS = 15 * 1000; // 15 seconds cache
  private readonly MAX_STALE_TTL_MS = 30 * 60 * 1000; // 30 minutes max stale tolerance during outages

  /**
   * Formats MMK amount according to Option A requested by user: "<amount> Ks"
   */
  formatPrice(amountMmk: number): string {
    return `${amountMmk.toLocaleString("en-US")} Ks`;
  }

  private activeRefreshPromise: Promise<void> | null = null;

  /**
   * Fetches fresh catalog data from upstream XPro Partner API.
   */
  private async fetchUpstreamCatalog(): Promise<{ categories: BotCategory[]; products: BotProduct[] }> {
    const config = getCoreConfig();
    const baseUrl = (config.UPSTREAM_BASE_URL || "https://api.upstream.com").replace(/\/+$/, "");
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (config.UPSTREAM_API_KEY) {
      headers["Authorization"] = `Bearer ${config.UPSTREAM_API_KEY}`;
    }

    // Parallelize balance, categories, and products upstream requests
    const [balanceResResult, catResResult, prodResResult] = await Promise.allSettled([
      fetch(`${baseUrl}/balance`, {
        headers,
        signal: AbortSignal.timeout(2500),
      }),
      fetch(`${baseUrl}/catalog/categories`, {
        headers,
        signal: AbortSignal.timeout(2500),
      }),
      fetch(`${baseUrl}/catalog/products`, {
        headers,
        signal: AbortSignal.timeout(2500),
      }),
    ]);

    // 1. Parse wallet balance
    let walletBalanceUsd = 1.0;
    if (balanceResResult.status === "fulfilled" && balanceResResult.value.ok) {
      try {
        const balJson: any = await balanceResResult.value.json();
        if (balJson.ok && balJson.balance !== undefined) {
          walletBalanceUsd = parseFloat(String(balJson.balance)) || 0;
        }
      } catch {
        // Keep default
      }
    }

    // 2. Parse categories
    if (catResResult.status === "rejected") {
      throw catResResult.reason;
    }
    if (!catResResult.value.ok) {
      throw new Error(`Upstream categories failed with status ${catResResult.value.status}`);
    }
    const catJson: any = await catResResult.value.json();
    const rawCategories: any[] = Array.isArray(catJson.categories)
      ? catJson.categories
      : Array.isArray(catJson.data)
      ? catJson.data
      : [];

    const categories: BotCategory[] = rawCategories.map((c) => {
      const parsed = parseCustomEmoji(c.name || `Category ${c.categoryId || c.id}`);
      return {
        id: c.categoryId ?? c.id,
        name: c.name,
        cleanName: parsed.cleanText,
        emojiId: parsed.emojiId,
        productsCount: c.productsCount,
      };
    });

    // 3. Parse products
    if (prodResResult.status === "rejected") {
      throw prodResResult.reason;
    }
    if (!prodResResult.value.ok) {
      throw new Error(`Upstream products failed with status ${prodResResult.value.status}`);
    }
    const prodJson: any = await prodResResult.value.json();
    const rawProducts: any[] = Array.isArray(prodJson.products)
      ? prodJson.products
      : Array.isArray(prodJson.data)
      ? prodJson.data
      : [];

    const products: BotProduct[] = rawProducts.map((p) => {
      const usdPrice = parseFloat(String(p.price || 0));
      const pricing = calculateRetailMmk({
        upstreamUsdCost: usdPrice,
        exchangeRateMmk: config.DEFAULT_EXCHANGE_RATE_MMK ?? 4500,
        marginPercentage: config.DEFAULT_MARGIN_PERCENTAGE ?? 15,
      });
      const stockInfo = calculateSellableStock({
        supplierStock: p.stock || 0,
        supplierWalletBalanceUsd: walletBalanceUsd,
        unitCostUsd: usdPrice,
      });

      const parsed = parseCustomEmoji(p.name || `Product ${p.productId || p.id}`);
      const formattedDesc = p.description
        ? formatTelegramCustomEmoji(p.description, "✨")
        : "";

      return {
        id: p.productId ?? p.id,
        upstreamProductId: p.productId ?? p.id,
        categoryId: p.categoryId,
        name: p.name,
        cleanName: parsed.cleanText,
        emojiId:
          parsed.emojiId && /^\d+$/.test(parsed.emojiId)
            ? parsed.emojiId
            : findBrandEmojiId(p.name),
        description: p.description || "",
        formattedDescription: formattedDesc,
        supplierPriceUsd: usdPrice.toFixed(2),
        retailPriceMmk: pricing.retailPriceMmk,
        formattedPriceMmk: this.formatPrice(pricing.retailPriceMmk),
        stock: stockInfo.sellableStock,
        supplierStock: p.stock || 0,
        deliveryType: p.deliveryType || "CREDENTIALS",
        inStock: stockInfo.sellableStock > 0 && p.inStock !== false,
      };
    });

    return { categories, products };
  }

  private lastBalanceFetchedAt: Record<string, number> = { XPRO: 0, DIGITALCORE: 0 };
  private cachedWalletBalances: Record<string, number> = { XPRO: 0.0, DIGITALCORE: 0.0 };

  /**
   * Fetches the latest Upstream Partner wallet balance to constrain sellable stock per supplier.
   */
  private async getSupplierWalletBalance(supplier: string): Promise<number> {
    const config = getCoreConfig();
    const s = supplier.toUpperCase();
    const now = Date.now();
    if (now - (this.lastBalanceFetchedAt[s] || 0) < this.CACHE_TTL_MS) {
      return this.cachedWalletBalances[s] ?? 0.0;
    }

    if (s === "DIGITALCORE") {
      if (!config.DIGITALCORE_API_KEY) {
        return this.cachedWalletBalances.DIGITALCORE ?? 0.0;
      }
      try {
        const res = await fetch(`${(config.DIGITALCORE_BASE_URL || "https://api.digitalcore.com").replace(/\/+$/, "")}/api/user/me`, {
          headers: { "Api-Key": config.DIGITALCORE_API_KEY, Accept: "application/json" },
          signal: AbortSignal.timeout(2500),
        });
        if (res.ok) {
          const json: any = await res.json();
          const bal = json?.data?.balance ?? json?.balance;
          if (bal !== undefined) {
            this.cachedWalletBalances.DIGITALCORE = parseFloat(String(bal)) || 0;
            this.lastBalanceFetchedAt.DIGITALCORE = now;
            return this.cachedWalletBalances.DIGITALCORE;
          }
        }
      } catch {
        // Keep cached
      }
      return this.cachedWalletBalances.DIGITALCORE ?? 0.0;
    }

    // Default: XPro
    const baseUrl = (config.UPSTREAM_BASE_URL || "https://api.upstream.com").replace(/\/+$/, "");
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (config.UPSTREAM_API_KEY) {
      headers["Authorization"] = `Bearer ${config.UPSTREAM_API_KEY}`;
    }

    try {
      const balanceRes = await fetch(`${baseUrl}/balance`, {
        headers,
        signal: AbortSignal.timeout(2500),
      });
      if (balanceRes.ok) {
        const balJson: any = await balanceRes.json();
        if (balJson.ok && balJson.balance !== undefined) {
          this.cachedWalletBalances.XPRO = parseFloat(String(balJson.balance)) || 0;
          this.lastBalanceFetchedAt.XPRO = now;
          return this.cachedWalletBalances.XPRO;
        }
      }
    } catch {
      // Keep cached or default fallback
    }
    return this.cachedWalletBalances.XPRO ?? 0.0;
  }

  /**
   * Fetches catalog directly from PostgreSQL database where admin price overrides live.
   */
  private async fetchDatabaseCatalog(): Promise<{ categories: BotCategory[]; products: BotProduct[] } | null> {
    try {
      const db = getDb();
      const catRows = await db
        .select()
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(categories.sortOrder);

      const prodRows = await db
        .select({
          id: products.id,
          supplier: products.supplier,
          upstreamProductId: products.upstreamProductId,
          categoryId: products.categoryId,
          nameMmk: products.nameMmk,
          descriptionMmk: products.descriptionMmk,
          retailPriceMmk: products.retailPriceMmk,
          localStockLimit: products.localStockLimit,
          isActive: products.isActive,
          rawName: productSupplierSnapshots.rawName,
          supplierPriceUsd: productSupplierSnapshots.supplierPriceUsd,
          supplierStock: productSupplierSnapshots.supplierStock,
          deliveryType: productSupplierSnapshots.deliveryType,
          inStock: productSupplierSnapshots.inStock,
          rawDescription: productSupplierSnapshots.rawDescription,
          pricingTiers: productSupplierSnapshots.pricingTiers,
        })
        .from(products)
        .leftJoin(
          productSupplierSnapshots,
          and(
            eq(products.id, productSupplierSnapshots.productId),
            eq(products.supplier, productSupplierSnapshots.supplier)
          )
        )
        .where(eq(products.isActive, true));

      if (prodRows.length === 0) return null;

      // Query wallet balances per supplier to accurately calculate sellable capacity
      const [xproWalletBalanceUsd, dcWalletBalanceUsd] = await Promise.all([
        this.getSupplierWalletBalance("XPRO"),
        this.getSupplierWalletBalance("DIGITALCORE"),
      ]);

      const isNumericEmojiId = (val?: string | null): boolean =>
        Boolean(val && /^\d+$/.test(val.trim()));

      const catList: BotCategory[] = catRows.map((c) => {
        const parsed = parseCustomEmoji(c.name || `Category ${c.id}`);
        const emojiId = isNumericEmojiId(parsed.emojiId)
          ? parsed.emojiId
          : isNumericEmojiId(c.iconEmoji)
          ? c.iconEmoji
          : null;
        const iconEmoji =
          !emojiId && c.iconEmoji && c.iconEmoji !== "📁" ? c.iconEmoji : null;
        return {
          id: c.id,
          name: c.name,
          cleanName: parsed.cleanText,
          emojiId,
          iconEmoji,
        };
      });

      const prodList: BotProduct[] = prodRows.map((p) => {
        const displayName = p.rawName || p.nameMmk;
        const parsed = parseCustomEmoji(displayName);
        const descText = p.descriptionMmk || p.rawDescription || "";
        const formattedDesc = descText
          ? formatTelegramCustomEmoji(descText, "✨")
          : "";

        const pSupplier = (p.supplier || "XPRO").toUpperCase();
        const effectiveWalletBalance =
          pSupplier === "DIGITALCORE" ? dcWalletBalanceUsd : xproWalletBalanceUsd;

        const stockCalc = calculateSellableStock({
          supplierStock: p.supplierStock ?? 999,
          supplierWalletBalanceUsd: effectiveWalletBalance,
          unitCostUsd: p.supplierPriceUsd || "0.00",
          localLimit: p.localStockLimit,
        });

        const stock = stockCalc.sellableStock;

        return {
          id: p.id,
          supplier: p.supplier || "XPRO",
          upstreamProductId: p.upstreamProductId,
          categoryId: p.categoryId ?? 0,
          name: displayName,
          cleanName: parsed.cleanText,
          emojiId:
            parsed.emojiId && /^\d+$/.test(parsed.emojiId)
              ? parsed.emojiId
              : findBrandEmojiId(displayName),
          description: descText,
          formattedDescription: formattedDesc,
          supplierPriceUsd: p.supplierPriceUsd || "0.00",
          pricingTiers: p.pricingTiers,
          retailPriceMmk: p.retailPriceMmk,
          formattedPriceMmk: this.formatPrice(p.retailPriceMmk),
          stock,
          supplierStock: p.supplierStock || 999,
          deliveryType: p.deliveryType || "CREDENTIALS",
          inStock: stock > 0,
        };
      });

      return { categories: catList, products: prodList };
    } catch (err: any) {
      console.warn("[BotCatalogService] Database query skipped, falling back to upstream API:", err.message);
      return null;
    }
  }

  /**
   * Refreshes in-memory cache if expired (with in-flight deduplication against thundering herds).
   */
  private async ensureFreshCache(): Promise<void> {
    const now = Date.now();
    const isCacheFresh =
      this.categoriesCache &&
      this.productsCache &&
      now - this.lastFetchedAt < this.CACHE_TTL_MS;

    if (isCacheFresh) {
      return;
    }

    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
    }

    this.activeRefreshPromise = (async () => {
      try {
        // 1. Prioritize PostgreSQL Database in dev/prod (reflects real-time admin pricing changes instantly)
        if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
          const dbCatalog = await this.fetchDatabaseCatalog();
          if (dbCatalog && dbCatalog.products.length > 0) {
            this.categoriesCache = dbCatalog.categories;
            this.productsCache = dbCatalog.products;
            this.lastFetchedAt = Date.now();
            return;
          }
        }

        // 2. Fallback to direct Upstream Partner API
        const { categories, products } = await this.fetchUpstreamCatalog();
        if (products.length > 0) {
          this.categoriesCache = categories;
          this.productsCache = products;
          this.lastFetchedAt = Date.now();
        } else {
          throw new Error("Upstream returned empty catalog");
        }
      } catch (err: any) {
        console.error("[BotCatalogService] Failed to refresh catalog cache:", err.message);

        const isDevOrTest =
          process.env.NODE_ENV === "development" ||
          process.env.NODE_ENV === "test" ||
          Boolean(process.env.VITEST);

        const hasValidCache =
          this.categoriesCache !== null &&
          this.productsCache !== null &&
          this.productsCache.length > 0;

        const isWithinStaleGrace =
          hasValidCache && Date.now() - this.lastFetchedAt < this.MAX_STALE_TTL_MS;

        if (isWithinStaleGrace) {
          // Serve previous cache during temporary short-lived network glitches
          console.warn(
            `[BotCatalogService] Serving stale cache during upstream outage (age: ${Math.round((Date.now() - this.lastFetchedAt) / 1000)}s)`
          );
        } else if (isDevOrTest) {
          // In local dev/unit test environment only: provide mock fallback if no cache exists
          if (!hasValidCache) {
            this.categoriesCache = this.getFallbackCategories();
            this.productsCache = this.getFallbackProducts();
            this.lastFetchedAt = Date.now();
          }
        } else {
          // In Production with NO cache or EXPIRED cache (> 30m stale):
          // Refuse to inject fake saleable demo products!
          console.error(
            "[BotCatalogService] CRITICAL: Catalog unavailable in production. Refusing to inject demo products or serve expired cache."
          );
          this.categoriesCache = [];
          this.productsCache = [];
        }
      } finally {
        this.activeRefreshPromise = null;
      }
    })();

    return this.activeRefreshPromise;
  }

  async getCategories(): Promise<BotCategory[]> {
    await this.ensureFreshCache();
    const cats = this.categoriesCache || [];
    const prods = this.productsCache || [];
    // Only return categories that actually have active products
    const activeCatIds = new Set(prods.map((p) => p.categoryId));
    return cats.filter((c) => activeCatIds.has(c.id));
  }

  async getCategoryById(categoryId: number): Promise<BotCategory | null> {
    const cats = await this.getCategories();
    return cats.find((c) => c.id === categoryId) || null;
  }

  async getProductsByCategory(categoryId: number): Promise<BotProduct[]> {
    await this.ensureFreshCache();
    const prods = this.productsCache || [];
    return prods.filter((p) => p.categoryId === categoryId);
  }

  async getProductById(productId: number): Promise<BotProduct | null> {
    await this.ensureFreshCache();
    const prods = this.productsCache || [];
    return prods.find((p) => p.id === productId) || null;
  }

  /**
   * In-memory fallback if upstream is unreachable during dev.
   */
  private getFallbackCategories(): BotCategory[] {
    return [
      { id: 10, name: "{pe:5069075201950483359} GEMINI AI", cleanName: "GEMINI AI", emojiId: "5069075201950483359" },
      { id: 36, name: "{pe:4963072209334567688} Duolingo", cleanName: "Duolingo", emojiId: "4963072209334567688" },
      { id: 15, name: "{pe:5229235451541338986} Canva", cleanName: "Canva", emojiId: "5229235451541338986" },
      { id: 23, name: "{pe:5233578612665375810} SPOTIFY", cleanName: "SPOTIFY", emojiId: "5233578612665375810" },
      { id: 18, name: "{pe:4956506857901392912} steam", cleanName: "steam", emojiId: "4956506857901392912" },
      { id: 39, name: "{pe:6174520215376763867} Claude", cleanName: "Claude", emojiId: "6174520215376763867" },
    ];
  }

  private getFallbackProducts(): BotProduct[] {
    return [
      {
        id: 10,
        supplier: "XPRO",
        upstreamProductId: "10",
        categoryId: 10,
        name: "{pe:5069075201950483359}🤖 Gemini AI 18 MONTH",
        cleanName: "Gemini AI 18 MONTH",
        emojiId: "5069075201950483359",
        description: "⚡ Instant activation on your personal Google account\n⬛ No Card Required • ⚪ No Country Issue\n🛡 6-Hour Warranty: Activation only\n⚠️ No warranty after successful activation",
        formattedDescription: "⚡ Instant activation on your personal Google account\n⬛ No Card Required • ⚪ No Country Issue\n🛡 6-Hour Warranty: Activation only\n⚠️ No warranty after successful activation",
        supplierPriceUsd: "0.69",
        retailPriceMmk: 3900,
        formattedPriceMmk: "3,900 Ks",
        stock: 50,
        supplierStock: 60,
        deliveryType: "LINK",
        inStock: true,
      },
    ];
  }
}

export const botCatalog = new BotCatalogService();
