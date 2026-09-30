import { describe, it, expect } from "vitest";
import {
  usdToCents,
  centsToUsdString,
  toIntegerMmk,
  calculateRetailMmk,
  formatMmk,
} from "@arena/shared";

describe("Money Utilities", () => {
  describe("usdToCents & centsToUsdString", () => {
    it("converts numbers and strings to integer cents safely", () => {
      expect(usdToCents(0.69)).toBe(69);
      expect(usdToCents("0.69")).toBe(69);
      expect(usdToCents(4.5)).toBe(450);
      expect(usdToCents("12.99")).toBe(1299);
    });

    it("converts cents back to decimal string", () => {
      expect(centsToUsdString(69)).toBe("0.69");
      expect(centsToUsdString(450)).toBe("4.50");
      expect(centsToUsdString(1299)).toBe("12.99");
    });

    it("throws on invalid USD inputs", () => {
      expect(() => usdToCents("invalid")).toThrow();
      expect(() => usdToCents(-1)).toThrow();
      expect(() => centsToUsdString(-5)).toThrow();
    });
  });

  describe("toIntegerMmk", () => {
    it("ensures strict integer Kyat units", () => {
      expect(toIntegerMmk(3500)).toBe(3500);
      expect(toIntegerMmk(3499.7)).toBe(3500);
      expect(toIntegerMmk(3499.2)).toBe(3499);
    });

    it("throws on invalid amounts", () => {
      expect(() => toIntegerMmk(-100)).toThrow();
      expect(() => toIntegerMmk(NaN)).toThrow();
    });
  });

  describe("calculateRetailMmk", () => {
    it("calculates retail price with profit margin and rounding", () => {
      // Cost: $0.69, Rate: 4,500 MMK/USD, Margin: 25%, Round to nearest: 50
      // Base cost in MMK = round(69 * 4500 / 100) = round(3105) = 3105 MMK
      // Profit 25% = 3105 * 0.25 = 776.25 -> Raw total = 3881.25 MMK
      // Round to nearest 50 = ceil(3881.25 / 50) * 50 = 78 * 50 = 3900 MMK
      const result = calculateRetailMmk({
        upstreamUsdCost: "0.69",
        exchangeRateMmk: 4500,
        marginPercentage: 25,
        roundToNearest: 50,
      });

      expect(result.costInMmk).toBe(3105);
      expect(result.retailPriceMmk).toBe(3900);
      expect(result.profitMmk).toBe(3900 - 3105);
    });

    it("handles fixed fees correctly", () => {
      const result = calculateRetailMmk({
        upstreamUsdCost: 1.0,
        exchangeRateMmk: 4000,
        marginPercentage: 0,
        fixedFeeMmk: 500,
        roundToNearest: 100,
      });

      // Cost = 4000, Fee = 500 -> 4500
      expect(result.costInMmk).toBe(4000);
      expect(result.retailPriceMmk).toBe(4500);
      expect(result.profitMmk).toBe(500);
    });

    it("throws on non-positive exchange rate", () => {
      expect(() =>
        calculateRetailMmk({
          upstreamUsdCost: 1.0,
          exchangeRateMmk: 0,
        })
      ).toThrow();
    });
  });

  describe("formatMmk", () => {
    it("formats integer amounts with comma separators", () => {
      expect(formatMmk(3500)).toBe("3,500 Ks");
      expect(formatMmk(1000000, "MMK")).toBe("1,000,000 MMK");
    });
  });
});
