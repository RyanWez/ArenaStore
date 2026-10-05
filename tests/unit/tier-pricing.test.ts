import { describe, it, expect } from "vitest";
import { effectiveUnitCostUsdCents, type PricingTierItem } from "@arena/shared";

describe("Wholesale Tier Pricing Unit Tests", () => {
  it("evaluates a single tier with null maxQty across quantities", () => {
    const tiers: PricingTierItem[] = [
      { minQty: 1, maxQty: null, price: "0.55" },
    ];

    expect(effectiveUnitCostUsdCents(tiers, 1)).toBe(55);
    expect(effectiveUnitCostUsdCents(tiers, 10)).toBe(55);
    expect(effectiveUnitCostUsdCents(tiers, 500)).toBe(55);
  });

  it("selects correct tier boundaries for multi-tier pricing", () => {
    const tiers: PricingTierItem[] = [
      { minQty: 1, maxQty: 9, price: "1.00" },
      { minQty: 10, maxQty: 49, price: "0.85" },
      { minQty: 50, maxQty: null, price: "0.70" },
    ];

    expect(effectiveUnitCostUsdCents(tiers, 1)).toBe(100);
    expect(effectiveUnitCostUsdCents(tiers, 9)).toBe(100);
    expect(effectiveUnitCostUsdCents(tiers, 10)).toBe(85);
    expect(effectiveUnitCostUsdCents(tiers, 49)).toBe(85);
    expect(effectiveUnitCostUsdCents(tiers, 50)).toBe(70);
    expect(effectiveUnitCostUsdCents(tiers, 999)).toBe(70);
  });

  it("handles unsorted tier configurations gracefully", () => {
    const unsortedTiers: PricingTierItem[] = [
      { minQty: 50, maxQty: null, price: "0.70" },
      { minQty: 1, maxQty: 9, price: "1.00" },
      { minQty: 10, maxQty: 49, price: "0.85" },
    ];

    expect(effectiveUnitCostUsdCents(unsortedTiers, 5)).toBe(100);
    expect(effectiveUnitCostUsdCents(unsortedTiers, 25)).toBe(85);
    expect(effectiveUnitCostUsdCents(unsortedTiers, 75)).toBe(70);
  });

  it("preserves integer-cent precision avoiding floating point inaccuracies", () => {
    const tiers: PricingTierItem[] = [
      { minQty: 1, maxQty: null, price: 0.29 },
    ];
    // In raw JS: 0.29 * 100 = 28.999999999999996
    expect(effectiveUnitCostUsdCents(tiers, 1)).toBe(29);
  });

  it("falls back to the highest tier if quantity exceeds bounded tiers", () => {
    const boundedTiers: PricingTierItem[] = [
      { minQty: 1, maxQty: 10, price: "2.00" },
      { minQty: 11, maxQty: 50, price: "1.50" },
    ];

    expect(effectiveUnitCostUsdCents(boundedTiers, 100)).toBe(150);
  });

  it("throws on empty tiers or invalid quantity", () => {
    expect(() => effectiveUnitCostUsdCents([], 1)).toThrow("No pricing tiers provided.");
    expect(() => effectiveUnitCostUsdCents([{ minQty: 1, maxQty: null, price: "1.00" }], 0)).toThrow(
      "Quantity must be a positive integer: 0"
    );
    expect(() => effectiveUnitCostUsdCents([{ minQty: 1, maxQty: null, price: "1.00" }], -5)).toThrow();
    expect(() => effectiveUnitCostUsdCents([{ minQty: 1, maxQty: null, price: "1.00" }], 1.5)).toThrow();
  });
});
