import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, gte, sql } from "drizzle-orm";
import { botOrderService } from "../../apps/bot/src/services/order.service";
import { decryptPayload } from "../../apps/bot/src/services/encryption";
import {
  getDb,
  closeDb,
  users,
  wallets,
  walletLedger,
  orders,
  orderItems,
  orderDeliveries,
} from "@arena/db";
import {
  seedCatalog,
  seedCustomer,
  syntheticTelegramId,
  getWalletBalance,
} from "../fixtures/seed";

/**
 * Customer instant-purchase integration test (primary bot flow):
 * creditWallet → purchaseWithWallet against a real Postgres test database.
 *
 * In test mode the bot's catalog service serves its deterministic fallback
 * product (id 10, "Gemini AI 18 MONTH", 3,900 Ks, stock 50) and the upstream
 * purchase is skipped by the bot's own NODE_ENV=test guard, so no supplier
 * request can ever happen. The database transaction (atomic wallet debit,
 * ledger, order, encrypted delivery) runs for real.
 */

const FALLBACK_PRODUCT_ID = 10;
const FALLBACK_PRICE_MMk = 3900;
const FALLBACK_STOCK = 50;

async function getUserIdByTelegramId(telegramId: string): Promise<number> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId));
  expect(user).toBeTruthy();
  return user.id;
}

beforeAll(async () => {
  // The bot's fallback product (id 10) must exist in the DB for order_items FK.
  await seedCatalog({
    productId: FALLBACK_PRODUCT_ID,
    upstreamProductId: FALLBACK_PRODUCT_ID,
    slugSuffix: "bot-fallback",
    retailPriceMmk: FALLBACK_PRICE_MMk,
  });
});

afterAll(async () => {
  await closeDb();
});

describe("Bot instant wallet purchase (Recommendation D money path)", () => {
  it("atomically debits the wallet, writes the ledger, stores the order and encrypted delivery", async () => {
    const telegramId = syntheticTelegramId();
    const credited = await botOrderService.creditWallet(telegramId, 10000);
    expect(credited).toBe(10000);

    const res = await botOrderService.purchaseWithWallet({
      telegramId,
      customerName: "Test Customer",
      productId: FALLBACK_PRODUCT_ID,
      quantity: 1,
    });

    expect(res.success).toBe(true);
    expect(res.publicOrderNo).toBeTruthy();
    expect(res.totalMmk).toBe(FALLBACK_PRICE_MMk);
    expect(res.remainingBalance).toBe(10000 - FALLBACK_PRICE_MMk);
    expect(res.credentialsText).toBeTruthy();

    const userId = await getUserIdByTelegramId(telegramId);

    // Wallet debited exactly once (integer MMK, no float drift).
    const wallet = await getWalletBalance(userId);
    expect(wallet.balanceMmk).toBe(10000 - FALLBACK_PRICE_MMk);
    expect(wallet.totalSpentMmk).toBe(FALLBACK_PRICE_MMk);

    // Ledger entry for the debit.
    const db = getDb();
    const [debit] = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.referenceId, res.publicOrderNo!));
    expect(debit).toBeTruthy();
    expect(debit.type).toBe("ORDER_DEBIT");
    expect(debit.amountMmk).toBe(-FALLBACK_PRICE_MMk);

    // Order stored as DELIVERED.
    const [orderRow] = await db
      .select()
      .from(orders)
      .where(eq(orders.publicOrderNo, res.publicOrderNo!));
    expect(orderRow).toBeTruthy();
    expect(orderRow.status).toBe("DELIVERED");
    expect(orderRow.customerId).toBe(userId);
    expect(orderRow.totalAmountMmk).toBe(FALLBACK_PRICE_MMk);

    // Order item snapshot with the real product and unit price.
    const [itemRow] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderRow.id));
    expect(itemRow.productId).toBe(FALLBACK_PRODUCT_ID);
    expect(itemRow.quantity).toBe(1);
    expect(itemRow.unitPriceMmk).toBe(FALLBACK_PRICE_MMk);
    expect(itemRow.subtotalMmk).toBe(FALLBACK_PRICE_MMk);

    // Encrypted delivery payload round-trips with the test key and never
    // stores plaintext credentials.
    const [deliveryRow] = await db
      .select()
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, orderRow.id));
    expect(deliveryRow).toBeTruthy();
    expect(deliveryRow.upstreamOrderId).toBeNull();
    const payload = deliveryRow.encryptedPayload;
    expect(payload.split(":")).toHaveLength(3);
    expect(payload).not.toContain(res.credentialsText!);
    const lines = decryptPayload<string[]>(payload, undefined, true);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.join("\n")).toBe(res.credentialsText);

    // Wallet balance via the service reflects the debit.
    expect(await botOrderService.getWalletBalance(telegramId)).toBe(
      10000 - FALLBACK_PRICE_MMk
    );
  });

  it("never returns another customer's order to the order viewer", async () => {
    const telegramId = syntheticTelegramId();
    await botOrderService.creditWallet(telegramId, 10000);

    const res = await botOrderService.purchaseWithWallet({
      telegramId,
      customerName: "Owner Customer",
      productId: FALLBACK_PRODUCT_ID,
      quantity: 1,
    });
    expect(res.success).toBe(true);
    expect(res.publicOrderNo).toBeTruthy();

    // A different Telegram account must not be able to read this order...
    const strangerId = syntheticTelegramId();
    const strangerView = await botOrderService.getOrderById(res.publicOrderNo!, strangerId);
    expect(strangerView).toBeNull();

    // ...while the owner still can, credentials included.
    const ownerView = await botOrderService.getOrderById(res.publicOrderNo!, telegramId);
    expect(ownerView).toBeTruthy();
    expect(ownerView!.publicOrderNo).toBe(res.publicOrderNo);
    expect(ownerView!.credentialsText).toBeTruthy();
  });

  it("refuses a purchase when the wallet balance is insufficient and stores nothing", async () => {
    const telegramId = syntheticTelegramId();
    await seedCustomer(telegramId, 0);

    const res = await botOrderService.purchaseWithWallet({
      telegramId,
      customerName: "Broke Customer",
      productId: FALLBACK_PRODUCT_ID,
      quantity: 1,
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("INSUFFICIENT_FUNDS");

    const userId = await getUserIdByTelegramId(telegramId);
    const db = getDb();
    const orderRows = await db.select().from(orders).where(eq(orders.customerId, userId));
    expect(orderRows).toHaveLength(0);
    expect(await getWalletBalance(userId)).toEqual({
      balanceMmk: 0,
      totalDepositedMmk: 0,
      totalSpentMmk: 0,
    });
  });

  it("refuses a purchase that exceeds the sellable stock", async () => {
    const telegramId = syntheticTelegramId();
    await botOrderService.creditWallet(telegramId, 500000);

    const res = await botOrderService.purchaseWithWallet({
      telegramId,
      customerName: "Greedy Customer",
      productId: FALLBACK_PRODUCT_ID,
      quantity: FALLBACK_STOCK + 1,
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("OUT_OF_STOCK");

    const userId = await getUserIdByTelegramId(telegramId);
    const db = getDb();
    const orderRows = await db.select().from(orders).where(eq(orders.customerId, userId));
    expect(orderRows).toHaveLength(0);
    expect((await getWalletBalance(userId)).balanceMmk).toBe(500000);
  });

  it("prevents double-spend when concurrent purchases arrive simultaneously for the same wallet", async () => {
    const telegramId = syntheticTelegramId();
    // Credit exactly enough for ONE purchase
    await botOrderService.creditWallet(telegramId, FALLBACK_PRICE_MMk);

    const [res1, res2] = await Promise.all([
      botOrderService.purchaseWithWallet({
        telegramId,
        customerName: "Concurrent Buyer 1",
        productId: FALLBACK_PRODUCT_ID,
        quantity: 1,
      }),
      botOrderService.purchaseWithWallet({
        telegramId,
        customerName: "Concurrent Buyer 2",
        productId: FALLBACK_PRODUCT_ID,
        quantity: 1,
      }),
    ]);

    // Exactly one must succeed, the other must fail (either OPERATION_IN_PROGRESS or INSUFFICIENT_FUNDS)
    const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0);
    expect(successCount).toBe(1);

    const failedRes = res1.success ? res2 : res1;
    expect(["INSUFFICIENT_FUNDS", "OPERATION_IN_PROGRESS"]).toContain(failedRes.error);

    const userId = await getUserIdByTelegramId(telegramId);
    const db = getDb();
    const orderRows = await db.select().from(orders).where(eq(orders.customerId, userId));
    // Exactly 1 order created in database
    expect(orderRows).toHaveLength(1);

    // Wallet balance cannot be negative or double-spent; must be exactly 0 MMK
    const wallet = await getWalletBalance(userId);
    expect(wallet.balanceMmk).toBe(0);
    expect(wallet.totalSpentMmk).toBe(FALLBACK_PRICE_MMk);
  });

  it("admin dashboard debit leaves no phantom balance: bot shows 0 and purchase is refused", async () => {
    const telegramId = syntheticTelegramId();
    // 1. Customer credited 50,000 — real funds in the wallet.
    await botOrderService.creditWallet(telegramId, 50000);

    // 2. Admin debits it all from the Dashboard (same guarded update as
    //    adjust-balance). The API never touches the bot's in-process cache.
    const userId = await getUserIdByTelegramId(telegramId);
    const db = getDb();
    const [walletRow] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    const [debited] = await db
      .update(wallets)
      .set({ balanceMmk: sql`${wallets.balanceMmk} - 50000` })
      .where(and(eq(wallets.id, walletRow.id), gte(wallets.balanceMmk, 50000)))
      .returning();
    expect(debited.balanceMmk).toBe(0);

    // 3. The bot must report the true debited balance, never a stale cache.
    expect(await botOrderService.getWalletBalance(telegramId)).toBe(0);

    // 4. A purchase with no money must be refused and store nothing.
    const res = await botOrderService.purchaseWithWallet({
      telegramId,
      customerName: "Debited Customer",
      productId: FALLBACK_PRODUCT_ID,
      quantity: 1,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("INSUFFICIENT_FUNDS");

    const orderRows = await db.select().from(orders).where(eq(orders.customerId, userId));
    expect(orderRows).toHaveLength(0);
  });
});
