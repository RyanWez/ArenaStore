// Must stay the first import: Sentry instrumentation has to initialize before
// grammY handlers run (see instrument.ts).
import "./instrument";
import * as Sentry from "@sentry/node";
import { closeSentry } from "./instrument";
import { createBot } from "./bot";

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

  let isShuttingDown = false;
  let isPolling = false;

  // Graceful shutdown: stop long polling, then flush pending Sentry events.
  for (const signal of ["SIGINT", "SIGTERM"] as NodeJS.Signals[]) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}, stopping bot...`);
      isShuttingDown = true;
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
          await bot.api.setMyCommands([
            { command: "start", description: "Start Arena Store" },
            { command: "menu", description: "Open Main Menu" },
          ]).catch(() => {});
          console.log("📋 Bot menu commands registered: /start and /menu");
        } catch (connErr: any) {
          console.warn(`[Telegram Bot] Connection to Telegram API failed (${connErr.message}). Retrying in 5s...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
      }

      isPolling = true;
      bot.botInfo = botInfo;
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
