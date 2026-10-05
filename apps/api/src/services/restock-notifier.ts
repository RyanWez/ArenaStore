import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { appSettings, getDb, products, users } from "@arena/db";
import { catalogService } from "./catalog.service";
import { buildRestockedMessage, sendTelegramMessageFloodAware } from "./telegram-notifier";
import { config } from "../config";

/** app_settings key toggling restock broadcasts (missing / anything but "false" = enabled). */
const RESTOCK_TOGGLE_KEY = "restockNotificationsEnabled";

/**
 * Inter-message pause for the fan-out loop. Telegram caps bots at ~30
 * messages/second globally; ~20/s keeps a large broadcast under that without
 * stretching a small one.
 */
const BROADCAST_DELAY_MS = 50;

export interface RestockDetectionResult {
  /** Products that transitioned 0 -> positive sellable stock this pass. */
  restocked: number;
  /** Whether a Telegram broadcast was attempted. */
  notified: boolean;
}

interface RestockProductDetails {
  id: number;
  nameMmk: string;
  retailPriceMmk: number;
}

/**
 * Detects products whose sellable stock transitioned 0 -> positive and
 * broadcasts a "Restocked!" message to every active bot user.
 *
 * Sellable stock (calculateSellableStock) folds supplier stock, our upstream
 * wallet capacity, the local sale cap and checkout reservations into one
 * number — so ANY of those changing (supplier restock, wallet top-up, admin
 * limit raise, re-activation) flips a product back to buyable and is caught
 * by the same edge detector. Runs after each catalog sync tick; the observed
 * state is in-memory (first pass is a silent baseline, mirroring
 * SupplierBalanceMonitor) so a restart never replays the whole catalog.
 */
export class RestockNotifier {
  /** productId -> sellable stock observed on the previous pass. */
  private lastSellable = new Map<number, number>();
  private running = false;

  async detectAndNotify(): Promise<RestockDetectionResult> {
    // The sync scheduler serializes ticks; this guards stray concurrent calls
    // (e.g. a manual sync racing a tick) from double-broadcasting one edge.
    if (this.running) return { restocked: 0, notified: false };
    this.running = true;
    try {
      // Include paused products: they are not buyable, so they count as zero
      // stock — otherwise an admin re-activation (or a restock while paused)
      // would look like a brand-new product and never announce.
      const items = await catalogService.getSellableProducts({ activeOnly: false });
      const current = new Map(items.map((p) => [p.id, p.isActive ? p.sellableStock : 0]));

      // First pass after startup: record baseline silently — announcing the
      // entire in-stock catalog on boot would be spam, not signal.
      const hasBaseline = this.lastSellable.size > 0;
      const restocked = hasBaseline
        ? items.filter((p) => p.isActive && this.lastSellable.get(p.id) === 0 && p.sellableStock > 0)
        : [];

      // State refreshes even while disabled, so re-enabling never replays
      // stock that already came back during the off period.
      this.lastSellable = current;

      if (restocked.length === 0) return { restocked: 0, notified: false };

      if (!(await this.isNotificationsEnabled())) {
        console.log(
          `[RestockNotifier] ${restocked.length} product(s) restocked — notifications disabled, skipped.`
        );
        return { restocked: restocked.length, notified: false };
      }

      if (!config.TELEGRAM_BOT_TOKEN) {
        console.warn("[RestockNotifier] No TELEGRAM_BOT_TOKEN configured — restock broadcast skipped.");
        return { restocked: restocked.length, notified: false };
      }

      const [details, recipients] = await Promise.all([
        this.fetchProductDetails(restocked.map((p) => p.id)),
        this.fetchRecipients(),
      ]);
      if (recipients.length === 0) {
        console.warn("[RestockNotifier] No active bot users to notify.");
        return { restocked: restocked.length, notified: false };
      }

      let delivered = 0;
      for (const product of details) {
        const text = buildRestockedMessage({
          productName: product.nameMmk,
          priceMmk: product.retailPriceMmk,
          botUsername: config.TELEGRAM_BOT_USERNAME || null,
          productId: product.id,
        });
        for (const telegramId of recipients) {
          if (await sendTelegramMessageFloodAware(telegramId, text)) delivered++;
          await new Promise((resolve) => setTimeout(resolve, BROADCAST_DELAY_MS));
        }
      }

      console.log(
        `[RestockNotifier] ${restocked.length} restocked product(s) announced to ${recipients.length} user(s) (${delivered} messages sent).`
      );
      return { restocked: restocked.length, notified: delivered > 0 };
    } finally {
      this.running = false;
    }
  }

  /** app_settings toggle, defaulting to enabled; DB failure fails open. */
  async isNotificationsEnabled(): Promise<boolean> {
    try {
      const db = getDb();
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, RESTOCK_TOGGLE_KEY));
      if (!row || !row.value) return true;
      return row.value.trim().toLowerCase() !== "false";
    } catch {
      return true;
    }
  }

  /**
   * Everyone who ever used the bot: persisted telegram users that are active
   * customers. Staff roles are excluded so admins don't get customer blasts.
   */
  private async fetchRecipients(): Promise<string[]> {
    const db = getDb();
    const rows = await db
      .select({ telegramId: users.telegramId })
      .from(users)
      .where(
        and(
          isNotNull(users.telegramId),
          eq(users.status, "ACTIVE"),
          ne(users.role, "ADMIN"),
          ne(users.role, "SUPERADMIN")
        )
      );
    return rows.map((r) => r.telegramId).filter((id): id is string => Boolean(id));
  }

  private async fetchProductDetails(ids: number[]): Promise<RestockProductDetails[]> {
    const db = getDb();
    return db
      .select({
        id: products.id,
        nameMmk: products.nameMmk,
        retailPriceMmk: products.retailPriceMmk,
      })
      .from(products)
      .where(inArray(products.id, ids));
  }

  /** Test hook: clears the in-memory baseline. */
  reset(): void {
    this.lastSellable.clear();
  }
}

export const restockNotifier = new RestockNotifier();
