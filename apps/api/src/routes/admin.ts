import { FastifyInstance } from "fastify";
import { ReviewPaymentSchema, UpdateProductPricingSchema, calculateRetailMmk } from "@arena/shared";
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
} from "@arena/db";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { xproClient } from "../services/xpro-client";
import { catalogService } from "../services/catalog.service";
import { orderService } from "../services/order.service";
import { notifyTopUpApproved, notifyTopUpRejected } from "../services/telegram-notifier";
import { decryptPayload } from "../services/encryption";

const ReviewDepositSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  rejectReason: z.string().optional(),
});

export async function adminRoutes(server: FastifyInstance) {
  // GET /api/admin/stats (Dashboard overview summary stats)
  server.get("/api/admin/stats", async () => {
    const db = getDb();

    // 1. Total revenue / sales from completed orders and order counts
    const [salesResult] = await db
      .select({
        totalSalesMmk: sql<number>`coalesce(sum(${orders.totalAmountMmk}), 0)`,
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

    // 4. Supplier status
    let supplierBalanceUsd = 0;
    let supplierHealth = "OFFLINE";
    try {
      const balance = await xproClient.getBalance();
      const health = await xproClient.getHealth();
      supplierBalanceUsd = Number(balance.balance) || 0;
      supplierHealth = health.ok ? "ONLINE" : "OFFLINE";
    } catch {
      // Keep defaults
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
        supplierBalanceUsd,
        supplierHealth,
      },
    };
  });

  // GET /api/admin/supplier/status (For top bar wallet widget)
  server.get("/api/admin/supplier/status", async (_request, reply) => {
    try {
      const balance = await xproClient.getBalance();
      const health = await xproClient.getHealth();

      return {
        ok: true,
        supplier: {
          balanceUsd: balance.balance,
          currency: balance.currency,
          health: health.ok ? "ONLINE" : "OFFLINE",
          version: health.version,
        },
      };
    } catch (err: any) {
      return reply.status(502).send({
        ok: false,
        error: `Supplier status check failed: ${err.message}`,
      });
    }
  });

  // POST /api/admin/supplier/sync (Sync catalog from XPro)
  server.post("/api/admin/supplier/sync", async (_request, reply) => {
    try {
      const categoriesCount = await catalogService.syncCategories();
      const productsCount = await catalogService.syncProducts();

      return {
        ok: true,
        synced: {
          categories: categoriesCount,
          products: productsCount,
        },
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

    return {
      ok: true,
      products: productRows.map((p) => ({
        id: p.id,
        supplierProductId: p.upstreamProductId,
        categoryId: p.categoryId,
        categoryName: p.categoryName || "Uncategorized",
        name: p.supplierRawName || p.nameMmk,
        nameMmk: p.nameMmk,
        description: p.descriptionMmk || "",
        supplierPriceUsd: p.supplierPriceUsd || "0.00",
        customPriceMmk: p.retailPriceMmk,
        retailPriceMmk: p.retailPriceMmk,
        pricingMode: "CUSTOM_OVERRIDE",
        supplierStock: p.supplierStock ?? 999,
        localStockLimit: p.localStockLimit,
        stockSyncStatus: p.inStock ? "SYNCED" : "OUT_OF_STOCK",
        deliveryType: p.deliveryType || "CREDENTIALS",
        isActive: p.isActive,
        syncStatus: "SYNCED",
        updatedAt: p.updatedAt,
      })),
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
      retailPriceMmk: parseRes.data.retailPriceMmk,
      updatedAt: new Date(),
    };

    if (parseRes.data.localStockLimit !== undefined) {
      updateValues.localStockLimit = parseRes.data.localStockLimit;
    }
    if (parseRes.data.isActive !== undefined) {
      updateValues.isActive = parseRes.data.isActive;
    }
    if (parseRes.data.nameMmk) {
      updateValues.nameMmk = parseRes.data.nameMmk;
    }
    if (parseRes.data.descriptionMmk) {
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
      categories: catList,
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
      slips: slips.map((s) => ({
        id: s.id,
        reference: s.reference,
        user: s.user.username ? `@${s.user.username}` : `${s.user.firstName} ${s.user.lastName || ""}`.trim(),
        telegramId: s.user.telegramId,
        amount: s.amountMmk,
        method: s.paymentMethod,
        txnRef: s.transactionRef || "-",
        slipUrl: s.slipFileId || null,
        intendedProduct: s.intendedProduct || "General Wallet Topup",
        status: s.status,
        date: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
        rejectReason: s.rejectReason,
      })),
    };
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
          newBalance = existingWallet.balanceMmk + topUp.amountMmk;
          await tx
            .update(wallets)
            .set({
              balanceMmk: newBalance,
              totalDepositedMmk: existingWallet.totalDepositedMmk + topUp.amountMmk,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, existingWallet.id));

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
  server.get("/api/admin/orders", async () => {
    const db = getDb();
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
      .limit(100);

    // Fetch items and deliveries for each order
    const enrichedOrders = await Promise.all(
      orderList.map(async (o) => {
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
          let payload: any = d.encryptedPayload;
          try {
            payload = decryptPayload(d.encryptedPayload);
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
      })
    );

    return {
      ok: true,
      orders: enrichedOrders,
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
          roundToNearest: 50,
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
}
