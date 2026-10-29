import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierBalanceMonitor } from "../../apps/api/src/services/supplier-balance-monitor";
import { xproClient, digitalcoreClient, aivaulthubClient } from "../../apps/api/src/services/xpro-client";
import * as telegramNotifier from "../../apps/api/src/services/telegram-notifier";

vi.mock("../../apps/api/src/services/xpro-client", () => ({
  xproClient: {
    getBalance: vi.fn(),
  },
  digitalcoreClient: {
    getBalance: vi.fn(),
  },
  aivaulthubClient: {
    getBalance: vi.fn(),
  },
}));

vi.mock("@arena/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  }),
  appSettings: { key: "key" },
}));

describe("Supplier Balance Monitor (Coalesced $5.00 Alert)", () => {
  let monitor: SupplierBalanceMonitor;
  let notifySpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor = new SupplierBalanceMonitor();
    notifySpy = vi.spyOn(telegramNotifier, "notifyLowSupplierBalance").mockResolvedValue(true);
    vi.mocked(aivaulthubClient.getBalance).mockResolvedValue({
      balanceUsd: "50.00",
      balanceUsdCents: 5000,
    } as any);
  });

  it("does not alert when balances are above the threshold ($5.00)", async () => {
    vi.mocked(xproClient.getBalance).mockResolvedValue({
      balanceUsd: "15.00",
      balanceUsdCents: 1500,
    } as any);
    vi.mocked(digitalcoreClient.getBalance).mockResolvedValue({
      balanceUsd: "50.00",
      balanceUsdCents: 5000,
    } as any);

    const res = await monitor.checkBalances(5.0);

    expect(notifySpy).not.toHaveBeenCalled();
    expect(res.XPRO?.alertSent).toBe(false);
    expect(res.DIGITALCORE?.alertSent).toBe(false);
    expect(monitor.isAlerted("XPRO")).toBe(false);
    expect(monitor.isAlerted("DIGITALCORE")).toBe(false);
  });

  it("sends an alert when balance drops below the threshold", async () => {
    vi.mocked(xproClient.getBalance).mockResolvedValue({
      balanceUsd: "3.50",
      balanceUsdCents: 350,
    } as any);
    vi.mocked(digitalcoreClient.getBalance).mockResolvedValue({
      balanceUsd: "25.00",
      balanceUsdCents: 2500,
    } as any);

    const res = await monitor.checkBalances(5.0);

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier: "XPRO",
        balanceUsd: "3.50",
        thresholdUsd: 5.0,
      })
    );
    expect(res.XPRO?.alertSent).toBe(true);
    expect(monitor.isAlerted("XPRO")).toBe(true);
  });

  it("coalesces alerts: does not spam duplicate alerts on subsequent low balance checks", async () => {
    vi.mocked(xproClient.getBalance).mockResolvedValue({
      balanceUsd: "3.50",
      balanceUsdCents: 350,
    } as any);
    vi.mocked(digitalcoreClient.getBalance).mockResolvedValue({
      balanceUsd: "25.00",
      balanceUsdCents: 2500,
    } as any);

    // First check: triggers alert
    await monitor.checkBalances(5.0);
    expect(notifySpy).toHaveBeenCalledTimes(1);

    // Second check (balance still low, e.g. 2.00): must NOT send another alert
    vi.mocked(xproClient.getBalance).mockResolvedValue({
      balanceUsd: "2.00",
      balanceUsdCents: 200,
    } as any);
    const secondRes = await monitor.checkBalances(5.0);
    expect(notifySpy).toHaveBeenCalledTimes(1); // Still 1!
    expect(secondRes.XPRO?.alertSent).toBe(false);
    expect(monitor.isAlerted("XPRO")).toBe(true);
  });

  it("re-arms when balance recovers and alerts again on a subsequent drop", async () => {
    // 1. Drop below threshold -> alert sent
    vi.mocked(xproClient.getBalance).mockResolvedValue({
      balanceUsd: "1.00",
      balanceUsdCents: 100,
    } as any);
    await monitor.checkBalances(5.0);
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(monitor.isAlerted("XPRO")).toBe(true);

    // 2. Topped up above threshold ($20.00) -> re-arms
    vi.mocked(xproClient.getBalance).mockResolvedValue({
      balanceUsd: "20.00",
      balanceUsdCents: 2000,
    } as any);
    await monitor.checkBalances(5.0);
    expect(notifySpy).toHaveBeenCalledTimes(1); // No new alert
    expect(monitor.isAlerted("XPRO")).toBe(false); // Re-armed!

    // 3. Drops below threshold again ($4.99) -> alert sent again!
    vi.mocked(xproClient.getBalance).mockResolvedValue({
      balanceUsd: "4.99",
      balanceUsdCents: 499,
    } as any);
    await monitor.checkBalances(5.0);
    expect(notifySpy).toHaveBeenCalledTimes(2); // Second alert triggered!
    expect(monitor.isAlerted("XPRO")).toBe(true);
  });
});
