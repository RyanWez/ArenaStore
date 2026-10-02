/**
 * Automatic catalog sync scheduler.
 *
 * Runs syncFullCatalog once at startup and then on a fixed interval, so
 * products, prices, and supplier stock stay fresh even if an admin never
 * presses "Sync Catalog". Deliberately a plain setInterval inside the API
 * process instead of BullMQ/Redis: the sync is a single idempotent batch
 * upsert, and this app must keep working without Redis.
 */

export interface CatalogSyncResult {
  categories: number;
  products: number;
}

export interface SchedulerLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
}

export interface CatalogSchedulerHandle {
  /** Stops the interval; safe to call multiple times. */
  stop: () => void;
}

export interface StartSchedulerOptions {
  /** Minutes between syncs; 0 (or less) disables scheduling entirely. */
  intervalMinutes: number;
  /** The sync function (usually catalogService.syncFullCatalog). */
  sync: () => Promise<CatalogSyncResult>;
  log?: SchedulerLogger;
}

const defaultLogger: SchedulerLogger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};

export function startCatalogSyncScheduler(options: StartSchedulerOptions): CatalogSchedulerHandle {
  const { intervalMinutes, sync } = options;
  const log = options.log ?? defaultLogger;

  if (intervalMinutes <= 0) {
    log.info("[CatalogScheduler] Disabled (CATALOG_SYNC_INTERVAL_MINUTES=0).");
    return { stop: () => {} };
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const runSync = async (trigger: "startup" | "scheduled") => {
    if (running || stopped) return;
    running = true;
    const startedAt = Date.now();
    try {
      const result = await sync();
      log.info(
        `[CatalogScheduler] ${trigger} sync completed in ${Date.now() - startedAt}ms ` +
          `(${result.categories} categories, ${result.products} products).`
      );
    } catch (err: any) {
      log.warn(`[CatalogScheduler] ${trigger} sync failed: ${err.message}`);
    } finally {
      running = false;
    }
  };

  const handle: CatalogSchedulerHandle = {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };

  // First sync immediately (replaces the old one-shot startup sync), then
  // keep refreshing on the configured cadence.
  void runSync("startup");
  timer = setInterval(() => {
    void runSync("scheduled");
  }, intervalMs);

  log.info(`[CatalogScheduler] Started: syncing the catalog every ${intervalMinutes} minute(s).`);
  return handle;
}
