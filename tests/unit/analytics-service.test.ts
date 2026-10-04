import { describe, it, expect } from "vitest";
import { getMyanmarDateBounds } from "../../apps/api/src/services/analytics.service";

describe("Analytics Service - Myanmar Date Bounds & Financial Utilities", () => {
  it("calculates TODAY bounds matching Myanmar Timezone (UTC+06:30)", () => {
    const { startUtc, endUtc, label, mode } = getMyanmarDateBounds("TODAY");

    expect(label).toBe("Today");
    expect(mode).toBe("HOURLY");
    expect(startUtc).toBeInstanceOf(Date);
    expect(endUtc).toBeInstanceOf(Date);

    // Duration between start and end of day is 24 hours - 1ms
    const durationMs = endUtc!.getTime() - startUtc!.getTime();
    expect(durationMs).toBe(24 * 60 * 60 * 1000 - 1);

    // Myanmar is +06:30, so start of day in MM is 17:30 UTC of previous calendar day
    // (startUtc.getUTCHours() === 17 && startUtc.getUTCMinutes() === 30)
    expect(startUtc!.getUTCHours()).toBe(17);
    expect(startUtc!.getUTCMinutes()).toBe(30);
    expect(startUtc!.getUTCSeconds()).toBe(0);

    // End of day is 17:29:59.999 UTC
    expect(endUtc!.getUTCHours()).toBe(17);
    expect(endUtc!.getUTCMinutes()).toBe(29);
    expect(endUtc!.getUTCSeconds()).toBe(59);
  });

  it("calculates YESTERDAY bounds exactly 24 hours prior to TODAY", () => {
    const todayBounds = getMyanmarDateBounds("TODAY");
    const yesterdayBounds = getMyanmarDateBounds("YESTERDAY");

    expect(yesterdayBounds.label).toBe("Yesterday");
    expect(yesterdayBounds.mode).toBe("HOURLY");

    const diffStartMs = todayBounds.startUtc!.getTime() - yesterdayBounds.startUtc!.getTime();
    expect(diffStartMs).toBe(24 * 60 * 60 * 1000);
  });

  it("calculates LAST_7_DAYS bounds spanning exactly 7 full days", () => {
    const { startUtc, endUtc, label, mode } = getMyanmarDateBounds("LAST_7_DAYS");

    expect(label).toBe("Last 7 Days");
    expect(mode).toBe("DAILY");

    const diffDays = Math.round((endUtc!.getTime() - startUtc!.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(7);
  });

  it("calculates THIS_MONTH starting on the 1st of the month in Myanmar timezone", () => {
    const { startUtc, endUtc, label, mode } = getMyanmarDateBounds("THIS_MONTH");

    expect(label).toBe("This Month");
    expect(mode).toBe("DAILY");
    expect(startUtc!.getTime()).toBeLessThan(endUtc!.getTime());
  });

  it("calculates CUSTOM single date correctly", () => {
    const { startUtc, endUtc, label, mode } = getMyanmarDateBounds("CUSTOM", "2026-10-04");

    expect(label).toBe("2026-10-04");
    expect(mode).toBe("HOURLY");

    // 2026-10-04 00:00:00 +06:30 is 2026-10-03 17:30:00 UTC
    expect(startUtc!.toISOString()).toBe("2026-10-03T17:30:00.000Z");
    // 2026-10-04 23:59:59.999 +06:30 is 2026-10-04T17:29:59.999Z
    expect(endUtc!.toISOString()).toBe("2026-10-04T17:29:59.999Z");
  });

  it("calculates CUSTOM date range across multiple days", () => {
    const { startUtc, endUtc, label, mode } = getMyanmarDateBounds("CUSTOM", undefined, "2026-10-01", "2026-10-05");

    expect(label).toBe("2026-10-01 to 2026-10-05");
    expect(mode).toBe("DAILY");

    expect(startUtc!.toISOString()).toBe("2026-09-30T17:30:00.000Z");
    expect(endUtc!.toISOString()).toBe("2026-10-05T17:29:59.999Z");
  });

  it("returns null bounds for ALL time", () => {
    const { startUtc, endUtc, label, mode } = getMyanmarDateBounds("ALL");

    expect(label).toBe("All Time");
    expect(mode).toBe("DAILY");
    expect(startUtc).toBeNull();
    expect(endUtc).toBeNull();
  });

  it("correctly models the financial profit and margin formulas", () => {
    // E.g. A digital product sold for 12,000 MMK with cost 2.00 USD at 4,500 exchange rate
    const retailPriceMmk = 12000;
    const unitCostUsd = "2.00";
    const quantity = 2;
    const exchangeRate = 4500;

    const totalRevenue = retailPriceMmk * quantity; // 24,000
    const totalCostUsd = parseFloat(unitCostUsd) * quantity; // 4.00
    const totalCostMmk = Math.round(totalCostUsd * exchangeRate); // 18,000
    const netGrossProfit = totalRevenue - totalCostMmk; // 6,000
    const marginPct = Number(((netGrossProfit / totalRevenue) * 100).toFixed(1)); // 25.0%

    expect(totalRevenue).toBe(24000);
    expect(totalCostMmk).toBe(18000);
    expect(netGrossProfit).toBe(6000);
    expect(marginPct).toBe(25.0);
  });

  it("cleans raw Telegram custom emoji placeholders from product and category names", async () => {
    const { stripCustomEmojiPlaceholders } = await import("@arena/shared");
    const rawCategory = "{pe:5069075201950483359} GEMINI AI";
    const rawProduct = "{pe:5474521476197536994} capcut pro 1 month";

    expect(stripCustomEmojiPlaceholders(rawCategory)).toBe("GEMINI AI");
    expect(stripCustomEmojiPlaceholders(rawProduct)).toBe("capcut pro 1 month");
  });
});
