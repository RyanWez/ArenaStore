import crypto from "node:crypto";
import { Bot, InlineKeyboard } from "grammy";
import { storeAuthService, botOrderService } from "@arena/core";
import { BOT_EMOJIS, tgEmoji, escapeHtml } from "@arena/shared";
import { BotContext } from "../types";

const TICKET_ID_REGEX = /^tk_[a-f0-9]{24}$/;
const CODE_REGEX = /^\d{4}$/;

/**
 * Handles incoming Telegram deep-links: /start login_<ticketId>
 */
export async function handleWebLoginDeepLink(ctx: BotContext, ticketId: string): Promise<void> {
  if (!ctx.from?.id) return;

  if (!TICKET_ID_REGEX.test(ticketId)) {
    await ctx.reply(
      `${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <b>မှားယွင်းသော Login Request ဖြစ်ပါသည်</b>\n\n` +
      `ကျေးဇူးပြု၍ Website မှ QR Code သို့မဟုတ် Link အသစ်ကို ပြန်လည် စတင်ပေးပါခင်ဗျာ။`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // Account status check
  const telegramId = String(ctx.from.id);
  const userData = await botOrderService.getOrCreateUser({
    telegramId,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name || null,
    username: ctx.from.username || null,
  });

  if (userData && userData.user.status !== "ACTIVE") {
    await ctx.reply(
      `${tgEmoji(BOT_EMOJIS.CANCEL, "❌")} <b>အကောင့်ကို ပိတ်ပင်ထားပါသည်</b>\n\n` +
      `သင့်အကောင့်သည် လောလောဆယ်တွင် အသုံးပြုခွင့် ရပ်ဆိုင်းထားခြင်း ခံထားရပါသဖြင့် Website သို့ Login ဝင်ရောက်၍ မရနိုင်ပါခင်ဗျာ။`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const ticket = await storeAuthService.getTicket(ticketId);

  if (!ticket || ticket.status === "EXPIRED" || ticket.status === "CONSUMED") {
    await ctx.reply(
      `${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <b>Login Request သက်တမ်းကုန်ဆုံး သို့မဟုတ် သုံးပြီးဖြစ်ပါသည်</b>\n\n` +
      `လုံခြုံရေးအရ Website Login Request တစ်ခုသည် ၅ မိနစ်သာ သက်တမ်းရှိပါသည်။\n` +
      `ကျေးဇူးပြု၍ Website တွင် Login ပြန်လည် စတင်ပေးပါခင်ဗျာ။`,
      { parse_mode: "HTML" }
    );
    return;
  }

  if (ticket.status === "CONFIRMED") {
    await ctx.reply(
      `${tgEmoji(BOT_EMOJIS.CHECK, "✅")} <b>ဤ Login Request သည် အတည်ပြုပြီးဖြစ်ပါသည်</b>\n\n` +
      `Website သို့ ပြန်သွားပြီး ဝယ်ယူမှုများကို ဆက်လက်လုပ်ဆောင်နိုင်ပါပြီခင်ဗျာ။`,
      { parse_mode: "HTML" }
    );
    return;
  }

  if (ticket.status === "CANCELLED") {
    await ctx.reply(
      `${tgEmoji(BOT_EMOJIS.CANCEL, "❌")} <b>ဤ Login Request သည် ပယ်ဖျက်ပြီးဖြစ်ပါသည်</b>\n\n` +
      `Website တွင် Login အသစ် ပြန်လည် စတင်ပေးပါခင်ဗျာ။`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // Generate 3 distinct 4-digit distractor codes
  const distractors = new Set<string>();
  while (distractors.size < 3) {
    const randomCode = crypto.randomInt(1000, 10000).toString();
    if (randomCode !== ticket.code) {
      distractors.add(randomCode);
    }
  }

  // Combine and shuffle codes
  const allCodes = [ticket.code, ...Array.from(distractors)];
  for (let i = allCodes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCodes[i], allCodes[j]] = [allCodes[j], allCodes[i]];
  }

  // Build 2x2 inline keyboard grid + red cancel button with animated icon
  const keyboard = new InlineKeyboard()
    .text(allCodes[0], `wlogin:${ticketId}:${allCodes[0]}`)
    .text(allCodes[1], `wlogin:${ticketId}:${allCodes[1]}`)
    .row()
    .text(allCodes[2], `wlogin:${ticketId}:${allCodes[2]}`)
    .text(allCodes[3], `wlogin:${ticketId}:${allCodes[3]}`)
    .row()
    .add({
      text: "ကျွန်တော် Login မဝင်ထားပါ",
      callback_data: `wlogin:${ticketId}:cancel`,
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
      style: "danger",
    } as any);

  const messageText =
    `${tgEmoji(BOT_EMOJIS.KEY, "🔐")} <b>Website Login အတည်ပြုခြင်း</b>\n\n` +
    `အောက်ပါ ကိရိယာမှ Arena Store Website သို့ Login ဝင်ရောက်ရန် ကြိုးစားနေပါသည်-\n` +
    `${tgEmoji(BOT_EMOJIS.LOCATION, "📍")} <b>ကိရိယာ:</b> ${escapeHtml(ticket.deviceSummary || "Browser")}\n` +
    `${tgEmoji(BOT_EMOJIS.GLOBE, "🌐")} <b>IP လိပ်စာ:</b> ${escapeHtml(ticket.ip || "Unknown")}\n\n` +
    `Website မျက်နှာပြင်တွင် ပေါ်နေသော <b>ဂဏန်းနံပါတ် 4လုံး</b> နှင့် တူရာကို \n ရွေးချယ်နှိပ်ပေးပါခင်ဗျာ ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}\n\n` +
    `${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <i>သင်ကိုယ်တိုင် Website တွင် Login ဝင်ရောက်ရန် ကြိုးစားခြင်း မဟုတ်ပါက မည်သည့်နံပါတ်ကိုမျှ မနှိပ်ဘဲ ချက်ချင်း ပယ်ဖျက်ပါခင်ဗျာ။</i>`;

  await ctx.reply(messageText, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

/**
 * Registers callback handlers for Web Login matching buttons.
 */
export function registerWebLoginCallbacks(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^wlogin:(tk_[a-f0-9]{24}):(\w+)$/, async (ctx) => {
    const match = ctx.match;
    const ticketId = match[1];
    const action = match[2];

    await ctx.answerCallbackQuery().catch(() => {});

    // Guard: only allow "cancel" or strictly 4 digits
    if (action !== "cancel" && !CODE_REGEX.test(action)) {
      return;
    }

    // Case 1: User explicitly rejected/cancelled
    if (action === "cancel") {
      await storeAuthService.cancelTicket(ticketId, "USER_CANCELLED");
      await ctx.editMessageText(
        `${tgEmoji(BOT_EMOJIS.CANCEL, "❌")} <b>Website Login ကို ပယ်ဖျက်လိုက်ပါပြီခင်ဗျာ။</b>\n\n` +
        `မိမိကိုယ်တိုင် Login ဝင်ရောက်ရန် ကြိုးစားခြင်း မဟုတ်ပါက မည်သည့်အရာမှ ပြုလုပ်ရန် မလိုပါ။`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      return;
    }

    // Case 2: Code selection
    const ticket = await storeAuthService.getTicket(ticketId);
    if (!ticket || ticket.status !== "PENDING") {
      await ctx.editMessageText(
        `${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <b>Login Request သက်တမ်းကုန်ဆုံး သို့မဟုတ် ပြီးစီးသွားပါပြီခင်ဗျာ။</b>`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      return;
    }

    // Account status guard
    if (ctx.from?.id) {
      const userData = await botOrderService.getOrCreateUser({
        telegramId: String(ctx.from.id),
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name || null,
        username: ctx.from.username || null,
      });

      if (userData && userData.user.status !== "ACTIVE") {
        await storeAuthService.cancelTicket(ticketId, "ACCOUNT_SUSPENDED");
        await ctx.editMessageText(
          `${tgEmoji(BOT_EMOJIS.CANCEL, "❌")} <b>အကောင့်ကို ပိတ်ပင်ထားပါသည်</b>\n\n` +
          `သင့်အကောင့်သည် အသုံးပြုခွင့် ရပ်ဆိုင်းထားခြင်း ခံထားရပါသဖြင့် Website သို့ Login မပြုလုပ်နိုင်ပါ။`,
          { parse_mode: "HTML" }
        ).catch(() => {});
        return;
      }
    }

    // Timing-safe 4-digit code equality check
    const isMatch =
      action.length === ticket.code.length &&
      crypto.timingSafeEqual(Buffer.from(action), Buffer.from(ticket.code));

    if (isMatch) {
      // Correct Match!
      const telegramId = String(ctx.from?.id);
      await storeAuthService.confirmTicket(ticketId, telegramId, {
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name || null,
        username: ctx.from?.username || null,
      });

      await ctx.editMessageText(
        `${tgEmoji(BOT_EMOJIS.CHECK, "✅")} <b>Login အောင်မြင်ပါသည်!</b>\n\n` +
        `Website သို့ ပြန်သွားပြီး ဝယ်ယူမှုများကို ဆက်လက်လုပ်ဆောင်နိုင်ပါပြီခင်ဗျာ။`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    } else {
      // Wrong Code - Anti-brute force: invalidate immediately
      await storeAuthService.cancelTicket(ticketId, "WRONG_CODE_ATTEMPT");

      await ctx.editMessageText(
        `${tgEmoji(BOT_EMOJIS.CANCEL, "❌")} <b>နံပါတ် မှားယွင်းပါသည်!</b>\n\n` +
        `လုံခြုံရေးအရ ဤ Login Request ကို ပယ်ဖျက်လိုက်ပါပြီ။ Website တွင် ပြန်လည် စတင်ပေးပါခင်ဗျာ။`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  });
}
