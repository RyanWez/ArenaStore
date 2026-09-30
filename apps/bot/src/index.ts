import { createBot } from "./bot";

async function main() {
  const bot = createBot();

  // Error boundary
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[Telegram Bot Error] Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
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

  // Start polling
  bot.start({
    onStart: (botInfo) => {
      console.log(`🚀 Storefront bot @${botInfo.username} listening for customer updates!`);
    },
  });
}

main().catch((err) => {
  console.error("Failed to start Telegram Bot:", err);
  process.exit(1);
});
