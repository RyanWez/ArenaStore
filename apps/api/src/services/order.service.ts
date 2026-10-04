import crypto from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import {
  getDb,
  users,
  products,
  productSupplierSnapshots,
  orders,
  orderItems,
  orderDeliveries,
  paymentSubmissions,
  stockReservations,
  auditLogs,
} from "@arena/db";
import { OrderStatus, PaymentStatus } from "@arena/shared";
import { xproClient, XProCreateOrderResponse } from "./xpro-client";
import { encryptPayload } from "./encryption";
import { catalogService } from "./catalog.service";
import { config } from "../config";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

/**
 * Test-environment safety guard (mirrors the bot-side guard): in test runs the
 * upstream base URL must point at localhost so a real supplier order can never
 * be placed from a test. Tests simulate the supplier by mocking the
 * xpro-client module or by running a local mock server.
 */
function assertUpstreamSafeForTests(): void {
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;
  if (!isTestEnv) return;

  let upstreamHost = "";
  try {
    upstreamHost = new URL(config.UPSTREAM_BASE_URL).hostname;
  } catch {
    throw new Error("SAFETY GUARD: UPSTREAM_BASE_URL is not a valid URL.");
  }
  if (!LOCAL_HOSTS.includes(upstreamHost)) {
    throw new Error(
      "SAFETY GUARD: refusing to place an upstream order from a test environment " +
        `with a non-local UPSTREAM_BASE_URL ("${upstreamHost}"). Mock the xpro-client module instead.`
    );
  }
}

export interface CreateOrderParams {
  telegramId: string;
  productId: number;
  quantity: number;
  notes?: string;
  username?: string;
  firstName?: string;
}

export interface SubmitPaymentParams {
  orderId: string;
  paymentMethod: string;
  slipFileId: string;
  transactionRef?: string;
  submittedAmountMmk: number;
}

export class OrderService {
  /**
   * Generates a customer-facing public order number (e.g., ARN-2026-84920).
   */
  private generatePublicOrderNo(): string {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    return `ARN-${year}-${randomSuffix}`;
  }

  /**
   * Creates a pending customer order and holds a 15-minute stock reservation.
   */
  async createPendingOrder(params: CreateOrderParams) {
    const db = getDb();
    const { telegramId, productId, quantity, notes, username, firstName } = params;

    // 1. Find or create user
    let [user] = await db.select().from(users).where(eq(users.telegramId, telegramId));
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          telegramId,
          username: username || null,
          firstName: firstName || "Customer",
          role: "CUSTOMER",
          status: "ACTIVE",
        })
        .returning();
    }

    // 2. Fetch product and live supplier snapshot
    const [row] = await db
      .select({
        product: products,
        snapshot: productSupplierSnapshots,
      })
      .from(products)
      .innerJoin(productSupplierSnapshots, eq(products.id, productSupplierSnapshots.productId))
      .where(and(eq(products.id, productId), eq(products.isActive, true)));

    if (!row) {
      throw new Error("Product is not available or has been disabled.");
    }

    // 3. Verify sellable stock
    const [sellableItem] = await catalogService.getSellableProducts({ categoryId: row.product.categoryId || undefined });
    const currentStock = sellableItem?.sellableStock || 0;
    if (currentStock < quantity) {
      throw new Error(`Insufficient stock. Only ${currentStock} units available.`);
    }

    // 4. Generate order IDs
    const publicOrderNo = this.generatePublicOrderNo();
    const externalOrderId = `arn-${crypto.randomUUID()}`;
    const totalAmountMmk = row.product.retailPriceMmk * quantity;

    // 5. Insert order
    const [order] = await db
      .insert(orders)
      .values({
        publicOrderNo,
        externalOrderId,
        customerId: user.id,
        status: OrderStatus.PENDING_PAYMENT,
        totalAmountMmk,
        notes: notes || null,
      })
      .returning();

    // 6. Insert order item snapshot
    await db.insert(orderItems).values({
      orderId: order.id,
      productId: row.product.id,
      productNameSnapshot: row.product.nameMmk,
      quantity,
      unitPriceMmk: row.product.retailPriceMmk,
      unitCostUsd: row.snapshot.supplierPriceUsd,
      subtotalMmk: totalAmountMmk,
    });

    // 7. Create 15-minute stock reservation
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.insert(stockReservations).values({
      productId: row.product.id,
      orderId: order.id,
      quantity,
      expiresAt,
    });

    return {
      orderId: order.id,
      publicOrderNo: order.publicOrderNo,
      totalAmountMmk: order.totalAmountMmk,
      expiresAt,
      productName: row.product.nameMmk,
      quantity,
    };
  }

  /**
   * Records customer payment slip submission and transitions order to PAYMENT_SUBMITTED.
   */
  async submitPaymentProof(params: SubmitPaymentParams) {
    const db = getDb();
    const { orderId, paymentMethod, slipFileId, transactionRef, submittedAmountMmk } = params;

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      throw new Error("Order not found.");
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new Error(`Cannot submit payment for order in ${order.status} state.`);
    }

    const [submission] = await db
      .insert(paymentSubmissions)
      .values({
        orderId,
        paymentMethod,
        slipFileId,
        transactionRef: transactionRef || null,
        submittedAmountMmk,
        status: PaymentStatus.SUBMITTED,
      })
      .returning();

    await db
      .update(orders)
      .set({
        status: OrderStatus.PAYMENT_SUBMITTED,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    return submission;
  }

  /**
   * Approves customer payment, calls upstream XPro API with externalOrderId,
   * encrypts delivered credentials, and sets order status to DELIVERED.
   */
  async approvePaymentAndFulfill(submissionId: number, reviewedByUserId?: number) {
    const db = getDb();

    // 1. Fetch submission and order
    const [submission] = await db
      .select()
      .from(paymentSubmissions)
      .where(eq(paymentSubmissions.id, submissionId));

    if (!submission) {
      throw new Error("Payment submission not found.");
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, submission.orderId));
    if (!order) {
      throw new Error("Order not found.");
    }

    if (order.status === OrderStatus.DELIVERED) {
      throw new Error("Order has already been fulfilled and delivered.");
    }

    // 2. Fetch order items and upstream product info
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    if (!item) {
      throw new Error("Order has no items.");
    }

    const [product] = await db.select().from(products).where(eq(products.id, item.productId));
    if (!product) {
      throw new Error("Product record not found.");
    }

    // 3. Transition to processing
    await db
      .update(orders)
      .set({ status: OrderStatus.PROCESSING_SUPPLIER, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    // 4. Place upstream order with strict idempotency (same externalOrderId)
    assertUpstreamSafeForTests();

    let upstreamRes: XProCreateOrderResponse;
    try {
      upstreamRes = await xproClient.createOrder({
        productId: product.upstreamProductId,
        quantity: item.quantity,
        externalOrderId: order.externalOrderId,
      });
    } catch (err: any) {
      await db
        .update(orders)
        .set({ status: OrderStatus.FAILED, updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      throw new Error(`Upstream purchase failed: ${err.message}`);
    }

    // 5. Encrypt delivery credentials using AES-256-GCM
    const encrypted = encryptPayload(upstreamRes.delivery.lines);

    await db.insert(orderDeliveries).values({
      orderId: order.id,
      upstreamOrderId: upstreamRes.order.orderId,
      deliveryType: upstreamRes.delivery.type,
      encryptedPayload: encrypted,
      deliveredAt: new Date(),
    });

    // 6. Release reservation and mark order DELIVERED
    await db.delete(stockReservations).where(eq(stockReservations.orderId, order.id));

    await db
      .update(paymentSubmissions)
      .set({
        status: PaymentStatus.VERIFIED,
        reviewedBy: reviewedByUserId || null,
        reviewedAt: new Date(),
      })
      .where(eq(paymentSubmissions.id, submissionId));

    await db
      .update(orders)
      .set({ status: OrderStatus.DELIVERED, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    // 7. Audit log
    await db.insert(auditLogs).values({
      actorId: reviewedByUserId || null,
      action: "APPROVE_AND_DELIVER",
      entityType: "ORDER",
      entityId: order.id,
      details: {
        publicOrderNo: order.publicOrderNo,
        upstreamOrderId: upstreamRes.order.orderId,
        quantity: item.quantity,
      },
    });

    return {
      orderId: order.id,
      publicOrderNo: order.publicOrderNo,
      status: OrderStatus.DELIVERED,
      delivery: {
        type: upstreamRes.delivery.type,
        lines: upstreamRes.delivery.lines,
      },
    };
  }

  /**
   * Rejects payment slip, releases reservation, and marks order CANCELLED.
   */
  async rejectPayment(submissionId: number, rejectReason: string, reviewedByUserId?: number) {
    const db = getDb();

    const [submission] = await db
      .select()
      .from(paymentSubmissions)
      .where(eq(paymentSubmissions.id, submissionId));

    if (!submission) {
      throw new Error("Payment submission not found.");
    }

    await db
      .update(paymentSubmissions)
      .set({
        status: PaymentStatus.REJECTED,
        rejectReason,
        reviewedBy: reviewedByUserId || null,
        reviewedAt: new Date(),
      })
      .where(eq(paymentSubmissions.id, submissionId));

    // Release stock reservation
    await db.delete(stockReservations).where(eq(stockReservations.orderId, submission.orderId));

    await db
      .update(orders)
      .set({ status: OrderStatus.CANCELLED, updatedAt: new Date() })
      .where(eq(orders.id, submission.orderId));

    return {
      orderId: submission.orderId,
      status: OrderStatus.CANCELLED,
      rejectReason,
    };
  }
}

export const orderService = new OrderService();
