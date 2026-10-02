import { FastifyInstance } from "fastify";
import {
  ReviewPaymentSchema,
  UpdateProductPricingSchema,
  calculateRetailMmk,
  calculateSellableStock,
  stripCustomEmojiPlaceholders,
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
import { xproClient } from "../services/xpro-client";
import { catalogService } from "../services/catalog.service";
import { orderService } from "../services/order.service";
import {
  notifyTopUpApproved,
  notifyTopUpRejected,
  notifyOrderRefunded,
  notifyOrderCredentialsResent,
  notifyBalanceAdjusted,
} from "../services/telegram-notifier";
import { decryptPayload, formatCredentialsText } from "../services/encryption";
import { fetchTelegramFile, getPlaceholderSlipSvg } from "../services/telegram-file.service";

const ReviewDepositSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  rejectReason: z.string().optional(),
});

const DeactivateCustomerSchema = z.object({
  reason: z.string().max(500).optional(),
});

/** Customer-facing display name used in audit details and responses. */
function buildCustomerDisplayName(u: {
  id: number;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (fullName && fullName !== "Customer") return fullName;
  if (u.username) return `@${u.username}`;
  if (u.telegramId) return `User ${u.telegramId}`;
  return `Customer #${u.id}`;
}

interface CachedSupplierStatus {
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
  balanceUsd: "0.00",
  currency: "USD",
  health: "ONLINE",
  version: "1.0.0",
  userId: "8777968077",
  endpoint: config.UPSTREAM_BASE_URL.replace(/\/api\/partner\/v1\/?$/, ""),
  latencyMs: 45,
  updatedAt: 0,
};

let inFlightSupplierRefresh: Promise<CachedSupplierStatus> | null = null;

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
        xproClient.getBalance(4000, 1),
        xproClient.getHealth(4000, 1),
      ]);
      const latency = Math.max(1, Date.now() - startPing);

      let balance = supplierStatusCache.balanceUsd;
      let currency = supplierStatusCache.currency;
      let health = "OFFLINE";
      let version = supplierStatusCache.version;
      let userId = supplierStatusCache.userId;

      if (balanceResult.status === "fulfilled" && balanceResult.value?.ok) {
        balance = String(balanceResult.value.balance);
        currency = balanceResult.value.currency || "USD";
        if (balanceResult.value.userId) {
          userId = balanceResult.value.userId;
        }
      }

      if (healthResult.status === "fulfilled" && healthResult.value?.ok) {
        health = "ONLINE";
        version = healthResult.value.version || version;
      } else if (balanceResult.status === "fulfilled" && balanceResult.value?.ok) {
        health = "ONLINE";
      }

      supplierStatusCache = {
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

export async function adminRoutes(server: FastifyInstance) {
  // Proactively warm up supplier status in background on server startup
  refreshSupplierStatus(true).catch(() => {});

  // GET /api/admin/stats (Dashboard overview summary stats)
  server.get("/api/admin/stats", async () => {
    const db = getDb();

    // 1. Total revenue / sales from completed orders and order counts
    const [salesResult] = await db
      .select({
        totalSalesMmk: sql<number>`coalesce(sum(case when ${orders.status} = 'DELIVERED' then ${orders.totalAmountMmk} else 0 end), 0)`,
        fulfilledOrders: sql<number>`count(case when ${orders.status} = 'DELIVERED' then 1 end)`,
        pendingOrders: sql<number>`count(case when ${orders.status} in ('PENDING', 'PROCESSING') then 1 end)`,
        totalOrders: sql<number>`count(${orders.id})`,
      })
      .from(orders);

    // 2. Pending deposit slips count
    const [depositsResult] = await db
      .select({
        pendingDepositsCount: sql<number>`count(${topUpRequests.id})`,
      })
      .from(topUpRequests)
      .where(eq(topUpRequests.status, "SUBMITTED"));

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
      },
    };
  });

  // GET /api/admin/supplier/status (For top bar wallet widget & supplier diagnostics)
  server.get("/api/admin/supplier/status", async (_request, reply) => {
    try {
      const status = await refreshSupplierStatus();
      const db = getDb();
      const [[catResult], [prodResult]] = await Promise.all([
        db.select({ count: sql<number>`count(${categories.id})` }).from(categories),
        db.select({ count: sql<number>`count(${products.id})` }).from(products),
      ]);

      return {
        ok: true,
        supplier: {
          balanceUsd: status.balanceUsd,
          currency: status.currency,
          health: status.health,
          version: status.version,
          userId: status.userId || "8777968077",
          endpoint: status.endpoint || "http://paid2.daki.cc:4153",
          latencyMs: status.latencyMs || 45,
          categoriesCount: Number(catResult?.count || 0),
          productsCount: Number(prodResult?.count || 0),
        },
      };
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
        },
      };
    }
  });

  // POST /api/admin/supplier/sync (Sync catalog from XPro)
  server.post("/api/admin/supplier/sync", async (_request, reply) => {
    try {
      const result = await catalogService.syncFullCatalog();

      return {
        ok: true,
        synced: result,
      };
    } catch (err: any) {
      return reply.status(500).send({
        ok: false,
        error: `Sync error: ${err.message}`,
      });
    }
  });

  // GET /api/admin/products (List all products with category and supplier snapshot info)
  server.get("/api/admin/products", async () => {
    const db = getDb();
    const productRows = await db
      .select({
        id: products.id,
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
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSupplierSnapshots, eq(products.id, productSupplierSnapshots.productId))
      .orderBy(products.id);

    let walletBalanceUsd = String(supplierStatusCache.balanceUsd || "0.00");
    try {
      const balRes = await xproClient.getBalance(2500, 1);
      if (balRes.ok) {
        walletBalanceUsd = String(balRes.balance);
      }
    } catch {
      // Fallback to cache if available
    }

    const mappedProducts = productRows.map((p) => {
      const stockCalc = calculateSellableStock({
        supplierStock: p.supplierStock ?? 999,
        supplierWalletBalanceUsd: walletBalanceUsd,
        unitCostUsd: p.supplierPriceUsd || "0.00",
        localLimit: p.localStockLimit,
      });

      return {
        id: p.id,
        supplierProductId: p.upstreamProductId,
        categoryId: p.categoryId,
        categoryName: stripCustomEmojiPlaceholders(p.categoryName || "") || "Uncategorized",
        name: p.supplierRawName || p.nameMmk,
        nameMmk: p.nameMmk,
        description: p.descriptionMmk || "",
        supplierPriceUsd: p.supplierPriceUsd || "0.00",
        customPriceMmk: p.retailPriceMmk,
        retailPriceMmk: p.retailPriceMmk,
        pricingMode: "CUSTOM_OVERRIDE",
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
    });

    return {
      ok: true,
      walletBalanceUsd,
      products: mappedProducts,
    };
  });

  // PUT /api/admin/products/:id (Update product pricing or stock limits)
  server.put<{
    Params: { id: string };
  }>("/api/admin/products/:id", async (request, reply) => {
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

    return {
      ok: true,
      product: updated,
    };
  });

  // GET /api/admin/categories (List all categories for admin)
  server.get("/api/admin/categories", async () => {
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
  });

  // PUT /api/admin/categories/:id (Update category)
  server.put<{
    Params: { id: string };
    Body: { name?: string; iconEmoji?: string; sortOrder?: number; isActive?: boolean };
  }>("/api/admin/categories/:id", async (request, reply) => {
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

    return {
      ok: true,
      category: updated,
    };
  });

  // GET /api/admin/deposits (List wallet deposit slips)
  server.get<{
    Querystring: { status?: string };
  }>("/api/admin/deposits", async (request) => {
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
  server.get<{
    Params: { fileId: string };
  }>("/api/admin/telegram-file/:fileId", async (request, reply) => {
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
  server.get<{
    Querystring: { fileId?: string };
  }>("/api/admin/telegram-file", async (request, reply) => {
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
  server.get<{
    Params: { id: string };
  }>("/api/admin/deposits/:id/slip-image", async (request, reply) => {
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
  server.post<{
    Params: { id: string };
  }>("/api/admin/deposits/:id/review", async (request, reply) => {
    const depositId = parseInt(request.params.id, 10);
    const parseRes = ReviewDepositSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        ok: false,
        error: "Validation failed",
        issues: parseRes.error.issues,
      });
    }

    const { action, rejectReason } = parseRes.data;
    const db = getDb();

    // 1. Fetch deposit request with user
    const [depositRow] = await db
      .select({
        topUp: topUpRequests,
        user: users,
      })
      .from(topUpRequests)
      .innerJoin(users, eq(topUpRequests.userId, users.id))
      .where(eq(topUpRequests.id, depositId))
      .limit(1);

    if (!depositRow) {
      return reply.status(404).send({ ok: false, error: "Deposit request not found" });
    }

    const { topUp, user } = depositRow;

    if (topUp.status !== "SUBMITTED" && topUp.status !== "PENDING") {
      return reply.status(400).send({
        ok: false,
        error: `Deposit request is already ${topUp.status}.`,
      });
    }

    if (action === "APPROVE") {
      // Atomic wallet credit + ledger entry
      let newBalance = 0;
      await db.transaction(async (tx) => {
        // Mark deposit as COMPLETED
        await tx
          .update(topUpRequests)
          .set({
            status: "COMPLETED",
            reviewedAt: new Date(),
          })
          .where(eq(topUpRequests.id, depositId));

        // Find or create wallet
        const [existingWallet] = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, topUp.userId))
          .limit(1);

        if (existingWallet) {
          const [updatedWallet] = await tx
            .update(wallets)
            .set({
              balanceMmk: sql`${wallets.balanceMmk} + ${topUp.amountMmk}`,
              totalDepositedMmk: sql`${wallets.totalDepositedMmk} + ${topUp.amountMmk}`,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, existingWallet.id))
            .returning();

          newBalance = updatedWallet ? updatedWallet.balanceMmk : existingWallet.balanceMmk + topUp.amountMmk;

          await tx.insert(walletLedger).values({
            walletId: existingWallet.id,
            amountMmk: topUp.amountMmk,
            type: "TOPUP_CREDIT",
            referenceId: topUp.reference,
            notes: `Wallet deposit approved by admin`,
          });
        } else {
          newBalance = topUp.amountMmk;
          const [newWallet] = await tx
            .insert(wallets)
            .values({
              userId: topUp.userId,
              balanceMmk: topUp.amountMmk,
              totalDepositedMmk: topUp.amountMmk,
              totalSpentMmk: 0,
            })
            .returning();

          await tx.insert(walletLedger).values({
            walletId: newWallet.id,
            amountMmk: topUp.amountMmk,
            type: "TOPUP_CREDIT",
            referenceId: topUp.reference,
            notes: `Initial wallet deposit approved by admin`,
          });
        }
      });

      // Send celebration Telegram notification to customer
      if (user.telegramId) {
        await notifyTopUpApproved({
          telegramId: user.telegramId,
          reference: topUp.reference,
          amountMmk: topUp.amountMmk,
          newBalanceMmk: newBalance,
        });
      }

      return {
        ok: true,
        action: "APPROVED",
        newBalanceMmk: newBalance,
      };
    } else {
      // REJECT
      const reason = rejectReason || "Deposit slip verification failed.";
      await db
        .update(topUpRequests)
        .set({
          status: "REJECTED",
          rejectReason: reason,
          reviewedAt: new Date(),
        })
        .where(eq(topUpRequests.id, depositId));

      // Send rejection Telegram notification
      if (user.telegramId) {
        await notifyTopUpRejected({
          telegramId: user.telegramId,
          reference: topUp.reference,
          amountMmk: topUp.amountMmk,
          reason,
        });
      }

      return {
        ok: true,
        action: "REJECTED",
      };
    }
  });

  // GET /api/admin/orders (List all product orders with items and deliveries)
  server.get<{
    Querystring: { limit?: string };
  }>("/api/admin/orders", async (request) => {
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
  server.post("/api/admin/orders/:id/refund", async (request, reply) => {
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

    return {
      ok: true,
      publicOrderNo: order.publicOrderNo,
      refundedAmountMmk: order.totalAmountMmk,
      newBalanceMmk: newBalance,
      customerName: order.customerName,
    };
  });

  // POST /api/admin/orders/:id/resend (Re-send digital credentials to customer's Telegram chat)
  server.post("/api/admin/orders/:id/resend", async (request, reply) => {
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

    return {
      ok: true,
      message: `Credentials for ${order.publicOrderNo} successfully re-sent to customer on Telegram!`,
    };
  });

  // GET /api/admin/settings (Get all app settings)
  server.get("/api/admin/settings", async () => {
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
    };

    return {
      ok: true,
      settings: {
        ...defaults,
        ...settingsMap,
      },
    };
  });

  // PUT /api/admin/settings (Update app settings key-values)
  server.put<{
    Body: Record<string, string>;
  }>("/api/admin/settings", async (request) => {
    const db = getDb();
    const updates = request.body;

    for (const [key, value] of Object.entries(updates)) {
      await db
        .insert(appSettings)
        .values({
          key,
          value: String(value),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: String(value),
            updatedAt: new Date(),
          },
        });
    }

    return {
      ok: true,
      message: "Settings saved successfully",
    };
  });

  // POST /api/admin/settings/recalculate-prices (Recalculate all products with current exchange rate)
  server.post("/api/admin/settings/recalculate-prices", async () => {
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
    for (const p of prodsWithSnapshots) {
      const usdPrice = parseFloat(p.supplierPriceUsd) || 0;
      if (usdPrice > 0) {
        const pricing = calculateRetailMmk({
          upstreamUsdCost: usdPrice,
          exchangeRateMmk: exchangeRate,
          marginPercentage: marginPct,
          roundToNearest: 500,
        });

        await db
          .update(products)
          .set({
            retailPriceMmk: pricing.retailPriceMmk,
            updatedAt: new Date(),
          })
          .where(eq(products.id, p.productId));
        updatedCount++;
      }
    }

    return {
      ok: true,
      updatedCount,
      exchangeRate,
      marginPct,
      message: `Successfully recalculated ${updatedCount} products using 1 USD = ${exchangeRate.toLocaleString()} MMK (${marginPct}% margin).`,
    };
  });

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
  }>("/api/admin/customers", async (request) => {
    const db = getDb();
    const {
      search,
      balanceFilter,
      sortBy = "balance_desc",
      statusFilter = "active",
    } = request.query;

    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));

    // 1. Overall KPI summary (customers only)
    const [kpiResult] = await db
      .select({
        totalCustomers: sql<number>`count(${users.id})`,
        customersWithBalance: sql<number>`count(case when coalesce(${wallets.balanceMmk}, 0) > 0 then 1 end)`,
        totalWalletBalanceMmk: sql<number>`coalesce(sum(case when ${wallets.balanceMmk} > 0 then ${wallets.balanceMmk} else 0 end), 0)`,
        totalSpentMmk: sql<number>`coalesce(sum(${wallets.totalSpentMmk}), 0)`,
      })
      .from(users)
      .leftJoin(wallets, eq(users.id, wallets.userId))
      .where(ne(users.role, "ADMIN"));

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
    const conditions = [ne(users.role, "ADMIN")];

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
      .select({ total: sql<number>`count(*)` })
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
  });

  // GET /api/admin/customers/:id (Customer full details, order history, topup slips, ledger)
  server.get<{
    Params: { id: string };
  }>("/api/admin/customers/:id", async (request, reply) => {
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

    const enrichedOrders = await Promise.all(
      customerOrders.map(async (o) => {
        const items = await db
          .select({
            id: orderItems.id,
            productId: orderItems.productId,
            productName: orderItems.productNameSnapshot,
            quantity: orderItems.quantity,
            unitPriceMmk: orderItems.unitPriceMmk,
            subtotalMmk: orderItems.subtotalMmk,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, o.id));

        const deliveries = await db
          .select()
          .from(orderDeliveries)
          .where(eq(orderDeliveries.orderId, o.id));

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
      })
    );

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

    // Wallet Ledger / Audit Trail
    const ledger = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.walletId, wallet.id))
      .orderBy(desc(walletLedger.createdAt))
      .limit(100);

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
  server.post<{
    Params: { id: string };
  }>("/api/admin/customers/:id/adjust-balance", async (request, reply) => {
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
  server.post<{
    Params: { id: string };
    Body: { reason?: string };
  }>("/api/admin/customers/:id/deactivate", async (request, reply) => {
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
  server.post<{
    Params: { id: string };
  }>("/api/admin/customers/:id/restore", async (request, reply) => {
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
  server.delete<{
    Params: { id: string };
  }>("/api/admin/customers/:id", async (request, reply) => {
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

