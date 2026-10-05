import { eq, and, lt, sql } from "drizzle-orm";
import { getDb, categories, products, productSupplierSnapshots, stockReservations, appSettings } from "@arena/db";
import { calculateRetailMmk, calculateSellableStock, formatMmk, stripCustomEmojiPlaceholders, parseCustomEmoji } from "@arena/shared";
import { xproClient, digitalcoreClient, XProProduct, XProCategory } from "./xpro-client";
import { config, getEnabledSuppliers } from "../config";

export interface LocalizedProduct {
  id: number;
  supplier?: string;
  upstreamProductId: string | number;
  categoryId: number | null;
  nameMmk: string;
  descriptionMmk: string | null;
  rawName: string;
  rawDescription: string | null;
  retailPriceMmk: number;
  formattedRetailPriceMmk: string;
  supplierPriceUsd: string;
  pricingTiers?: any;
  supplierStock: number;
  sellableStock: number;
  deliveryType: string;
  isActive: boolean;
  isWalletConstrained: boolean;
  syncedAt: Date;
}

export class CatalogService {
  private lastSyncedAt: string | null = null;
  private cachedBalances: Record<string, string> = {
    XPRO: "0.00",
    DIGITALCORE: "0.00",
  };
  private lastBalanceFetchTime: Record<string, number> = {
    XPRO: 0,
    DIGITALCORE: 0,
  };

  getLastSyncedAt(): string | null {
    return this.lastSyncedAt;
  }
  /**
   * Syncs upstream categories into the database.
   */
  /**
   * Syncs upstream categories into the database using batch upsert.
   */
  async syncCategories(): Promise<number> {
    const upstreamCategories = await xproClient.getCategories();
    if (!upstreamCategories || upstreamCategories.length === 0) return 0;
    const db = getDb();

    const catValues = upstreamCategories.map((cat, index) => {
      const parsed = parseCustomEmoji(cat.name);
      const cleanName = parsed.cleanText || cat.name;
      const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return {
        upstreamCategoryId: cat.id,
        name: cat.name,
        slug: slug || `category-${cat.id}`,
        iconEmoji: parsed.emojiId || "📁",
        sortOrder: index * 10,
        isActive: true,
      };
    });

    await db
      .insert(categories)
      .values(catValues)
      .onConflictDoUpdate({
        target: categories.slug,
        set: {
          name: sql`EXCLUDED.name`,
          upstreamCategoryId: sql`EXCLUDED.upstream_category_id`,
          iconEmoji: sql`EXCLUDED.icon_emoji`,
          updatedAt: new Date(),
        },
      });

    return upstreamCategories.length;
  }

  /**
   * Synchronizes all products from upstream supplier into local database using batch upsert.
   */
  async syncProducts(exchangeRateMmk: number = config.DEFAULT_EXCHANGE_RATE_MMK): Promise<number> {
    const { products: upstreamProducts } = await xproClient.getProducts({ limit: 100 });
    if (!upstreamProducts || upstreamProducts.length === 0) return 0;
    const db = getDb();

    const allCategories = await db.select().from(categories);
    const catByUpstreamId = new Map<number, number>();
    const catByName = new Map<string, number>();
    for (const c of allCategories) {
      if (c.upstreamCategoryId !== null && c.upstreamCategoryId !== undefined) {
        catByUpstreamId.set(c.upstreamCategoryId, c.id);
      }
      catByName.set(c.name.trim().toLowerCase(), c.id);
    }

    const productValues: any[] = [];
    const validUpstreamItems: any[] = [];

    for (const item of upstreamProducts) {
      const upstreamId = Number((item as any).productId ?? (item as any).id);
      if (!upstreamId || isNaN(upstreamId)) continue;

      const usdPrice = item.yourPrice !== undefined ? item.yourPrice : item.price;
      const initialPricing = calculateRetailMmk({
        upstreamUsdCost: usdPrice,
        exchangeRateMmk,
        marginPercentage: config.DEFAULT_MARGIN_PERCENTAGE,
      });

      let matchedCategoryId: number | null = null;
      const rawCatId = (item as any).categoryId ?? (typeof (item as any).category === "number" ? (item as any).category : null);
      if (rawCatId !== null && rawCatId !== undefined && catByUpstreamId.has(Number(rawCatId))) {
        matchedCategoryId = catByUpstreamId.get(Number(rawCatId))!;
      } else if ((item as any).category) {
        const catStr = String((item as any).category).trim().toLowerCase();
        if (catByName.has(catStr)) {
          matchedCategoryId = catByName.get(catStr)!;
        }
      }

      productValues.push({
        supplier: "XPRO",
        upstreamProductId: String(upstreamId),
        categoryId: matchedCategoryId,
        nameMmk: item.name,
        descriptionMmk: item.description || null,
        retailPriceMmk: initialPricing.retailPriceMmk,
        localStockLimit: null,
        isActive: true,
      });

      validUpstreamItems.push({ item, upstreamId: String(upstreamId), usdPrice });
    }

    if (productValues.length === 0) return 0;

    const localProducts = await db
      .insert(products)
      .values(productValues)
      .onConflictDoUpdate({
        target: [products.supplier, products.upstreamProductId],
        set: {
          categoryId: sql`EXCLUDED.category_id`,
          nameMmk: sql`EXCLUDED.name_mmk`,
          descriptionMmk: sql`EXCLUDED.description_mmk`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const localProdByUpstreamId = new Map<string, number>();
    for (const p of localProducts) {
      localProdByUpstreamId.set(p.upstreamProductId, p.id);
    }

    const snapshotValues = validUpstreamItems.map(({ item, upstreamId, usdPrice }) => ({
      productId: localProdByUpstreamId.get(upstreamId)!,
      supplier: "XPRO",
      upstreamProductId: upstreamId,
      rawName: item.name,
      rawDescription: item.description || null,
      deliveryType: (item as any).deliveryType || "CREDENTIALS",
      supplierPriceUsd: String(usdPrice),
      pricingTiers: null,
      supplierStock: item.stock ?? 0,
      inStock: item.inStock !== false && (item.stock ?? 0) > 0,
      syncedAt: new Date(),
    }));

    await db
      .insert(productSupplierSnapshots)
      .values(snapshotValues)
      .onConflictDoUpdate({
        target: [productSupplierSnapshots.productId, productSupplierSnapshots.supplier],
        set: {
          upstreamProductId: sql`EXCLUDED.upstream_product_id`,
          rawName: sql`EXCLUDED.raw_name`,
          rawDescription: sql`EXCLUDED.raw_description`,
          deliveryType: sql`EXCLUDED.delivery_type`,
          supplierPriceUsd: sql`EXCLUDED.supplier_price_usd`,
          pricingTiers: sql`EXCLUDED.pricing_tiers`,
          supplierStock: sql`EXCLUDED.supplier_stock`,
          inStock: sql`EXCLUDED.in_stock`,
          syncedAt: new Date(),
        },
      });

    return validUpstreamItems.length;
  }

  /**
   * High-speed catalog sync:
   * 1. Fetches categories & products from upstream partner in parallel
   * 2. Batch upserts categories in 1 query
   * 3. Batch upserts products in 1 query
   * 4. Batch upserts snapshots in 1 query
   */
  async syncFullCatalog(exchangeRateMmk: number = config.DEFAULT_EXCHANGE_RATE_MMK): Promise<{ categories: number; products: number }> {
    const db = getDb();

    // 1. Parallel fetch from upstream partner
    const [upstreamCategories, { products: upstreamProducts }] = await Promise.all([
      xproClient.getCategories(),
      xproClient.getProducts({ limit: 100 }),
    ]);

    // 2. Batch upsert categories
    if (upstreamCategories.length > 0) {
      const catValues = upstreamCategories.map((cat, index) => {
        const parsed = parseCustomEmoji(cat.name);
        const cleanName = parsed.cleanText || cat.name;
        const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        return {
          upstreamCategoryId: cat.id,
          name: cat.name,
          slug: slug || `category-${cat.id}`,
          iconEmoji: parsed.emojiId || "📁",
          sortOrder: index * 10,
          isActive: true,
        };
      });

      await db
        .insert(categories)
        .values(catValues)
        .onConflictDoUpdate({
          target: categories.slug,
          set: {
            name: sql`EXCLUDED.name`,
            upstreamCategoryId: sql`EXCLUDED.upstream_category_id`,
            iconEmoji: sql`EXCLUDED.icon_emoji`,
            updatedAt: new Date(),
          },
        });
    }

    // 3. Category lookup mapping
    const allCategories = await db.select().from(categories);
    const catByUpstreamId = new Map<number, number>();
    const catByName = new Map<string, number>();
    for (const c of allCategories) {
      if (c.upstreamCategoryId !== null && c.upstreamCategoryId !== undefined) {
        catByUpstreamId.set(c.upstreamCategoryId, c.id);
      }
      catByName.set(c.name.trim().toLowerCase(), c.id);
      catByName.set(stripCustomEmojiPlaceholders(c.name).trim().toLowerCase(), c.id);
    }

    // 4. Batch prepare products
    const productValues: any[] = [];
    const validUpstreamItems: any[] = [];

    for (const item of upstreamProducts) {
      const upstreamId = Number((item as any).productId ?? (item as any).id);
      if (!upstreamId || isNaN(upstreamId)) continue;

      const usdPrice = item.yourPrice !== undefined ? item.yourPrice : item.price;
      const initialPricing = calculateRetailMmk({
        upstreamUsdCost: usdPrice,
        exchangeRateMmk,
        marginPercentage: config.DEFAULT_MARGIN_PERCENTAGE,
      });

      let matchedCategoryId: number | null = null;
      const rawCatId = (item as any).categoryId ?? (typeof (item as any).category === "number" ? (item as any).category : null);
      if (rawCatId !== null && rawCatId !== undefined && catByUpstreamId.has(Number(rawCatId))) {
        matchedCategoryId = catByUpstreamId.get(Number(rawCatId))!;
      } else if ((item as any).category) {
        const catStr = String((item as any).category).trim().toLowerCase();
        if (catByName.has(catStr)) {
          matchedCategoryId = catByName.get(catStr)!;
        }
      }

      productValues.push({
        supplier: "XPRO",
        upstreamProductId: String(upstreamId),
        categoryId: matchedCategoryId,
        nameMmk: item.name,
        descriptionMmk: item.description || null,
        retailPriceMmk: initialPricing.retailPriceMmk,
        localStockLimit: null,
        isActive: true,
      });

      validUpstreamItems.push({ item, upstreamId: String(upstreamId), usdPrice });
    }

    let xproProductCount = 0;
    if (productValues.length > 0) {
      // 5. Batch upsert products in 1 query
      const localProducts = await db
        .insert(products)
        .values(productValues)
        .onConflictDoUpdate({
          target: [products.supplier, products.upstreamProductId],
          set: {
            categoryId: sql`EXCLUDED.category_id`,
            nameMmk: sql`EXCLUDED.name_mmk`,
            descriptionMmk: sql`EXCLUDED.description_mmk`,
            updatedAt: new Date(),
          },
        })
        .returning();

      const localProdByUpstreamId = new Map<string, number>();
      for (const p of localProducts) {
        localProdByUpstreamId.set(p.upstreamProductId, p.id);
      }

      // 6. Batch upsert snapshots in 1 query
      const snapshotValues = validUpstreamItems.map(({ item, upstreamId, usdPrice }) => ({
        productId: localProdByUpstreamId.get(upstreamId)!,
        supplier: "XPRO",
        upstreamProductId: upstreamId,
        rawName: item.name,
        rawDescription: item.description || null,
        deliveryType: (item as any).deliveryType || "CREDENTIALS",
        supplierPriceUsd: String(usdPrice),
        pricingTiers: null,
        supplierStock: item.stock ?? 0,
        inStock: item.inStock !== false && (item.stock ?? 0) > 0,
        syncedAt: new Date(),
      }));

      await db
        .insert(productSupplierSnapshots)
        .values(snapshotValues)
        .onConflictDoUpdate({
          target: [productSupplierSnapshots.productId, productSupplierSnapshots.supplier],
          set: {
            upstreamProductId: sql`EXCLUDED.upstream_product_id`,
            rawName: sql`EXCLUDED.raw_name`,
            rawDescription: sql`EXCLUDED.raw_description`,
            deliveryType: sql`EXCLUDED.delivery_type`,
            supplierPriceUsd: sql`EXCLUDED.supplier_price_usd`,
            pricingTiers: sql`EXCLUDED.pricing_tiers`,
            supplierStock: sql`EXCLUDED.supplier_stock`,
            inStock: sql`EXCLUDED.in_stock`,
            syncedAt: new Date(),
          },
        });

      xproProductCount = validUpstreamItems.length;
    }

    const now = new Date();
    this.lastSyncedAt = now.toISOString();

    await db
      .insert(appSettings)
      .values({
        key: "catalog_last_synced_at",
        value: this.lastSyncedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: this.lastSyncedAt,
          updatedAt: now,
        },
      })
      .catch(() => {});

    // Sync DigitalCore if enabled
    const enabled = getEnabledSuppliers();
    let dcProductCount = 0;
    if (enabled.includes("DIGITALCORE")) {
      try {
        dcProductCount = await this.syncDigitalCoreCatalog(exchangeRateMmk);
      } catch (err) {
        console.error("[CatalogService] Failed to sync DigitalCore catalog:", err);
      }
    }

    return { categories: upstreamCategories.length, products: xproProductCount + dcProductCount };
  }

  /**
   * Synchronizes catalog from DigitalCore partner API.
   * Preserves admin manual category overrides.
   */
  async syncDigitalCoreCatalog(exchangeRateMmk: number = config.DEFAULT_EXCHANGE_RATE_MMK): Promise<number> {
    const dcProducts = await digitalcoreClient.listProducts();
    if (!dcProducts || dcProducts.length === 0) return 0;
    const db = getDb();

    // Default category 'uncategorized'
    let defaultCat = await db.query.categories.findFirst({
      where: eq(categories.slug, "uncategorized"),
    });
    if (!defaultCat) {
      const [newCat] = await db
        .insert(categories)
        .values({
          name: "Uncategorized",
          slug: "uncategorized",
          iconEmoji: "📦",
          sortOrder: 999,
          isActive: true,
        })
        .onConflictDoNothing()
        .returning();
      if (newCat) defaultCat = newCat;
      else {
        defaultCat = await db.query.categories.findFirst({
          where: eq(categories.slug, "uncategorized"),
        });
      }
    }

    // Pre-fetch all active categories to auto-link by brand name (e.g. Gemini -> GEMINI AI)
    const allCategories = await db
      .select({ id: categories.id, name: categories.name, slug: categories.slug })
      .from(categories)
      .where(eq(categories.isActive, true));

    const findMatchingCategoryId = (name: string): number | null => {
      const lower = name.toLowerCase();
      for (const cat of allCategories) {
        if (cat.slug === "uncategorized") continue;
        const cleanCat = (cat.name || "").replace(/\{pe:\d+\}/g, "").trim().toLowerCase();
        if (!cleanCat) continue;
        const firstWord = cleanCat.split(" ")[0];
        if (lower.includes(cleanCat) || (firstWord.length >= 3 && lower.includes(firstWord))) {
          return cat.id;
        }
      }
      return defaultCat?.id || null;
    };

    const productValues: any[] = [];
    const validItems: any[] = [];

    for (const item of dcProducts) {
      const upstreamId = item.upstreamProductId;
      if (!upstreamId) continue;

      const usdPrice = item.basePriceUsd;
      const initialPricing = calculateRetailMmk({
        upstreamUsdCost: usdPrice,
        exchangeRateMmk,
        marginPercentage: config.DEFAULT_MARGIN_PERCENTAGE,
      });

      productValues.push({
        supplier: "DIGITALCORE",
        upstreamProductId: upstreamId,
        categoryId: findMatchingCategoryId(item.name),
        nameMmk: item.name,
        descriptionMmk: item.description || null,
        retailPriceMmk: initialPricing.retailPriceMmk,
        localStockLimit: null,
        isActive: true,
      });

      validItems.push({ item, upstreamId, usdPrice });
    }

    if (productValues.length === 0) return 0;

    // Do NOT clobber custom categories assigned by admin
    const localProducts = await db
      .insert(products)
      .values(productValues)
      .onConflictDoUpdate({
        target: [products.supplier, products.upstreamProductId],
        set: {
          categoryId: sql`CASE WHEN ${products.categoryId} IS NULL OR ${products.categoryId} = ${defaultCat?.id || 0} THEN EXCLUDED.category_id ELSE ${products.categoryId} END`,
          nameMmk: sql`EXCLUDED.name_mmk`,
          descriptionMmk: sql`EXCLUDED.description_mmk`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const localProdByUpstreamId = new Map<string, number>();
    for (const p of localProducts) {
      localProdByUpstreamId.set(p.upstreamProductId, p.id);
    }

    const snapshotValues = validItems.map(({ item, upstreamId, usdPrice }) => ({
      productId: localProdByUpstreamId.get(upstreamId)!,
      supplier: "DIGITALCORE",
      upstreamProductId: upstreamId,
      rawName: item.name,
      rawDescription: item.description || null,
      deliveryType: "LINK",
      supplierPriceUsd: String(usdPrice),
      pricingTiers: item.pricingTiers || null,
      supplierStock: item.stock ?? 0,
      inStock: item.inStock && (item.stock ?? 0) > 0,
      syncedAt: new Date(),
    }));

    await db
      .insert(productSupplierSnapshots)
      .values(snapshotValues)
      .onConflictDoUpdate({
        target: [productSupplierSnapshots.productId, productSupplierSnapshots.supplier],
        set: {
          upstreamProductId: sql`EXCLUDED.upstream_product_id`,
          rawName: sql`EXCLUDED.raw_name`,
          rawDescription: sql`EXCLUDED.raw_description`,
          deliveryType: sql`EXCLUDED.delivery_type`,
          supplierPriceUsd: sql`EXCLUDED.supplier_price_usd`,
          pricingTiers: sql`EXCLUDED.pricing_tiers`,
          supplierStock: sql`EXCLUDED.supplier_stock`,
          inStock: sql`EXCLUDED.in_stock`,
          syncedAt: new Date(),
        },
      });

    const now = new Date();
    await db
      .insert(appSettings)
      .values({
        key: "catalog_last_synced_at_DIGITALCORE",
        value: now.toISOString(),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: now.toISOString(),
          updatedAt: now,
        },
      })
      .catch(() => {});

    return validItems.length;
  }

  /**
   * Syncs catalog for a specific supplier ("XPRO" | "DIGITALCORE").
   */
  async syncSupplier(supplier: "XPRO" | "DIGITALCORE", exchangeRateMmk?: number): Promise<{ supplier: string; count: number }> {
    if (supplier === "XPRO") {
      const res = await this.syncFullCatalog(exchangeRateMmk);
      return { supplier: "XPRO", count: res.products };
    } else {
      const count = await this.syncDigitalCoreCatalog(exchangeRateMmk);
      return { supplier: "DIGITALCORE", count };
    }
  }

  /**
   * Gets list of sellable products for customer bot and admin dashboard.
   * Calculates effective sellable stock against real-time wallet capacity and reservations.
   * Pass productId to fetch a single product instead of the whole catalog.
   */
  async getSellableProducts(options?: {
    categoryId?: number;
    productId?: number;
    activeOnly?: boolean;
  }): Promise<LocalizedProduct[]> {
    const db = getDb();

    // Query active wallet balance per supplier concurrently with caching & graceful failure
    const nowMs = Date.now();
    const balancePromises: [Promise<any>, Promise<any>] = [
      nowMs - (this.lastBalanceFetchTime.XPRO || 0) < 15000
        ? Promise.resolve({ balanceUsd: this.cachedBalances.XPRO })
        : xproClient.getBalance(2500).catch((err) => {
            console.warn("[CatalogService] XPro getBalance error:", err?.message);
            return { balanceUsd: this.cachedBalances.XPRO };
          }),
      nowMs - (this.lastBalanceFetchTime.DIGITALCORE || 0) < 15000
        ? Promise.resolve({ balanceUsd: this.cachedBalances.DIGITALCORE })
        : digitalcoreClient.getBalance(2500).catch((err) => {
            console.warn("[CatalogService] DigitalCore getBalance error:", err?.message);
            return { balanceUsd: this.cachedBalances.DIGITALCORE };
          }),
    ];

    const [xRes, dcRes] = await Promise.allSettled(balancePromises);
    if (xRes.status === "fulfilled" && xRes.value) {
      const val = xRes.value as any;
      const b = String(val.balanceUsd ?? val.balance ?? this.cachedBalances.XPRO);
      this.cachedBalances.XPRO = b;
      this.lastBalanceFetchTime.XPRO = nowMs;
    }
    if (dcRes.status === "fulfilled" && dcRes.value) {
      const val = dcRes.value as any;
      const b = String(val.balanceUsd ?? val.balance ?? this.cachedBalances.DIGITALCORE);
      this.cachedBalances.DIGITALCORE = b;
      this.lastBalanceFetchTime.DIGITALCORE = nowMs;
    }

    // Fetch products with snapshots (all, or a single one when productId is given)
    const rows = await db
      .select({
        product: products,
        snapshot: productSupplierSnapshots,
      })
      .from(products)
      .innerJoin(
        productSupplierSnapshots,
        and(
          eq(products.id, productSupplierSnapshots.productId),
          eq(products.supplier, productSupplierSnapshots.supplier)
        )
      )
      .where(
        and(
          options?.productId ? eq(products.id, options.productId) : undefined,
          options?.activeOnly !== false ? eq(products.isActive, true) : undefined
        )
      );

    const now = new Date();

    // One grouped aggregate for every product's active reservations. The old
    // per-product SUM ran one extra query per product inside the loop below,
    // which made this endpoint the catalog's N+1 hotspot.
    const reservationRows = await db
      .select({
        productId: stockReservations.productId,
        totalReserved: sql<number>`COALESCE(SUM(${stockReservations.quantity}), 0)::integer`,
      })
      .from(stockReservations)
      .where(
        and(
          options?.productId ? eq(stockReservations.productId, options.productId) : undefined,
          sql`${stockReservations.expiresAt} > ${now}`
        )
      )
      .groupBy(stockReservations.productId);
    const reservedByProduct = new Map(
      reservationRows.map((r) => [r.productId, r.totalReserved])
    );

    const result: LocalizedProduct[] = [];

    for (const { product, snapshot } of rows) {
      if (options?.categoryId && product.categoryId !== options.categoryId) {
        continue;
      }

      const activeReservedUnits = reservedByProduct.get(product.id) || 0;
      const pSupplier = (product.supplier || "XPRO").toUpperCase();
      const effectiveWalletBalance = this.cachedBalances[pSupplier] ?? "0.00";

      const stockCalc = calculateSellableStock({
        supplierStock: snapshot.supplierStock,
        supplierWalletBalanceUsd: effectiveWalletBalance,
        unitCostUsd: snapshot.supplierPriceUsd,
        localLimit: product.localStockLimit,
        activeReservedUnits,
      });

      result.push({
        id: product.id,
        supplier: pSupplier,
        upstreamProductId: product.upstreamProductId,
        categoryId: product.categoryId,
        nameMmk: product.nameMmk,
        descriptionMmk: product.descriptionMmk,
        rawName: snapshot.rawName,
        rawDescription: snapshot.rawDescription,
        retailPriceMmk: product.retailPriceMmk,
        formattedRetailPriceMmk: formatMmk(product.retailPriceMmk),
        supplierPriceUsd: snapshot.supplierPriceUsd,
        supplierStock: snapshot.supplierStock,
        sellableStock: stockCalc.sellableStock,
        deliveryType: snapshot.deliveryType,
        isActive: product.isActive,
        isWalletConstrained: stockCalc.isWalletConstrained,
        syncedAt: snapshot.syncedAt,
      });
    }

    return result;
  }

  /**
   * Single-product variant of getSellableProducts — fetches only that product
   * instead of scanning the whole catalog.
   */
  async getSellableProduct(productId: number): Promise<LocalizedProduct | null> {
    const rows = await this.getSellableProducts({ productId, activeOnly: true });
    return rows[0] || null;
  }

  /**
   * Deletes expired stock reservations (housekeeping). Their hold windows are
   * gone, so the rows only bloat the sellable-stock aggregate and the database.
   * Failures are swallowed — cleanup must never break the sync it runs beside.
   */
  async purgeExpiredReservations(): Promise<number> {
    try {
      const db = getDb();
      const deleted = await db
        .delete(stockReservations)
        .where(lt(stockReservations.expiresAt, new Date()))
        .returning({ id: stockReservations.id });
      return deleted.length;
    } catch (err: any) {
      console.warn("[CatalogService] Failed to purge expired reservations:", err.message);
      return 0;
    }
  }
}

export const catalogService = new CatalogService();
