import http from "node:http";
import { webhookCallback } from "grammy";
import "./instrument";
import * as Sentry from "@sentry/node";
import { closeSentry } from "./instrument";
import { createBot, BOT_COMMANDS } from "./bot";
import { startMmpayInvoiceScheduler } from "./services/mmpay-invoice-scheduler";

// Last-resort fault handlers, mirroring the API: an uncaught exception means
// unknown process state (log, flush, exit — Render restarts), while a stray
// unhandled rejection only gets logged so one bad promise cannot take the
// bot offline for every customer.
process.on("uncaughtException", (err) => {
  console.error("[Bot] Uncaught exception:", err);
  Sentry.captureException(err);
  void closeSentry();
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Bot] Unhandled promise rejection:", reason);
  Sentry.captureException(reason);
});

async function main() {
  const bot = createBot();

  // Error boundary
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[Telegram Bot Error] Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    // No-op unless SENTRY_DSN is set (the SDK is only initialized then).
    Sentry.captureException(e);
    console.error(e);
  });

  // Background sweep: live MMQR countdown refresh + auto-expiry (no customer
  // Refresh needed). Runs independently of polling/webhook mode.
  const invoiceScheduler = startMmpayInvoiceScheduler(bot);

  let isShuttingDown = false;
  let isPolling = false;

  // Graceful shutdown: stop long polling, then flush pending Sentry events.
  for (const signal of ["SIGINT", "SIGTERM"] as NodeJS.Signals[]) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}, stopping bot...`);
      isShuttingDown = true;
      invoiceScheduler.stop();
      if (isPolling) {
        await Promise.race([
          bot.stop().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }
      await closeSentry();
      process.exit(0);
    });
  }

  // Resilient runner: fetches bot info and runs polling with auto-reconnect
  let botInfo: any = null;
  while (!isShuttingDown) {
    try {
      if (!botInfo) {
        try {
          botInfo = await bot.api.getMe();
          console.log(`🤖 Arena Store Telegram Bot running as @${botInfo.username} (ID: ${botInfo.id})`);
          console.log(`✨ Custom Emojis (icon_custom_emoji_id) and MMK Pricing active.`);
          await bot.api.setMyCommands(BOT_COMMANDS as any).catch(() => {});
          console.log(`📋 Bot menu commands registered: ${BOT_COMMANDS.map((c) => `/${c.command}`).join(", ")}`);
        } catch (connErr: any) {
          console.warn(`[Telegram Bot] Connection to Telegram API failed (${connErr.message}). Retrying in 5s...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
      }

      bot.botInfo = botInfo;

      if (process.env.BOT_MODE === "webhook") {
        const webhookPort = Number(process.env.BOT_PORT || process.env.PORT || 3001);
        const webhookSecret = process.env.BOT_WEBHOOK_SECRET;
        const webhookUrl = process.env.BOT_WEBHOOK_URL;
        if (webhookUrl) {
          try {
            await bot.api.setWebhook(webhookUrl, { secret_token: webhookSecret });
            console.log(`📡 [Telegram Bot] Webhook URL registered with Telegram: ${webhookUrl}`);
          } catch (whErr: any) {
            console.warn(`[Telegram Bot] Failed to register webhook: ${whErr?.message || whErr}`);
          }
        }
        const server = http.createServer(webhookCallback(bot, "http", { secretToken: webhookSecret }));
        server.listen(webhookPort, () => {
          console.log(`🚀 Storefront bot @${botInfo.username} running in WEBHOOK mode on port ${webhookPort}!`);
        });
        return;
      }

      isPolling = true;
      await bot.start({
        onStart: (info) => {
          console.log(`🚀 Storefront bot @${info.username} listening for customer updates!`);
        },
      });
    } catch (err: any) {
      isPolling = false;
      if (isShuttingDown) break;
      console.warn(`[Telegram Bot] Polling interrupted (${err.message}). Reconnecting in 5s...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch((err) => {
  Sentry.captureException(err);
  console.error("Fatal error in bot main runner:", err);
});
