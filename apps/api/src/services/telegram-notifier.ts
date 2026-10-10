import { config } from "../config";
import {
  BOT_EMOJIS,
  tgEmoji,
  escapeHtml,
  parseCustomEmoji,
  findBrandEmojiId,
  buildReviewOutcomeCaption,
} from "@arena/shared";
import { formatCredentialsText } from "./encryption";
import { getDb, appSettings } from "@arena/db";
import { eq } from "drizzle-orm";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  messageThreadId?: number
): Promise<boolean> {
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
        ...(messageThreadId && messageThreadId > 0 ? { message_thread_id: messageThreadId } : {}),
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
 * sendMessage with Telegram flood handling for high-volume broadcast paths:
 * a 429 waits `retry_after` seconds and retries, transient network drops get
 * a short backoff retry. Single-recipient notifies keep sendTelegramMessage.
 */
export async function sendTelegramMessageFloodAware(chatId: string, text: string): Promise<boolean> {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.warn("[Telegram Notifier] No TELEGRAM_BOT_TOKEN configured, skipped sending message to", chatId);
    return false;
  }

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      });
      if (res.ok) return true;

      const errJson: any = await res.json().catch(() => ({}));
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(errJson?.parameters?.retry_after) || 3;
        console.warn(`[Telegram Notifier] Flood limit hit for ${chatId} — waiting ${retryAfter}s before retry.`);
        await sleep(retryAfter * 1000 + 250);
        continue;
      }
      console.error("[Telegram Notifier] Failed to send message:", errJson);
      return false;
    } catch (err: any) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * attempt);
        continue;
      }
      console.error("[Telegram Notifier] Network error sending message:", err.message);
      return false;
    }
  }
  return false;
}

export interface TelegramBroadcastItemOptions {
  chatId: string;
  text: string;
  imageUrl?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
}

export interface TelegramBroadcastItemResult {
  success: boolean;
  blocked?: boolean;
  error?: string;
}

/**
 * Enhanced broadcast sender that supports photo with caption, optional inline CTA button,
 * flood wait handling (429), and user block detection (403).
 */
export async function sendTelegramBroadcastItem(
  options: TelegramBroadcastItemOptions
): Promise<TelegramBroadcastItemResult> {
  const { chatId, text, imageUrl, buttonText, buttonUrl } = options;
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.warn("[Telegram Notifier] No TELEGRAM_BOT_TOKEN configured, skipped sending broadcast to", chatId);
    return { success: false, error: "NO_BOT_TOKEN" };
  }

  const hasPhoto = Boolean(imageUrl && imageUrl.trim());
  const method = hasPhoto ? "sendPhoto" : "sendMessage";
  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`;

  const replyMarkup =
    buttonText && buttonText.trim() && buttonUrl && buttonUrl.trim()
      ? {
          inline_keyboard: [
            [
              {
                text: buttonText.trim(),
                url: buttonUrl.trim(),
              },
            ],
          ],
        }
      : undefined;

  const body: Record<string, any> = {
    chat_id: chatId,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };

  if (hasPhoto) {
    body.photo = imageUrl!.trim();
    body.caption = text;
  } else {
    body.text = text;
  }

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return { success: true };
      }

      const errJson: any = await res.json().catch(() => ({}));
      const description = String(errJson?.description || "").toLowerCase();

      // Detect blocked user or chat not found (403 or 400 with specific text)
      if (
        res.status === 403 ||
        description.includes("bot was blocked by the user") ||
        description.includes("user is deactivated") ||
        description.includes("chat not found")
      ) {
        return { success: false, blocked: true, error: errJson?.description || "BLOCKED_BY_USER" };
      }

      // Detect flood limit (429)
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(errJson?.parameters?.retry_after) || 3;
        console.warn(`[Telegram Notifier] Flood limit hit for ${chatId} — waiting ${retryAfter}s before retry.`);
        await sleep(retryAfter * 1000 + 250);
        continue;
      }

      console.error("[Telegram Notifier] Failed to send broadcast message:", errJson);
      return { success: false, error: errJson?.description || `HTTP_${res.status}` };
    } catch (err: any) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * attempt);
        continue;
      }
      console.error("[Telegram Notifier] Network error sending broadcast:", err.message);
      return { success: false, error: err.message || "NETWORK_ERROR" };
    }
  }

  return { success: false, error: "MAX_RETRIES_EXCEEDED" };
}

/**
 * Builds the customer-facing "Restocked!" broadcast message in Burmese.
 * Product display mirrors the bot's product cards: custom brand emoji,
 * clear MMK pricing, in-stock status, and an engaging Burmese CTA with deep link.
 */
export function buildRestockedMessage(params: {
  productName: string;
  priceMmk: number;
  botUsername?: string | null;
  productId?: number;
}): string {
  const parsed = parseCustomEmoji(params.productName || "");
  const displayName = parsed.cleanText || params.productName;
  const emojiId = parsed.emojiId || findBrandEmojiId(displayName);
  const productEmoji = emojiId ? tgEmoji(emojiId, "🎁") : "🎁";
  const party = tgEmoji(BOT_EMOJIS.PARTY, "🎉");
  const sparkles = tgEmoji(BOT_EMOJIS.SPARKLES, "✨");
  const price = tgEmoji(BOT_EMOJIS.PRICE, "💵");
  const bags = tgEmoji(BOT_EMOJIS.BAGS, "🛍");
  const check = tgEmoji(BOT_EMOJIS.CHECK, "✅");
  const downArrow = tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇");

  let cta = `👉 Bot ထဲသို့ ဝင်ရောက်ပြီး ${bags} <b>[ ပစ္စည်း ဝယ်ယူရန် ]</b> ကို နှိပ်၍ အမြန်ဆုံး ဝယ်ယူလိုက်ပါခင်ဗျာ ${downArrow}`;
  const botUsername = (params.botUsername || "").replace(/^@/, "");
  if (botUsername && params.productId) {
    cta =
      `👉 အောက်ပါ ${bags} ` +
      `<b><a href="https://t.me/${botUsername}?start=restock_${params.productId}">[ ပစ္စည်း ဝယ်ယူရန် ]</a></b> ကို နှိပ်ပြီး အမြန်ဆုံး ဝယ်ယူလိုက်ပါခင်ဗျာ ${downArrow}`;
  }

  return (
    `<blockquote>${party} <b>Restocked!</b> <b>စတော့ ပြန်လည်ရရှိပါပြီ</b> ❞\n` +
    `ပစ္စည်း စတော့အသစ် ထပ်မံဖြည့်တင်းထားပါသည်ခင်ဗျာ ${sparkles}</blockquote>\n\n` +
    `${productEmoji} <b>${escapeHtml(displayName)}</b>\n` +
    `${price} <b>စျေးနှုန်း:</b> <b>${params.priceMmk.toLocaleString("en-US")} Ks</b>\n` +
    `${check} <b>အခြေအနေ:</b> <b>In Stock</b> (အသင့်ဝယ်ယူနိုင်ပါသည်)\n\n` +
    `💡 <i>စတော့အရေအတွက် ကန့်သတ်ချက်လေး ရှိတာကြောင့် စတော့ရှိတုန်းလေး ဆွဲထားလိုက်ဗျာ!</i>\n\n` +
    cta
  );
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
 * Best-effort deletion of a message the bot previously sent (same bot token).
 * Used to clear the live MMQR invoice photo once payment is confirmed.
 */
export async function deleteTelegramMessage(chatId: string, messageId: number): Promise<boolean> {
  if (!config.TELEGRAM_BOT_TOKEN || !chatId || !messageId) return false;
  try {
    const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/deleteMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    return res.ok;
  } catch (err: any) {
    console.warn("[Telegram Notifier] deleteMessage failed:", err.message);
    return false;
  }
}

/**
 * Customer-facing confirmation for an auto-confirmed MyanMyanPay MMQR top-up.
 * Removes the live QR invoice photo (so no stale "Refresh/Cancel" lingers) and
 * posts a single success card. Called fire-and-forget by the webhook so the
 * gateway ack is never delayed by Telegram latency.
 */
export async function notifyMmpayTopUpSuccess(params: {
  telegramId: string;
  qrMessageId?: number | null;
  reference: string;
  amountMmk: number;
  newBalanceMmk: number;
}): Promise<void> {
  const { telegramId, qrMessageId, reference, amountMmk, newBalanceMmk } = params;

  if (qrMessageId) {
    await deleteTelegramMessage(telegramId, qrMessageId);
  }

  const check = tgEmoji(BOT_EMOJIS.CHECK);
  const sparkles = tgEmoji(BOT_EMOJIS.SPARKLES);
  const text =
    `<blockquote>${check} <b>MMQR ငွေပေးချေမှု အောင်မြင်ပါပြီ!</b> ❞\n` +
    `အော်ဒါ အမှတ်: <b>${escapeHtml(reference)}</b>\n` +
    `ဖြည့်သွင်းငွေ: <b>+${amountMmk.toLocaleString("en-US")} MMK</b>\n` +
    `လက်ရှိ Wallet Balance: <b>${newBalanceMmk.toLocaleString("en-US")} MMK</b></blockquote>\n\n` +
    `ကျေးဇူးတင်ရှိပါသည်ခင်ဗျာ! အခုပဲ ပစ္စည်းများကို ဆက်လက် ဝယ်ယူနိုင်ပါပြီ ${sparkles}`;

  await sendTelegramMessage(telegramId, text);
}
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

export interface SyncDepositReviewParams {
  outcome: "APPROVED" | "REJECTED";
  actorLabel: string;
  reference: string;
  amountMmk: number;
  customerLabel: string;
  telegramId?: string | null;
  postedAt: Date;
  chatId?: string | null;
  messageId?: number | null;
  topicId?: string | null;
  rejectReason?: string;
}

/**
 * Synchronizes a deposit slip review outcome to the Admin Telegram Group:
 * 1. Edits the original slip photo message in-place:
 *    - Updates caption with outcome + reviewer ("✅ @Admin က အတည်ပြုပြီး")
 *    - Removes inline buttons (reply_markup: { inline_keyboard: [] })
 * 2. If messageId is missing or editMessageCaption fails (e.g. > 48 hours),
 *    sends a clear settlement notice message to the deposit topic.
 */
export async function syncTelegramDepositReviewOutcome(params: SyncDepositReviewParams): Promise<boolean> {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.warn("[Telegram Notifier] No TELEGRAM_BOT_TOKEN configured, skipped syncing deposit review outcome to group");
    return false;
  }

  let chatId = params.chatId || config.TELEGRAM_GROUP_CHAT_ID;
  let topicId = params.topicId;

  if (!chatId || !topicId) {
    try {
      const db = getDb();
      const settings = await db
        .select()
        .from(appSettings)
        .where(
          eq(appSettings.key, "telegramGroupChatId")
        );
      if (!chatId && settings[0]?.value) {
        chatId = settings[0].value;
      }
      if (!topicId) {
        const [topicSetting] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, "telegramDepositTopicId"));
        if (topicSetting?.value) {
          topicId = topicSetting.value;
        }
      }
    } catch (err: any) {
      console.warn("[Telegram Notifier] Failed to read telegram settings from DB:", err.message);
    }
  }

  if (!chatId) {
    console.warn("[Telegram Notifier] No admin group chatId configured, skipped syncing deposit review.");
    return false;
  }

  const updatedCaption = buildReviewOutcomeCaption({
    outcome: params.outcome,
    actorLabel: params.actorLabel,
    reference: params.reference,
    amountMmk: params.amountMmk,
    customerLabel: params.customerLabel,
    telegramId: params.telegramId || undefined,
    postedAt: params.postedAt,
  });

  // 1. Try editing the original slip message in-place if messageId is known
  if (params.messageId && params.messageId > 0) {
    try {
      const editUrl = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/editMessageCaption`;
      const res = await fetch(editUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: params.messageId,
          caption: updatedCaption,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [] },
        }),
      });

      if (res.ok) {
        return true;
      }

      const errJson = await res.json().catch(() => ({}));
      console.warn(`[Telegram Notifier] editMessageCaption failed for message ${params.messageId}:`, errJson);
    } catch (err: any) {
      console.warn(`[Telegram Notifier] Network error during editMessageCaption:`, err.message);
    }
  }

  // 2. Fallback: If no messageId or edit failed (e.g. > 48h limit), post a settlement notice to the topic
  try {
    const threadIdNum = topicId ? parseInt(topicId, 10) : undefined;
    const receipt = tgEmoji(BOT_EMOJIS.RECEIPT, "🧾");
    const money = tgEmoji(BOT_EMOJIS.MONEY, "💰");
    const person = tgEmoji(BOT_EMOJIS.CHAT, "👤");
    const statusLine = params.outcome === "APPROVED"
      ? `✅ <b>${escapeHtml(params.actorLabel)}</b> က အတည်ပြုပြီး`
      : `❌ <b>${escapeHtml(params.actorLabel)}</b> က ပယ်ဖျက်ပြီး${params.rejectReason ? `\n<i>အကြောင်းပြချက်: ${escapeHtml(params.rejectReason)}</i>` : ""}`;

    const text =
      `${tgEmoji(BOT_EMOJIS.MONEY, "💰")} <b>Deposit Slip စစ်ဆေးပြီးပါပြီ</b>\n\n` +
      `${receipt} <b>Reference:</b> <code>${escapeHtml(params.reference)}</code>\n` +
      `${money} <b>ပမာဏ:</b> <b>${params.amountMmk.toLocaleString("en-US")} MMK</b>\n` +
      `${person} <b>ဝယ်ယူသူ:</b> ${escapeHtml(params.customerLabel)}\n\n` +
      `${statusLine}`;

    return await sendTelegramMessage(chatId, text, Number.isFinite(threadIdNum) && threadIdNum! > 0 ? threadIdNum : undefined);
  } catch (err: any) {
    console.error(`[Telegram Notifier] Fallback notice failed:`, err.message);
    return false;
  }
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
  const sparkles = tgEmoji(BOT_EMOJIS.SPARKLES, "✨");

  const cleanCredentials = formatCredentialsText(credentialsText);

  const text =
    `<blockquote>${party} <b>အော်ဒါ အချက်အလက်များ ပြန်လည်ပေးပို့ခြင်း</b> ❞\n` +
    `အော်ဒါနံပါတ်: <b>${escapeHtml(publicOrderNo)}</b>\n` +
    `ပစ္စည်း: <b>${escapeHtml(productName)}</b></blockquote>\n\n` +
    `${key} <b>သင့်အကောင့် / ကုဒ် အချက်အလက်များ:</b>\n` +
    `<pre><code>${escapeHtml(cleanCredentials)}</code></pre>\n\n` +
    `Arena Store ကို အားပေးသည့်အတွက် ကျေးဇူးအထူးတင်ရှိပါသည်! ${sparkles}`;

  return sendTelegramMessage(telegramId, text);
}

/**
 * Sends a wallet balance adjustment notification to the customer on Telegram.
 */
export async function notifyBalanceAdjusted(params: {
  telegramId: string;
  action: "CREDIT" | "DEBIT";
  amountMmk: number;
  newBalanceMmk: number;
  notes?: string;
}): Promise<boolean> {
  const { telegramId, action, amountMmk, newBalanceMmk, notes } = params;
  const isCredit = action === "CREDIT";
  const icon = isCredit
    ? tgEmoji(BOT_EMOJIS.MONEY, "💰")
    : tgEmoji(BOT_EMOJIS.WARNING, "⚠️");
  const sparkles = tgEmoji(BOT_EMOJIS.SPARKLES, "✨");
  const memo = tgEmoji(BOT_EMOJIS.RECEIPT, "📝");

  const actionTitle = isCredit
    ? "Wallet လက်ကျန်ငွေ ဖြည့်သွင်းပေးအပ်ပါသည်"
    : "Wallet လက်ကျန်ငွေ နှုတ်ယူပြင်ဆင်ပါသည်";
  const amountPrefix = isCredit ? "+" : "-";

  const text =
    `<blockquote>${icon} <b>${actionTitle}</b> ❞\n` +
    `ပမာဏ: <b>${amountPrefix}${amountMmk.toLocaleString("en-US")} Ks</b>\n` +
    `လက်ရှိ Wallet လက်ကျန်: <b>${newBalanceMmk.toLocaleString("en-US")} Ks</b></blockquote>\n\n` +
    `${memo} <b>အကြောင်းအရာ / မှတ်ချက်:</b>\n<i>${escapeHtml(notes || "System Administrator Adjustment")}</i>\n\n` +
    `ကျေးဇူးတင်ရှိပါသည်ခင်ဗျာ။ ${sparkles}`;

  return sendTelegramMessage(telegramId, text);
}

/**
 * Sends a low balance alert for an upstream supplier to the admin Telegram group.
 */
export async function notifyLowSupplierBalance(params: {
  supplier: string;
  balanceUsd: string;
  thresholdUsd: number;
}): Promise<boolean> {
  const { supplier, balanceUsd, thresholdUsd } = params;
  let chatId = config.TELEGRAM_GROUP_CHAT_ID;
  if (!chatId) {
    try {
      const db = getDb();
      const [setting] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, "telegramGroupChatId"));
      if (setting && setting.value) chatId = setting.value;
    } catch {
      // ignore
    }
  }

  if (!chatId) {
    console.warn("[Telegram Notifier] No admin group chatId configured for low balance alert.");
    return false;
  }

  // Route into the configured "Bot Alert" forum topic (DB value wins, env
  // fallback); empty/unset falls back to the group's General topic.
  let topicRaw = "";
  try {
    const db = getDb();
    const [setting] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "telegramBotAlertTopicId"));
    if (setting && setting.value) topicRaw = setting.value;
  } catch {
    // ignore
  }
  if (!topicRaw) topicRaw = config.TELEGRAM_BOT_ALERT_TOPIC_ID || "";
  const topicId = parseInt(topicRaw, 10);

  const warning = tgEmoji(BOT_EMOJIS.WARNING, "⚠️");
  const money = tgEmoji(BOT_EMOJIS.MONEY, "💰");

  const text =
    `<blockquote>${warning} <b>LOW SUPPLIER BALANCE ALERT</b> ❞\n\n` +
    `• <b>Supplier:</b> <code>${escapeHtml(supplier)}</code>\n` +
    `• <b>Current Balance:</b> <b>$${escapeHtml(balanceUsd)} USD</b>\n` +
    `• <b>Threshold:</b> $${thresholdUsd.toFixed(2)} USD</blockquote>\n\n` +
    `${money} ကျေးဇူးပြု၍ ${escapeHtml(supplier)} အကောင့်သို့ ငွေကြိုတင်ဖြည့်သွင်းပေးပါရန် အသိပေးအပ်ပါသည်။`;

  return sendTelegramMessage(chatId, text, Number.isFinite(topicId) && topicId > 0 ? topicId : undefined);
}

