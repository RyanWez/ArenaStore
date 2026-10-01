import { botConfig } from "../config";
import { getDb, products, categories, productSupplierSnapshots } from "@arena/db";
import { eq } from "drizzle-orm";
import {
  calculateRetailMmk,
  calculateSellableStock,
  formatTelegramCustomEmoji,
  parseCustomEmoji,
  stripCustomEmojiPlaceholders,
  escapeHtml,
} from "@arena/shared";

export interface BotCategory {
  id: number;
  name: string;
  cleanName: string;
  emojiId: string | null;
  productsCount?: number;
}

export interface BotProduct {
  id: number;
  categoryId: number;
  name: string;
  cleanName: string;
  emojiId: string | null;
  description: string;
  formattedDescription: string;
  supplierPriceUsd: string;
  retailPriceMmk: number;
  formattedPriceMmk: string; // e.g. "3,900 Ks"
  stock: number;
  supplierStock: number;
  deliveryType: string;
  inStock: boolean;
}

class BotCatalogService {
  private categoriesCache: BotCategory[] | null = null;
  private productsCache: BotProduct[] | null = null;
  private lastFetchedAt: number = 0;
  private readonly CACHE_TTL_MS = 15 * 1000; // 15 seconds cache

  /**
   * Formats MMK amount according to Option A requested by user: "<amount> Ks"
   */
  formatPrice(amountMmk: number): string {
    return `${amountMmk.toLocaleString("en-US")} Ks`;
  }

  /**
   * Fetches fresh catalog data from upstream XPro Partner API.
   */
  private async fetchUpstreamCatalog(): Promise<{ categories: BotCategory[]; products: BotProduct[] }> {
    const baseUrl = botConfig.UPSTREAM_BASE_URL.replace(/\/+$/, "");
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (botConfig.UPSTREAM_API_KEY) {
      headers["Authorization"] = `Bearer ${botConfig.UPSTREAM_API_KEY}`;
    }

    // 1. Fetch wallet balance
    let walletBalanceUsd = 1.0;
    try {
      const balanceRes = await fetch(`${baseUrl}/balance`, {
        headers,
        signal: AbortSignal.timeout(2500),
      });
      if (balanceRes.ok) {
        const balJson: any = await balanceRes.json();
        if (balJson.ok && balJson.balance !== undefined) {
          walletBalanceUsd = parseFloat(String(balJson.balance)) || 0;
        }
      }
    } catch {
      // Keep default
    }

    // 2. Fetch categories
    const catRes = await fetch(`${baseUrl}/catalog/categories`, {
      headers,
      signal: AbortSignal.timeout(2500),
    });
    const catJson: any = await catRes.json();
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

    // 3. Fetch products
    const prodRes = await fetch(`${baseUrl}/catalog/products`, {
      headers,
      signal: AbortSignal.timeout(2500),
    });
    const prodJson: any = await prodRes.json();
    const rawProducts: any[] = Array.isArray(prodJson.products)
      ? prodJson.products
      : Array.isArray(prodJson.data)
      ? prodJson.data
      : [];

    const products: BotProduct[] = rawProducts.map((p) => {
      const usdPrice = parseFloat(String(p.price || 0));
      const pricing = calculateRetailMmk({
        upstreamUsdCost: usdPrice,
        exchangeRateMmk: botConfig.DEFAULT_EXCHANGE_RATE_MMK,
        marginPercentage: botConfig.DEFAULT_MARGIN_PERCENTAGE,
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
        categoryId: p.categoryId,
        name: p.name,
        cleanName: parsed.cleanText,
        emojiId: parsed.emojiId,
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
          id: products.upstreamProductId,
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
        })
        .from(products)
        .leftJoin(productSupplierSnapshots, eq(products.id, productSupplierSnapshots.productId))
        .where(eq(products.isActive, true));

      if (prodRows.length === 0) return null;

      const catList: BotCategory[] = catRows.map((c) => {
        const parsed = parseCustomEmoji(c.name || `Category ${c.id}`);
        return {
          id: c.id,
          name: c.name,
          cleanName: parsed.cleanText,
          emojiId: parsed.emojiId,
        };
      });

      const prodList: BotProduct[] = prodRows.map((p) => {
        const displayName = p.rawName || p.nameMmk;
        const parsed = parseCustomEmoji(displayName);
        const formattedDesc = p.descriptionMmk
          ? formatTelegramCustomEmoji(p.descriptionMmk, "✨")
          : "";
        const stock = p.localStockLimit !== null ? p.localStockLimit : (p.supplierStock || 999);

        return {
          id: p.id,
          categoryId: p.categoryId || 1,
          name: displayName,
          cleanName: parsed.cleanText,
          emojiId: parsed.emojiId,
          description: p.descriptionMmk || "",
          formattedDescription: formattedDesc,
          supplierPriceUsd: p.supplierPriceUsd || "0.00",
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
   * Refreshes in-memory cache if expired.
   */
  private async ensureFreshCache(): Promise<void> {
    const now = Date.now();
    if (this.categoriesCache && this.productsCache && now - this.lastFetchedAt < this.CACHE_TTL_MS) {
      return;
    }

    try {
      // 1. Prioritize PostgreSQL Database in dev/prod (reflects real-time admin pricing changes instantly)
      if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
        const dbCatalog = await this.fetchDatabaseCatalog();
        if (dbCatalog && dbCatalog.products.length > 0) {
          this.categoriesCache = dbCatalog.categories;
          this.productsCache = dbCatalog.products;
          this.lastFetchedAt = now;
          return;
        }
      }

      // 2. Fallback to direct Upstream Partner API
      const { categories, products } = await this.fetchUpstreamCatalog();
      this.categoriesCache = categories;
      this.productsCache = products;
      this.lastFetchedAt = now;
    } catch (err: any) {
      console.error("[BotCatalogService] Failed to refresh catalog cache:", err.message);
      // If we don't have cache at all, provide safe fallback
      if (!this.categoriesCache || !this.productsCache) {
        this.categoriesCache = this.getFallbackCategories();
        this.productsCache = this.getFallbackProducts();
        this.lastFetchedAt = now;
      }
    }
  }

  async getCategories(): Promise<BotCategory[]> {
    await this.ensureFreshCache();
    return this.categoriesCache || [];
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
