import { config } from "../config";
import { BOT_EMOJIS, tgEmoji, escapeHtml } from "@arena/shared";

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

/**
 * Sends an order refund notification to the customer on Telegram.
 */
export async function notifyOrderRefunded(params: {
  telegramId: string;
  publicOrderNo: string;
  amountMmk: number;
  newBalanceMmk: number;
  reason?: string;
}): Promise<boolean> {
  const { telegramId, publicOrderNo, amountMmk, newBalanceMmk, reason } = params;
  const money = tgEmoji(BOT_EMOJIS.MONEY, "💰");
  const receipt = tgEmoji(BOT_EMOJIS.RECEIPT, "🧾");
  const sparkles = tgEmoji(BOT_EMOJIS.SPARKLES, "✨");

  const text =
    `<blockquote>${money} <b>အော်ဒါ ငွေပြန်အမ်းခြင်း ပြီးမြောက်ပါသည်</b> ❞\n` +
    `အော်ဒါအမှတ်: <b>${escapeHtml(publicOrderNo)}</b>\n` +
    `ပြန်အမ်းငွေ: <b>+${amountMmk.toLocaleString("en-US")} Ks</b>\n` +
    `လက်ကျန် Wallet: <b>${newBalanceMmk.toLocaleString("en-US")} Ks</b></blockquote>\n\n` +
    `${receipt} <b>အကြောင်းပြချက်:</b> <i>${escapeHtml(reason || "Admin Customer Support")}</i>\n\n` +
    `သင့်အော်ဒါအတွက် ငွေပမာဏကို Wallet ထဲသို့ ပြန်လည် ထည့်သွင်းပေးပြီးဖြစ်ပါသည်ခင်ဗျာ။ ${sparkles}`;

  return sendTelegramMessage(telegramId, text);
}

/**
 * Re-sends digital account / key credentials to the customer on Telegram.
 */
export async function notifyOrderCredentialsResent(params: {
  telegramId: string;
  publicOrderNo: string;
  productName: string;
  credentialsText: string;
}): Promise<boolean> {
  const { telegramId, publicOrderNo, productName, credentialsText } = params;
  const party = tgEmoji(BOT_EMOJIS.PARTY, "🎉");
  const key = tgEmoji(BOT_EMOJIS.KEY, "🔑");
  const warning = tgEmoji(BOT_EMOJIS.WARNING, "⚠️");
  const sparkles = tgEmoji(BOT_EMOJIS.SPARKLES, "✨");

  const text =
    `<blockquote>${party} <b>အော်ဒါ အချက်အလက်များ ပြန်လည်ပေးပို့ခြင်း</b> ❞\n` +
    `အော်ဒါနံပါတ်: <b>${escapeHtml(publicOrderNo)}</b>\n` +
    `ပစ္စည်း: <b>${escapeHtml(productName)}</b></blockquote>\n\n` +
    `${key} <b>သင့်အကောင့် / ကုဒ် အချက်အလက်များ:</b>\n` +
    `<pre><code>${escapeHtml(credentialsText)}</code></pre>\n\n` +
    `${warning} <b>လုံခြုံရေး သတိပေးချက်:</b>\n` +
    `မိမိအကောင့်၏ Password သို့မဟုတ် လုံခြုံရေးအချက်အလက်များကို ချက်ချင်း ပြောင်းလဲပြီး သိမ်းဆည်းထားပါရန် အကြံပြုအပ်ပါသည်။\n\n` +
    `Arena Store ကို အားပေးသည့်အတွက် ကျေးဇူးအထူးတင်ရှိပါသည်! ${sparkles}`;

  return sendTelegramMessage(telegramId, text);
}

