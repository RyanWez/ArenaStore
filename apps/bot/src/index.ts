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

  const me = await bot.api.getMe();
  console.log(`🤖 Arena Store Telegram Bot running as @${me.username} (ID: ${me.id})`);
  console.log(`✨ Custom Emojis (icon_custom_emoji_id) and MMK Pricing active.`);

  // Automatically register bot menu commands in Telegram UI
  try {
    await bot.api.setMyCommands([
      { command: "start", description: "Start Arena Store" },
      { command: "menu", description: "Open Main Menu" },
    ]);
    console.log("📋 Bot menu commands registered: /start and /menu");
  } catch (err: any) {
    console.warn("Could not register bot commands:", err.message);
  }

  // Graceful shutdown: stop long polling, then flush pending Sentry events.
  let isPolling = false;
  for (const signal of ["SIGINT", "SIGTERM"] as NodeJS.Signals[]) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}, stopping bot...`);
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

  // Start polling
  bot.start({
    onStart: (botInfo) => {
      isPolling = true;
      console.log(`🚀 Storefront bot @${botInfo.username} listening for customer updates!`);
    },
  });
}

main().catch((err) => {
  Sentry.captureException(err);
  console.error("Failed to start Telegram Bot:", err);
  process.exit(1);
});
