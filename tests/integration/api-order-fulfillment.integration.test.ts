import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeUpstreamOrderResponse } from "../mocks/upstream";

/**
 * Legacy API order flow integration test (service level):
 * createPendingOrder → stock reservation → submitPaymentProof →
 * approvePaymentAndFulfill (upstream mocked) → encrypted delivery.
 *
 * The upstream supplier is fully mocked; the real code path (including the
 * externalOrderId idempotency key and AES-256-GCM encryption at rest) runs
 * against the Postgres test database.
 */

const xproState = vi.hoisted(() => ({
  balance: "50.00",
  categories: [] as unknown[],
  products: [] as unknown[],
  createOrderImpl: async () => {
    throw new Error("createOrderImpl not configured");
  },
  createOrderCalls: [] as Array<{ productId: number; quantity: number; externalOrderId: string }>,
}));

vi.mock("../../apps/api/src/services/xpro-client", () => ({
  xproClient: {
    getBalance: () => Promise.resolve({ ok: true, balance: xproState.balance, currency: "USD" }),
    getCategories: () => Promise.resolve(xproState.categories),
    getProducts: () => Promise.resolve({ products: xproState.products, total: xproState.products.length }),
    createOrder: (params: { productId: number; quantity: number; externalOrderId: string }) => {
      xproState.createOrderCalls.push(params);
      return xproState.createOrderImpl(params);
    },
    getHealth: () => Promise.resolve({ ok: true, service: "mock-xpro", version: "test", time: 0 }),
    getProduct: () => Promise.reject(new Error("not mocked")),
    getOrder: () => Promise.reject(new Error("not mocked")),
    getUsage: () => Promise.reject(new Error("not mocked")),
  },
  XProApiError: class XProApiError extends Error {},
  XProProduct: class XProProduct {},
  XProCategory: class XProCategory {},
  XProCreateOrderResponse: class XProCreateOrderResponse {},
}));

import { orderService } from "../../apps/api/src/services/order.service";
import { decryptPayload } from "../../apps/api/src/services/encryption";
import {
  getDb,
  closeDb,
  orders,
  orderItems,
  orderDeliveries,
  stockReservations,
  paymentSubmissions,
  auditLogs,
} from "@arena/db";
import { OrderStatus, PaymentStatus } from "@arena/shared";
import { seedCatalog, syntheticTelegramId } from "../fixtures/seed";

const DELIVERY_LINES = ["arena.test.user@arenastore.mm:ArenaTestPass#1"];

beforeAll(() => {
  xproState.createOrderImpl = async (params) =>
    makeUpstreamOrderResponse({
      order: {
        orderId: 987654,
        externalOrderId: params.externalOrderId,
        quantity: params.quantity,
        productId: params.productId,
      },
      delivery: { type: "CREDENTIALS", lines: DELIVERY_LINES },
    });
});

afterAll(async () => {
  await closeDb();
});

/** Creates a pending order (no payment submission yet). */
async function createPendingOrderForTest() {
  const telegramId = syntheticTelegramId();
  const catalog = await seedCatalog({ priceUsd: "0.69", stock: 50 });

  const order = await orderService.createPendingOrder({
    telegramId,
    productId: catalog.product.id,
    quantity: 2,
    username: "test_customer",
    firstName: "Test",
  });

  return { catalog, telegramId, order };
}

/** Creates a pending order and submits its payment slip. */
async function seedPendingSubmission() {
  const { catalog, telegramId, order } = await createPendingOrderForTest();

  const submission = await orderService.submitPaymentProof({
    orderId: order.orderId,
    paymentMethod: "KPAY",
    slipFileId: "test-slip-file-id",
    submittedAmountMmk: order.totalAmountMmk,
  });

  return { catalog, telegramId, order, submissionId: submission.id };
}

describe("API order lifecycle (legacy pending-order flow)", () => {
  it("creates a pending order with a 15-minute stock reservation", async () => {
    const { catalog, order } = await createPendingOrderForTest();

    expect(order.totalAmountMmk).toBe(3900 * 2);
    expect(order.publicOrderNo).toMatch(/^ARN-\d{4}-\d{5}$/);

    const db = getDb();
    const [orderRow] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(orderRow.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(orderRow.externalOrderId).toMatch(/^arn-/);

    const [itemRow] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.orderId));
    expect(itemRow.productId).toBe(catalog.product.id);
    expect(itemRow.quantity).toBe(2);
    expect(itemRow.unitCostUsd).toBe("0.69");
    expect(itemRow.subtotalMmk).toBe(7800);

    const [reservation] = await db
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.orderId, order.orderId));
    expect(reservation.quantity).toBe(2);
    const holdMinutes =
      (reservation.expiresAt.getTime() - Date.now()) / 1000 / 60;
    expect(holdMinutes).toBeGreaterThan(14);
    expect(holdMinutes).toBeLessThanOrEqual(15);
  });

  it("fulfills an approved payment: upstream purchase, encrypted delivery, reservation release, audit log", async () => {
    const { catalog, order, submissionId } = await seedPendingSubmission();

    const result = await orderService.approvePaymentAndFulfill(submissionId);

    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(result.delivery.lines).toEqual(DELIVERY_LINES);

    // The upstream purchase used the internal idempotency key.
    expect(xproState.createOrderCalls).toHaveLength(1);
    const call = xproState.createOrderCalls[0];
    expect(call.quantity).toBe(2);
    expect(call.productId).toBe(catalog.product.upstreamProductId);

    const db = getDb();
    const [orderRow] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(orderRow.status).toBe(OrderStatus.DELIVERED);
    expect(call.externalOrderId).toBe(orderRow.externalOrderId);

    // Delivery stored encrypted at rest — never plaintext.
    const [deliveryRow] = await db
      .select()
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, order.orderId));
    expect(deliveryRow).toBeTruthy();
    expect(deliveryRow.upstreamOrderId).toBe(987654);
    expect(deliveryRow.encryptedPayload).not.toContain("ArenaTestPass");
    expect(deliveryRow.encryptedPayload.split(":")).toHaveLength(3);
    const decrypted = decryptPayload<string[]>(deliveryRow.encryptedPayload, undefined, true);
    expect(decrypted).toEqual(DELIVERY_LINES);

    // Reservation released and submission verified.
    const reservations = await db
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.orderId, order.orderId));
    expect(reservations).toHaveLength(0);

    const [submissionRow] = await db
      .select()
      .from(paymentSubmissions)
      .where(eq(paymentSubmissions.id, submissionId));
    expect(submissionRow.status).toBe(PaymentStatus.VERIFIED);

    const [auditRow] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, order.orderId));
    expect(auditRow.action).toBe("APPROVE_AND_DELIVER");
    expect(auditRow.entityType).toBe("ORDER");
  });

  it("refuses to fulfill an order that was already delivered", async () => {
    const { submissionId } = await seedPendingSubmission();
    await orderService.approvePaymentAndFulfill(submissionId);

    await expect(orderService.approvePaymentAndFulfill(submissionId)).rejects.toThrow(
      /already been fulfilled/
    );
  });

  it("marks the order FAILED without storing a delivery when the upstream purchase fails", async () => {
    const { order, submissionId } = await seedPendingSubmission();

    xproState.createOrderImpl = async () => {
      throw new Error("Supplier outage simulation");
    };

    await expect(orderService.approvePaymentAndFulfill(submissionId)).rejects.toThrow(
      /Upstream purchase failed: Supplier outage simulation/
    );

    xproState.createOrderImpl = async (params) =>
      makeUpstreamOrderResponse({
        order: { orderId: 987654, externalOrderId: params.externalOrderId },
        delivery: { type: "CREDENTIALS", lines: DELIVERY_LINES },
      });

    const db = getDb();
    const [orderRow] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(orderRow.status).toBe(OrderStatus.FAILED);

    const deliveries = await db
      .select()
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, order.orderId));
    expect(deliveries).toHaveLength(0);
  });

  it("rejects a payment: order CANCELLED, submission REJECTED, reservation released", async () => {
    const { order, submissionId } = await seedPendingSubmission();

    const result = await orderService.rejectPayment(submissionId, "Slip image is blurry");

    expect(result.status).toBe(OrderStatus.CANCELLED);

    const db = getDb();
    const [orderRow] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(orderRow.status).toBe(OrderStatus.CANCELLED);

    const [submissionRow] = await db
      .select()
      .from(paymentSubmissions)
      .where(eq(paymentSubmissions.id, submissionId));
    expect(submissionRow.status).toBe(PaymentStatus.REJECTED);
    expect(submissionRow.rejectReason).toBe("Slip image is blurry");

    const reservations = await db
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.orderId, order.orderId));
    expect(reservations).toHaveLength(0);
  });
});
