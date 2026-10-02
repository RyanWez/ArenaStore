import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startCatalogSyncScheduler,
  type CatalogSyncResult,
  type SchedulerLogger,
} from "../../apps/api/src/services/catalog-scheduler";

/**
 * Unit tests for the automatic catalog sync scheduler (pure timer logic —
 * no database, no upstream).
 */

const INTERVAL_MINUTES = 10;
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

function makeSync(impl?: () => Promise<CatalogSyncResult>) {
  return vi.fn(impl ?? (async () => ({ categories: 24, products: 42 })));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Catalog sync scheduler", () => {
  it("is fully disabled when intervalMinutes is 0", async () => {
    const sync = makeSync();
    const logger = makeLogger();

    const handle = startCatalogSyncScheduler({ intervalMinutes: 0, sync, log: logger });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    expect(sync).not.toHaveBeenCalled();
    expect(logger.infos.some((m) => m.includes("Disabled"))).toBe(true);

    handle.stop();
  });

  it("runs the first sync immediately on start, then on every interval tick", async () => {
    const sync = makeSync();
    const handle = startCatalogSyncScheduler({ intervalMinutes: INTERVAL_MINUTES, sync });

    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(3);

    handle.stop();
  });

  it("skips a tick while the previous sync is still running (overlap guard)", async () => {
    let resolveFirst!: (value: CatalogSyncResult) => void;
    const sync = makeSync();
    sync.mockImplementationOnce(
      () =>
        new Promise<CatalogSyncResult>((resolve) => {
          resolveFirst = resolve;
        })
    );

    const handle = startCatalogSyncScheduler({ intervalMinutes: INTERVAL_MINUTES, sync });
    expect(sync).toHaveBeenCalledTimes(1);

    // Tick arrives while the first sync is still pending — must be skipped.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(1);

    // First sync finishes; the next tick runs again.
    resolveFirst({ categories: 1, products: 1 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it("keeps the timer alive after a failed sync and logs a warning", async () => {
    const sync = makeSync();
    sync.mockImplementationOnce(async () => {
      throw new Error("upstream offline simulation");
    });
    const logger = makeLogger();

    const handle = startCatalogSyncScheduler({ intervalMinutes: INTERVAL_MINUTES, sync, log: logger });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(logger.warns.some((m) => m.includes("upstream offline simulation"))).toBe(true);

    // The scheduler must survive the failure and retry on the next tick.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it("stops cleanly: stop() prevents all further runs and is idempotent", async () => {
    const sync = makeSync();
    const handle = startCatalogSyncScheduler({ intervalMinutes: INTERVAL_MINUTES, sync });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);

    handle.stop();
    handle.stop();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
