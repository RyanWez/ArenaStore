import crypto from "node:crypto";
import { botConfig } from "../config";
import { botCatalog } from "./catalog.service";
import { botSettingsService } from "./settings.service";
import { createSupplierClient, SupplierError, type SupplierId } from "@arena/suppliers";
import { escapeHtml } from "@arena/shared";
import { encryptPayload, decryptPayload, formatCredentialsText } from "./encryption";
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
import { eq, desc, or, and, sql, gte } from "drizzle-orm";

async function sendAdminTelegramAlert(text: string): Promise<boolean> {
  try {
    const settings = await botSettingsService.getSettings();
    const chatId = settings.telegramGroupChatId || botConfig.TELEGRAM_GROUP_CHAT_ID;
    if (!chatId || !botConfig.TELEGRAM_BOT_TOKEN) return false;

    const url = `https://api.telegram.org/bot${botConfig.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    return res.ok;
  } catch (err: any) {
    console.error("[BotOrderService] Failed to send admin telegram alert:", err.message);
    return false;
  }
}

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

/**
 * Collision-resistant top-up reference.
 *
 * The old form was `TOP-${Date.now().toString().slice(-6)}` — only the last 6
 * digits of the millisecond timestamp, which wraps every ~16.7 minutes and is
 * identical for two requests in the same millisecond. `topup_requests.reference`
 * is UNIQUE, so a collision made the insert throw, the catch swallowed it, and
 * the request silently fell back to the in-memory record the admin panel (which
 * reads the DB) can never show.
 *
 * Format: `TOP-` + base36 timestamp (monotonic-ish, ~8 chars) + 8 random hex
 * chars (32-bit) — unique with overwhelming probability while staying
 * short/readable (20 chars total, well within the 64-char column).
 */
export function generateTopUpReference(): string {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TOP-${timePart}${randomPart}`;
}

export class BotOrderService {
  // In-memory fallback caches if DB is briefly unreachable or during unit tests
  private memoryWallets = new Map<string, number>();
  private memoryOrders = new Map<string, OrderRecord[]>();
  private memoryTopUps = new Map<string, TopUpRecord>();
  private activePurchases = new Set<string>();

  /**
   * Finds or creates a customer user record and associated wallet in Neon DB.
   */
  async getOrCreateUser(params: {
    telegramId: string;
    firstName?: string;
    lastName?: string | null;
    username?: string | null;
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
          .onConflictDoUpdate({
            target: users.telegramId,
            set: {
              firstName: sql`COALESCE(EXCLUDED.first_name, ${users.firstName})`,
              lastName: sql`COALESCE(EXCLUDED.last_name, ${users.lastName})`,
              username: sql`COALESCE(EXCLUDED.username, ${users.username})`,
              updatedAt: new Date(),
            },
          })
          .returning();
        user = newUser;
      } else {
        // Automatically sync latest Telegram profile (Name, Username) into DB
        const updates: Record<string, any> = {};
        if (params.firstName && params.firstName !== user.firstName) {
          updates.firstName = params.firstName;
        }
        if (params.lastName !== undefined && params.lastName !== user.lastName) {
          updates.lastName = params.lastName;
        }
        if (params.username !== undefined && params.username !== user.username) {
          updates.username = params.username;
        }

        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date();
          const [updated] = await db
            .update(users)
            .set(updates)
            .where(eq(users.id, user.id))
            .returning();
          if (updated) {
            user = updated;
          }
        }
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
          .onConflictDoNothing({ target: wallets.userId })
          .returning();
        wallet = newWallet || (await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1))[0];
      }

      return { user, wallet };
    } catch (err: any) {
      console.warn("[BotOrderService] DB getOrCreateUser error:", err.message);
      return null;
    }
  }

  /**
   * Synchronizes latest Telegram user info (id, name, username) directly into DB.
   */
  async upsertTelegramUser(params: {
    telegramId: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
  }) {
    return this.getOrCreateUser(params);
  }

  /**
   * Returns the current status of a user ("ACTIVE", "DEACTIVATED", ...).
   * Returns null when the user is unknown or the DB is briefly unreachable —
   * callers treat null as "allow" and getOrCreateUser registers new users as ACTIVE.
   */
  async getUserStatus(telegramId: string): Promise<string | null> {
    try {
      const db = getDb();
      const [row] = await db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);
      return row?.status ?? null;
    } catch (err: any) {
      console.warn("[BotOrderService] getUserStatus DB error:", err.message);
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
        // DB is authoritative. Never blend in the in-memory cache: an admin
        // debit from the Dashboard would otherwise keep showing phantom money.
        return record.wallet.balanceMmk;
      }
    } catch (err: any) {
      console.warn("[BotOrderService] getWalletBalance DB fallback:", err.message);
    }
    return this.memoryWallets.get(telegramId) || 0;
  }

  /**
   * Directly credits a wallet. Test/internal seeding only — no bot command or
   * route may expose this; wallet credits must go through the Dashboard
   * (admin adjust-balance / deposit review) exclusively.
   */
  async creditWallet(telegramId: string, amountMmk: number): Promise<number> {
    const memCurrent = this.memoryWallets.get(telegramId) || 0;
    const memNew = memCurrent + amountMmk;
    this.memoryWallets.set(telegramId, memNew);

    try {
      const record = await this.getOrCreateUser({ telegramId });
      if (record?.user && record.wallet) {
        const db = getDb();
        const [updatedWallet] = await db
          .update(wallets)
          .set({
            balanceMmk: sql`${wallets.balanceMmk} + ${amountMmk}`,
            totalDepositedMmk: sql`${wallets.totalDepositedMmk} + ${amountMmk}`,
            updatedAt: new Date(),
          })
          .where(eq(wallets.id, record.wallet.id))
          .returning();

        const newBalance = updatedWallet ? updatedWallet.balanceMmk : record.wallet.balanceMmk + amountMmk;

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
    const reference = generateTopUpReference();
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
   * Matches by reference ('TOP-XXXXXX') OR numeric database ID.
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
      const isNumeric = /^\d+$/.test(params.topUpId);
      const condition = isNumeric
        ? or(
            eq(topUpRequests.reference, params.topUpId),
            eq(topUpRequests.id, parseInt(params.topUpId, 10))
          )
        : eq(topUpRequests.reference, params.topUpId);

      const [updated] = await db
        .update(topUpRequests)
        .set({
          slipFileId: params.fileId,
          paymentMethod: params.paymentMethod,
          status: "SUBMITTED",
        })
        .where(condition)
        .returning();

      if (updated) {
        const mem = this.memoryTopUps.get(params.topUpId) || this.memoryTopUps.get(updated.reference);
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
   * Retrieves the latest pending top-up request for a user.
   * Useful when user submits a slip photo even after bot restart or session reset.
   */
  async getLatestPendingTopUp(telegramId: string): Promise<TopUpRecord | null> {
    try {
      const db = getDb();
      const userRecord = await this.getOrCreateUser({ telegramId });
      if (userRecord?.user) {
        const [latest] = await db
          .select()
          .from(topUpRequests)
          .where(
            and(
              eq(topUpRequests.userId, userRecord.user.id),
              eq(topUpRequests.status, "PENDING")
            )
          )
          .orderBy(desc(topUpRequests.createdAt))
          .limit(1);

        if (latest) {
          return {
            id: String(latest.id),
            telegramId,
            amountMmk: latest.amountMmk,
            reference: latest.reference,
            status: latest.status as any,
            createdAt: latest.createdAt ? new Date(latest.createdAt).toISOString() : new Date().toISOString(),
            slipFileId: latest.slipFileId || undefined,
          };
        }
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB getLatestPendingTopUp error:", err.message);
    }

    // Memory fallback
    for (const record of Array.from(this.memoryTopUps.values()).reverse()) {
      if (record.telegramId === telegramId && record.status === "PENDING") {
        return record;
      }
    }

    return null;
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
          const [updatedWallet] = await db
            .update(wallets)
            .set({
              balanceMmk: sql`${wallets.balanceMmk} + ${topUp.amountMmk}`,
              totalDepositedMmk: sql`${wallets.totalDepositedMmk} + ${topUp.amountMmk}`,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id))
            .returning();

          const newBal = updatedWallet ? updatedWallet.balanceMmk : wallet.balanceMmk + topUp.amountMmk;
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
   * Calls real Upstream XPro Partner API (POST /orders) with strict idempotency and AES-256 encryption.
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
    errorMessage?: string;
  }> {
    // 0. Prevent concurrent multi-clicks from the same user (in-flight mutex)
    if (this.activePurchases.has(params.telegramId)) {
      return {
        success: false,
        error: "OPERATION_IN_PROGRESS",
        errorMessage: "⚠️ ယခင် အော်ဒါ ဆောင်ရွက်နေဆဲ ဖြစ်ပါသည်ခင်ဗျာ။ ခေတ္တစောင့်ပေးပါ။",
      };
    }

    this.activePurchases.add(params.telegramId);

    try {
      const product = await botCatalog.getProductById(params.productId);
      if (!product) {
        return {
          success: false,
          error: "PRODUCT_NOT_FOUND",
          errorMessage: "⚠️ ပစ္စည်း ရှာမတွေ့ပါခင်ဗျာ။",
        };
      }

      if (product.stock < params.quantity) {
        return {
          success: false,
          error: "OUT_OF_STOCK",
          errorMessage: "⚠️ ပစ္စည်းလက်ကျန် မလုံလောက်တော့ပါခင်ဗျာ။",
        };
      }

      if (!product.upstreamProductId) {
        return {
          success: false,
          error: "PRODUCT_NOT_FOUND",
          errorMessage: "⚠️ ပစ္စည်း အချက်အလက် မပြည့်စုံပါသဖြင့် အော်ဒါတင်၍ မရသေးပါခင်ဗျာ။",
        };
      }
      const totalMmk = product.retailPriceMmk * params.quantity;
      const publicOrderNo = `ARN-${Date.now().toString().slice(-6)}`;
      const externalOrderId = publicOrderNo;
      const targetUpstreamId = product.upstreamProductId;

      // 1. Fetch user & wallet records
      const memCurrent = this.memoryWallets.get(params.telegramId) || 0;
      const userRecord = await this.getOrCreateUser({
        telegramId: params.telegramId,
        firstName: params.customerName,
        username: params.telegramUsername,
      });

      const user = userRecord?.user;
      const wallet = userRecord?.wallet;
      // DB balance decides; the guarded atomic debit below enforces it anyway.
      const availableBalance = wallet ? wallet.balanceMmk : memCurrent;

      if (availableBalance < totalMmk) {
        return {
          success: false,
          error: "INSUFFICIENT_FUNDS",
          errorMessage: "⚠️ ပိုက်ဆံအိတ် လက်ကျန်ငွေ မလုံလောက်ပါခင်ဗျာ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်ပေးပါ။",
        };
      }

      // 2. Atomic PostgreSQL Conditional Debit: Debit wallet BEFORE upstream order!
      let remainingBalance = 0;
      let debitedWalletId: number | null = null;

      if (user && wallet) {
        try {
          const db = getDb();
          const [updated] = await db
            .update(wallets)
            .set({
              balanceMmk: sql`${wallets.balanceMmk} - ${totalMmk}`,
              totalSpentMmk: sql`${wallets.totalSpentMmk} + ${totalMmk}`,
              updatedAt: new Date(),
            })
            .where(and(eq(wallets.id, wallet.id), gte(wallets.balanceMmk, totalMmk)))
            .returning();

          if (!updated) {
            return {
              success: false,
              error: "INSUFFICIENT_FUNDS",
              errorMessage: "⚠️ ပိုက်ဆံအိတ် လက်ကျန်ငွေ မလုံလောက်ပါခင်ဗျာ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်ပေးပါ။",
            };
          }

          debitedWalletId = updated.id;
          remainingBalance = updated.balanceMmk;
        } catch (dbErr: any) {
          console.error("[BotOrderService] Atomic wallet debit failed:", dbErr.message);
          return {
            success: false,
            error: "DATABASE_ERROR",
            errorMessage: "⚠️ ငွေစာရင်း စစ်ဆေးမှု မအောင်မြင်ပါခင်ဗျာ။ ခေတ္တစောင့်ပြီး ပြန်လည်ကြိုးစားပေးပါ။",
          };
        }
      } else {
        // Fallback in-memory wallet debit
        if (memCurrent < totalMmk) {
          return {
            success: false,
            error: "INSUFFICIENT_FUNDS",
            errorMessage: "⚠️ ပိုက်ဆံအိတ် လက်ကျန်ငွေ မလုံလောက်ပါခင်ဗျာ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်ပေးပါ။",
          };
        }
        remainingBalance = memCurrent - totalMmk;
      }

      // 3. Call Upstream Supplier API (XPro or DigitalCore) with strict error handling & atomic refund
      let deliveryLines: string[] = [];
      let deliveryType = product.deliveryType || "CREDENTIALS";
      let upstreamOrderId: string | null = null;
      let upstreamUnitPrice = product.supplierPriceUsd;

      const isTest = process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;
      const supplierId: SupplierId = product.supplier === "DIGITALCORE" ? "DIGITALCORE" : "XPRO";

      if (!isTest) {
        const apiKey = supplierId === "DIGITALCORE" ? botConfig.DIGITALCORE_API_KEY : botConfig.UPSTREAM_API_KEY;
        const baseUrl = supplierId === "DIGITALCORE" ? botConfig.DIGITALCORE_BASE_URL : botConfig.UPSTREAM_BASE_URL;

        if (!apiKey) {
          // FOOTGUN PREVENTED: Never fake deliveries in production when API key is missing!
          if (debitedWalletId !== null) {
            try {
              const db = getDb();
              await db
                .update(wallets)
                .set({
                  balanceMmk: sql`${wallets.balanceMmk} + ${totalMmk}`,
                  totalSpentMmk: sql`GREATEST(0, ${wallets.totalSpentMmk} - ${totalMmk})`,
                  updatedAt: new Date(),
                })
                .where(eq(wallets.id, debitedWalletId));
            } catch (refundErr: any) {
              console.error("[BotOrderService] Critical: Wallet refund failed on unconfigured supplier:", refundErr.message);
            }
          }

          void sendAdminTelegramAlert(
            `🚨 <b>CRITICAL CONFIG ERROR: Missing Supplier API Key</b>\n\n` +
            `• <b>Supplier:</b> <code>${supplierId}</code>\n` +
            `• <b>Product:</b> ${escapeHtml(product.cleanName)} (ID: ${product.id})\n` +
            `• <b>Customer:</b> @${params.telegramUsername || params.customerName} (TG: <code>${params.telegramId}</code>)\n` +
            `• <b>Action:</b> Wallet debited was automatically refunded to customer.\n` +
            `⚠️ Please configure <code>${supplierId === "DIGITALCORE" ? "DIGITALCORE_API_KEY" : "UPSTREAM_API_KEY"}</code> in environment!`
          );

          return {
            success: false,
            error: "SUPPLIER_CONFIG_ERROR",
            errorMessage: "⚠️ ဆာဗာ စနစ် ပြင်ဆင်နေဆဲ ဖြစ်ပါသဖြင့် ဤပစ္စည်းအား ခေတ္တ ဝယ်ယူ၍ မရနိုင်သေးပါခင်ဗျာ။ သင့် Wallet မှ ငွေကို ပြန်လည် ထည့်သွင်းပေးထားပါသည်။",
          };
        }

        try {
          const client = createSupplierClient(supplierId, {
            baseUrl,
            apiKey,
            timeoutMs: 15000,
          });

          const upstreamRes = await client.createOrder({
            upstreamProductId: String(targetUpstreamId),
            quantity: params.quantity,
            externalOrderId,
            pricingTiers: product.pricingTiers,
          });

          upstreamOrderId = upstreamRes.upstreamOrderId ? String(upstreamRes.upstreamOrderId) : null;
          deliveryType = (upstreamRes.raw as any)?.delivery?.type || product.deliveryType || "CREDENTIALS";
          deliveryLines = upstreamRes.items || [];
          if (upstreamRes.viewUrl && !deliveryLines.includes(upstreamRes.viewUrl)) {
            deliveryLines.push(upstreamRes.viewUrl);
          }
          upstreamUnitPrice = String(
            (upstreamRes.raw as any)?.order?.unitPrice || product.supplierPriceUsd
          );
        } catch (err: any) {
          console.error(`[BotOrderService] Upstream purchase failed (${supplierId}):`, err.message);

          // ATOMIC REFUND: Rollback the debited balance immediately on upstream failure!
          if (debitedWalletId !== null) {
            try {
              const db = getDb();
              await db
                .update(wallets)
                .set({
                  balanceMmk: sql`${wallets.balanceMmk} + ${totalMmk}`,
                  totalSpentMmk: sql`GREATEST(0, ${wallets.totalSpentMmk} - ${totalMmk})`,
                  updatedAt: new Date(),
                })
                .where(eq(wallets.id, debitedWalletId));
            } catch (refundErr: any) {
              console.error("[BotOrderService] Critical: Wallet refund failed after upstream error:", refundErr.message);
            }
          }

          if (err instanceof SupplierError) {
            if (err.code === "INSUFFICIENT_BALANCE") {
              return {
                success: false,
                error: "SUPPLIER_OUTAGE",
                errorMessage: "⚠️ ပစ္စည်းလက်ကျန် ပြတ်လပ်နေပါသည်ခင်ဗျာ။ သင့် Wallet မှ ငွေကို နုတ်ယူခြင်း မရှိပါ။",
              };
            }
            if (err.code === "OUT_OF_STOCK") {
              return {
                success: false,
                error: "OUT_OF_STOCK",
                errorMessage: "⚠️ ပစ္စည်းလက်ကျန် ပြတ်လပ်သွားပါပြီခင်ဗျာ။ သင့် Wallet မှ ငွေကို နုတ်ယူခြင်း မရှိပါ။",
              };
            }
            if (err.code === "PRODUCT_NOT_FOUND") {
              return {
                success: false,
                error: "PRODUCT_NOT_FOUND",
                errorMessage: "⚠️ ဤပစ္စည်း ရောင်းချခြင်း ယာယီရပ်ဆိုင်းထားပါသည်ခင်ဗျာ။",
              };
            }
            if (err.code === "AMBIGUOUS_TIMEOUT") {
              // Persist trace order for reconciliation (safeguard against upstream order fulfillment)
              if (user) {
                try {
                  const db = getDb();
                  await db.transaction(async (tx) => {
                    const [insertedOrder] = await tx
                      .insert(orders)
                      .values({
                        publicOrderNo,
                        externalOrderId: upstreamOrderId ? `${supplierId}-${upstreamOrderId}` : externalOrderId,
                        supplier: supplierId,
                        customerId: user.id,
                        status: "TIMEOUT_REFUNDED",
                        totalAmountMmk: totalMmk,
                        notes: `AMBIGUOUS_TIMEOUT: Upstream timeout. Customer refunded. External ref: ${externalOrderId}`,
                      })
                      .returning();

                    if (insertedOrder) {
                      await tx.insert(orderItems).values({
                        orderId: insertedOrder.id,
                        productId: product.id,
                        productNameSnapshot: product.cleanName,
                        quantity: params.quantity,
                        unitPriceMmk: product.retailPriceMmk,
                        unitCostUsd: upstreamUnitPrice || "0.00",
                        subtotalMmk: totalMmk,
                      });
                    }
                  });
                } catch (traceErr: any) {
                  console.error("[BotOrderService] Failed to persist timeout trace order:", traceErr.message);
                }
              }

              void sendAdminTelegramAlert(
                `⚠️ <b>UPSTREAM TIMEOUT ALERT (Manual Reconcile Needed)</b>\n\n` +
                `• <b>Order No:</b> <code>${publicOrderNo}</code>\n` +
                `• <b>External Ref:</b> <code>${externalOrderId}</code>\n` +
                `• <b>Supplier:</b> <code>${supplierId}</code>\n` +
                `• <b>Product:</b> ${escapeHtml(product.cleanName)} x ${params.quantity}\n` +
                `• <b>Customer:</b> @${params.telegramUsername || params.customerName} (TG: <code>${params.telegramId}</code>)\n` +
                `• <b>Status:</b> Customer was refunded in wallet. Check supplier dashboard to see if order executed upstream!`
              );

              return {
                success: false,
                error: "SUPPLIER_TIMEOUT",
                errorMessage: "⚠️ ဆာဗာမှ တုံ့ပြန်မှု နှောင့်နှေးနေပါသည်။ သင့် ငွေစာရင်းကို စစ်ဆေးပြီး လိုအပ်ပါက Admin မှ ဆက်သွယ်ပေးပါမည်။",
              };
            }
          }

          return {
            success: false,
            error: "UPSTREAM_ERROR",
            errorMessage: `⚠️ ပစ္စည်း ပေးပို့မှု မအောင်မြင်ပါ (${err.message || "Network Error"})။ သင့် Wallet မှ ငွေကို နုတ်ယူခြင်း မရှိပါ။`,
          };
        }
      } else {
        // Mock fallback ONLY in test mode
        deliveryLines = [
          product.deliveryType === "LINK"
            ? `https://partner.arena.store/invite/claim?order=${publicOrderNo}&token=arena_${Date.now()}`
            : product.deliveryType === "LICENSE"
            ? `ARN-${Date.now().toString().slice(-4)}-TEST-LICENSE-KEY`
            : `user.${params.telegramId.slice(-4)}@arenastore.mm:ArenaPass#${Date.now().toString().slice(-4)}`,
        ];
      }

      // 4. Format delivered credentials for Telegram chat display
      const rawDeliveryText = deliveryLines.length > 1
        ? deliveryLines.map((line, idx) => `#${idx + 1}: ${line}`).join("\n")
        : deliveryLines[0] || "အကောင့်အချက်အလက်ကို ရယူပြီးပါပြီ။";
      const credentialsText = formatCredentialsText(rawDeliveryText);
      const encryptedPayload = encryptPayload(deliveryLines);

      // 5. Commit Order & Ledger in Atomic PostgreSQL Transaction
      if (user && debitedWalletId !== null) {
        try {
          const db = getDb();
          await db.transaction(async (tx) => {
            // A. Insert wallet ledger
            await tx.insert(walletLedger).values({
              walletId: debitedWalletId,
              amountMmk: -totalMmk,
              type: "ORDER_DEBIT",
              referenceId: publicOrderNo,
              notes: `Purchase: ${product.cleanName} x ${params.quantity} (${supplierId} #${upstreamOrderId || "direct"})`,
            });

            // B. Insert order
            const [insertedOrder] = await tx
              .insert(orders)
              .values({
                publicOrderNo,
                externalOrderId: upstreamOrderId ? `${supplierId}-${upstreamOrderId}` : publicOrderNo,
                supplier: supplierId,
                customerId: user.id,
                status: "DELIVERED",
                totalAmountMmk: totalMmk,
                notes: `Telegram purchase by @${params.telegramUsername || params.customerName}`,
              })
              .returning();

            // C. Insert order item
            await tx.insert(orderItems).values({
              orderId: insertedOrder.id,
              productId: product.id,
              productNameSnapshot: product.cleanName,
              quantity: params.quantity,
              unitPriceMmk: product.retailPriceMmk,
              unitCostUsd: upstreamUnitPrice,
              subtotalMmk: totalMmk,
            });

            // D. Insert encrypted delivery payload
            await tx.insert(orderDeliveries).values({
              orderId: insertedOrder.id,
              upstreamOrderId: upstreamOrderId || null,
              deliveryType,
              encryptedPayload,
              deliveredAt: new Date(),
            });
          });
        } catch (dbErr: any) {
          console.error("[BotOrderService] DB transaction failed recording order details:", dbErr.message);
        }
      }

      // 6. Update In-Memory Cache
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
    } finally {
      this.activePurchases.delete(params.telegramId);
    }
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
        const [stats] = await db
          .select({ ordersCount: sql<number>`COUNT(*)::integer` })
          .from(orders)
          .where(eq(orders.customerId, user.id));

        return {
          joinedDate: user.createdAt.toISOString().split("T")[0],
          ordersCount: stats?.ordersCount ?? 0,
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
          .select({
            order: orders,
            item: orderItems,
          })
          .from(orders)
          .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
          .where(eq(orders.customerId, userRecord.user.id))
          .orderBy(desc(orders.createdAt))
          .limit(20);

        if (dbOrders.length > 0) {
          return dbOrders.map(({ order: o, item }) => ({
            id: o.publicOrderNo,
            publicOrderNo: o.publicOrderNo,
            productId: item?.productId || 0,
            productName: item?.productNameSnapshot || "Digital Product",
            quantity: item?.quantity || 1,
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
   * Retrieves a single order by public order number or ID, decrypting credentials.
   * Scoped to the requesting customer — one account can never read another's order.
   */
  async getOrderById(orderId: string, requesterTelegramId: string): Promise<OrderRecord | null> {
    try {
      const userRecord = await this.getOrCreateUser({ telegramId: requesterTelegramId });
      if (!userRecord?.user) return null;

      const db = getDb();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
      const condition = and(
        isUuid ? eq(orders.id, orderId) : eq(orders.publicOrderNo, orderId),
        eq(orders.customerId, userRecord.user.id)
      );

      const [orderRow] = await db
        .select()
        .from(orders)
        .where(condition)
        .limit(1);

      if (orderRow) {
        const [deliv] = await db
          .select()
          .from(orderDeliveries)
          .where(eq(orderDeliveries.orderId, orderRow.id))
          .limit(1);

        const [item] = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderRow.id))
          .limit(1);

        let credentialsText: string | undefined = undefined;
        if (deliv?.encryptedPayload) {
          try {
            const dec = decryptPayload(deliv.encryptedPayload);
            credentialsText = formatCredentialsText(dec);
          } catch (err: any) {
            console.warn(`[BotOrderService] Decryption failed for order ${orderRow.publicOrderNo}:`, err.message);
            credentialsText = deliv.encryptedPayload;
          }
        }

        return {
          id: orderRow.publicOrderNo,
          publicOrderNo: orderRow.publicOrderNo,
          productId: item?.productId || 0,
          productName: item?.productNameSnapshot || "Digital Product",
          quantity: item?.quantity || 1,
          totalMmk: orderRow.totalAmountMmk,
          status: orderRow.status as any,
          createdAt: orderRow.createdAt.toISOString(),
          credentialsText,
        };
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB getOrderById error:", err.message);
    }

    const ownOrders = this.memoryOrders.get(requesterTelegramId) || [];
    const found = ownOrders.find((o) => o.id === orderId || o.publicOrderNo === orderId);
    return found || null;
  }
}

export const botOrderService = new BotOrderService();
