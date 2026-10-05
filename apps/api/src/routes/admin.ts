import { FastifyInstance } from "fastify";
import {
  BOT_EMOJIS,
  ReviewPaymentSchema,
  UpdateProductPricingSchema,
  calculateRetailMmk,
  calculateSellableStock,
  stripCustomEmojiPlaceholders,
  tgEmoji,
} from "@arena/shared";
import {
  getDb,
  orders,
  paymentSubmissions,
  products,
  users,
  categories,
  orderItems,
  orderDeliveries,
  appSettings,
  topUpRequests,
  wallets,
  walletLedger,
  productSupplierSnapshots,
  auditLogs,
} from "@arena/db";
import { and, asc, desc, eq, ilike, inArray, or, ne, sql, gte } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { xproClient, digitalcoreClient } from "../services/xpro-client";
import { catalogService } from "../services/catalog.service";
import { restockNotifier } from "../services/restock-notifier";
import {
  notifyOrderRefunded,
  notifyOrderCredentialsResent,
  notifyBalanceAdjusted,
} from "../services/telegram-notifier";
import { reviewDeposit, buildCustomerDisplayName } from "../services/deposit-review.service";
import { decryptPayload, formatCredentialsText } from "../services/encryption";
import { fetchTelegramFile, getPlaceholderSlipSvg } from "../services/telegram-file.service";
import { writeAudit } from "../services/audit.service";
import { getAnalytics } from "../services/analytics.service";
import { getRbac, requirePermission } from "../rbac/require-permission";
import { filterSettingsForPermissions } from "../rbac/catalog";
import { RbacContext } from "../services/rbac.service";

const ReviewDepositSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  rejectReason: z.string().optional(),
});

const DeactivateCustomerSchema = z.object({
  reason: z.string().max(500).optional(),
});

interface CachedSupplierStatus {
  supplier: "XPRO" | "DIGITALCORE";
  balanceUsd: string | number;
  currency: string;
  health: string;
  version: string;
  userId?: string | number;
  endpoint: string;
  latencyMs: number;
  updatedAt: number;
}

let supplierStatusCache: CachedSupplierStatus = {
  supplier: "XPRO",
  balanceUsd: "0.00",
  currency: "USD",
  health: "ONLINE",
  version: "1.0.0",
  userId: "8777968077",
  endpoint: config.UPSTREAM_BASE_URL.replace(/\/api\/partner\/v1\/?$/, ""),
  latencyMs: 45,
  updatedAt: 0,
};

let digitalcoreStatusCache: CachedSupplierStatus = {
  supplier: "DIGITALCORE",
  balanceUsd: "0.00",
  currency: "USD",
  health: "ONLINE",
  version: "1.0.0",
  userId: "digitalcore",
  endpoint: config.DIGITALCORE_BASE_URL,
  latencyMs: 50,
  updatedAt: 0,
};

let inFlightSupplierRefresh: Promise<CachedSupplierStatus> | null = null;
let inFlightDigitalcoreRefresh: Promise<CachedSupplierStatus> | null = null;

async function refreshSupplierStatus(force = false): Promise<CachedSupplierStatus> {
  const now = Date.now();
  // Return cached if fresh within 30 seconds unless forced
  if (!force && now - supplierStatusCache.updatedAt < 30_000 && supplierStatusCache.updatedAt > 0) {
    return supplierStatusCache;
  }

  // Deduplicate concurrent in-flight requests
  if (inFlightSupplierRefresh) {
    return inFlightSupplierRefresh;
  }

  inFlightSupplierRefresh = (async () => {
    const startPing = Date.now();
    try {
      const [balanceResult, healthResult] = await Promise.allSettled([
        xproClient.getBalance(4000),
        xproClient.getHealth(4000),
      ]);
      const latency = Math.max(1, Date.now() - startPing);

      let balance = supplierStatusCache.balanceUsd;
      let currency = supplierStatusCache.currency;
      let health = "OFFLINE";
      let version = supplierStatusCache.version;
      let userId = supplierStatusCache.userId;

      if (balanceResult.status === "fulfilled" && balanceResult.value) {
        balance = balanceResult.value.balanceUsd;
        currency = "USD";
      }

      if (healthResult.status === "fulfilled" && healthResult.value.online) {
        health = "ONLINE";
      } else if (balanceResult.status === "fulfilled") {
        health = "ONLINE";
      }

      supplierStatusCache = {
        supplier: "XPRO",
        balanceUsd: balance,
        currency,
        health,
        version,
        userId,
        endpoint: config.UPSTREAM_BASE_URL.replace(/\/api\/partner\/v1\/?$/, ""),
        latencyMs: latency,
        updatedAt: Date.now(),
      };
      return supplierStatusCache;
    } catch {
      supplierStatusCache = {
        ...supplierStatusCache,
        health: "OFFLINE",
        updatedAt: Date.now(),
      };
      return supplierStatusCache;
    } finally {
      inFlightSupplierRefresh = null;
    }
  })();

  return inFlightSupplierRefresh;
}

async function refreshDigitalcoreStatus(force = false): Promise<CachedSupplierStatus> {
  const now = Date.now();
  if (!force && now - digitalcoreStatusCache.updatedAt < 30_000 && digitalcoreStatusCache.updatedAt > 0) {
    return digitalcoreStatusCache;
  }

  if (inFlightDigitalcoreRefresh) {
    return inFlightDigitalcoreRefresh;
  }

  inFlightDigitalcoreRefresh = (async () => {
    const startPing = Date.now();
    try {
      const [balanceResult, healthResult] = await Promise.allSettled([
        digitalcoreClient.getBalance(4000),
        digitalcoreClient.getHealth(4000),
      ]);
      const latency = Math.max(1, Date.now() - startPing);

      let balance = digitalcoreStatusCache.balanceUsd;
      let currency = digitalcoreStatusCache.currency;
      let health = "OFFLINE";
      let version = digitalcoreStatusCache.version;
      let userId = digitalcoreStatusCache.userId;

      if (balanceResult.status === "fulfilled" && balanceResult.value) {
        balance = balanceResult.value.balanceUsd;
        currency = "USD";
      }

      if (healthResult.status === "fulfilled" && healthResult.value.online) {
        health = "ONLINE";
      } else if (balanceResult.status === "fulfilled") {
        health = "ONLINE";
      }

      digitalcoreStatusCache = {
        supplier: "DIGITALCORE",
        balanceUsd: balance,
        currency,
        health,
        version,
        userId,
        endpoint: config.DIGITALCORE_BASE_URL,
        latencyMs: latency,
        updatedAt: Date.now(),
      };
      return digitalcoreStatusCache;
    } catch {
      digitalcoreStatusCache = {
        ...digitalcoreStatusCache,
        health: "OFFLINE",
        updatedAt: Date.now(),
      };
      return digitalcoreStatusCache;
    } finally {
      inFlightDigitalcoreRefresh = null;
    }
  })();

  return inFlightDigitalcoreRefresh;
}

export async function adminRoutes(server: FastifyInstance) {
  // Proactively warm up supplier status in background on server startup
  refreshSupplierStatus(true).catch(() => {});
  refreshDigitalcoreStatus(true).catch(() => {});

  // GET /api/admin/stats (Dashboard overview summary stats)
  server.get(
    "/api/admin/stats",
    { preHandler: requirePermission("overview.view") },
    async () => {
    const db = getDb();

    // 1. Total revenue / sales from completed orders and order counts.
    // pendingOrders counts the real in-flight statuses (awaiting payment /
    // slip submitted) — 'PENDING'/'PROCESSING' never occur in this schema.
    const [salesResult] = await db
      .select({
        totalSalesMmk: sql<number>`coalesce(sum(case when ${orders.status} = 'DELIVERED' then ${orders.totalAmountMmk} else 0 end), 0)`,
        fulfilledOrders: sql<number>`count(case when ${orders.status} = 'DELIVERED' then 1 end)`,
        pendingOrders: sql<number>`count(case when ${orders.status} in ('PENDING_PAYMENT', 'PAYMENT_SUBMITTED') then 1 end)`,
        totalOrders: sql<number>`count(${orders.id})`,
      })
      .from(orders);

    // 2. Pending deposit slips count — both reviewable statuses, matching
    // the review flow's SUBMITTED|PENDING claim guard.
    const [depositsResult] = await db
      .select({
        pendingDepositsCount: sql<number>`count(${topUpRequests.id})`,
      })
      .from(topUpRequests)
      .where(inArray(topUpRequests.status, ["SUBMITTED", "PENDING"]));

    // 3. Active products count
    const [productsResult] = await db
      .select({
        activeProductsCount: sql<number>`count(${products.id})`,
      })
      .from(products)
      .where(eq(products.isActive, true));

    // 4. Supplier status (served from cache so dashboard stats NEVER block on external HTTP network)
    if (supplierStatusCache.updatedAt === 0) {
      // Fire background probe on initial server boot without awaiting
      refreshSupplierStatus().catch(() => {});
    }
    if (digitalcoreStatusCache.updatedAt === 0) {
      refreshDigitalcoreStatus().catch(() => {});
    }

    return {
      ok: true,
      stats: {
        totalSalesMmk: Number(salesResult?.totalSalesMmk || 0),
        totalOrders: Number(salesResult?.totalOrders || 0),
        fulfilledOrders: Number(salesResult?.fulfilledOrders || 0),
        pendingOrders: Number(salesResult?.pendingOrders || 0),
        pendingDepositsCount: Number(depositsResult?.pendingDepositsCount || 0),
        activeProductsCount: Number(productsResult?.activeProductsCount || 0),
        supplierBalanceUsd: Number(supplierStatusCache.balanceUsd) || 0,
        supplierHealth: supplierStatusCache.health,
        digitalcoreBalanceUsd: Number(digitalcoreStatusCache.balanceUsd) || 0,
        digitalcoreHealth: digitalcoreStatusCache.health,
        suppliers: {
          XPRO: {
            balanceUsd: Number(supplierStatusCache.balanceUsd) || 0,
            health: supplierStatusCache.health,
          },
          DIGITALCORE: {
            balanceUsd: Number(digitalcoreStatusCache.balanceUsd) || 0,
            health: digitalcoreStatusCache.health,
          },
        },
      },
    };
  });

  // GET /api/admin/analytics (Financial analytics, revenue, cost, profit, categories, top products)
  server.get(
    "/api/admin/analytics",
    { preHandler: requirePermission("analytics.view") },
    async (request) => {
      const query = request.query as {
        preset?: string;
        customDate?: string;
        startDate?: string;
        endDate?: string;
      };
      const data = await getAnalytics(query);
      return { ok: true, ...data };
    }
  );

  // Helper handler for supplier status
  async function handleSupplierStatus() {
    const [status, dcStatus] = await Promise.all([
      refreshSupplierStatus(),
      refreshDigitalcoreStatus(),
    ]);
    const db = getDb();
    const [[catResult], [xproProdResult], [dcProdResult]] = await Promise.all([
      db.select({ count: sql<number>`count(${categories.id})` }).from(categories),
      db.select({ count: sql<number>`count(${products.id})` }).from(products).where(eq(products.supplier, "XPRO")),
      db.select({ count: sql<number>`count(${products.id})` }).from(products).where(eq(products.supplier, "DIGITALCORE")),
    ]);

    let lastSyncedAt = catalogService.getLastSyncedAt();
    let dcLastSyncedAt: string | null = null;
    try {
      const rows = await db
        .select()
        .from(appSettings)
        .where(
          or(
            eq(appSettings.key, "catalog_last_synced_at"),
            eq(appSettings.key, "catalog_last_synced_at_DIGITALCORE")
          )
        );
      for (const r of rows) {
        if (r.key === "catalog_last_synced_at" && !lastSyncedAt) lastSyncedAt = r.value;
        if (r.key === "catalog_last_synced_at_DIGITALCORE") dcLastSyncedAt = r.value;
      }
    } catch {}

    const xproSupplier = {
      id: "XPRO",
      name: "XPro",
      balanceUsd: status.balanceUsd,
      currency: status.currency,
      health: status.health,
      version: status.version,
      userId: status.userId || "8777968077",
      endpoint: status.endpoint || "http://paid2.daki.cc:4153",
      latencyMs: status.latencyMs || 45,
      categoriesCount: Number(catResult?.count || 0),
      productsCount: Number(xproProdResult?.count || 0),
      autoSyncIntervalMinutes: config.CATALOG_SYNC_INTERVAL_MINUTES,
      lastSyncedAt: lastSyncedAt || null,
    };

    const dcSupplier = {
      id: "DIGITALCORE",
      name: "DigitalCore",
      balanceUsd: dcStatus.balanceUsd,
      currency: dcStatus.currency,
      health: dcStatus.health,
      version: dcStatus.version,
      userId: dcStatus.userId || "digitalcore",
      endpoint: dcStatus.endpoint || config.DIGITALCORE_BASE_URL,
      latencyMs: dcStatus.latencyMs || 50,
      categoriesCount: 1,
      productsCount: Number(dcProdResult?.count || 0),
      autoSyncIntervalMinutes: config.CATALOG_SYNC_INTERVAL_MINUTES,
      lastSyncedAt: dcLastSyncedAt || null,
    };

    return {
      ok: true,
      supplier: xproSupplier,
      suppliers: [xproSupplier, dcSupplier],
    };
  }

  // GET /api/admin/supplier/status (For top bar wallet widget & supplier diagnostics)
  server.get(
    "/api/admin/supplier/status",
    { preHandler: requirePermission("supplier.view") },
    async () => {
      try {
        return await handleSupplierStatus();
      } catch {
        return {
          ok: true,
          supplier: {
            balanceUsd: supplierStatusCache.balanceUsd,
            currency: supplierStatusCache.currency,
            health: "OFFLINE",
            version: "1.0",
            userId: supplierStatusCache.userId || "8777968077",
            endpoint: supplierStatusCache.endpoint || "http://paid2.daki.cc:4153",
            latencyMs: 0,
            categoriesCount: 0,
            productsCount: 0,
            autoSyncIntervalMinutes: config.CATALOG_SYNC_INTERVAL_MINUTES,
            lastSyncedAt: catalogService.getLastSyncedAt() || null,
          },
          suppliers: [
            {
              id: "XPRO",
              name: "XPro",
              balanceUsd: supplierStatusCache.balanceUsd,
              currency: supplierStatusCache.currency,
              health: "OFFLINE",
              version: "1.0",
              userId: supplierStatusCache.userId || "8777968077",
              endpoint: supplierStatusCache.endpoint || "http://paid2.daki.cc:4153",
              latencyMs: 0,
              categoriesCount: 0,
              productsCount: 0,
              autoSyncIntervalMinutes: config.CATALOG_SYNC_INTERVAL_MINUTES,
              lastSyncedAt: catalogService.getLastSyncedAt() || null,
            },
            {
              id: "DIGITALCORE",
              name: "DigitalCore",
              balanceUsd: digitalcoreStatusCache.balanceUsd,
              currency: digitalcoreStatusCache.currency,
              health: "OFFLINE",
              version: "1.0",
              userId: "digitalcore",
              endpoint: config.DIGITALCORE_BASE_URL,
              latencyMs: 0,
              categoriesCount: 0,
              productsCount: 0,
              autoSyncIntervalMinutes: config.CATALOG_SYNC_INTERVAL_MINUTES,
              lastSyncedAt: null,
            },
          ],
        };
      }
    }
  );

  // GET /api/admin/suppliers/status (Multi-supplier status endpoint)
  server.get(
    "/api/admin/suppliers/status",
    { preHandler: requirePermission("supplier.view") },
    async () => {
      return await handleSupplierStatus();
    }
  );

  // POST /api/admin/suppliers/:supplier/sync (Sync catalog for specific supplier or all)
  server.post<{ Params: { supplier: string } }>(
    "/api/admin/suppliers/:supplier/sync",
    { preHandler: requirePermission("supplier.sync") },
    async (request, reply) => {
      try {
        const target = request.params.supplier.toUpperCase();
        let result: any;
        if (target === "DIGITALCORE") {
          result = await catalogService.syncSupplier("DIGITALCORE");
        } else if (target === "XPRO") {
          result = await catalogService.syncSupplier("XPRO");
        } else if (target === "ALL") {
          result = await catalogService.syncFullCatalog();
        } else {
          return reply.status(400).send({
            ok: false,
            error: `Invalid supplier '${request.params.supplier}'. Valid values: 'xpro', 'digitalcore', 'all'`,
          });
        }

        await writeAudit({
          actorId: getRbac(request)?.userId ?? null,
          action: "SUPPLIER_SYNC",
          entityType: "SUPPLIER",
          entityId: target.toLowerCase(),
          details: { result },
        });

        return {
          ok: true,
          synced: result,
          lastSyncedAt: catalogService.getLastSyncedAt(),
        };
      } catch (err: any) {
        return reply.status(500).send({
          ok: false,
          error: `Sync error: ${err.message}`,
        });
      }
    }
  );

  // POST /api/admin/supplier/sync (Sync catalog from upstream suppliers)
  server.post(
    "/api/admin/supplier/sync",
    { preHandler: requirePermission("supplier.sync") },
    async (request, reply) => {
      try {
        const body = (request.body as { supplier?: string } | undefined) || {};
        const query = (request.query as { supplier?: string } | undefined) || {};
        const targetSupplier = (body.supplier || query.supplier || "ALL").toUpperCase();

        let result: any;
        if (targetSupplier === "DIGITALCORE") {
          result = await catalogService.syncSupplier("DIGITALCORE");
        } else if (targetSupplier === "XPRO") {
          result = await catalogService.syncSupplier("XPRO");
        } else {
          result = await catalogService.syncFullCatalog();
        }

        await writeAudit({
          actorId: getRbac(request)?.userId ?? null,
          action: "SUPPLIER_SYNC",
          entityType: "SUPPLIER",
          entityId: targetSupplier.toLowerCase(),
          details: { result },
        });

        return {
          ok: true,
          synced: result,
          lastSyncedAt: catalogService.getLastSyncedAt(),
        };
      } catch (err: any) {
        return reply.status(500).send({
          ok: false,
          error: `Sync error: ${err.message}`,
        });
      }
    }
  );

  // GET /api/admin/products (List all products with category and supplier snapshot info)
  server.get(
    "/api/admin/products",
    { preHandler: requirePermission("products.view") },
    async (request) => {
      const db = getDb();
      const rbac: RbacContext | undefined = getRbac(request);
      const perms = rbac?.permissions ?? [];
      const canSeeCost = perms.includes("products.show_cost");
      const canSeeMargin = perms.includes("products.show_margin");
      const canSeeSupplierWallet = perms.includes("supplier.view");

      const productRows = await db
        .select({
          id: products.id,
          supplier: products.supplier,
          upstreamProductId: products.upstreamProductId,
          categoryId: products.categoryId,
          categoryName: categories.name,
          nameMmk: products.nameMmk,
          descriptionMmk: products.descriptionMmk,
          retailPriceMmk: products.retailPriceMmk,
          localStockLimit: products.localStockLimit,
          isActive: products.isActive,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          supplierRawName: productSupplierSnapshots.rawName,
          supplierPriceUsd: productSupplierSnapshots.supplierPriceUsd,
          supplierStock: productSupplierSnapshots.supplierStock,
          deliveryType: productSupplierSnapshots.deliveryType,
          inStock: productSupplierSnapshots.inStock,
          pricingTiers: productSupplierSnapshots.pricingTiers,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .leftJoin(
          productSupplierSnapshots,
          and(
            eq(products.id, productSupplierSnapshots.productId),
            eq(products.supplier, productSupplierSnapshots.supplier)
          )
        )
        .orderBy(products.id);

      let xproWalletBalanceUsd = String(supplierStatusCache.balanceUsd || "0.00");
      let digitalcoreWalletBalanceUsd = String(digitalcoreStatusCache.balanceUsd || "0.00");
      try {
        const [xRes, dcRes] = await Promise.allSettled([
          xproClient.getBalance(2500),
          digitalcoreClient.getBalance(2500),
        ]);
        if (xRes.status === "fulfilled" && xRes.value) {
          const val = xRes.value as any;
          xproWalletBalanceUsd = String(val.balanceUsd ?? val.balance ?? xproWalletBalanceUsd);
        }
        if (dcRes.status === "fulfilled" && dcRes.value) {
          const val = dcRes.value as any;
          digitalcoreWalletBalanceUsd = String(val.balanceUsd ?? val.balance ?? digitalcoreWalletBalanceUsd);
        }
      } catch {
        // Fallback to cache if available
      }

      // Exchange rate for the server-computed margin %, so margin can be
      // hidden/shown independently of the USD cost column.
      let exchangeRate = 4500;
      try {
        const settingsList = await db.select().from(appSettings);
        for (const s of settingsList) {
          if (s.key === "usdToMmkRate") exchangeRate = Number(s.value) || 4500;
        }
      } catch {
        // Fall back to the default rate
      }

      const mappedProducts = productRows.map((p) => {
        const pSupplier = (p.supplier || "XPRO").toUpperCase();
        const effectiveWalletBalance =
          pSupplier === "DIGITALCORE" ? digitalcoreWalletBalanceUsd : xproWalletBalanceUsd;

        const stockCalc = calculateSellableStock({
          supplierStock: p.supplierStock ?? 999,
          supplierWalletBalanceUsd: effectiveWalletBalance,
          unitCostUsd: p.supplierPriceUsd || "0.00",
          localLimit: p.localStockLimit,
        });

        const costUsd = parseFloat(p.supplierPriceUsd || "0") || 0;
        const retailMmk = Number(p.retailPriceMmk) || 0;
        const marginPct =
          costUsd > 0 && retailMmk > 0
            ? Math.round((retailMmk / (costUsd * exchangeRate) - 1) * 100)
            : null;

        const row: Record<string, unknown> = {
          id: p.id,
          supplier: pSupplier,
          supplierProductId: p.upstreamProductId,
          categoryId: p.categoryId,
          categoryName: stripCustomEmojiPlaceholders(p.categoryName || "") || "Uncategorized",
          name: p.supplierRawName || p.nameMmk,
          nameMmk: p.nameMmk,
          description: p.descriptionMmk || "",
          supplierPriceUsd: p.supplierPriceUsd || "0.00",
          pricingTiers: p.pricingTiers || null,
          customPriceMmk: p.retailPriceMmk,
          retailPriceMmk: p.retailPriceMmk,
          pricingMode: "CUSTOM_OVERRIDE",
          marginPct,
          supplierStock: p.supplierStock ?? 999,
          walletCapacity: stockCalc.walletCapacity,
          sellableStock: stockCalc.sellableStock,
          isWalletConstrained: stockCalc.isWalletConstrained,
          localStockLimit: p.localStockLimit,
          stockSyncStatus: p.inStock ? "SYNCED" : "OUT_OF_STOCK",
          deliveryType: p.deliveryType || "CREDENTIALS",
          isActive: p.isActive,
          syncStatus: "SYNCED",
          updatedAt: p.updatedAt,
        };

        // Field-level hiding — enforced here, not just in the UI, so the data
        // is never sent over the wire without the field permission.
        if (!canSeeCost) {
          delete row.supplierPriceUsd;
          delete row.pricingTiers;
        }
        if (!canSeeMargin) {
          delete row.marginPct;
        }
        return row;
      });

      return {
        ok: true,
        walletBalanceUsd: canSeeSupplierWallet ? xproWalletBalanceUsd : null,
        digitalcoreWalletBalanceUsd: canSeeSupplierWallet ? digitalcoreWalletBalanceUsd : null,
        balances: {
          XPRO: canSeeSupplierWallet ? xproWalletBalanceUsd : null,
          DIGITALCORE: canSeeSupplierWallet ? digitalcoreWalletBalanceUsd : null,
        },
        products: mappedProducts,
      };
    }
  );

  // PUT /api/admin/products/:id (Update product pricing or stock limits)
  server.put<{ Params: { id: string } }>(
    "/api/admin/products/:id",
    { preHandler: requirePermission("products.edit") },
    async (request, reply) => {
      const productId = parseInt(request.params.id, 10);
      const body = {
        ...(request.body as Record<string, unknown>),
        productId,
      };

      const parseRes = UpdateProductPricingSchema.safeParse(body);
      if (!parseRes.success) {
        return reply.status(400).send({
          ok: false,
          error: "Validation error",
          issues: parseRes.error.issues,
        });
      }

      const db = getDb();
      const updateValues: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (parseRes.data.retailPriceMmk !== undefined) {
        updateValues.retailPriceMmk = parseRes.data.retailPriceMmk;
      }

      if (parseRes.data.localStockLimit !== undefined) {
        updateValues.localStockLimit = parseRes.data.localStockLimit;
      }
      if (parseRes.data.isActive !== undefined) {
        updateValues.isActive = parseRes.data.isActive;
      }
      if (parseRes.data.nameMmk) {
        updateValues.nameMmk = parseRes.data.nameMmk;
      }
      if (parseRes.data.descriptionMmk !== undefined) {
        updateValues.descriptionMmk = parseRes.data.descriptionMmk;
      }

      const [updated] = await db
        .update(products)
        .set(updateValues)
        .where(eq(products.id, productId))
        .returning();

      await writeAudit({
        actorId: getRbac(request)?.userId ?? null,
        action: "PRODUCT_UPDATE",
        entityType: "PRODUCT",
        entityId: productId,
        details: updateValues,
      });

      // Stock-relevant admin changes (pause/activate, local limit) can flip a
      // product back to buyable — announce immediately instead of waiting for
      // the next scheduled sync tick. Fire-and-forget: the response must not
      // wait on the broadcast, and the notifier's overlap guard makes a
      // concurrent tick harmless.
      if ("isActive" in updateValues || "localStockLimit" in updateValues) {
        void restockNotifier
          .detectAndNotify()
          .catch((err: any) =>
            console.warn("[RestockNotifier] Post-admin-edit detection failed:", err?.message)
          );
      }

      return {
        ok: true,
        product: updated,
      };
    }
  );

  // GET /api/admin/categories (List all categories for admin)
  server.get(
    "/api/admin/categories",
    { preHandler: requirePermission("products.view") },
    async () => {
      const db = getDb();
      const catList = await db
        .select()
        .from(categories)
        .orderBy(categories.sortOrder);

      return {
        ok: true,
        categories: catList.map((c) => ({
          ...c,
          cleanName: stripCustomEmojiPlaceholders(c.name),
        })),
      };
    }
  );

  // PUT /api/admin/categories/:id (Update category)
  server.put<{
    Params: { id: string };
    Body: { name?: string; iconEmoji?: string; sortOrder?: number; isActive?: boolean };
  }>(
    "/api/admin/categories/:id",
    { preHandler: requirePermission("products.edit") },
    async (request, reply) => {
      const categoryId = parseInt(request.params.id, 10);
      const db = getDb();

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (request.body.name !== undefined) updateData.name = request.body.name;
      if (request.body.iconEmoji !== undefined) updateData.iconEmoji = request.body.iconEmoji;
      if (request.body.sortOrder !== undefined) updateData.sortOrder = request.body.sortOrder;
      if (request.body.isActive !== undefined) updateData.isActive = request.body.isActive;

      const [updated] = await db
        .update(categories)
        .set(updateData)
        .where(eq(categories.id, categoryId))
        .returning();

      if (!updated) {
        return reply.status(404).send({ ok: false, error: "Category not found" });
      }

      await writeAudit({
        actorId: getRbac(request)?.userId ?? null,
        action: "CATEGORY_UPDATE",
        entityType: "CATEGORY",
        entityId: categoryId,
        details: updateData,
      });

      return {
        ok: true,
        category: updated,
      };
    }
  );

  // GET /api/admin/deposits (List wallet deposit slips)
  server.get<{
    Querystring: { status?: string };
  }>(
    "/api/admin/deposits",
    { preHandler: requirePermission("payments.view") },
    async (request) => {
    const db = getDb();
    const { status } = request.query;

    let query = db
      .select({
        id: topUpRequests.id,
        reference: topUpRequests.reference,
        amountMmk: topUpRequests.amountMmk,
        paymentMethod: topUpRequests.paymentMethod,
        transactionRef: topUpRequests.transactionRef,
        slipFileId: topUpRequests.slipFileId,
        status: topUpRequests.status,
        rejectReason: topUpRequests.rejectReason,
        intendedProduct: topUpRequests.intendedProduct,
        reviewedAt: topUpRequests.reviewedAt,
        createdAt: topUpRequests.createdAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          telegramId: users.telegramId,
        },
      })
      .from(topUpRequests)
      .innerJoin(users, eq(topUpRequests.userId, users.id))
      .orderBy(desc(topUpRequests.createdAt))
      .$dynamic();

    if (status && status !== "ALL") {
      query = query.where(eq(topUpRequests.status, status));
    }

    const slips = await query.limit(100);

    return {
      ok: true,
      slips: slips.map((s) => {
        const displayName = buildCustomerDisplayName(s.user);
        const username = s.user.username ? `@${s.user.username}` : null;
        return {
          id: s.id,
          reference: s.reference,
          user: displayName,
          displayName,
          firstName: s.user.firstName,
          lastName: s.user.lastName,
          username,
          telegramUsername: username,
          telegramId: s.user.telegramId,
          customer: {
            id: s.user.id,
            displayName,
            firstName: s.user.firstName,
            lastName: s.user.lastName,
            username: s.user.username,
            telegramId: s.user.telegramId,
          },
          amount: s.amountMmk,
          method: s.paymentMethod,
          txnRef: s.transactionRef || "-",
          slipUrl: s.slipFileId
            ? `/api/admin/telegram-file/${encodeURIComponent(s.slipFileId)}`
            : `/api/admin/deposits/${s.id}/slip-image`,
          intendedProduct: s.intendedProduct || "General Wallet Topup",
          status: s.status,
          date: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
          rejectReason: s.rejectReason,
        };
      }),
    };
  });

  // GET /api/admin/telegram-file/:fileId (Stream Telegram Photo Proxy)
  server.get<{ Params: { fileId: string } }>(
    "/api/admin/telegram-file/:fileId",
    { preHandler: requirePermission("payments.view") },
    async (request, reply) => {
    const fileId = request.params.fileId;
    try {
      const file = await fetchTelegramFile(fileId);
      if (!file) {
        reply.header("Content-Type", "image/svg+xml");
        reply.header("Cache-Control", "no-cache");
        return reply.send(getPlaceholderSlipSvg("Telegram file expired or not found"));
      }
      reply.header("Content-Type", file.contentType);
      reply.header("Cache-Control", "public, max-age=86400, immutable");
      return reply.send(file.buffer);
    } catch (err: any) {
      reply.header("Content-Type", "image/svg+xml");
      return reply.send(getPlaceholderSlipSvg(err.message || "Failed to load slip photo"));
    }
  });

  // GET /api/admin/telegram-file (Query string format)
  server.get<{ Querystring: { fileId?: string } }>(
    "/api/admin/telegram-file",
    { preHandler: requirePermission("payments.view") },
    async (request, reply) => {
    const fileId = request.query.fileId;
    if (!fileId) {
      reply.header("Content-Type", "image/svg+xml");
      return reply.send(getPlaceholderSlipSvg("No fileId specified"));
    }
    const file = await fetchTelegramFile(fileId);
    if (!file) {
      reply.header("Content-Type", "image/svg+xml");
      return reply.send(getPlaceholderSlipSvg("Telegram file expired or not found"));
    }
    reply.header("Content-Type", file.contentType);
    reply.header("Cache-Control", "public, max-age=86400, immutable");
    return reply.send(file.buffer);
  });

  // GET /api/admin/deposits/:id/slip-image (Direct Slip Image by Deposit ID)
  server.get<{ Params: { id: string } }>(
    "/api/admin/deposits/:id/slip-image",
    { preHandler: requirePermission("payments.view") },
    async (request, reply) => {
    const depositId = parseInt(request.params.id, 10);
    const db = getDb();
    const [topUp] = await db
      .select({ id: topUpRequests.id, slipFileId: topUpRequests.slipFileId })
      .from(topUpRequests)
      .where(eq(topUpRequests.id, depositId))
      .limit(1);

    if (!topUp || !topUp.slipFileId) {
      reply.header("Content-Type", "image/svg+xml");
      return reply.send(getPlaceholderSlipSvg(topUp ? "No slip attached to deposit" : "Deposit record not found"));
    }

    const file = await fetchTelegramFile(topUp.slipFileId);
    if (!file) {
      reply.header("Content-Type", "image/svg+xml");
      return reply.send(getPlaceholderSlipSvg("Slip file expired on Telegram"));
    }

    reply.header("Content-Type", file.contentType);
    reply.header("Cache-Control", "public, max-age=86400, immutable");
    return reply.send(file.buffer);
  });

  // POST /api/admin/deposits/:id/review (Approve or Reject top-up request)
  // Thin wrapper — the implementation lives in deposit-review.service.ts and
  // is shared with the internal bot route (POST /api/bot/deposits/:id/review).
  server.post<{ Params: { id: string } }>(
    "/api/admin/deposits/:id/review",
    { preHandler: requirePermission("payments.review") },
    async (request, reply) => {
      const depositId = parseInt(request.params.id, 10);
      const parseRes = ReviewDepositSchema.safeParse(request.body);
      if (!parseRes.success) {
        return reply.status(400).send({
          ok: false,
          error: "Validation failed",
          issues: parseRes.error.issues,
        });
      }

      const result = await reviewDeposit({
        depositId,
        action: parseRes.data.action,
        rejectReason: parseRes.data.rejectReason,
        actor: { kind: "ADMIN", adminUserId: getRbac(request)?.userId ?? null },
      });

      if (!result.ok) {
        if (result.code === "NOT_FOUND") {
          return reply.status(404).send({ ok: false, error: "Deposit request not found" });
        }
        return reply.status(400).send({
          ok: false,
          error: `Deposit request is already ${result.status}.`,
        });
      }

      if (result.action === "APPROVED") {
        return { ok: true, action: "APPROVED", newBalanceMmk: result.newBalanceMmk };
      }
      return { ok: true, action: "REJECTED" };
    }
  );

  // GET /api/admin/orders (List all product orders with items and deliveries)
  server.get<{ Querystring: { limit?: string } }>(
    "/api/admin/orders",
    { preHandler: requirePermission("orders.view") },
    async (request) => {
    const db = getDb();
    const limit = Math.min(Math.max(1, Number(request.query?.limit) || 100), 100);
    const orderList = await db
      .select({
        id: orders.id,
        publicOrderNo: orders.publicOrderNo,
        status: orders.status,
        totalAmountMmk: orders.totalAmountMmk,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        customer: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          telegramId: users.telegramId,
        },
      })
      .from(orders)
      .innerJoin(users, eq(orders.customerId, users.id))
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    const orderIds = orderList.map((o) => o.id);
    if (orderIds.length === 0) {
      return { ok: true, orders: [] };
    }

    // Batch fetch items and deliveries in parallel instead of N+1 per order
    const [allItems, allDeliveries] = await Promise.all([
      db
        .select({
          id: orderItems.id,
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          productName: orderItems.productNameSnapshot,
          quantity: orderItems.quantity,
          unitPriceMmk: orderItems.unitPriceMmk,
          subtotalMmk: orderItems.subtotalMmk,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds)),
      db
        .select()
        .from(orderDeliveries)
        .where(inArray(orderDeliveries.orderId, orderIds)),
    ]);

    const itemsByOrderId = new Map<string, typeof allItems>();
    for (const item of allItems) {
      const list = itemsByOrderId.get(item.orderId) || [];
      list.push(item);
      itemsByOrderId.set(item.orderId, list);
    }

    const deliveriesByOrderId = new Map<string, typeof allDeliveries>();
    for (const delivery of allDeliveries) {
      const list = deliveriesByOrderId.get(delivery.orderId) || [];
      list.push(delivery);
      deliveriesByOrderId.set(delivery.orderId, list);
    }

    const enrichedOrders = orderList.map((o) => {
      const items = itemsByOrderId.get(o.id) || [];
      const deliveries = deliveriesByOrderId.get(o.id) || [];

      const decryptedDeliveries = deliveries.map((d) => {
        let payload: any = d.encryptedPayload;
        try {
          payload = formatCredentialsText(decryptPayload(d.encryptedPayload));
        } catch {
          // Raw text or fallback
        }
        return {
          id: d.id,
          deliveryType: d.deliveryType,
          deliveredAt: d.deliveredAt,
          customerViewedAt: d.customerViewedAt,
          payload,
        };
      });

      const firstItem = items[0];

      return {
        id: o.publicOrderNo,
        orderId: o.id,
        user: o.customer.username
          ? `@${o.customer.username}`
          : `${o.customer.firstName} ${o.customer.lastName || ""}`.trim(),
        telegramId: o.customer.telegramId,
        product: firstItem ? firstItem.productName : "Digital Product",
        qty: firstItem ? firstItem.quantity : 1,
        totalMmk: o.totalAmountMmk,
        status: o.status === "DELIVERED" ? "DELIVERED" : o.status === "CANCELLED" ? "REFUNDED" : "PROCESSING",
        date: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
        delivery: decryptedDeliveries[0]?.payload || "Delivered directly to user chat",
        rawDeliveries: decryptedDeliveries,
      };
    });

    return {
      ok: true,
      orders: enrichedOrders,
    };
  });

  // POST /api/admin/orders/:id/refund (Refund order to customer's wallet and notify on Telegram)
  server.post(
    "/api/admin/orders/:id/refund",
    { preHandler: requirePermission("orders.refund") },
    async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { reason?: string };
    const reason = body.reason?.trim() || "Admin Customer Support Refund";
    const db = getDb();

    // 1. Locate the order (by UUID or publicOrderNo)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const [order] = await db
      .select({
        id: orders.id,
        publicOrderNo: orders.publicOrderNo,
        status: orders.status,
        totalAmountMmk: orders.totalAmountMmk,
        customerId: orders.customerId,
        customerTelegramId: users.telegramId,
        customerName: users.firstName,
      })
      .from(orders)
      .innerJoin(users, eq(orders.customerId, users.id))
      .where(isUuid ? eq(orders.id, id) : eq(orders.publicOrderNo, id))
      .limit(1);

    if (!order) {
      return reply.code(404).send({ ok: false, error: "Order not found" });
    }

    if (order.status === "REFUNDED") {
      return reply.code(400).send({ ok: false, error: "This order has already been refunded" });
    }

    // 2. Fetch or create customer's wallet
    let [wallet] = await db.select().from(wallets).where(eq(wallets.userId, order.customerId)).limit(1);
    if (!wallet) {
      const [newWallet] = await db
        .insert(wallets)
        .values({
          userId: order.customerId,
          balanceMmk: 0,
          totalDepositedMmk: 0,
          totalSpentMmk: 0,
        })
        .returning();
      wallet = newWallet;
    }

    // 3. Atomically update wallet balance, write ledger entry, and update order status in a single transaction
    let newBalance = wallet.balanceMmk + order.totalAmountMmk;

    const runTransaction =
      typeof (db as any).transaction === "function"
        ? (db as any).transaction.bind(db)
        : async (cb: any) => cb(db);

    await runTransaction(async (tx: any) => {
      const [updatedWallet] = await tx
        .update(wallets)
        .set({
          balanceMmk: sql`${wallets.balanceMmk} + ${order.totalAmountMmk}`,
          totalSpentMmk: sql`GREATEST(0, ${wallets.totalSpentMmk} - ${order.totalAmountMmk})`,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, wallet.id))
        .returning();

      if (updatedWallet) {
        newBalance = updatedWallet.balanceMmk;
      }

      await tx.insert(walletLedger).values({
        walletId: wallet.id,
        amountMmk: order.totalAmountMmk,
        type: "REFUND_CREDIT",
        referenceId: order.publicOrderNo,
        notes: `Refund for ${order.publicOrderNo}: ${reason}`,
      });

      await tx
        .update(orders)
        .set({
          status: "REFUNDED",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    });

    // 4. Send Telegram instant notification to customer
    if (order.customerTelegramId) {
      await notifyOrderRefunded({
        telegramId: order.customerTelegramId,
        publicOrderNo: order.publicOrderNo,
        amountMmk: order.totalAmountMmk,
        newBalanceMmk: newBalance,
        reason,
      });
    }

    await writeAudit({
      actorId: getRbac(request)?.userId ?? null,
      action: "ORDER_REFUND",
      entityType: "ORDER",
      entityId: order.id,
      details: {
        publicOrderNo: order.publicOrderNo,
        refundedAmountMmk: order.totalAmountMmk,
        newBalanceMmk: newBalance,
        reason,
      },
    });

    return {
      ok: true,
      publicOrderNo: order.publicOrderNo,
      refundedAmountMmk: order.totalAmountMmk,
      newBalanceMmk: newBalance,
      customerName: order.customerName,
    };
  });

  // POST /api/admin/orders/:id/resend (Re-send digital credentials to customer's Telegram chat)
  server.post(
    "/api/admin/orders/:id/resend",
    { preHandler: requirePermission("orders.resend") },
    async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    // 1. Locate the order
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const [order] = await db
      .select({
        id: orders.id,
        publicOrderNo: orders.publicOrderNo,
        status: orders.status,
        customerId: orders.customerId,
        customerTelegramId: users.telegramId,
        customerName: users.firstName,
      })
      .from(orders)
      .innerJoin(users, eq(orders.customerId, users.id))
      .where(isUuid ? eq(orders.id, id) : eq(orders.publicOrderNo, id))
      .limit(1);

    if (!order) {
      return reply.code(404).send({ ok: false, error: "Order not found" });
    }

    // 2. Fetch product name and delivery credentials
    const items = await db
      .select({ productName: orderItems.productNameSnapshot })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const productName = items[0]?.productName || "Digital Product";

    const deliveries = await db
      .select()
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, order.id));

    let credentialsText = "Direct Delivery";
    if (deliveries.length > 0) {
      try {
        const decrypted = decryptPayload(deliveries[0].encryptedPayload);
        credentialsText = formatCredentialsText(decrypted);
      } catch {
        credentialsText = deliveries[0].encryptedPayload;
      }
    }

    // 3. Send Telegram delivery message to customer
    if (!order.customerTelegramId) {
      return reply.code(400).send({ ok: false, error: "Customer does not have a linked Telegram ID" });
    }

    const sent = await notifyOrderCredentialsResent({
      telegramId: order.customerTelegramId,
      publicOrderNo: order.publicOrderNo,
      productName,
      credentialsText,
    });

    if (!sent) {
      return reply.code(502).send({ ok: false, error: "Failed to send Telegram message to customer" });
    }

    await writeAudit({
      actorId: getRbac(request)?.userId ?? null,
      action: "ORDER_RESEND",
      entityType: "ORDER",
      entityId: order.id,
      details: { publicOrderNo: order.publicOrderNo },
    });

    return {
      ok: true,
      message: `Credentials for ${order.publicOrderNo} successfully re-sent to customer on Telegram!`,
    };
  });

  // GET /api/admin/settings (Get all app settings — filtered by settings sub-permissions)
  server.get(
    "/api/admin/settings",
    { preHandler: requirePermission("settings.view") },
    async (request) => {
      const db = getDb();
      const settingsList = await db.select().from(appSettings);
      const settingsMap: Record<string, string> = {};
      for (const s of settingsList) {
        settingsMap[s.key] = s.value;
      }

      const defaults = {
        usdToMmkRate: "4500",
        defaultMarginPct: "25",
        supportTelegramHandle: "@ArenaStoreSupport",
        kpayAccountName: "Arena Digital Services",
        kpayPhone: "09 987 654 321",
        wavepayAccountName: "Arena Store",
        wavepayPhone: "09 789 123 456",
        ayapayAccountName: "Arena Store",
        ayapayPhone: "09 987 654 321",
        uabpayAccountName: "Arena Store",
        uabpayPhone: "09 789 123 456",
        isMaintenanceMode: "false",
        orderTimeoutMinutes: "15",
        restockNotificationsEnabled: "true",
        telegramGroupChatId: "",
        telegramDepositTopicId: "",
        telegramBotAlertTopicId: "",
        telegramAdminMentions: "",
        telegramApproverIds: "",
        balanceAlertThresholdUsd: settingsMap["supplier.balanceAlertThresholdUsd"] || settingsMap["balanceAlertThresholdUsd"] || "5",
      };

      const merged = { ...defaults, ...settingsMap };
      const perms = getRbac(request)?.permissions ?? [];
      // Only settings groups the role may edit are readable — payment account
      // numbers etc. stay hidden without settings.payments.
      const visible = filterSettingsForPermissions(merged, perms).allowed;

      return {
        ok: true,
        settings: visible,
      };
    }
  );

  // PUT /api/admin/settings (Update app settings key-values — whitelisted by sub-permissions)
  server.put<{ Body: Record<string, string> }>(
    "/api/admin/settings",
    { preHandler: requirePermission("settings.view") },
    async (request, reply) => {
      const db = getDb();
      const rbac = getRbac(request);
      const perms = rbac?.permissions ?? [];
      const { allowed, denied } = filterSettingsForPermissions(request.body, perms);

      // Fail closed: a role with no settings edit permission cannot change
      // anything, and a payload touching groups it may not edit is rejected
      // outright — never silently trimmed.
      if (denied.length > 0) {
        return reply.status(403).send({
          ok: false,
          error: `Permission denied. You cannot edit these settings keys: ${denied.join(", ")}.`,
        });
      }
      if (Object.keys(allowed).length === 0) {
        return reply.status(403).send({
          ok: false,
          error: "Permission denied. No settings edit permission granted.",
        });
      }

      if (allowed.balanceAlertThresholdUsd !== undefined) {
        allowed["supplier.balanceAlertThresholdUsd"] = allowed.balanceAlertThresholdUsd;
      }

      // Single multi-row upsert — one DB round-trip instead of one per key
      // (sequential awaits made Save take seconds against the remote Neon DB).
      await db
        .insert(appSettings)
        .values(
          Object.entries(allowed).map(([key, value]) => ({
            key,
            value: String(value),
            updatedAt: new Date(),
          }))
        )
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: sql`excluded.value`,
            updatedAt: sql`excluded.updated_at`,
          },
        });

      await writeAudit({
        actorId: rbac?.userId ?? null,
        action: "SETTINGS_UPDATE",
        entityType: "SETTING",
        entityId: "app_settings",
        details: { keys: Object.keys(allowed), values: allowed },
      });

      return {
        ok: true,
        message: "Settings saved successfully",
      };
    }
  );

  // POST /api/admin/settings/test-group-notify (Send a test message into the
  // configured admin Telegram group/topic — or an ad-hoc one supplied in the
  // body — so the deposit-slip relay can be verified before saving settings.)
  server.post<{ Body: { chatId?: string; topicId?: string; mentions?: string } }>(
    "/api/admin/settings/test-group-notify",
    { preHandler: requirePermission("settings.operations") },
    async (request, reply) => {
      const db = getDb();
      const rows = await db.select().from(appSettings);
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;

      const chatId = String(request.body?.chatId ?? map.telegramGroupChatId ?? "").trim();
      const topicRaw = String(request.body?.topicId ?? map.telegramDepositTopicId ?? "").trim();
      // Mentions come from the form body first so Send Test reflects what the
      // admin sees on screen — an unsaved mentions value must not be ignored.
      const mentionsRaw = String(request.body?.mentions ?? map.telegramAdminMentions ?? "");

      if (!chatId) {
        return reply
          .status(400)
          .send({ ok: false, error: "Group Chat ID မထည့်ရသေးပါ။" });
      }
      if (!/^-?\d{5,}$/.test(chatId)) {
        return reply.status(400).send({
          ok: false,
          error:
            "Group Chat ID ပုံစံ မှားနေပါသည်။ ဥပမာ: -1001234567890 (message link ထဲက t.me/c/<n> ကို -100 နဲ့ ဦးပေါ်တည်ပါ)။",
        });
      }
      if (!config.TELEGRAM_BOT_TOKEN) {
        return reply
          .status(500)
          .send({ ok: false, error: "Server has no TELEGRAM_BOT_TOKEN configured." });
      }

      const threadId = parseInt(topicRaw, 10);
      const mentionNames = mentionsRaw
        .split(/[\s,|]+/)
        .map((t) => t.replace(/^@/, "").trim())
        .filter((t) => /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(t));
      const mentionLine =
        mentionNames.length > 0
          ? `\n\n${tgEmoji(BOT_EMOJIS.BELL, "🔔")} ${mentionNames.map((n) => `@${n}`).join(" | ")}`
          : "";
      try {
        // AbortSignal caps a dropped connection at 10s instead of the default
        // ~2min TCP timeout; one retry rides out transient ETIMEDOUT blips.
        const res = await (async () => {
          const payload = {
            chat_id: chatId,
            text:
              `✅ <b>Arena Store Bot ချိတ်ဆက်မှု အတည်ပြုပြီး</b>\n\n` +
              `Deposit slip အသစ်များ တွေ့ရတိုင်း ဤ group/topic ထဲသို့ အလိုအလျောက် ပို့ပေးပါမည်။` +
              mentionLine,
            parse_mode: "HTML",
            ...(Number.isFinite(threadId) && threadId > 0 ? { message_thread_id: threadId } : {}),
          };
          for (let attempt = 1; ; attempt++) {
            try {
              return await fetch(
                `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                  signal: AbortSignal.timeout(10_000),
                }
              );
            } catch (err) {
              if (attempt >= 2) throw err;
            }
          }
        })();
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const desc = data?.description || `HTTP ${res.status}`;
          return reply.status(502).send({ ok: false, error: `Telegram: ${desc}` });
        }
        return { ok: true, message: "စမ်းသပ်စာ ပို့ပြီးပါပြီ — Group/Topic ကို စစ်ဆေးပါ။" };
      } catch (err: any) {
        // undici wraps the real socket/DNS failure in err.cause — without it
        // every network-layer failure shows up as a useless "fetch failed".
        const cause = err?.cause?.code || err?.cause?.message || "";
        const detail =
          err?.name === "TimeoutError"
            ? `Telegram request timed out after 10s${cause ? ` (${cause})` : ""}`
            : `${err?.message}${cause ? ` (${cause})` : ""}`;
        return reply.status(502).send({ ok: false, error: `Network error: ${detail}` });
      }
    }
  );

  // POST /api/admin/settings/recalculate-prices (Recalculate all products with current exchange rate)
  server.post(
    "/api/admin/settings/recalculate-prices",
    { preHandler: requirePermission("settings.pricing") },
    async (request) => {
      const db = getDb();
      const settingsList = await db.select().from(appSettings);
      const settingsMap: Record<string, string> = {};
      for (const s of settingsList) {
        settingsMap[s.key] = s.value;
      }

      const exchangeRate = Number(settingsMap.usdToMmkRate) || 4500;
      const marginPct = Number(settingsMap.defaultMarginPct) || 25;

      const prodsWithSnapshots = await db
        .select({
          productId: products.id,
          supplierPriceUsd: productSupplierSnapshots.supplierPriceUsd,
        })
        .from(products)
        .innerJoin(
          productSupplierSnapshots,
          eq(products.id, productSupplierSnapshots.productId)
        );

      let updatedCount = 0;
      // Compute all prices in memory, then write in parallel batches —
      // one sequential await per product over the remote Neon DB made this
      // take seconds even for ~40 products.
      const priceUpdates = prodsWithSnapshots
        .map((p) => {
          const usdPrice = parseFloat(p.supplierPriceUsd) || 0;
          if (usdPrice <= 0) return null;
          const pricing = calculateRetailMmk({
            upstreamUsdCost: usdPrice,
            exchangeRateMmk: exchangeRate,
            marginPercentage: marginPct,
            roundToNearest: 100,
          });
          return { productId: p.productId, retailPriceMmk: pricing.retailPriceMmk };
        })
        .filter((u): u is NonNullable<typeof u> => u !== null);

      const BATCH_SIZE = 10;
      for (let i = 0; i < priceUpdates.length; i += BATCH_SIZE) {
        await Promise.all(
          priceUpdates.slice(i, i + BATCH_SIZE).map((u) =>
            db
              .update(products)
              .set({
                retailPriceMmk: u.retailPriceMmk,
                updatedAt: new Date(),
              })
              .where(eq(products.id, u.productId))
          )
        );
      }
      updatedCount = priceUpdates.length;

      await writeAudit({
        actorId: getRbac(request)?.userId ?? null,
        action: "RECALCULATE_PRICES",
        entityType: "PRODUCT",
        entityId: "bulk",
        details: { updatedCount, exchangeRate, marginPct },
      });

      return {
        ok: true,
        updatedCount,
        exchangeRate,
        marginPct,
        message: `Successfully recalculated ${updatedCount} products using 1 USD = ${exchangeRate.toLocaleString()} MMK (${marginPct}% margin).`,
      };
    }
  );

  // GET /api/admin/customers (List customers with wallet balances, order counts, stats)
  server.get<{
    Querystring: {
      search?: string;
      balanceFilter?: string;
      sortBy?: string;
      page?: string;
      pageSize?: string;
      statusFilter?: string;
    };
  }>(
    "/api/admin/customers",
    { preHandler: requirePermission("customers.view") },
    async (request) => {
      const db = getDb();
      const {
        search,
        balanceFilter,
        sortBy = "balance_desc",
        statusFilter = "active",
      } = request.query;

      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));

      // Staff accounts (any role) are never customers — exclude ADMIN and SUPERADMIN.
      const notStaff = and(ne(users.role, "ADMIN"), ne(users.role, "SUPERADMIN"));

      // 1. Overall KPI summary (customers only)
      const [kpiResult] = await db
        .select({
          totalCustomers: sql<number>`count(distinct ${users.id})`,
          customersWithBalance: sql<number>`count(distinct case when coalesce(${wallets.balanceMmk}, 0) > 0 then ${users.id} end)`,
          totalWalletBalanceMmk: sql<number>`coalesce(sum(case when ${wallets.balanceMmk} > 0 then ${wallets.balanceMmk} else 0 end), 0)`,
          totalSpentMmk: sql<number>`coalesce(sum(${wallets.totalSpentMmk}), 0)`,
        })
        .from(users)
        .leftJoin(wallets, eq(users.id, wallets.userId))
        .where(notStaff);

      // 2. Subquery for orders aggregated per customer
      const orderStats = db
        .select({
          customerId: orders.customerId,
          orderCount: sql<number>`count(${orders.id})`.as("order_count"),
          deliveredSpentMmk: sql<number>`coalesce(sum(case when ${orders.status} = 'DELIVERED' then ${orders.totalAmountMmk} else 0 end), 0)`.as("delivered_spent_mmk"),
          lastOrderAt: sql<Date | null>`max(${orders.createdAt})`.as("last_order_at"),
        })
        .from(orders)
        .groupBy(orders.customerId)
        .as("order_stats");

      // 3. WHERE conditions pushed down to SQL (role, status, search, balance)
      const conditions = [notStaff];

      if (statusFilter === "deactivated") {
        conditions.push(ne(users.status, "ACTIVE"));
      } else if (statusFilter !== "all") {
        conditions.push(eq(users.status, "ACTIVE"));
      }

      const term = search?.trim().replace(/^@/, "").toLowerCase() || "";
      if (term) {
        const pattern = `%${term}%`;
        const searchCondition = or(
          ilike(users.telegramId, pattern),
          ilike(users.username, pattern),
          sql`(coalesce(${users.firstName}, '') || ' ' || coalesce(${users.lastName}, '')) ilike ${pattern}`,
          sql`cast(${users.id} as text) ilike ${pattern}`
        );
        if (searchCondition) conditions.push(searchCondition);
      }

      if (balanceFilter === "has_balance") {
        conditions.push(sql`coalesce(${wallets.balanceMmk}, 0) > 0`);
      } else if (balanceFilter === "zero_balance") {
        conditions.push(sql`coalesce(${wallets.balanceMmk}, 0) = 0`);
      }

      const whereExpr = and(...conditions);

      // 4. Total count for pagination (same joins/where)
      const [countResult] = await db
        .select({ total: sql<number>`count(distinct ${users.id})` })
        .from(users)
        .leftJoin(wallets, eq(users.id, wallets.userId))
        .leftJoin(orderStats, eq(users.id, orderStats.customerId))
        .where(whereExpr);
      const total = Number(countResult?.total || 0);

      // 5. Sort expressions (SQL level) with stable id tiebreaker
      const balanceExpr = sql`coalesce(${wallets.balanceMmk}, 0)`;
      const spentExpr = sql`greatest(coalesce(${wallets.totalSpentMmk}, 0), coalesce(${orderStats.deliveredSpentMmk}, 0))`;
      const orderCountExpr = sql`coalesce(${orderStats.orderCount}, 0)`;

      let orderByExpr: ReturnType<typeof desc>;
      if (sortBy === "balance_asc") orderByExpr = asc(balanceExpr);
      else if (sortBy === "spent_desc") orderByExpr = desc(spentExpr);
      else if (sortBy === "orders_desc") orderByExpr = desc(orderCountExpr);
      else if (sortBy === "newest") orderByExpr = desc(users.createdAt);
      else orderByExpr = desc(balanceExpr);

      // 6. Page of customer users joined with wallets and order stats
      const rows = await db
        .select({
          id: users.id,
          telegramId: users.telegramId,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          walletId: wallets.id,
          balanceMmk: sql<number>`coalesce(${wallets.balanceMmk}, 0)`,
          totalDepositedMmk: sql<number>`coalesce(${wallets.totalDepositedMmk}, 0)`,
          walletTotalSpentMmk: sql<number>`coalesce(${wallets.totalSpentMmk}, 0)`,
          orderCount: sql<number>`coalesce(${orderStats.orderCount}, 0)`,
          deliveredSpentMmk: sql<number>`coalesce(${orderStats.deliveredSpentMmk}, 0)`,
          lastOrderAt: orderStats.lastOrderAt,
        })
        .from(users)
        .leftJoin(wallets, eq(users.id, wallets.userId))
        .leftJoin(orderStats, eq(users.id, orderStats.customerId))
        .where(whereExpr)
        .orderBy(orderByExpr, asc(users.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      // Transform and map
      const customerList = rows.map((r) => {
        const fullName = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
        let displayName = fullName;
        if (!displayName || displayName === "Customer") {
          if (r.username) {
            displayName = `@${r.username}`;
          } else if (r.telegramId) {
            displayName = `User ${r.telegramId}`;
          } else {
            displayName = `Customer #${r.id}`;
          }
        }
        const effectiveSpent = Math.max(
          Number(r.walletTotalSpentMmk || 0),
          Number(r.deliveredSpentMmk || 0)
        );

        return {
          id: r.id,
          telegramId: r.telegramId,
          username: r.username,
          firstName: r.firstName,
          lastName: r.lastName,
          displayName,
          role: r.role,
          status: r.status,
          walletBalanceMmk: Number(r.balanceMmk || 0),
          totalDepositedMmk: Number(r.totalDepositedMmk || 0),
          totalSpentMmk: effectiveSpent,
          ordersCount: Number(r.orderCount || 0),
          lastActive: r.lastOrderAt || r.updatedAt || r.createdAt,
          createdAt: r.createdAt,
        };
      });

      return {
        ok: true,
        stats: {
          totalCustomers: Number(kpiResult?.totalCustomers || 0),
          customersWithBalance: Number(kpiResult?.customersWithBalance || 0),
          totalWalletBalanceMmk: Number(kpiResult?.totalWalletBalanceMmk || 0),
          totalSpentMmk: Number(kpiResult?.totalSpentMmk || 0),
        },
        total,
        page,
        pageSize,
        customers: customerList,
      };
    }
  );

  // GET /api/admin/customers/:id (Customer full details, order history, topup slips, ledger)
  server.get<{ Params: { id: string } }>(
    "/api/admin/customers/:id",
    { preHandler: requirePermission("customers.view") },
    async (request, reply) => {
    const rawId = request.params.id;
    const db = getDb();
    let user = null;

    const numericId = parseInt(rawId, 10);
    if (!isNaN(numericId) && numericId > 0 && numericId <= 2147483647) {
      const [found] = await db.select().from(users).where(eq(users.id, numericId));
      if (found) user = found;
    }

    if (!user) {
      const [found] = await db.select().from(users).where(eq(users.telegramId, rawId));
      if (found) user = found;
    }

    if (!user) {
      return reply.status(404).send({ ok: false, error: "Customer not found" });
    }

    const customerId = user.id;

    // Wallet
    let [wallet] = await db.select().from(wallets).where(eq(wallets.userId, customerId));
    if (!wallet) {
      const [created] = await db
        .insert(wallets)
        .values({
          userId: customerId,
          balanceMmk: 0,
          totalDepositedMmk: 0,
          totalSpentMmk: 0,
        })
        .returning();
      wallet = created;
    }

    // Orders / Purchases
    const customerOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt));

    const orderIds = customerOrders.map((o) => o.id);
    const [rawItems, rawDeliveries] = orderIds.length > 0
      ? await Promise.all([
          db
            .select({
              id: orderItems.id,
              orderId: orderItems.orderId,
              productId: orderItems.productId,
              productName: orderItems.productNameSnapshot,
              quantity: orderItems.quantity,
              unitPriceMmk: orderItems.unitPriceMmk,
              subtotalMmk: orderItems.subtotalMmk,
            })
            .from(orderItems)
            .where(inArray(orderItems.orderId, orderIds)),
          db
            .select()
            .from(orderDeliveries)
            .where(inArray(orderDeliveries.orderId, orderIds)),
        ])
      : [[], []];

    const itemsByOrder = new Map<string, typeof rawItems>();
    for (const item of rawItems) {
      const arr = itemsByOrder.get(item.orderId) || [];
      arr.push(item);
      itemsByOrder.set(item.orderId, arr);
    }

    const deliveriesByOrder = new Map<string, typeof rawDeliveries>();
    for (const del of rawDeliveries) {
      const arr = deliveriesByOrder.get(del.orderId) || [];
      arr.push(del);
      deliveriesByOrder.set(del.orderId, arr);
    }

    const enrichedOrders = customerOrders.map((o) => {
      const items = itemsByOrder.get(o.id) || [];
      const deliveries = deliveriesByOrder.get(o.id) || [];

      const decryptedDeliveries = deliveries.map((d) => {
        let plainCredentials = "";
        if (d.encryptedPayload) {
          try {
            plainCredentials = formatCredentialsText(decryptPayload(d.encryptedPayload));
          } catch {
            plainCredentials = "[Encrypted Data]";
          }
        }
        return {
          id: d.id,
          deliveryType: d.deliveryType,
          deliveredAt: d.deliveredAt,
          customerViewedAt: d.customerViewedAt,
          credentials: plainCredentials,
        };
      });

        return {
          id: o.id,
          publicOrderNo: o.publicOrderNo,
          externalOrderId: o.externalOrderId,
          status: o.status,
          totalAmountMmk: o.totalAmountMmk,
          notes: o.notes,
          createdAt: o.createdAt,
          items,
          deliveries: decryptedDeliveries,
        };
      });

    // Deposit Slips / Top-ups
    const topUps = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.userId, customerId))
      .orderBy(desc(topUpRequests.createdAt));

    const enrichedTopUps = topUps.map((t) => ({
      id: t.id,
      reference: t.reference,
      amountMmk: t.amountMmk,
      paymentMethod: t.paymentMethod,
      transactionRef: t.transactionRef,
      slipFileId: t.slipFileId,
      slipUrl: t.slipFileId ? `/api/admin/deposits/${t.id}/slip-image` : null,
      status: t.status,
      rejectReason: t.rejectReason,
      intendedProduct: t.intendedProduct,
      reviewedAt: t.reviewedAt,
      createdAt: t.createdAt,
    }));

    // Wallet Ledger / Audit Trail (newest first). The table stores only deltas,
    // so the balance after each entry is rebuilt backwards from the current
    // wallet balance — the newest entry always ends exactly at balanceMmk.
    const ledgerRows = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.walletId, wallet.id))
      .orderBy(desc(walletLedger.createdAt), desc(walletLedger.id))
      .limit(100);

    let runningBalanceMmk = wallet.balanceMmk;
    const ledger = ledgerRows.map((entry) => {
      const enriched = { ...entry, balanceAfterMmk: runningBalanceMmk };
      runningBalanceMmk -= entry.amountMmk;
      return enriched;
    });

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    let displayName = fullName;
    if (!displayName || displayName === "Customer") {
      if (user.username) {
        displayName = `@${user.username}`;
      } else if (user.telegramId) {
        displayName = `User ${user.telegramId}`;
      } else {
        displayName = `Customer #${user.id}`;
      }
    }

    return {
      ok: true,
      customer: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      wallet: {
        id: wallet.id,
        balanceMmk: wallet.balanceMmk,
        totalDepositedMmk: wallet.totalDepositedMmk,
        totalSpentMmk: wallet.totalSpentMmk,
      },
      orders: enrichedOrders,
      topUps: enrichedTopUps,
      ledger,
    };
  });

  // POST /api/admin/customers/:id/adjust-balance (Admin balance credit/debit with audit ledger and Telegram notification)
  server.post<{ Params: { id: string } }>(
    "/api/admin/customers/:id/adjust-balance",
    { preHandler: requirePermission("customers.balance") },
    async (request, reply) => {
    const rawId = request.params.id;
    const db = getDb();
    let user = null;

    const numericId = parseInt(rawId, 10);
    if (!isNaN(numericId) && numericId > 0 && numericId <= 2147483647) {
      const [found] = await db.select().from(users).where(eq(users.id, numericId));
      if (found) user = found;
    }

    if (!user) {
      const [found] = await db.select().from(users).where(eq(users.telegramId, rawId));
      if (found) user = found;
    }

    if (!user) {
      return reply.status(404).send({ ok: false, error: "Customer not found" });
    }
    if (user.role !== "CUSTOMER") {
      return reply.status(400).send({ ok: false, error: "Only customer accounts can be adjusted" });
    }

    const AdjustBalanceSchema = z.object({
      action: z.enum(["CREDIT", "DEBIT"]),
      amountMmk: z.number().int().positive("Amount must be greater than 0"),
      notes: z.string().min(1, "Reason or note is required"),
      notifyTelegram: z.boolean().default(true),
    });

    const parseRes = AdjustBalanceSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        ok: false,
        error: "Validation error",
        issues: parseRes.error.issues,
      });
    }

    const { action, amountMmk, notes, notifyTelegram } = parseRes.data;
    const customerId = user.id;

    const runTransaction =
      typeof (db as any).transaction === "function"
        ? (db as any).transaction.bind(db)
        : async (cb: any) => cb(db);

    let finalBalanceMmk = 0;

    try {
      finalBalanceMmk = await runTransaction(async (tx: any) => {
        let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, customerId));
        if (!wallet) {
          const [created] = await tx
            .insert(wallets)
            .values({
              userId: customerId,
              balanceMmk: 0,
              totalDepositedMmk: 0,
              totalSpentMmk: 0,
            })
            .returning();
          wallet = created;
        }

        if (action === "DEBIT") {
          const [updated] = await tx
            .update(wallets)
            .set({
              balanceMmk: sql`${wallets.balanceMmk} - ${amountMmk}`,
              updatedAt: new Date(),
            })
            .where(and(eq(wallets.id, wallet.id), gte(wallets.balanceMmk, amountMmk)))
            .returning();

          if (!updated) {
            throw new Error(`INSUFFICIENT_FUNDS:${wallet.balanceMmk}`);
          }

          await tx.insert(walletLedger).values({
            walletId: wallet.id,
            amountMmk: -amountMmk,
            type: "ADMIN_ADJUSTMENT",
            referenceId: `ADJ-${Date.now()}`,
            notes: notes.trim(),
          });

          return updated.balanceMmk;
        } else {
          const [updated] = await tx
            .update(wallets)
            .set({
              balanceMmk: sql`${wallets.balanceMmk} + ${amountMmk}`,
              totalDepositedMmk: sql`${wallets.totalDepositedMmk} + ${amountMmk}`,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id))
            .returning();

          await tx.insert(walletLedger).values({
            walletId: wallet.id,
            amountMmk,
            type: "ADMIN_ADJUSTMENT",
            referenceId: `ADJ-${Date.now()}`,
            notes: notes.trim(),
          });

          return updated ? updated.balanceMmk : wallet.balanceMmk + amountMmk;
        }
      });
    } catch (err: any) {
      if (err?.message?.startsWith("INSUFFICIENT_FUNDS")) {
        const bal = err.message.split(":")[1];
        return reply.status(400).send({
          ok: false,
          error: `Cannot debit ${amountMmk.toLocaleString()} MMK. Customer only has ${Number(bal).toLocaleString()} MMK in wallet.`,
        });
      }
      throw err;
    }

    const newBalanceMmk = finalBalanceMmk;

    // Notify user via Telegram if requested and telegramId exists
    let telegramNotified = false;
    if (notifyTelegram && user.telegramId) {
      try {
        telegramNotified = await notifyBalanceAdjusted({
          telegramId: user.telegramId,
          action,
          amountMmk,
          newBalanceMmk,
          notes: notes.trim(),
        });
      } catch (err: any) {
        console.error("[Adjust Balance] Failed to send Telegram notification:", err.message);
      }
    }

    await writeAudit({
      actorId: getRbac(request)?.userId ?? null,
      action: "ADMIN_ADJUSTMENT",
      entityType: "USER",
      entityId: customerId,
      details: {
        action,
        amountMmk,
        newBalanceMmk,
        notes: notes.trim(),
        telegramNotified,
      },
    });

    return {
      ok: true,
      action,
      amountMmk,
      newBalanceMmk,
      telegramNotified,
      message: `Successfully ${action === "CREDIT" ? "credited" : "debited"} ${amountMmk.toLocaleString()} MMK. New balance: ${newBalanceMmk.toLocaleString()} MMK.`,
    };
  });

  // POST /api/admin/customers/:id/deactivate (Soft delete — reversible, keeps all history)
  server.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/api/admin/customers/:id/deactivate",
    { preHandler: requirePermission("customers.status") },
    async (request, reply) => {
    const db = getDb();
    const customerId = Number(request.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return reply.status(400).send({ ok: false, error: "Invalid customer id" });
    }

    const parsed = DeactivateCustomerSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: "Invalid request payload" });
    }

    const [customer] = await db.select().from(users).where(eq(users.id, customerId)).limit(1);
    if (!customer) {
      return reply.status(404).send({ ok: false, error: "Customer not found" });
    }
    if (customer.role !== "CUSTOMER") {
      return reply.status(400).send({ ok: false, error: "Only customer accounts can be deactivated" });
    }
    if (customer.status !== "ACTIVE") {
      return reply.status(400).send({ ok: false, error: "This customer is already deactivated" });
    }

    const adminUser = (request as any).adminUser as { userId: number } | undefined;
    const displayName = buildCustomerDisplayName(customer);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: "DEACTIVATED", updatedAt: new Date() })
        .where(eq(users.id, customerId));

      await tx.insert(auditLogs).values({
        actorId: adminUser?.userId ?? null,
        action: "CUSTOMER_DEACTIVATE",
        entityType: "USER",
        entityId: String(customerId),
        details: {
          displayName,
          telegramId: customer.telegramId,
          reason: parsed.data.reason ?? null,
        },
      });
    });

    return {
      ok: true,
      customerId,
      displayName,
      message: `${displayName} has been deactivated. The customer can no longer use the bot.`,
    };
  });

  // POST /api/admin/customers/:id/restore (Undo a deactivation)
  server.post<{ Params: { id: string } }>(
    "/api/admin/customers/:id/restore",
    { preHandler: requirePermission("customers.status") },
    async (request, reply) => {
    const db = getDb();
    const customerId = Number(request.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return reply.status(400).send({ ok: false, error: "Invalid customer id" });
    }

    const [customer] = await db.select().from(users).where(eq(users.id, customerId)).limit(1);
    if (!customer) {
      return reply.status(404).send({ ok: false, error: "Customer not found" });
    }
    if (customer.status === "ACTIVE") {
      return reply.status(400).send({ ok: false, error: "This customer is already active" });
    }

    const adminUser = (request as any).adminUser as { userId: number } | undefined;
    const displayName = buildCustomerDisplayName(customer);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: "ACTIVE", updatedAt: new Date() })
        .where(eq(users.id, customerId));

      await tx.insert(auditLogs).values({
        actorId: adminUser?.userId ?? null,
        action: "CUSTOMER_RESTORE",
        entityType: "USER",
        entityId: String(customerId),
        details: {
          displayName,
          telegramId: customer.telegramId,
          previousStatus: customer.status,
        },
      });
    });

    return {
      ok: true,
      customerId,
      displayName,
      message: `${displayName} has been restored and can use the bot again.`,
    };
  });

  // DELETE /api/admin/customers/:id (Permanent hard delete — only for deactivated customers with no orders)
  server.delete<{ Params: { id: string } }>(
    "/api/admin/customers/:id",
    { preHandler: requirePermission("customers.delete") },
    async (request, reply) => {
    const db = getDb();
    const customerId = Number(request.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return reply.status(400).send({ ok: false, error: "Invalid customer id" });
    }

    const [customer] = await db.select().from(users).where(eq(users.id, customerId)).limit(1);
    if (!customer) {
      return reply.status(404).send({ ok: false, error: "Customer not found" });
    }
    if (customer.role !== "CUSTOMER") {
      return reply.status(400).send({ ok: false, error: "Only customer accounts can be deleted" });
    }
    if (customer.status === "ACTIVE") {
      return reply.status(400).send({
        ok: false,
        error: "Deactivate this customer first. Permanent deletion is only allowed for deactivated accounts.",
      });
    }

    const [ordersCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.customerId, customerId));
    const ordersCount = Number(ordersCountRow?.count || 0);
    if (ordersCount > 0) {
      return reply.status(400).send({
        ok: false,
        error: `This customer has ${ordersCount} order${ordersCount === 1 ? "" : "s"} in history, so the account cannot be permanently deleted. Keep it deactivated instead.`,
      });
    }

    const adminUser = (request as any).adminUser as { userId: number } | undefined;
    const displayName = buildCustomerDisplayName(customer);

    await db.transaction(async (tx) => {
      // Snapshot remaining related data before cascading delete
      const [topupsRow] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(topUpRequests)
        .where(eq(topUpRequests.userId, customerId));
      const [walletRow] = await tx
        .select({
          balanceMmk: sql<number>`coalesce(${wallets.balanceMmk}, 0)`,
          totalDepositedMmk: sql<number>`coalesce(${wallets.totalDepositedMmk}, 0)`,
          ledgerCount: sql<number>`(select count(*) from ${walletLedger} where ${walletLedger.walletId} = ${wallets.id})`,
        })
        .from(wallets)
        .where(eq(wallets.userId, customerId))
        .limit(1);

      // Audit row first, inside the same transaction as the delete
      await tx.insert(auditLogs).values({
        actorId: adminUser?.userId ?? null,
        action: "CUSTOMER_HARD_DELETE",
        entityType: "USER",
        entityId: String(customerId),
        details: {
          displayName,
          telegramId: customer.telegramId,
          username: customer.username,
          ordersCount,
          topUpsCount: Number(topupsRow?.count || 0),
          walletBalanceMmk: Number(walletRow?.balanceMmk || 0),
          walletTotalDepositedMmk: Number(walletRow?.totalDepositedMmk || 0),
          ledgerEntriesCount: Number(walletRow?.ledgerCount || 0),
        },
      });

      // Cascades: wallets → wallet_ledger, topup_requests (orders FK blocks earlier)
      await tx.delete(users).where(eq(users.id, customerId));
    });

    return {
      ok: true,
      customerId,
      displayName,
      message: `${displayName} has been permanently deleted along with their wallet and deposit records.`,
    };
  });
}

