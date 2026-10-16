import { eq, and, sql } from "drizzle-orm";
import {
  getDb,
  users,
  wallets,
  walletLedger,
  referrals,
  referralRewards,
  orders,
} from "@arena/db";
import { BOT_EMOJIS, tgEmoji, escapeHtml } from "@arena/shared";
import { botConfig } from "../config";
import type { Api } from "grammy";

export interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  totalEarningsMmk: number;
  inviteLink: string;
}

export class ReferralService {
  /**
   * Generates a Telegram referral invite link for a given Telegram ID.
   */
  getInviteLink(telegramId: string, botUsername?: string): string {
    const username = botUsername || "ArenaStoreBot";
    return `https://t.me/${username}?start=ref_${telegramId}`;
  }

  /**
   * Binds a newly registering user to a referrer if eligible.
   * Business Rules:
   * 1. Self-referrals are rejected.
   * 2. Users can only be referred ONCE in their lifetime (enforced via DB unique index and null check).
   * 3. Existing users with prior purchase history cannot be referred retroactively.
   * 4. Upon successful binding:
   *    - New user immediately gets 200 MMK Welcome Bonus credited to their wallet.
   *    - Referrer's 200 MMK bonus status stays PENDING (anti-abuse) until first purchase.
   */
  async bindReferralIfEligible(params: {
    newUserTelegramId: string;
    referrerTelegramId: string;
    firstName?: string;
    lastName?: string | null;
    username?: string | null;
  }): Promise<{
    success: boolean;
    welcomeCredited: boolean;
    referrerTelegramId?: string;
    reason?: string;
  }> {
    const { newUserTelegramId, referrerTelegramId } = params;

    // 1. Self-referral prevention
    if (newUserTelegramId === referrerTelegramId) {
      return { success: false, welcomeCredited: false, reason: "SELF_REFERRAL" };
    }

    try {
      const db = getDb();

      // 2. Fetch referrer record
      const [referrer] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, referrerTelegramId))
        .limit(1);

      if (!referrer) {
        return { success: false, welcomeCredited: false, reason: "REFERRER_NOT_FOUND" };
      }

      // 3. Ensure new user exists in DB
      let [newUser] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, newUserTelegramId))
        .limit(1);

      if (!newUser) {
        const [created] = await db
          .insert(users)
          .values({
            telegramId: newUserTelegramId,
            firstName: params.firstName || "Customer",
            lastName: params.lastName || null,
            username: params.username || null,
            role: "CUSTOMER",
            status: "ACTIVE",
            referredBy: referrer.id,
          })
          .returning();
        newUser = created;
      } else {
        // If user already has a referrer or existing referral binding
        if (newUser.referredBy) {
          return { success: false, welcomeCredited: false, reason: "ALREADY_REFERRED" };
        }
      }

      // Check if existing referral record exists
      const [existingReferral] = await db
        .select()
        .from(referrals)
        .where(eq(referrals.referredUserId, newUser.id))
        .limit(1);

      if (existingReferral) {
        return { success: false, welcomeCredited: false, reason: "ALREADY_REFERRED" };
      }

      // Check if user has already placed orders previously (not a new customer)
      const [orderHistory] = await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(orders)
        .where(eq(orders.customerId, newUser.id));

      if ((orderHistory?.count ?? 0) > 0) {
        return { success: false, welcomeCredited: false, reason: "EXISTING_CUSTOMER" };
      }

      // 4. Ensure new user has a wallet
      let [newUserWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, newUser.id))
        .limit(1);

      if (!newUserWallet) {
        const [createdWallet] = await db
          .insert(wallets)
          .values({
            userId: newUser.id,
            balanceMmk: 0,
            totalDepositedMmk: 0,
            totalSpentMmk: 0,
            totalReferralEarningsMmk: 0,
          })
          .returning();
        newUserWallet = createdWallet;
      }

      const welcomeAmountMmk = 200;
      const referrerBonusMmk = 200;

      // 5. Execute referral binding and 200 MMK welcome bonus credit atomically
      await db.transaction(async (tx) => {
        // Update user referredBy
        await tx
          .update(users)
          .set({ referredBy: referrer.id, updatedAt: new Date() })
          .where(eq(users.id, newUser.id));

        // Insert referral tracking entry
        await tx.insert(referrals).values({
          referrerId: referrer.id,
          referredUserId: newUser.id,
          status: "PENDING",
          welcomeRewardMmk: welcomeAmountMmk,
          referrerBonusMmk,
          totalCommissionMmk: 0,
        });

        // Credit 200 MMK to new user's wallet
        await tx
          .update(wallets)
          .set({
            balanceMmk: sql`${wallets.balanceMmk} + ${welcomeAmountMmk}`,
            updatedAt: new Date(),
          })
          .where(eq(wallets.id, newUserWallet.id));

        // Record in wallet ledger
        await tx.insert(walletLedger).values({
          walletId: newUserWallet.id,
          amountMmk: welcomeAmountMmk,
          type: "REFERRAL_WELCOME",
          referenceId: `REF-WELCOME-${newUser.id}`,
          notes: `Referral welcome bonus (Invited by TG: ${referrerTelegramId})`,
        });
      });

      return {
        success: true,
        welcomeCredited: true,
        referrerTelegramId,
      };
    } catch (err: any) {
      console.warn("[ReferralService] bindReferralIfEligible error:", err?.message || err);
      return { success: false, welcomeCredited: false, reason: err?.message };
    }
  }

  /**
   * Processes order commissions and unlocks first-purchase bonuses upon order completion.
   * Called immediately after an order is marked DELIVERED.
   *
   * Business Rules:
   * 1. If this is the referred user's first delivered purchase:
   *    - Unlocks +200 MMK bonus for referrer.
   *    - Marks referral status as QUALIFIED.
   * 2. Computes lifetime 3% purchase commission: Math.floor(orderTotal * 0.03).
   * 3. Atomically credits referrer's wallet, logs in ledger, and notifies referrer on Telegram.
   */
  async processOrderReferralCommission(params: {
    orderId: string;
    customerUserId: number;
    totalMmk: number;
    botApi?: Api;
  }): Promise<{
    processed: boolean;
    referrerTelegramId?: string;
    bonusUnlocked: boolean;
    commissionAmount: number;
  }> {
    const { orderId, customerUserId, totalMmk, botApi } = params;

    try {
      const db = getDb();

      // 1. Check if customer was referred
      const [referral] = await db
        .select()
        .from(referrals)
        .where(eq(referrals.referredUserId, customerUserId))
        .limit(1);

      if (!referral) {
        return { processed: false, bonusUnlocked: false, commissionAmount: 0 };
      }

      // 2. Fetch referrer and their wallet
      const [referrer] = await db
        .select()
        .from(users)
        .where(eq(users.id, referral.referrerId))
        .limit(1);

      if (!referrer) {
        return { processed: false, bonusUnlocked: false, commissionAmount: 0 };
      }

      let [referrerWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, referrer.id))
        .limit(1);

      if (!referrerWallet) {
        const [newWallet] = await db
          .insert(wallets)
          .values({
            userId: referrer.id,
            balanceMmk: 0,
            totalDepositedMmk: 0,
            totalSpentMmk: 0,
            totalReferralEarningsMmk: 0,
          })
          .returning();
        referrerWallet = newWallet;
      }

      // 3. Compute rewards
      const isFirstPurchase = referral.status === "PENDING";
      const bonusMmk = isFirstPurchase ? referral.referrerBonusMmk : 0;
      const commissionMmk = Math.floor(totalMmk * 0.03); // 3% commission
      const totalRewardMmk = bonusMmk + commissionMmk;

      if (totalRewardMmk <= 0) {
        return { processed: false, bonusUnlocked: false, commissionAmount: 0 };
      }

      const now = new Date();

      // 4. Atomically persist rewards, wallet balance, and ledger
      await db.transaction(async (tx) => {
        // A. Update referral status
        if (isFirstPurchase) {
          await tx
            .update(referrals)
            .set({
              status: "QUALIFIED",
              firstPurchaseAt: now,
              totalCommissionMmk: sql`${referrals.totalCommissionMmk} + ${commissionMmk}`,
              updatedAt: now,
            })
            .where(eq(referrals.id, referral.id));

          // Log first-purchase bonus reward
          await tx.insert(referralRewards).values({
            referrerId: referrer.id,
            referredUserId: customerUserId,
            orderId,
            rewardType: "FIRST_PURCHASE_BONUS",
            amountMmk: bonusMmk,
          });
        } else if (commissionMmk > 0) {
          await tx
            .update(referrals)
            .set({
              totalCommissionMmk: sql`${referrals.totalCommissionMmk} + ${commissionMmk}`,
              updatedAt: now,
            })
            .where(eq(referrals.id, referral.id));
        }

        // Log 3% commission reward
        if (commissionMmk > 0) {
          await tx.insert(referralRewards).values({
            referrerId: referrer.id,
            referredUserId: customerUserId,
            orderId,
            rewardType: "ORDER_COMMISSION",
            amountMmk: commissionMmk,
          });
        }

        // B. Credit referrer's wallet
        await tx
          .update(wallets)
          .set({
            balanceMmk: sql`${wallets.balanceMmk} + ${totalRewardMmk}`,
            totalReferralEarningsMmk: sql`${wallets.totalReferralEarningsMmk} + ${totalRewardMmk}`,
            updatedAt: now,
          })
          .where(eq(wallets.id, referrerWallet.id));

        // C. Record ledger entries
        if (bonusMmk > 0) {
          await tx.insert(walletLedger).values({
            walletId: referrerWallet.id,
            amountMmk: bonusMmk,
            type: "REFERRAL_BONUS",
            referenceId: `REF-BONUS-${orderId}`,
            notes: "First purchase referral bonus unlocked",
          });
        }

        if (commissionMmk > 0) {
          await tx.insert(walletLedger).values({
            walletId: referrerWallet.id,
            amountMmk: commissionMmk,
            type: "REFERRAL_COMMISSION",
            referenceId: `REF-COMM-${orderId}`,
            notes: "3% Lifetime purchase commission",
          });
        }
      });

      // 5. Send real-time celebratory Telegram notification to referrer
      if (botApi && referrer.telegramId) {
        this.notifyReferrerReward({
          botApi,
          referrerTelegramId: referrer.telegramId,
          isFirstPurchase,
          bonusMmk,
          commissionMmk,
          totalRewardMmk,
        }).catch((err) => {
          console.warn("[ReferralService] Referrer notification error:", err?.message || err);
        });
      }

      return {
        processed: true,
        referrerTelegramId: referrer.telegramId || undefined,
        bonusUnlocked: isFirstPurchase,
        commissionAmount: commissionMmk,
      };
    } catch (err: any) {
      console.error("[ReferralService] processOrderReferralCommission error:", err?.message || err);
      return { processed: false, bonusUnlocked: false, commissionAmount: 0 };
    }
  }

  /**
   * Sends Telegram notification to the referrer when they earn bonuses or commissions.
   */
  private async notifyReferrerReward(params: {
    botApi: Api;
    referrerTelegramId: string;
    isFirstPurchase: boolean;
    bonusMmk: number;
    commissionMmk: number;
    totalRewardMmk: number;
  }) {
    const { botApi, referrerTelegramId, isFirstPurchase, bonusMmk, commissionMmk, totalRewardMmk } = params;

    let text = "";
    if (isFirstPurchase) {
      text =
        `${tgEmoji(BOT_EMOJIS.PARTY, "🎉")} <b>ဂုဏ်ယူပါတယ်! မိတ်ဆက်ဆုကြေး ရရှိပါသည်</b>\n\n` +
        `သင် ဖိတ်ခေါ်ထားသော မိတ်ဆွေသည် ပထမဆုံး အော်ဒါကို အောင်မြင်စွာ ဝယ်ယူပြီးဖြစ်ပါသဖြင့် ဆုကြေးများ ရရှိပါသည်:\n\n` +
        `• မိတ်ဆက်ဆုကြေး: <b>+${bonusMmk.toLocaleString("en-US")} MMK</b>\n` +
        `• 3% အော်ဒါကော်မရှင်: <b>+${commissionMmk.toLocaleString("en-US")} MMK</b>\n` +
        `💰 စုစုပေါင်း ရရှိငွေ: <b>+${totalRewardMmk.toLocaleString("en-US")} MMK</b>\n\n` +
        `${tgEmoji(BOT_EMOJIS.WALLET, "💳")} ငွေပမာဏကို သင့် Wallet လက်ကျန်ငွေထဲသို့ တိုက်ရိုက် ထည့်သွင်းပေးလိုက်ပါပြီခင်ဗျာ!`;
    } else {
      text =
        `${tgEmoji(BOT_EMOJIS.GIFT, "🎁")} <b>မိတ်ဆက် ကော်မရှင် ရရှိပါသည်!</b>\n\n` +
        `သင် ဖိတ်ခေါ်ထားသော မိတ်ဆွေ၏ အော်ဒါဝယ်ယူမှုမှ 3% ကော်မရှင် ရရှိပါသည်:\n\n` +
        `• အော်ဒါကော်မရှင်: <b>+${commissionMmk.toLocaleString("en-US")} MMK</b>\n\n` +
        `${tgEmoji(BOT_EMOJIS.WALLET, "💳")} ငွေပမာဏကို သင့် Wallet လက်ကျန်ငွေထဲသို့ တိုက်ရိုက် ထည့်သွင်းပေးလိုက်ပါပြီခင်ဗျာ!`;
    }

    await botApi.sendMessage(referrerTelegramId, text, { parse_mode: "HTML" });
  }

  /**
   * Retrieves aggregated referral stats for a customer profile.
   */
  async getReferralStats(telegramId: string, botUsername?: string): Promise<ReferralStats> {
    const inviteLink = this.getInviteLink(telegramId, botUsername);

    try {
      const db = getDb();

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);

      if (!user) {
        return {
          totalReferrals: 0,
          activeReferrals: 0,
          totalEarningsMmk: 0,
          inviteLink,
        };
      }

      // Total invited
      const [totalRow] = await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(referrals)
        .where(eq(referrals.referrerId, user.id));

      // Active (qualified - made at least 1 purchase)
      const [activeRow] = await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(referrals)
        .where(and(eq(referrals.referrerId, user.id), eq(referrals.status, "QUALIFIED")));

      // Wallet earnings
      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, user.id))
        .limit(1);

      return {
        totalReferrals: totalRow?.count ?? 0,
        activeReferrals: activeRow?.count ?? 0,
        totalEarningsMmk: wallet?.totalReferralEarningsMmk ?? 0,
        inviteLink,
      };
    } catch (err: any) {
      console.warn("[ReferralService] getReferralStats error:", err?.message || err);
      return {
        totalReferrals: 0,
        activeReferrals: 0,
        totalEarningsMmk: 0,
        inviteLink,
      };
    }
  }
}

export const referralService = new ReferralService();
