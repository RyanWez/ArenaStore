import { eq, and, sql } from "drizzle-orm";
import { getDb, categories, products, productSupplierSnapshots, stockReservations } from "@arena/db";
import { calculateRetailMmk, calculateSellableStock, formatMmk } from "@arena/shared";
import { xproClient, XProProduct, XProCategory } from "./xpro-client";
import { config } from "../config";

export interface LocalizedProduct {
  id: number;
  upstreamProductId: number;
  categoryId: number | null;
  nameMmk: string;
  descriptionMmk: string | null;
  rawName: string;
  rawDescription: string | null;
  retailPriceMmk: number;
  formattedRetailPriceMmk: string;
  supplierPriceUsd: string;
  supplierStock: number;
  sellableStock: number;
  deliveryType: string;
  isActive: boolean;
  isWalletConstrained: boolean;
  syncedAt: Date;
}

export class CatalogService {
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
      const slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return {
        upstreamCategoryId: cat.id,
        name: cat.name,
        slug: slug || `category-${cat.id}`,
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
        upstreamProductId: upstreamId,
        categoryId: matchedCategoryId,
        nameMmk: item.name,
        descriptionMmk: item.description || null,
        retailPriceMmk: initialPricing.retailPriceMmk,
        localStockLimit: null,
        isActive: true,
      });

      validUpstreamItems.push({ item, upstreamId, usdPrice });
    }

    if (productValues.length === 0) return 0;

    const localProducts = await db
      .insert(products)
      .values(productValues)
      .onConflictDoUpdate({
        target: products.upstreamProductId,
        set: {
          categoryId: sql`EXCLUDED.category_id`,
          nameMmk: sql`EXCLUDED.name_mmk`,
          descriptionMmk: sql`EXCLUDED.description_mmk`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const localProdByUpstreamId = new Map<number, number>();
    for (const p of localProducts) {
      localProdByUpstreamId.set(p.upstreamProductId, p.id);
    }

    const snapshotValues = validUpstreamItems.map(({ item, upstreamId, usdPrice }) => ({
      productId: localProdByUpstreamId.get(upstreamId)!,
      upstreamProductId: upstreamId,
      rawName: item.name,
      rawDescription: item.description || null,
      deliveryType: (item as any).deliveryType || "CREDENTIALS",
      supplierPriceUsd: String(usdPrice),
      supplierStock: item.stock ?? 0,
      inStock: item.inStock !== false && (item.stock ?? 0) > 0,
      syncedAt: new Date(),
    }));

    await db
      .insert(productSupplierSnapshots)
      .values(snapshotValues)
      .onConflictDoUpdate({
        target: productSupplierSnapshots.productId,
        set: {
          upstreamProductId: sql`EXCLUDED.upstream_product_id`,
          rawName: sql`EXCLUDED.raw_name`,
          rawDescription: sql`EXCLUDED.raw_description`,
          deliveryType: sql`EXCLUDED.delivery_type`,
          supplierPriceUsd: sql`EXCLUDED.supplier_price_usd`,
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
        const slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        return {
          upstreamCategoryId: cat.id,
          name: cat.name,
          slug: slug || `category-${cat.id}`,
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
        upstreamProductId: upstreamId,
        categoryId: matchedCategoryId,
        nameMmk: item.name,
        descriptionMmk: item.description || null,
        retailPriceMmk: initialPricing.retailPriceMmk,
        localStockLimit: null,
        isActive: true,
      });

      validUpstreamItems.push({ item, upstreamId, usdPrice });
    }

    if (productValues.length === 0) {
      return { categories: upstreamCategories.length, products: 0 };
    }

    // 5. Batch upsert products in 1 query
    const localProducts = await db
      .insert(products)
      .values(productValues)
      .onConflictDoUpdate({
        target: products.upstreamProductId,
        set: {
          categoryId: sql`EXCLUDED.category_id`,
          nameMmk: sql`EXCLUDED.name_mmk`,
          descriptionMmk: sql`EXCLUDED.description_mmk`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const localProdByUpstreamId = new Map<number, number>();
    for (const p of localProducts) {
      localProdByUpstreamId.set(p.upstreamProductId, p.id);
    }

    // 6. Batch upsert snapshots in 1 query
    const snapshotValues = validUpstreamItems.map(({ item, upstreamId, usdPrice }) => ({
      productId: localProdByUpstreamId.get(upstreamId)!,
      upstreamProductId: upstreamId,
      rawName: item.name,
      rawDescription: item.description || null,
      deliveryType: (item as any).deliveryType || "CREDENTIALS",
      supplierPriceUsd: String(usdPrice),
      supplierStock: item.stock ?? 0,
      inStock: item.inStock !== false && (item.stock ?? 0) > 0,
      syncedAt: new Date(),
    }));

    await db
      .insert(productSupplierSnapshots)
      .values(snapshotValues)
      .onConflictDoUpdate({
        target: productSupplierSnapshots.productId,
        set: {
          upstreamProductId: sql`EXCLUDED.upstream_product_id`,
          rawName: sql`EXCLUDED.raw_name`,
          rawDescription: sql`EXCLUDED.raw_description`,
          deliveryType: sql`EXCLUDED.delivery_type`,
          supplierPriceUsd: sql`EXCLUDED.supplier_price_usd`,
          supplierStock: sql`EXCLUDED.supplier_stock`,
          inStock: sql`EXCLUDED.in_stock`,
          syncedAt: new Date(),
        },
      });

    return {
      categories: upstreamCategories.length,
      products: validUpstreamItems.length,
    };
  }

  /**
   * Gets list of sellable products for customer bot and admin dashboard.
   * Calculates effective sellable stock against real-time wallet capacity and reservations.
   */
  async getSellableProducts(options?: {
    categoryId?: number;
    activeOnly?: boolean;
  }): Promise<LocalizedProduct[]> {
    const db = getDb();

    // Query active wallet balance from upstream (fallback to 0 on failure)
    let walletBalanceUsd: string | number = "0.00";
    try {
      const balanceRes = await xproClient.getBalance();
      walletBalanceUsd = balanceRes.balance;
    } catch {
      // Continue with 0 if upstream balance fails
    }

    // Fetch products with snapshots
    const rows = await db
      .select({
        product: products,
        snapshot: productSupplierSnapshots,
      })
      .from(products)
      .innerJoin(productSupplierSnapshots, eq(products.id, productSupplierSnapshots.productId))
      .where(options?.activeOnly !== false ? eq(products.isActive, true) : undefined);

    const now = new Date();
    const result: LocalizedProduct[] = [];

    for (const { product, snapshot } of rows) {
      if (options?.categoryId && product.categoryId !== options.categoryId) {
        continue;
      }

      // Sum active reservations for this product
      const [reservationSum] = await db
        .select({
          totalReserved: sql<number>`COALESCE(SUM(${stockReservations.quantity}), 0)::integer`,
        })
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.productId, product.id),
            sql`${stockReservations.expiresAt} > ${now}`
          )
        );

      const activeReservedUnits = reservationSum?.totalReserved || 0;

      const stockCalc = calculateSellableStock({
        supplierStock: snapshot.supplierStock,
        supplierWalletBalanceUsd: walletBalanceUsd,
        unitCostUsd: snapshot.supplierPriceUsd,
        localLimit: product.localStockLimit,
        activeReservedUnits,
      });

      result.push({
        id: product.id,
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
}

export const catalogService = new CatalogService();
