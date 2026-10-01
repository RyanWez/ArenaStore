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
import { desc, eq, sql, or, ne } from "drizzle-orm";
import { z } from "zod";
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
import { decryptPayload } from "../services/encryption";
import { fetchTelegramFile, getPlaceholderSlipSvg } from "../services/telegram-file.service";

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
        slipUrl: s.slipFileId
          ? `/api/admin/telegram-file/${encodeURIComponent(s.slipFileId)}`
          : `/api/admin/deposits/${s.id}/slip-image`,
        intendedProduct: s.intendedProduct || "General Wallet Topup",
        status: s.status,
        date: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
        rejectReason: s.rejectReason,
      })),
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

    // 3. Atomically update wallet balance, write ledger entry, and update order status
    const newBalance = wallet.balanceMmk + order.totalAmountMmk;
    const newTotalSpent = Math.max(0, wallet.totalSpentMmk - order.totalAmountMmk);

    await db
      .update(wallets)
      .set({
        balanceMmk: newBalance,
        totalSpentMmk: newTotalSpent,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id));

    await db.insert(walletLedger).values({
      walletId: wallet.id,
      amountMmk: order.totalAmountMmk,
      type: "REFUND_CREDIT",
      referenceId: order.publicOrderNo,
      notes: `Refund for ${order.publicOrderNo}: ${reason}`,
    });

    await db
      .update(orders)
      .set({
        status: "REFUNDED",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

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
        credentialsText = typeof decrypted === "string" ? decrypted : JSON.stringify(decrypted, null, 2);
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

  // GET /api/admin/customers (List customers with wallet balances, order counts, stats)
  server.get<{
    Querystring: {
      search?: string;
      balanceFilter?: string;
      sortBy?: string;
    };
  }>("/api/admin/customers", async (request) => {
    const db = getDb();
    const { search, balanceFilter, sortBy = "balance_desc" } = request.query;

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

    // 3. Query all customer users joined with wallets and order stats
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
      .where(ne(users.role, "ADMIN"));

    // Transform and map
    let customerList = rows.map((r) => {
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

    // Search filter
    if (search && search.trim()) {
      const term = search.trim().toLowerCase().replace(/^@/, "");
      customerList = customerList.filter((c) => {
        const idMatch = c.telegramId?.toLowerCase().includes(term);
        const userMatch = c.username?.toLowerCase().includes(term);
        const nameMatch = c.displayName.toLowerCase().includes(term);
        const numIdMatch = String(c.id).includes(term);
        return idMatch || userMatch || nameMatch || numIdMatch;
      });
    }

    // Balance filter
    if (balanceFilter === "has_balance") {
      customerList = customerList.filter((c) => c.walletBalanceMmk > 0);
    } else if (balanceFilter === "zero_balance") {
      customerList = customerList.filter((c) => c.walletBalanceMmk === 0);
    }

    // Sort
    if (sortBy === "balance_desc") {
      customerList.sort((a, b) => b.walletBalanceMmk - a.walletBalanceMmk);
    } else if (sortBy === "balance_asc") {
      customerList.sort((a, b) => a.walletBalanceMmk - b.walletBalanceMmk);
    } else if (sortBy === "spent_desc") {
      customerList.sort((a, b) => b.totalSpentMmk - a.totalSpentMmk);
    } else if (sortBy === "orders_desc") {
      customerList.sort((a, b) => b.ordersCount - a.ordersCount);
    } else if (sortBy === "newest") {
      customerList.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return {
      ok: true,
      stats: {
        totalCustomers: Number(kpiResult?.totalCustomers || 0),
        customersWithBalance: Number(kpiResult?.customersWithBalance || 0),
        totalWalletBalanceMmk: Number(kpiResult?.totalWalletBalanceMmk || 0),
        totalSpentMmk: Number(kpiResult?.totalSpentMmk || 0),
      },
      customers: customerList,
    };
  });

  // GET /api/admin/customers/:id (Customer full details, order history, topup slips, ledger)
  server.get<{
    Params: { id: string };
  }>("/api/admin/customers/:id", async (request, reply) => {
    const customerId = parseInt(request.params.id, 10);
    if (isNaN(customerId)) {
      return reply.status(400).send({ ok: false, error: "Invalid customer ID" });
    }

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, customerId));
    if (!user) {
      return reply.status(404).send({ ok: false, error: "Customer not found" });
    }

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
              plainCredentials = decryptPayload(d.encryptedPayload);
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
    const customerId = parseInt(request.params.id, 10);
    if (isNaN(customerId)) {
      return reply.status(400).send({ ok: false, error: "Invalid customer ID" });
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

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, customerId));
    if (!user) {
      return reply.status(404).send({ ok: false, error: "Customer not found" });
    }

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

    if (action === "DEBIT" && wallet.balanceMmk < amountMmk) {
      return reply.status(400).send({
        ok: false,
        error: `Cannot debit ${amountMmk.toLocaleString()} MMK. Customer only has ${wallet.balanceMmk.toLocaleString()} MMK in wallet.`,
      });
    }

    const newBalanceMmk =
      action === "CREDIT"
        ? wallet.balanceMmk + amountMmk
        : wallet.balanceMmk - amountMmk;

    const newTotalDeposited =
      action === "CREDIT"
        ? wallet.totalDepositedMmk + amountMmk
        : wallet.totalDepositedMmk;

    // Update wallet
    await db
      .update(wallets)
      .set({
        balanceMmk: newBalanceMmk,
        totalDepositedMmk: newTotalDeposited,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id));

    // Record ledger entry
    await db.insert(walletLedger).values({
      walletId: wallet.id,
      amountMmk: action === "CREDIT" ? amountMmk : -amountMmk,
      type: "ADMIN_ADJUSTMENT",
      referenceId: `ADJ-${Date.now()}`,
      notes: notes.trim(),
    });

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
}

