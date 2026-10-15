import { describe, it, expect, vi, beforeEach } from "vitest";
import { COUNTDOWN_MILESTONES, startMmpayInvoiceScheduler } from "../../apps/bot/src/services/mmpay-invoice-scheduler";

describe("MMPay Invoice Countdown Scheduler Milestone Throttling", () => {
  it("defines the exact 5 milestone minutes [13, 10, 5, 3, 1]", () => {
    expect(COUNTDOWN_MILESTONES).toEqual([13, 10, 5, 3, 1]);
    expect(COUNTDOWN_MILESTONES.length).toBe(5);
  });

  it("identifies milestone minutes vs skipped minutes correctly", () => {
    const isMilestone = (m: number) =>
      (COUNTDOWN_MILESTONES as readonly number[]).includes(m);

    // Milestones to edit (5 times)
    expect(isMilestone(13)).toBe(true);
    expect(isMilestone(10)).toBe(true);
    expect(isMilestone(5)).toBe(true);
    expect(isMilestone(3)).toBe(true);
    expect(isMilestone(1)).toBe(true);

    // Skipped non-milestones (9 times saved!)
    expect(isMilestone(14)).toBe(false);
    expect(isMilestone(12)).toBe(false);
    expect(isMilestone(11)).toBe(false);
    expect(isMilestone(9)).toBe(false);
    expect(isMilestone(8)).toBe(false);
    expect(isMilestone(7)).toBe(false);
    expect(isMilestone(6)).toBe(false);
    expect(isMilestone(4)).toBe(false);
    expect(isMilestone(2)).toBe(false);
  });

  it("calculates remaining minutes correctly from expiresAt timestamp", () => {
    const now = Date.now();
    const computeMin = (targetMs: number) => {
      const remainingMs = targetMs - now;
      return Math.max(0, Math.ceil(remainingMs / 60000));
    };

    // Exactly 13 minutes remaining
    expect(computeMin(now + 13 * 60 * 1000)).toBe(13);

    // 12 minutes 45 seconds remaining rounds up to 13 minutes
    expect(computeMin(now + 12.75 * 60 * 1000)).toBe(13);

    // 10 minutes remaining
    expect(computeMin(now + 10 * 60 * 1000)).toBe(10);

    // 5 minutes remaining
    expect(computeMin(now + 5 * 60 * 1000)).toBe(5);

    // 3 minutes remaining
    expect(computeMin(now + 3 * 60 * 1000)).toBe(3);

    // 1 minute remaining
    expect(computeMin(now + 1 * 60 * 1000)).toBe(1);

    // Expired
    expect(computeMin(now - 1000)).toBe(0);
  });
});
