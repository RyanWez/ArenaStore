import { describe, it, expect, vi, beforeEach } from "vitest";
import { BOT_EMOJIS, tgEmoji } from "@arena/shared";
import {
  formatProfileMessage,
  formatReferralDetailsMessage,
} from "../../apps/bot/src/formatters/messages";
import {
  buildProfileKeyboard,
  buildReferralKeyboard,
} from "../../apps/bot/src/keyboards/store.keyboards";
import { ReferralService } from "../../apps/bot/src/services/referral.service";

// Hoisted mocks for database interaction in ReferralService
const h = vi.hoisted(() => {
  const usersRows: any[] = [];
  const walletsRows: any[] = [];
  const referralsRows: any[] = [];
  const referralRewardsRows: any[] = [];
  const ordersRows: any[] = [];
  const walletLedgerRows: any[] = [];

  const reset = () => {
    usersRows.length = 0;
    walletsRows.length = 0;
    referralsRows.length = 0;
    referralRewardsRows.length = 0;
    ordersRows.length = 0;
    walletLedgerRows.length = 0;
  };

  const getRowVal = (row: any, col: string) => {
    if (!row) return undefined;
    const camel = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return row[camel] !== undefined ? row[camel] : row[col];
  };

  const evaluateMockSql = (sqlObj: any, row: any): any => {
    if (!sqlObj || typeof sqlObj !== "object" || !Array.isArray(sqlObj.queryChunks)) {
      return sqlObj;
    }
    let exprStr = "";
    for (const chunk of sqlObj.queryChunks) {
      if (typeof chunk === "string") {
        exprStr += chunk;
      } else if (chunk?.value !== undefined && typeof chunk.value === "string") {
        exprStr += chunk.value;
      } else if (Array.isArray(chunk?.value)) {
        exprStr += chunk.value.join("");
      } else if (chunk?.name) {
        const colName = chunk.name;
        const camelName = colName.replace(/_([a-z])/g, (_: any, c: string) => c.toUpperCase());
        const val = row[camelName] ?? row[colName] ?? 0;
        exprStr += String(val);
      } else if (chunk?.value !== undefined) {
        exprStr += String(chunk.value);
      } else {
        exprStr += String(chunk);
      }
    }
    try {
      return Function(`"use strict"; return (${exprStr});`)();
    } catch {
      return sqlObj;
    }
  };

  const db: any = {
    transaction: async (cb: any) => cb(db),
    select: (selection?: any) => ({
      from: (table: any) => {
        let currentRows: any[] = [];
        const tableName = table?._?.name || (table as any)?.[Symbol.for("drizzle:Name")];

        if (table === "users" || tableName === "users") currentRows = usersRows;
        else if (table === "wallets" || tableName === "wallets") currentRows = walletsRows;
        else if (table === "referrals" || tableName === "referrals") currentRows = referralsRows;
        else if (table === "referral_rewards" || tableName === "referral_rewards") currentRows = referralRewardsRows;
        else if (table === "orders" || tableName === "orders") currentRows = ordersRows;
        else currentRows = [];

        return {
          where: (cond: any) => ({
            limit: (_n: number) => {
              if (cond?.__type === "eq") {
                const filtered = currentRows.filter((r) => getRowVal(r, cond.col) === cond.val);
                return Promise.resolve(filtered.slice(0, _n));
              }
              return Promise.resolve(currentRows.slice(0, _n));
            },
            then: (resolve: any) => {
              if (selection && selection.count) {
                if (cond?.__type === "and") {
                  const filtered = currentRows.filter((r) =>
                    cond.conditions.every((c: any) => getRowVal(r, c.col) === c.val)
                  );
                  return resolve([{ count: filtered.length }]);
                }
                if (cond?.__type === "eq") {
                  const filtered = currentRows.filter((r) => getRowVal(r, cond.col) === cond.val);
                  return resolve([{ count: filtered.length }]);
                }
                return resolve([{ count: currentRows.length }]);
              }
              if (cond?.__type === "eq") {
                const filtered = currentRows.filter((r) => getRowVal(r, cond.col) === cond.val);
                return resolve(filtered);
              }
              return resolve(currentRows);
            },
          }),
          then: (resolve: any) => {
            if (selection && selection.count) {
              return resolve([{ count: currentRows.length }]);
            }
            return resolve(currentRows);
          },
        };
      },
    }),
    insert: (table: any) => ({
      values: (val: any) => ({
        returning: () => {
          const tableName = table?._?.name || (table as any)?.[Symbol.for("drizzle:Name")];
          const newRow = { id: Math.floor(Math.random() * 100000) + 1, ...val };
          if (tableName === "users") usersRows.push(newRow);
          else if (tableName === "wallets") walletsRows.push(newRow);
          else if (tableName === "referrals") referralsRows.push(newRow);
          else if (tableName === "referral_rewards") referralRewardsRows.push(newRow);
          else if (tableName === "wallet_ledger") walletLedgerRows.push(newRow);
          return Promise.resolve([newRow]);
        },
        then: (resolve: any) => {
          const tableName = table?._?.name || (table as any)?.[Symbol.for("drizzle:Name")];
          const newRow = { id: Math.floor(Math.random() * 100000) + 1, ...val };
          if (tableName === "users") usersRows.push(newRow);
          else if (tableName === "wallets") walletsRows.push(newRow);
          else if (tableName === "referrals") referralsRows.push(newRow);
          else if (tableName === "referral_rewards") referralRewardsRows.push(newRow);
          else if (tableName === "wallet_ledger") walletLedgerRows.push(newRow);
          return resolve([newRow]);
        },
      }),
    }),
    update: (table: any) => ({
      set: (patch: any) => ({
        where: (cond: any) => ({
          returning: () => {
            const tableName = table?._?.name || (table as any)?.[Symbol.for("drizzle:Name")];
            let list = tableName === "users" ? usersRows : tableName === "wallets" ? walletsRows : referralsRows;
            const target = list.find((r) => (cond?.val !== undefined ? getRowVal(r, cond.col) === cond.val : true));
            if (target) {
              for (const [k, v] of Object.entries(patch)) {
                const camelK = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                const evaluated = evaluateMockSql(v, target);
                target[camelK] = evaluated;
                target[k] = evaluated;
              }
            }
            return Promise.resolve(target ? [target] : []);
          },
          then: (resolve: any) => {
            const tableName = table?._?.name || (table as any)?.[Symbol.for("drizzle:Name")];
            let list = tableName === "users" ? usersRows : tableName === "wallets" ? walletsRows : referralsRows;
            const target = list.find((r) => (cond?.val !== undefined ? getRowVal(r, cond.col) === cond.val : true));
            if (target) {
              for (const [k, v] of Object.entries(patch)) {
                const camelK = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                const evaluated = evaluateMockSql(v, target);
                target[camelK] = evaluated;
                target[k] = evaluated;
              }
            }
            return resolve(target ? [target] : []);
          },
        }),
      }),
    }),
  };

  return {
    reset,
    db,
    usersRows,
    walletsRows,
    referralsRows,
    referralRewardsRows,
    ordersRows,
    walletLedgerRows,
  };
});

vi.mock("@arena/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arena/db")>();
  return {
    ...actual,
    getDb: () => h.db,
  };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: any, val: any) => ({
      __type: "eq",
      col: col?.name || "id",
      val,
    }),
    and: (...conditions: any[]) => ({
      __type: "and",
      conditions,
    }),
  };
});

describe("Referral & Affiliate Reward System", () => {
  beforeEach(() => {
    h.reset();
    vi.restoreAllMocks();
  });

  describe("UI Messages & Keyboards", () => {
    it("formats profile message with referral summary and invite link", () => {
      const msg = formatProfileMessage({
        fullName: "Ryan Wez",
        username: "ryanwez",
        telegramId: "8777968077",
        walletBalanceMmk: 15000,
        totalSpentMmk: 5000,
        ordersCount: 2,
        referralsCount: 10,
        activeReferralsCount: 3,
        referralEarningsMmk: 12600,
        inviteLink: "https://t.me/ArenaStoreBot?start=ref_8777968077",
      });

      expect(msg).toContain("Ryan Wez");
      expect(msg).toContain("@ryanwez");
      expect(msg).toContain("8777968077");
      expect(msg).toContain("15,000 Ks");
      expect(msg).toContain("Referral အချက်အလက်များ");
      expect(msg).toContain("ဖိတ်ခေါ်ထားသူ: <b>10 ဦး</b>");
      expect(msg).toContain("အော်ဒါဝယ်ယူသူ: <b>3 ဦး</b>");
      expect(msg).toContain("စုစုပေါင်း ရရှိငွေ: <b>12,600 Ks</b>");
      expect(msg).toContain("https://t.me/ArenaStoreBot?start=ref_8777968077");
    });

    it("formats dedicated referral details message with rules and stats", () => {
      const msg = formatReferralDetailsMessage({
        telegramId: "8777968077",
        totalReferrals: 15,
        activeReferrals: 5,
        totalEarningsMmk: 18000,
        inviteLink: "https://t.me/ArenaStoreBot?start=ref_8777968077",
      });

      expect(msg).toContain("သူငယ်ချင်း ဖိတ်ခေါ်ပြီး ဆုကြေးရယူပါ");
      expect(msg).toContain("200 ကျပ်");
      expect(msg).toContain("Lifetime 3% ကော်မရှင်");
      expect(msg).toContain("ဖိတ်ခေါ်ထားသူ: <b>15 ဦး</b>");
      expect(msg).toContain("အော်ဒါဝယ်ယူသူ: <b>5 ဦး</b>");
      expect(msg).toContain("စုစုပေါင်း ရရှိငွေ: <b>18,000 Ks</b>");
      expect(msg).toContain("<code>https://t.me/ArenaStoreBot?start=ref_8777968077</code>");
    });

    it("builds profile keyboard with Referral Details, Wallet Topup, and Home button", () => {
      const keyboard = buildProfileKeyboard();
      const rows = keyboard.inline_keyboard;
      expect(rows.length).toBe(3);
      expect(rows[0][0].text).toBe("Referral အချက်အလက်");
      expect((rows[0][0] as any).callback_data).toBe("menu_referral");
      expect(rows[1][0].text).toBe("Wallet ထဲငွေဖြည့်မည်");
      expect((rows[1][0] as any).callback_data).toBe("menu_wallet");
      expect(rows[2][0].text).toBe("ပင်မစာမျက်နှာ");
    });

    it("builds referral keyboard with Telegram Share intent URL and Back navigation", () => {
      const link = "https://t.me/ArenaStoreBot?start=ref_8777968077";
      const keyboard = buildReferralKeyboard(link);
      const rows = keyboard.inline_keyboard;

      expect(rows.length).toBe(2);
      expect(rows[0][0].text).toBe("သူငယ်ချင်းများသို့ မျှဝေရန်");
      expect((rows[0][0] as any).switch_inline_query).toBe("");
      expect((rows[0][0] as any).icon_custom_emoji_id).toBe("5886334622849044906");
      expect(rows[1][0].text).toBe("နောက်သို့");
      expect((rows[1][0] as any).callback_data).toBe("menu_profile");
      expect(rows[1][1].text).toBe("ပင်မစာမျက်နှာ");
      expect((rows[1][1] as any).callback_data).toBe("menu_start");
    });
  });

  describe("Referral Service Core Logic", () => {
    const service = new ReferralService();

    it("generates correct Telegram invite link", () => {
      const link = service.getInviteLink("8777968077", "ArenaStoreBot");
      expect(link).toBe("https://t.me/ArenaStoreBot?start=ref_8777968077");
    });

    it("rejects self-referral", async () => {
      const res = await service.bindReferralIfEligible({
        newUserTelegramId: "8777968077",
        referrerTelegramId: "8777968077",
      });

      expect(res.success).toBe(false);
      expect(res.welcomeCredited).toBe(false);
      expect(res.reason).toBe("SELF_REFERRAL");
    });

    it("rejects referral if referrer is not found in database", async () => {
      const res = await service.bindReferralIfEligible({
        newUserTelegramId: "99999999",
        referrerTelegramId: "88888888", // Not in DB
      });

      expect(res.success).toBe(false);
      expect(res.reason).toBe("REFERRER_NOT_FOUND");
    });

    it("successfully binds new user and credits 200 MMK welcome bonus", async () => {
      // Seed referrer
      h.usersRows.push({
        id: 1,
        telegramId: "111111",
        firstName: "Inviter",
      });
      h.walletsRows.push({
        id: 1,
        userId: 1,
        balanceMmk: 5000,
        totalReferralEarningsMmk: 0,
      });

      const res = await service.bindReferralIfEligible({
        newUserTelegramId: "222222",
        referrerTelegramId: "111111",
        firstName: "NewFriend",
      });

      expect(res.success).toBe(true);
      expect(res.welcomeCredited).toBe(true);
      expect(res.referrerTelegramId).toBe("111111");

      // Verify new user was created with referredBy
      const newUser = h.usersRows.find((u) => u.telegramId === "222222");
      expect(newUser).toBeDefined();
      expect(newUser?.referredBy).toBe(1);

      // Verify referral row created with status PENDING
      const ref = h.referralsRows.find((r) => r.referredUserId === newUser.id);
      expect(ref).toBeDefined();
      expect(ref?.status).toBe("PENDING");
      expect(ref?.welcomeRewardMmk).toBe(200);

      // Verify wallet was credited 200 MMK
      const newWallet = h.walletsRows.find((w) => w.userId === newUser.id);
      expect(newWallet).toBeDefined();
      expect(newWallet?.balanceMmk).toBe(200);

      // Verify wallet ledger entry
      const ledger = h.walletLedgerRows.find((l) => l.walletId === newWallet.id);
      expect(ledger).toBeDefined();
      expect(ledger?.type).toBe("REFERRAL_WELCOME");
      expect(ledger?.amountMmk).toBe(200);
    });

    it("rejects referral if user is already referred", async () => {
      h.usersRows.push({
        id: 1,
        telegramId: "111111",
      });
      h.usersRows.push({
        id: 2,
        telegramId: "222222",
        referredBy: 1,
      });

      const res = await service.bindReferralIfEligible({
        newUserTelegramId: "222222",
        referrerTelegramId: "111111",
      });

      expect(res.success).toBe(false);
      expect(res.reason).toBe("ALREADY_REFERRED");
    });

    it("rejects referral if user has existing order history (anti-abuse for old customers)", async () => {
      h.usersRows.push({ id: 1, telegramId: "111111" });
      h.usersRows.push({ id: 2, telegramId: "222222" });
      h.ordersRows.push({ id: "order-1", customerId: 2, status: "DELIVERED" });

      const res = await service.bindReferralIfEligible({
        newUserTelegramId: "222222",
        referrerTelegramId: "111111",
      });

      expect(res.success).toBe(false);
      expect(res.reason).toBe("EXISTING_CUSTOMER");
    });

    it("unlocks 200 MMK bonus + 3% commission on friend's first completed purchase", async () => {
      h.usersRows.push({ id: 1, telegramId: "111111" }); // Referrer
      h.usersRows.push({ id: 2, telegramId: "222222", referredBy: 1 }); // Friend
      h.walletsRows.push({ id: 1, userId: 1, balanceMmk: 1000, totalReferralEarningsMmk: 0 });
      h.referralsRows.push({
        id: 1,
        referrerId: 1,
        referredUserId: 2,
        status: "PENDING",
        welcomeRewardMmk: 200,
        referrerBonusMmk: 200,
        totalCommissionMmk: 0,
      });

      const mockBotApi: any = {
        sendMessage: vi.fn().mockResolvedValue({}),
      };

      // Order total: 10,000 MMK
      // Commission: 3% of 10,000 = 300 MMK
      // Unlocked bonus: 200 MMK
      // Total earned: 500 MMK
      const res = await service.processOrderReferralCommission({
        orderId: "ord-first-123",
        customerUserId: 2,
        totalMmk: 10000,
        botApi: mockBotApi,
      });

      expect(res.processed).toBe(true);
      expect(res.bonusUnlocked).toBe(true);
      expect(res.commissionAmount).toBe(300);

      // Verify referral flipped to QUALIFIED
      const ref = h.referralsRows.find((r) => r.id === 1);
      expect(ref?.status).toBe("QUALIFIED");
      expect(ref?.firstPurchaseAt).toBeDefined();

      // Verify rewards logged
      const bonusReward = h.referralRewardsRows.find((r) => r.rewardType === "FIRST_PURCHASE_BONUS");
      expect(bonusReward?.amountMmk).toBe(200);

      const commReward = h.referralRewardsRows.find((r) => r.rewardType === "ORDER_COMMISSION");
      expect(commReward?.amountMmk).toBe(300);

      // Verify referrer wallet was credited
      const referrerWallet = h.walletsRows.find((w) => w.id === 1);
      expect(referrerWallet?.balanceMmk).toBe(1500); // 1000 + 500
      expect(referrerWallet?.totalReferralEarningsMmk).toBe(500);

      // Verify notification sent to referrer
      expect(mockBotApi.sendMessage).toHaveBeenCalledWith(
        "111111",
        expect.stringContaining("မိတ်ဆက်ဆုကြေး ရရှိပါသည်"),
        expect.objectContaining({ parse_mode: "HTML" })
      );
    });

    it("awards lifetime 3% commission on subsequent purchases without re-awarding bonus", async () => {
      h.usersRows.push({ id: 1, telegramId: "111111" });
      h.usersRows.push({ id: 2, telegramId: "222222", referredBy: 1 });
      h.walletsRows.push({ id: 1, userId: 1, balanceMmk: 1500, totalReferralEarningsMmk: 500 });
      h.referralsRows.push({
        id: 1,
        referrerId: 1,
        referredUserId: 2,
        status: "QUALIFIED", // Already qualified!
        welcomeRewardMmk: 200,
        referrerBonusMmk: 200,
        totalCommissionMmk: 300,
      });

      const mockBotApi: any = {
        sendMessage: vi.fn().mockResolvedValue({}),
      };

      // Subsequent order: 20,000 MMK
      // Commission: 3% of 20,000 = 600 MMK
      const res = await service.processOrderReferralCommission({
        orderId: "ord-second-456",
        customerUserId: 2,
        totalMmk: 20000,
        botApi: mockBotApi,
      });

      expect(res.processed).toBe(true);
      expect(res.bonusUnlocked).toBe(false); // Bonus was NOT unlocked again
      expect(res.commissionAmount).toBe(600);

      const referrerWallet = h.walletsRows.find((w) => w.id === 1);
      expect(referrerWallet?.balanceMmk).toBe(2100); // 1500 + 600
      expect(referrerWallet?.totalReferralEarningsMmk).toBe(1100); // 500 + 600

      expect(mockBotApi.sendMessage).toHaveBeenCalledWith(
        "111111",
        expect.stringContaining("မိတ်ဆက် ကော်မရှင် ရရှိပါသည်"),
        expect.objectContaining({ parse_mode: "HTML" })
      );
    });
  });
});
