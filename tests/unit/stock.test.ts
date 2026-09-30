import { describe, it, expect } from "vitest";
import { calculateSellableStock } from "@arena/shared";

describe("Stock Calculation Utilities", () => {
  it("constrains by supplier stock when supplier has least", () => {
    const res = calculateSellableStock({
      supplierStock: 5,
      supplierWalletBalanceUsd: "10.00",
      unitCostUsd: "1.00", // can afford 10
      localLimit: null,
      activeReservedUnits: 0,
    });

    expect(res.sellableStock).toBe(5);
    expect(res.walletCapacity).toBe(10);
    expect(res.isSupplierConstrained).toBe(true);
    expect(res.isWalletConstrained).toBe(false);
  });

  it("constrains by wallet capacity when wallet cannot afford all stock", () => {
    // Current reality in Ryan's profile: $1.00 balance, Gemini price $0.69, supplier stock 60
    const res = calculateSellableStock({
      supplierStock: 60,
      supplierWalletBalanceUsd: "1.00",
      unitCostUsd: "0.69",
      localLimit: 100,
      activeReservedUnits: 0,
    });

    // 1.00 / 0.69 = 1 unit affordable
    expect(res.walletCapacity).toBe(1);
    expect(res.sellableStock).toBe(1);
    expect(res.isWalletConstrained).toBe(true);
  });

  it("subtracts active reservations and clamps at zero", () => {
    const res = calculateSellableStock({
      supplierStock: 10,
      supplierWalletBalanceUsd: "20.00",
      unitCostUsd: "1.00",
      localLimit: 10,
      activeReservedUnits: 4,
    });

    expect(res.sellableStock).toBe(6);

    const clampedRes = calculateSellableStock({
      supplierStock: 5,
      supplierWalletBalanceUsd: "20.00",
      unitCostUsd: "1.00",
      localLimit: 10,
      activeReservedUnits: 8, // more than available
    });

    expect(clampedRes.sellableStock).toBe(0);
  });

  it("respects store manager local limit cap", () => {
    const res = calculateSellableStock({
      supplierStock: 100,
      supplierWalletBalanceUsd: "100.00",
      unitCostUsd: "1.00",
      localLimit: 20, // owner only wants to sell 20
      activeReservedUnits: 2,
    });

    expect(res.sellableStock).toBe(18);
    expect(res.isLocalLimitConstrained).toBe(true);
  });
});
