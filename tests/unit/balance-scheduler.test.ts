import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startBalanceCheckScheduler,
  type SchedulerLogger,
} from "../../apps/api/src/services/catalog-scheduler";

/**
 * Unit tests for the dedicated supplier-balance scheduler (pure timer logic).
 */

const INTERVAL_MINUTES = 2;
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

function makeLogger(): SchedulerLogger & { infos: string[]; warns: string[] } {
  const infos: string[] = [];
  const warns: string[] = [];
  return {
    infos,
    warns,
    info: (message) => infos.push(message),
    warn: (message) => warns.push(message),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Balance check scheduler", () => {
  it("is fully disabled when intervalMinutes is 0", async () => {
    const check = vi.fn(async () => ({}));
    const logger = makeLogger();

    const handle = startBalanceCheckScheduler({ intervalMinutes: 0, check, log: logger });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    expect(check).not.toHaveBeenCalled();
    expect(logger.infos.some((m) => m.includes("Disabled"))).toBe(true);

    handle.stop();
  });

  it("checks immediately on start, then on every interval tick", async () => {
    const check = vi.fn(async () => ({}));
    const handle = startBalanceCheckScheduler({ intervalMinutes: INTERVAL_MINUTES, check });

    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(3);

    handle.stop();
  });

  it("keeps the timer alive after a failed check and logs a warning", async () => {
    const check = vi.fn(async () => {
      throw new Error("upstream balance endpoint offline");
    });
    const logger = makeLogger();

    const handle = startBalanceCheckScheduler({ intervalMinutes: INTERVAL_MINUTES, check, log: logger });
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.warns.some((m) => m.includes("upstream balance endpoint offline"))).toBe(true);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);

    handle.stop();
  });
});
