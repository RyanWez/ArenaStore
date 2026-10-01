import { botConfig } from "../config";
import { botCatalog } from "./catalog.service";
import {
  getDb,
  users,
  wallets,
  walletLedger,
  topUpRequests,
  orders,
  orderItems,
  orderDeliveries,
} from "@arena/db";
import { eq, desc } from "drizzle-orm";

export interface CreateOrderResult {
  orderId: string;
  publicOrderNo: string;
  totalMmk: number;
}

export interface SubmitSlipResult {
  submissionId: number;
  status: string;
}

export interface OrderRecord {
  id: string;
  publicOrderNo: string;
  productId: number;
  productName: string;
  quantity: number;
  totalMmk: number;
  status: "PENDING_PAYMENT" | "PAYMENT_SUBMITTED" | "DELIVERED" | "CANCELLED";
  createdAt: string;
  credentialsText?: string;
}

export interface TopUpRecord {
  id: string;
  telegramId: string;
  amountMmk: number;
  reference: string;
  paymentMethod?: "KPAY" | "WAVEPAY";
  slipFileId?: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
  createdAt: string;
}

export class BotOrderService {
  // In-memory fallback caches if DB is briefly unreachable or during unit tests
  private memoryWallets = new Map<string, number>();
  private memoryOrders = new Map<string, OrderRecord[]>();
  private memoryTopUps = new Map<string, TopUpRecord>();

  /**
   * Finds or creates a customer user record and associated wallet in Neon DB.
   */
  async getOrCreateUser(params: {
    telegramId: string;
    firstName?: string;
    lastName?: string;
    username?: string;
  }) {
    try {
      const db = getDb();
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, params.telegramId))
        .limit(1);

      let user = existingUser;
      if (!user) {
        const [newUser] = await db
          .insert(users)
          .values({
            telegramId: params.telegramId,
            firstName: params.firstName || "Customer",
            lastName: params.lastName || null,
            username: params.username || null,
            role: "CUSTOMER",
            status: "ACTIVE",
          })
          .returning();
        user = newUser;
      }

      // Check or create wallet
      const [existingWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, user.id))
        .limit(1);

      let wallet = existingWallet;
      if (!wallet) {
        const [newWallet] = await db
          .insert(wallets)
          .values({
            userId: user.id,
            balanceMmk: 0,
            totalDepositedMmk: 0,
            totalSpentMmk: 0,
          })
          .returning();
        wallet = newWallet;
      }

      return { user, wallet };
    } catch (err: any) {
      console.warn("[BotOrderService] DB getOrCreateUser error:", err.message);
      return null;
    }
  }

  /**
   * Returns customer's live wallet balance in MMK from Neon DB.
   */
  async getWalletBalance(telegramId: string): Promise<number> {
    try {
      const record = await this.getOrCreateUser({ telegramId });
      if (record?.wallet) {
        return Math.max(record.wallet.balanceMmk, this.memoryWallets.get(telegramId) || 0);
      }
    } catch (err: any) {
      console.warn("[BotOrderService] getWalletBalance DB fallback:", err.message);
    }
    return this.memoryWallets.get(telegramId) || 0;
  }

  /**
   * Directly credits wallet (for admin manual credit or test credit).
   */
  async creditWallet(telegramId: string, amountMmk: number): Promise<number> {
    const memCurrent = this.memoryWallets.get(telegramId) || 0;
    const memNew = memCurrent + amountMmk;
    this.memoryWallets.set(telegramId, memNew);

    try {
      const record = await this.getOrCreateUser({ telegramId });
      if (record?.user && record.wallet) {
        const db = getDb();
        const newBalance = record.wallet.balanceMmk + amountMmk;
        await db
          .update(wallets)
          .set({
            balanceMmk: newBalance,
            totalDepositedMmk: record.wallet.totalDepositedMmk + amountMmk,
            updatedAt: new Date(),
          })
          .where(eq(wallets.id, record.wallet.id));

        await db.insert(walletLedger).values({
          walletId: record.wallet.id,
          amountMmk,
          type: "TOPUP_CREDIT",
          referenceId: `ADMIN-CREDIT-${Date.now()}`,
          notes: "Manual wallet credit by admin",
        });

        this.memoryWallets.set(telegramId, newBalance);
        return newBalance;
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB creditWallet error:", err.message);
    }

    return memNew;
  }

  /**
   * Creates a new top-up request with payment reference in Neon DB.
   */
  async createTopUpRequest(params: {
    telegramId: string;
    amountMmk: number;
    customerName?: string;
    telegramUsername?: string;
    intendedProduct?: string;
  }): Promise<TopUpRecord> {
    const reference = `TOP-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    try {
      const userRecord = await this.getOrCreateUser({
        telegramId: params.telegramId,
        firstName: params.customerName,
        username: params.telegramUsername,
      });

      if (userRecord?.user) {
        const db = getDb();
        const [inserted] = await db
          .insert(topUpRequests)
          .values({
            reference,
            userId: userRecord.user.id,
            amountMmk: params.amountMmk,
            paymentMethod: "KPAY",
            status: "PENDING",
            intendedProduct: params.intendedProduct,
          })
          .returning();

        const record: TopUpRecord = {
          id: String(inserted.id),
          telegramId: params.telegramId,
          amountMmk: params.amountMmk,
          reference,
          status: "PENDING",
          createdAt: nowIso,
        };
        this.memoryTopUps.set(reference, record);
        this.memoryTopUps.set(String(inserted.id), record);
        return record;
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB createTopUpRequest error:", err.message);
    }

    const fallbackRecord: TopUpRecord = {
      id: `topup-${Date.now()}`,
      telegramId: params.telegramId,
      amountMmk: params.amountMmk,
      reference,
      status: "PENDING",
      createdAt: nowIso,
    };
    this.memoryTopUps.set(reference, fallbackRecord);
    this.memoryTopUps.set(fallbackRecord.id, fallbackRecord);
    return fallbackRecord;
  }

  /**
   * Submits a top-up payment slip screenshot proof to Neon DB.
   */
  async submitTopUpSlip(params: {
    topUpId: string;
    telegramId: string;
    fileId: string;
    amountMmk: number;
    paymentMethod: "KPAY" | "WAVEPAY";
  }): Promise<{ submissionId: number; status: string }> {
    try {
      const db = getDb();
      const [updated] = await db
        .update(topUpRequests)
        .set({
          slipFileId: params.fileId,
          paymentMethod: params.paymentMethod,
          status: "SUBMITTED",
        })
        .where(eq(topUpRequests.reference, params.topUpId))
        .returning();

      if (updated) {
        const mem = this.memoryTopUps.get(params.topUpId);
        if (mem) {
          mem.status = "SUBMITTED";
          mem.slipFileId = params.fileId;
          mem.paymentMethod = params.paymentMethod;
        }
        return {
          submissionId: updated.id,
          status: "SUBMITTED",
        };
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB submitTopUpSlip error:", err.message);
    }

    const mem = this.memoryTopUps.get(params.topUpId);
    if (mem) {
      mem.status = "SUBMITTED";
      mem.slipFileId = params.fileId;
      mem.paymentMethod = params.paymentMethod;
    }

    return {
      submissionId: Date.now(),
      status: "SUBMITTED",
    };
  }

  /**
   * Approves top-up request (credits wallet in DB & memory).
   */
  async approveTopUp(topUpId: string): Promise<{ newBalance: number; telegramId: string; amountMmk: number } | null> {
    try {
      const db = getDb();
      const [topUp] = await db
        .select()
        .from(topUpRequests)
        .where(eq(topUpRequests.reference, topUpId))
        .limit(1);

      if (topUp) {
        await db
          .update(topUpRequests)
          .set({ status: "COMPLETED", reviewedAt: new Date() })
          .where(eq(topUpRequests.id, topUp.id));

        const [wallet] = await db
          .select()
          .from(wallets)
          .where(eq(wallets.userId, topUp.userId))
          .limit(1);

        if (wallet) {
          const newBal = wallet.balanceMmk + topUp.amountMmk;
          await db
            .update(wallets)
            .set({ balanceMmk: newBal, totalDepositedMmk: wallet.totalDepositedMmk + topUp.amountMmk })
            .where(eq(wallets.id, wallet.id));

          return { newBalance: newBal, telegramId: "", amountMmk: topUp.amountMmk };
        }
      }
    } catch {
      // fallback
    }

    const mem = this.memoryTopUps.get(topUpId);
    if (!mem) return null;
    mem.status = "APPROVED";
    const current = this.memoryWallets.get(mem.telegramId) || 0;
    const newBalance = current + mem.amountMmk;
    this.memoryWallets.set(mem.telegramId, newBalance);
    return {
      newBalance,
      telegramId: mem.telegramId,
      amountMmk: mem.amountMmk,
    };
  }

  /**
   * Instant purchase with Wallet funds — atomic balance deduction & immediate credentials delivery!
   */
  async purchaseWithWallet(params: {
    telegramId: string;
    customerName: string;
    telegramUsername?: string;
    productId: number;
    quantity: number;
  }): Promise<{
    success: boolean;
    orderId?: string;
    publicOrderNo?: string;
    productName?: string;
    quantity?: number;
    totalMmk?: number;
    credentialsText?: string;
    remainingBalance?: number;
    error?: string;
  }> {
    const product = await botCatalog.getProductById(params.productId);
    if (!product) return { success: false, error: "Product not found" };

    const totalMmk = product.retailPriceMmk * params.quantity;
    const publicOrderNo = `ARN-${Date.now().toString().slice(-6)}`;

    // Generate credentials based on product delivery type
    let credentialsText = "";
    if (product.deliveryType === "LINK") {
      credentialsText = `🔗 <b>Activation Link:</b>\nhttps://partner.arena.store/invite/claim?order=${publicOrderNo}&token=arena_${Date.now().toString().slice(-8)}`;
    } else if (product.deliveryType === "LICENSE") {
      credentialsText = `🔑 <b>License Key:</b>\n<code>ARN-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}</code>`;
    } else {
      credentialsText = `👤 <b>Username:</b> <code>user.${params.telegramId.slice(-4)}@arenastore.mm</code>\n🔑 <b>Password:</b> <code>ArenaPass#${Date.now().toString().slice(-5)}</code>\n📦 <b>Plan:</b> ${product.cleanName}`;
    }

    const memCurrent = this.memoryWallets.get(params.telegramId) || 0;

    try {
      const userRecord = await this.getOrCreateUser({
        telegramId: params.telegramId,
        firstName: params.customerName,
        username: params.telegramUsername,
      });

      if (userRecord?.user && userRecord.wallet) {
        const { user, wallet } = userRecord;
        const availableBalance = Math.max(wallet.balanceMmk, memCurrent);

        if (availableBalance < totalMmk) {
          return { success: false, error: "INSUFFICIENT_FUNDS" };
        }

        const remainingBalance = availableBalance - totalMmk;
        const db = getDb();

        await db.transaction(async (tx) => {
          // 1. Deduct wallet
          await tx
            .update(wallets)
            .set({
              balanceMmk: remainingBalance,
              totalSpentMmk: wallet.totalSpentMmk + totalMmk,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id));

          // 2. Insert wallet ledger
          await tx.insert(walletLedger).values({
            walletId: wallet.id,
            amountMmk: -totalMmk,
            type: "ORDER_DEBIT",
            referenceId: publicOrderNo,
            notes: `Purchase: ${product.cleanName} x ${params.quantity}`,
          });

          // 3. Insert order
          const [insertedOrder] = await tx
            .insert(orders)
            .values({
              publicOrderNo,
              externalOrderId: `XPRO-${publicOrderNo}`,
              customerId: user.id,
              status: "DELIVERED",
              totalAmountMmk: totalMmk,
              notes: `Telegram purchase by @${params.telegramUsername || params.customerName}`,
            })
            .returning();

          // 4. Insert order item
          await tx.insert(orderItems).values({
            orderId: insertedOrder.id,
            productId: product.id,
            productNameSnapshot: product.cleanName,
            quantity: params.quantity,
            unitPriceMmk: product.retailPriceMmk,
            unitCostUsd: product.supplierPriceUsd || "0.00",
            subtotalMmk: totalMmk,
          });

          // 5. Insert order delivery
          await tx.insert(orderDeliveries).values({
            orderId: insertedOrder.id,
            deliveryType: product.deliveryType,
            encryptedPayload: credentialsText,
          });
        });

        // Track in memory
        const orderRecord: OrderRecord = {
          id: publicOrderNo,
          publicOrderNo,
          productId: params.productId,
          productName: product.cleanName,
          quantity: params.quantity,
          totalMmk,
          status: "DELIVERED",
          createdAt: new Date().toISOString(),
          credentialsText,
        };

        const list = this.memoryOrders.get(params.telegramId) || [];
        list.unshift(orderRecord);
        this.memoryOrders.set(params.telegramId, list);
        this.memoryWallets.set(params.telegramId, remainingBalance);

        return {
          success: true,
          orderId: publicOrderNo,
          publicOrderNo,
          productName: product.cleanName,
          quantity: params.quantity,
          totalMmk,
          credentialsText,
          remainingBalance,
        };
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB purchaseWithWallet error:", err.message);
    }

    // Memory fallback if DB unavailable or in isolated unit test
    if (memCurrent < totalMmk) {
      return { success: false, error: "INSUFFICIENT_FUNDS" };
    }

    const remaining = memCurrent - totalMmk;
    this.memoryWallets.set(params.telegramId, remaining);

    const orderRecord: OrderRecord = {
      id: publicOrderNo,
      publicOrderNo,
      productId: params.productId,
      productName: product.cleanName,
      quantity: params.quantity,
      totalMmk,
      status: "DELIVERED",
      createdAt: new Date().toISOString(),
      credentialsText,
    };

    const list = this.memoryOrders.get(params.telegramId) || [];
    list.unshift(orderRecord);
    this.memoryOrders.set(params.telegramId, list);

    return {
      success: true,
      orderId: publicOrderNo,
      publicOrderNo,
      productName: product.cleanName,
      quantity: params.quantity,
      totalMmk,
      credentialsText,
      remainingBalance: remaining,
    };
  }

  /**
   * Pending order creation (legacy flow support).
   */
  async createOrder(params: {
    telegramId: string;
    telegramUsername?: string;
    customerName: string;
    productId: number;
    quantity: number;
  }): Promise<CreateOrderResult> {
    const apiUrl = `${botConfig.API_BASE_URL.replace(/\/+$/, "")}/api/orders`;

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId: params.telegramId,
          productId: params.productId,
          quantity: params.quantity,
          notes: `Customer: ${params.customerName}${params.telegramUsername ? ` (@${params.telegramUsername})` : ""}`,
        }),
      });

      if (res.ok) {
        const json: any = await res.json();
        if (json.ok && json.order) {
          const product = await botCatalog.getProductById(params.productId);
          const orderRecord: OrderRecord = {
            id: json.order.orderId || json.order.id,
            publicOrderNo: json.order.publicOrderNo,
            productId: params.productId,
            productName: product ? product.cleanName : "Digital Product",
            quantity: params.quantity,
            totalMmk: json.order.totalAmountMmk,
            status: "PENDING_PAYMENT",
            createdAt: new Date().toISOString(),
          };
          const list = this.memoryOrders.get(params.telegramId) || [];
          list.unshift(orderRecord);
          this.memoryOrders.set(params.telegramId, list);

          return {
            orderId: json.order.orderId || json.order.id,
            publicOrderNo: json.order.publicOrderNo,
            totalMmk: json.order.totalAmountMmk,
          };
        }
      }
    } catch {
      // Fallback
    }

    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const orderId = `ord-bot-${Date.now()}-${randomSuffix}`;
    const publicOrderNo = `ARN-2026-${randomSuffix}`;
    const product = await botCatalog.getProductById(params.productId);
    const totalMmk = (product ? product.retailPriceMmk : 3900) * params.quantity;

    const orderRecord: OrderRecord = {
      id: orderId,
      publicOrderNo,
      productId: params.productId,
      productName: product ? product.cleanName : "Digital Product",
      quantity: params.quantity,
      totalMmk,
      status: "PENDING_PAYMENT",
      createdAt: new Date().toISOString(),
    };

    const list = this.memoryOrders.get(params.telegramId) || [];
    list.unshift(orderRecord);
    this.memoryOrders.set(params.telegramId, list);

    return {
      orderId,
      publicOrderNo,
      totalMmk,
    };
  }

  /**
   * Submits payment slip (legacy flow support).
   */
  async submitPaymentSlip(params: {
    orderId: string;
    telegramId: string;
    fileId: string;
    paymentMethod: "KPAY" | "WAVEPAY";
    amountMmk: number;
    transactionRef?: string;
  }): Promise<SubmitSlipResult> {
    const apiUrl = `${botConfig.API_BASE_URL.replace(/\/+$/, "")}/api/orders/${params.orderId}/payments`;

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: params.paymentMethod,
          submittedAmountMmk: params.amountMmk,
          transactionRef: params.transactionRef || `TX-BOT-${Date.now().toString().slice(-6)}`,
          slipFileId: params.fileId,
        }),
      });

      if (res.ok) {
        const json: any = await res.json();
        if (json.ok && json.submission) {
          const list = this.memoryOrders.get(params.telegramId) || [];
          const ord = list.find((o) => o.id === params.orderId || o.publicOrderNo === params.orderId);
          if (ord) ord.status = "PAYMENT_SUBMITTED";

          return {
            submissionId: json.submission.id,
            status: json.submission.status,
          };
        }
      }
    } catch {
      // Dev fallback
    }

    const list = this.memoryOrders.get(params.telegramId) || [];
    const ord = list.find((o) => o.id === params.orderId || o.publicOrderNo === params.orderId);
    if (ord) {
      ord.status = "PAYMENT_SUBMITTED";
    }

    return {
      submissionId: Date.now(),
      status: "SUBMITTED",
    };
  }

  /**
   * Fetches customer purchasing stats and profile details from Neon DB.
   */
  async getUserProfile(telegramId: string): Promise<{
    joinedDate: string;
    ordersCount: number;
    totalSpentMmk: number;
    walletBalanceMmk: number;
    totalDepositsMmk: number;
  }> {
    try {
      const userRecord = await this.getOrCreateUser({ telegramId });
      if (userRecord?.user && userRecord.wallet) {
        const { user, wallet } = userRecord;
        const db = getDb();
        const userOrders = await db
          .select()
          .from(orders)
          .where(eq(orders.customerId, user.id));

        return {
          joinedDate: user.createdAt.toISOString().split("T")[0],
          ordersCount: userOrders.length,
          totalSpentMmk: wallet.totalSpentMmk,
          walletBalanceMmk: wallet.balanceMmk,
          totalDepositsMmk: wallet.totalDepositedMmk,
        };
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB getUserProfile error:", err.message);
    }

    const localBalance = this.memoryWallets.get(telegramId) || 0;
    const localOrders = this.memoryOrders.get(telegramId) || [];
    const localSpent = localOrders.reduce(
      (sum, o) => sum + (o.status === "DELIVERED" ? o.totalMmk : 0),
      0
    );

    return {
      joinedDate: new Date().toISOString().split("T")[0],
      ordersCount: localOrders.length,
      totalSpentMmk: localSpent,
      walletBalanceMmk: localBalance,
      totalDepositsMmk: localBalance + localSpent,
    };
  }

  /**
   * Retrieves user orders list.
   */
  async getUserOrders(telegramId: string): Promise<OrderRecord[]> {
    try {
      const userRecord = await this.getOrCreateUser({ telegramId });
      if (userRecord?.user) {
        const db = getDb();
        const dbOrders = await db
          .select()
          .from(orders)
          .where(eq(orders.customerId, userRecord.user.id))
          .orderBy(desc(orders.createdAt))
          .limit(20);

        if (dbOrders.length > 0) {
          return dbOrders.map((o) => ({
            id: o.publicOrderNo,
            publicOrderNo: o.publicOrderNo,
            productId: 0,
            productName: "Digital Product",
            quantity: 1,
            totalMmk: o.totalAmountMmk,
            status: o.status as any,
            createdAt: o.createdAt.toISOString(),
          }));
        }
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB getUserOrders error:", err.message);
    }

    return this.memoryOrders.get(telegramId) || [];
  }

  /**
   * Retrieves a single order by public order number or ID.
   */
  async getOrderById(orderId: string): Promise<OrderRecord | null> {
    try {
      const db = getDb();
      const [orderRow] = await db
        .select()
        .from(orders)
        .where(eq(orders.publicOrderNo, orderId))
        .limit(1);

      if (orderRow) {
        const [deliv] = await db
          .select()
          .from(orderDeliveries)
          .where(eq(orderDeliveries.orderId, orderRow.id))
          .limit(1);

        return {
          id: orderRow.publicOrderNo,
          publicOrderNo: orderRow.publicOrderNo,
          productId: 0,
          productName: "Digital Product",
          quantity: 1,
          totalMmk: orderRow.totalAmountMmk,
          status: orderRow.status as any,
          createdAt: orderRow.createdAt.toISOString(),
          credentialsText: deliv?.encryptedPayload,
        };
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB getOrderById error:", err.message);
    }

    for (const list of this.memoryOrders.values()) {
      const found = list.find((o) => o.id === orderId || o.publicOrderNo === orderId);
      if (found) return found;
    }
    return null;
  }
}

export const botOrderService = new BotOrderService();
