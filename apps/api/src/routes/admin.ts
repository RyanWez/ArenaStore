import { FastifyInstance } from "fastify";
import { ReviewPaymentSchema, UpdateProductPricingSchema } from "@arena/shared";
import { getDb, orders, paymentSubmissions, products, users, categories, orderItems, orderDeliveries, appSettings } from "@arena/db";
import { desc, eq } from "drizzle-orm";
import { xproClient } from "../services/xpro-client";
import { catalogService } from "../services/catalog.service";
import { orderService } from "../services/order.service";

export async function adminRoutes(server: FastifyInstance) {
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
      // If PostgreSQL is not configured/running locally yet, query upstream directly so sync works seamlessly
      if (err.message?.includes("DATABASE_URL") || err.code === "ECONNREFUSED") {
        try {
          const upstreamCats = await xproClient.getCategories();
          const upstreamProds = await xproClient.getProducts();
          return {
            ok: true,
            mode: "LIVE_UPSTREAM",
            synced: {
              categories: upstreamCats.length,
              products: upstreamProds.length,
            },
            message: "Live catalog synced from XPro Partner API.",
          };
        } catch (upstreamErr: any) {
          return reply.status(502).send({
            ok: false,
            error: `Upstream sync error: ${upstreamErr.message}`,
          });
        }
      }

      return reply.status(500).send({
        ok: false,
        error: `Sync error: ${err.message}`,
      });
    }
  });

  // GET /api/admin/orders (List all orders with payment submissions)
  server.get("/api/admin/orders", async () => {
    const db = getDb();
    const orderList = await db
      .select({
        order: orders,
        customer: users,
        submission: paymentSubmissions,
      })
      .from(orders)
      .innerJoin(users, eq(orders.customerId, users.id))
      .leftJoin(paymentSubmissions, eq(orders.id, paymentSubmissions.orderId))
      .orderBy(desc(orders.createdAt))
      .limit(50);

    return {
      ok: true,
      orders: orderList,
    };
  });

  // POST /api/admin/payments/review (Approve & Auto-Deliver OR Reject)
  server.post("/api/admin/payments/review", async (request, reply) => {
    const parseRes = ReviewPaymentSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        ok: false,
        error: "Validation error",
        issues: parseRes.error.issues,
      });
    }

    const { submissionId, action, rejectReason } = parseRes.data;

    try {
      if (action === "APPROVE") {
        const result = await orderService.approvePaymentAndFulfill(submissionId);
        return {
          ok: true,
          action: "APPROVED",
          result,
        };
      } else {
        const result = await orderService.rejectPayment(
          submissionId,
          rejectReason || "Payment slip rejected by store admin."
        );
        return {
          ok: true,
          action: "REJECTED",
          result,
        };
      }
    } catch (err: any) {
      return reply.status(400).send({
        ok: false,
        error: err.message,
      });
    }
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

  // GET /api/admin/orders/:id (Get full order details)
  server.get<{
    Params: { id: string };
  }>("/api/admin/orders/:id", async (request, reply) => {
    const orderId = request.params.id;
    const db = getDb();

    const [orderRow] = await db
      .select({
        order: orders,
        customer: users,
        submission: paymentSubmissions,
      })
      .from(orders)
      .innerJoin(users, eq(orders.customerId, users.id))
      .leftJoin(paymentSubmissions, eq(orders.id, paymentSubmissions.orderId))
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderRow) {
      return reply.status(404).send({ ok: false, error: "Order not found" });
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const deliveries = await db
      .select()
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, orderId));

    return {
      ok: true,
      order: orderRow.order,
      customer: orderRow.customer,
      submission: orderRow.submission,
      items,
      deliveries,
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

    // Default fallback values if not initialized yet
    const defaults = {
      usdToMmkRate: "4500",
      defaultMarginPct: "25",
      supportTelegramHandle: "@ArenaStoreSupport",
      kpayAccountName: "Arena Digital Services",
      kpayPhone: "09 987 654 321",
      wavepayAccountName: "Arena Store",
      wavepayPhone: "09 789 123 456",
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
}

