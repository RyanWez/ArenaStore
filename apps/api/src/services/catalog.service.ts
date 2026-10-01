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
  async syncCategories(): Promise<number> {
    const upstreamCategories = await xproClient.getCategories();
    const db = getDb();
    let count = 0;

    for (const cat of upstreamCategories) {
      const slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      // Upsert by slug
      await db
        .insert(categories)
        .values({
          upstreamCategoryId: cat.id,
          name: cat.name,
          slug: slug || `category-${cat.id}`,
          sortOrder: count * 10,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: categories.slug,
          set: {
            name: cat.name,
            upstreamCategoryId: cat.id,
            updatedAt: new Date(),
          },
        });

      count++;
    }

    return count;
  }

  /**
   * Synchronizes all products from upstream supplier into local database.
   * Calculates initial retail MMK prices for newly discovered products and maps category relations.
   */
  async syncProducts(exchangeRateMmk: number = config.DEFAULT_EXCHANGE_RATE_MMK): Promise<number> {
    const { products: upstreamProducts } = await xproClient.getProducts({ limit: 100 });
    const db = getDb();
    let syncedCount = 0;

    // Build lookup maps for categories to link foreign key accurately
    const allCategories = await db.select().from(categories);
    const catByUpstreamId = new Map<number, number>();
    const catByName = new Map<string, number>();
    for (const c of allCategories) {
      if (c.upstreamCategoryId !== null && c.upstreamCategoryId !== undefined) {
        catByUpstreamId.set(c.upstreamCategoryId, c.id);
      }
      catByName.set(c.name.trim().toLowerCase(), c.id);
    }

    for (const item of upstreamProducts) {
      const upstreamId = Number((item as any).productId ?? (item as any).id);
      if (!upstreamId || isNaN(upstreamId)) continue;

      const usdPrice = item.yourPrice !== undefined ? item.yourPrice : item.price;
      const initialPricing = calculateRetailMmk({
        upstreamUsdCost: usdPrice,
        exchangeRateMmk,
        marginPercentage: config.DEFAULT_MARGIN_PERCENTAGE,
      });

      // Match category from upstream category ID or category name
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

      // Upsert local product with proper category foreign key
      const [localProduct] = await db
        .insert(products)
        .values({
          upstreamProductId: upstreamId,
          categoryId: matchedCategoryId,
          nameMmk: item.name,
          descriptionMmk: item.description || null,
          retailPriceMmk: initialPricing.retailPriceMmk,
          localStockLimit: null,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: products.upstreamProductId,
          set: {
            categoryId: matchedCategoryId,
            nameMmk: item.name,
            descriptionMmk: item.description || null,
            updatedAt: new Date(),
          },
        })
        .returning();

      // Upsert supplier snapshot
      await db
        .insert(productSupplierSnapshots)
        .values({
          productId: localProduct.id,
          upstreamProductId: upstreamId,
          rawName: item.name,
          rawDescription: item.description || null,
          deliveryType: (item as any).deliveryType || "CREDENTIALS",
          supplierPriceUsd: String(usdPrice),
          supplierStock: item.stock ?? 0,
          inStock: item.inStock !== false && (item.stock ?? 0) > 0,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: productSupplierSnapshots.productId,
          set: {
            upstreamProductId: upstreamId,
            rawName: item.name,
            rawDescription: item.description || null,
            deliveryType: (item as any).deliveryType || "CREDENTIALS",
            supplierPriceUsd: String(usdPrice),
            supplierStock: item.stock ?? 0,
            inStock: item.inStock !== false && (item.stock ?? 0) > 0,
            syncedAt: new Date(),
          },
        });

      syncedCount++;
    }

    return syncedCount;
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
