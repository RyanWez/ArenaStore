import { config } from "../config";
import { BOT_EMOJIS, tgEmoji } from "@arena/shared";

export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.warn("[Telegram Notifier] No TELEGRAM_BOT_TOKEN configured, skipped sending message to", chatId);
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      console.error("[Telegram Notifier] Failed to send message:", errJson);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error("[Telegram Notifier] Network error sending message:", err.message);
    return false;
  }
}

/**
 * Sends a wallet top-up approval notification to the user in Telegram.
 */
export async function notifyTopUpApproved(params: {
  telegramId: string;
  reference: string;
  amountMmk: number;
  newBalanceMmk: number;
}): Promise<boolean> {
  const { telegramId, reference, amountMmk, newBalanceMmk } = params;
  const party = tgEmoji(BOT_EMOJIS.PARTY);
  const sparkles = tgEmoji(BOT_EMOJIS.SPARKLES);
  const money = tgEmoji(BOT_EMOJIS.MONEY);
  const check = tgEmoji(BOT_EMOJIS.CHECK);
  const bags = tgEmoji(BOT_EMOJIS.BAGS);

  const text =
    `${party} <b>ငွေသွင်းမှု အောင်မြင်ပါသည်!</b>\n\n` +
    `${check} <b>Top-Up Reference:</b> <code>${reference}</code>\n` +
    `${money} <b>သွင်းငွေ ပမာဏ:</b> +${amountMmk.toLocaleString("en-US")} Ks\n` +
    `${sparkles} <b>လက်ကျန် Wallet Balance:</b> <b>${newBalanceMmk.toLocaleString("en-US")} Ks</b>\n\n` +
    `${bags} မိမိစိတ်ကြိုက် ဝန်ဆောင်မှုနှင့် ကုန်ပစ္စည်းများကို <b>Buy Now</b> ဖြင့် ချက်ချင်း ဝယ်ယူနိုင်ပါပြီခင်ဗျာ။`;

  return sendTelegramMessage(telegramId, text);
}

/**
 * Sends a wallet top-up rejection notification to the user in Telegram.
 */
export async function notifyTopUpRejected(params: {
  telegramId: string;
  reference: string;
  amountMmk: number;
  reason: string;
}): Promise<boolean> {
  const { telegramId, reference, amountMmk, reason } = params;
  const cancel = tgEmoji(BOT_EMOJIS.CANCEL);
  const warning = tgEmoji(BOT_EMOJIS.WARNING);
  const chat = tgEmoji(BOT_EMOJIS.CHAT);

  const text =
    `${cancel} <b>ငွေသွင်းမှု ပယ်ဖျက်ခံရပါသည်</b>\n\n` +
    `<b>Top-Up Reference:</b> <code>${reference}</code>\n` +
    `<b>ပမာဏ:</b> ${amountMmk.toLocaleString("en-US")} Ks\n` +
    `${warning} <b>အကြောင်းပြချက်:</b> <i>${reason}</i>\n\n` +
    `${chat} အချက်အလက်များ လွဲမှားနေပါက သို့မဟုတ် အကူအညီ လိုအပ်ပါက Admin Support သို့ ဆက်သွယ်နိုင်ပါသည်။`;

  return sendTelegramMessage(telegramId, text);
}
