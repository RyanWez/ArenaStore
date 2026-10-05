import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const notifyTopUpApproved = vi.fn();
  const notifyTopUpRejected = vi.fn();
  const writeAudit = vi.fn();
  const rows: Record<string, any[]> = {};
  const updates: Array<{ table: string; patch: any }> = [];
  const inserts: Array<{ table: string; values: any }> = [];
  let claimFails = false;

  const reset = (seed: Record<string, any[]> = {}) => {
    for (const key of Object.keys(rows)) delete rows[key];
    Object.assign(rows, seed);
    updates.length = 0;
    inserts.length = 0;
    claimFails = false;
    notifyTopUpApproved.mockReset();
    notifyTopUpRejected.mockReset();
    writeAudit.mockReset();
  };

  const db = {
    transaction: async (cb: any) => cb(db),
    select: (selection?: any) => ({
      from: (table: any) => {
        const tableName = table?._?.name || "unknown";
        return {
          innerJoin: (joinTable: any, condition: any) => ({
            where: (cond: any) => ({
              limit: (n: number) => {
                const topUps = rows["topup_requests"] || [];
                const usrs = rows["users"] || [];
                if (topUps.length === 0) return [];
                const topUp = topUps[0];
                const user = usrs.find((u) => u.id === topUp.userId) || {
                  id: topUp.userId,
                  telegramId: "123456",
                  username: "testuser",
                  firstName: "Test",
                  lastName: "Customer",
                };
                return [{ topUp, user }];
              },
            }),
          }),
          where: (cond: any) => ({
            limit: (n: number) => {
              const list = rows[tableName] || [];
              return list.slice(0, n);
            },
          }),
        };
      },
    }),
    update: (table: any) => {
      const tableName = table?._?.name || "unknown";
      return {
        set: (patch: any) => ({
          where: (cond: any) => ({
            returning: (ret?: any) => {
              if (claimFails) {
                return [];
              }
              updates.push({ table: tableName, patch });
              const list = rows[tableName] || [];
              if (list.length > 0) {
                const updated = { ...list[0], ...patch };
                if (patch.balanceMmk && typeof patch.balanceMmk === "object") {
                  // handle sql addition
                  updated.balanceMmk = (list[0].balanceMmk || 0) + 10000;
                }
                rows[tableName] = [updated];
                return [updated];
              }
              return [{ id: 1 }];
            },
          }),
        }),
      };
    },
    insert: (table: any) => {
      const tableName = table?._?.name || "unknown";
      return {
        values: (val: any) => ({
          returning: () => {
            inserts.push({ table: tableName, values: val });
            const list = rows[tableName] || [];
            const inserted = { id: list.length + 1, ...val };
            list.push(inserted);
            rows[tableName] = list;
            return [inserted];
          },
        }),
      };
    },
  };

  return {
    notifyTopUpApproved,
    notifyTopUpRejected,
    writeAudit,
    rows,
    updates,
    inserts,
    reset,
    setClaimFails: (val: boolean) => {
      claimFails = val;
    },
    db,
  };
});

vi.mock("@arena/db", async () => {
  const actual = await vi.importActual<typeof import("@arena/db")>("@arena/db");
  return {
    ...actual,
    getDb: () => h.db,
  };
});

vi.mock("../../apps/api/src/services/telegram-notifier", () => ({
  notifyTopUpApproved: (...args: any[]) => h.notifyTopUpApproved(...args),
  notifyTopUpRejected: (...args: any[]) => h.notifyTopUpRejected(...args),
}));

vi.mock("../../apps/api/src/services/audit.service", () => ({
  writeAudit: (...args: any[]) => h.writeAudit(...args),
}));

import { reviewDeposit, buildCustomerDisplayName } from "../../apps/api/src/services/deposit-review.service";
import { isUserAuthorizedApprover } from "../../apps/bot/src/handlers/admin-deposit-review";

describe("isUserAuthorizedApprover (Telegram group approver allowlist)", () => {
  it("rejects unauthorized users when allowlist and admin fallback are empty or whitespace (default-deny)", () => {
    expect(isUserAuthorizedApprover({ id: 111, username: "anyone" }, "")).toBe(false);
    expect(isUserAuthorizedApprover({ id: 222 }, "   ")).toBe(false);
  });

  it("authorizes user matching admin fallback when approver allowlist is empty", () => {
    expect(isUserAuthorizedApprover({ id: 999, username: "admin" }, "", "admin, 888")).toBe(true);
    expect(isUserAuthorizedApprover({ id: 888 }, "", "admin, 888")).toBe(true);
    expect(isUserAuthorizedApprover({ id: 777 }, "", "admin, 888")).toBe(false);
  });

  it("authorizes user matching numeric Telegram ID", () => {
    const allowlist = "123456789, 987654321";
    expect(isUserAuthorizedApprover({ id: 123456789 }, allowlist)).toBe(true);
    expect(isUserAuthorizedApprover({ id: 987654321 }, allowlist)).toBe(true);
    expect(isUserAuthorizedApprover({ id: 555555555 }, allowlist)).toBe(false);
  });

  it("authorizes user matching username (case-insensitive, with or without @)", () => {
    const allowlist = "ryanwez, @H_M_A_2026, 999";
    expect(isUserAuthorizedApprover({ id: 1, username: "ryanwez" }, allowlist)).toBe(true);
    expect(isUserAuthorizedApprover({ id: 2, username: "RyanWez" }, allowlist)).toBe(true);
    expect(isUserAuthorizedApprover({ id: 3, username: "h_m_a_2026" }, allowlist)).toBe(true);
    expect(isUserAuthorizedApprover({ id: 4, username: "@H_M_A_2026" }, allowlist)).toBe(true);
    expect(isUserAuthorizedApprover({ id: 5, username: "stranger" }, allowlist)).toBe(false);
  });

  it("rejects unauthorized users not present in the allowlist", () => {
    const allowlist = "123456789, ryanwez";
    expect(isUserAuthorizedApprover({ id: 999999999, username: "intruder" }, allowlist)).toBe(false);
    expect(isUserAuthorizedApprover({ id: 888888888 }, allowlist)).toBe(false);
  });
});

describe("reviewDeposit service", () => {
  beforeEach(() => {
    h.reset();
  });

  it("returns NOT_FOUND when deposit does not exist", async () => {
    h.reset({ topup_requests: [] });
    const res = await reviewDeposit({
      depositId: 999,
      action: "APPROVE",
      actor: { kind: "ADMIN", adminUserId: 1 },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("NOT_FOUND");
    }
  });

  it("returns ALREADY_REVIEWED when deposit status is not SUBMITTED/PENDING", async () => {
    h.reset({
      topup_requests: [
        {
          id: 42,
          userId: 1,
          amountMmk: 10000,
          reference: "TOP-TEST42",
          status: "COMPLETED",
        },
      ],
      users: [{ id: 1, telegramId: "123456", firstName: "Ko", lastName: "Kyaw" }],
    });

    const res = await reviewDeposit({
      depositId: 42,
      action: "APPROVE",
      actor: { kind: "ADMIN", adminUserId: 1 },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("ALREADY_REVIEWED");
      expect(res.status).toBe("COMPLETED");
      expect(res.reference).toBe("TOP-TEST42");
    }
  });

  it("approves deposit, credits wallet, records ledger, notifies customer and writes audit", async () => {
    h.reset({
      topup_requests: [
        {
          id: 10,
          userId: 5,
          amountMmk: 10000,
          reference: "TOP-10000",
          status: "SUBMITTED",
        },
      ],
      users: [{ id: 5, telegramId: "555555", username: "customer5", firstName: "Ma", lastName: "Mya" }],
      wallets: [{ id: 1, userId: 5, balanceMmk: 5000, totalDepositedMmk: 5000 }],
    });

    const res = await reviewDeposit({
      depositId: 10,
      action: "APPROVE",
      actor: { kind: "ADMIN", adminUserId: 2 },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.action).toBe("APPROVED");
      expect(res.reference).toBe("TOP-10000");
      expect(res.amountMmk).toBe(10000);
      expect(res.customerLabel).toBe("Ma Mya");
    }

    expect(h.notifyTopUpApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramId: "555555",
        reference: "TOP-10000",
        amountMmk: 10000,
      })
    );

    expect(h.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 2,
        action: "DEPOSIT_REVIEW",
        entityType: "DEPOSIT",
        entityId: 10,
      })
    );
  });

  it("rejects deposit, does not touch wallet, sends rejection notice and writes audit", async () => {
    h.reset({
      topup_requests: [
        {
          id: 11,
          userId: 5,
          amountMmk: 15000,
          reference: "TOP-REJECT11",
          status: "SUBMITTED",
        },
      ],
      users: [{ id: 5, telegramId: "555555", username: "customer5" }],
      wallets: [{ id: 1, userId: 5, balanceMmk: 5000, totalDepositedMmk: 5000 }],
    });

    const res = await reviewDeposit({
      depositId: 11,
      action: "REJECT",
      rejectReason: "Slip unreadable",
      actor: { kind: "TELEGRAM", telegramId: "777", telegramUsername: "admin_tg" },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.action).toBe("REJECTED");
      expect(res.reference).toBe("TOP-REJECT11");
    }

    expect(h.notifyTopUpRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramId: "555555",
        reference: "TOP-REJECT11",
        reason: "Slip unreadable",
      })
    );

    expect(h.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DEPOSIT_REVIEW",
        entityId: 11,
        details: expect.objectContaining({
          action: "REJECT",
          actorKind: "TELEGRAM",
          actorTelegramId: "777",
          actorUsername: "admin_tg",
        }),
      })
    );
  });

  it("handles concurrent double-review by returning ALREADY_REVIEWED when claim guard matches 0 rows", async () => {
    h.reset({
      topup_requests: [
        {
          id: 12,
          userId: 5,
          amountMmk: 20000,
          reference: "TOP-CONCURRENT",
          status: "SUBMITTED",
        },
      ],
      users: [{ id: 5, telegramId: "555555" }],
      wallets: [{ id: 1, userId: 5, balanceMmk: 0 }],
    });

    // Simulate another admin claiming it first
    h.setClaimFails(true);

    const res = await reviewDeposit({
      depositId: 12,
      action: "APPROVE",
      actor: { kind: "ADMIN", adminUserId: 1 },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("ALREADY_REVIEWED");
      expect(res.status).toBe("COMPLETED");
    }
    // Customer not notified on double-review loser
    expect(h.notifyTopUpApproved).not.toHaveBeenCalled();
  });
});
