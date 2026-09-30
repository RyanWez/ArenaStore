import { BotCategory, BotProduct } from "../services/catalog.service";
import { botConfig } from "../config";
import { escapeHtml, BOT_EMOJIS, tgEmoji } from "@arena/shared";

/**
 * Formats the Welcome /start greeting message with animated custom emojis.
 */
export function formatStartMessage(firstName: string): string {
  return `${tgEmoji(BOT_EMOJIS.WAVE, "👋")} မင်္ဂလာပါ <b>${escapeHtml(firstName)}</b>,

<b>Arena Store</b> မှ ကြိုဆိုပါတယ်ဗျာ! ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}\n
AI Tools များနှင့် Digital Products များကို မြန်မာကျပ်ငွေ (MMK) ဖြင့် လွယ်ကူလျင်မြန်စွာ ဝယ်ယူနိုင်ပါတယ် ခင်ဗျာ။\n
ဝယ်ယူလိုသော ပစ္စည်း အမျိုးအစားများကို ရွေးချယ်ရန် အောက်ပါ ခလုတ်ကို နှိပ်ပါ ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`;
}

/**
 * Formats the Categories header message matching Screenshot 1.
 */
export function formatCategoriesMessage(): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.BAGS, "🛍")} <b>Store Categories</b> ❞
Choose a category to browse products ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}</blockquote>`;
}

/**
 * Formats the Product List header message matching Screenshot 2.
 */
export function formatProductsListMessage(categoryName: string): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.BAGS, "🎁")} <b>Available Products — ${escapeHtml(categoryName)}</b> ❞
Tap a product to view details & buy ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}</blockquote>`;
}

/**
 * Formats the Product Detail Card matching Screenshot 3.
 */
export function formatProductDetailMessage(product: BotProduct, quantity: number): string {
  const totalMmk = product.retailPriceMmk * quantity;

  // Title with custom emoji if available
  const emojiHeader = product.emojiId
    ? `<tg-emoji emoji-id="${product.emojiId}">🛍</tg-emoji>`
    : tgEmoji(BOT_EMOJIS.BAGS, "🛍");

  // Clean description or fallback
  const descriptionText = product.formattedDescription || escapeHtml(product.description) || "Instant activation on your personal account.";

  return `<blockquote>${emojiHeader} <b>${escapeHtml(product.cleanName)}</b> ❞
${descriptionText}</blockquote>

${tgEmoji(BOT_EMOJIS.PRICE, "💵")} <b>Price:</b> ${product.formattedPriceMmk}
${tgEmoji(BOT_EMOJIS.GIFT, "🎁")} <b>Stock:</b> ${product.stock} available

${tgEmoji(BOT_EMOJIS.ABACUS, "🧮")} <b>Selected ·</b> ${quantity}   ${tgEmoji(BOT_EMOJIS.MONEY, "💰")} <b>Total ·</b> ${totalMmk.toLocaleString("en-US")} Ks

<i>Pick a quantity below, then tap Buy Now.</i>`;
}

/**
 * Formats Checkout Order Reservation message with payment instructions.
 */
export function formatCheckoutMessage(params: {
  publicOrderNo: string;
  productName: string;
  quantity: number;
  totalMmk: number;
}): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>Order Created · ${params.publicOrderNo}</b> ❞
<b>Item:</b> ${escapeHtml(params.productName)} x ${params.quantity}
<b>Total Amount:</b> ${params.totalMmk.toLocaleString("en-US")} Ks
<b>Reservation Timer:</b> ${tgEmoji(BOT_EMOJIS.HOURGLASS, "⏳")} 15 မိနစ်အတွင်း ငွေလွှဲပေးပါရန်</blockquote>

${tgEmoji(BOT_EMOJIS.BUY_NOW, "💳")} <b>ငွေလွှဲလက်ခံမည့် အကောင့်များ:</b>
• ${tgEmoji(BOT_EMOJIS.KBZPAY, "🏧")} <b>KBZ Pay:</b> <code>${botConfig.PAYMENT_KPAY_PHONE}</code> (${botConfig.PAYMENT_ACCOUNT_NAME})
• ${tgEmoji(BOT_EMOJIS.WAVEPAY, "🆗")} <b>WavePay:</b> <code>${botConfig.PAYMENT_WAVEPAY_PHONE}</code> (${botConfig.PAYMENT_ACCOUNT_NAME})

📲 <b>ငွေလွှဲပြီးပါက:</b>
ငွေလွှဲပြီးကြောင်း ပြေစာ Screenshot ပုံကို <b>ဤ Chat ထဲသို့ ဓာတ်ပုံ (Photo) အဖြစ် တိုက်ရိုက် ပေးပို့ပေးပါရန်</b> ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}

<i>ပြေစာ စစ်ဆေးပြီးပါက အကောင့်အချက်အလက်များကို ဤ Bot မှတစ်ဆင့် ချက်ချင်း အလိုအလျောက် ပေးပို့ပေးပါမည်။</i>`;
}

/**
 * Formats Slip Acknowledged message.
 */
export function formatSlipReceivedMessage(publicOrderNo: string): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.CHECK, "✅")} <b>ပြေစာ လက်ခံရရှိပါပြီ!</b> ❞
အော်ဒါနံပါတ်: <b>${publicOrderNo}</b>
အခြေအနေ: ${tgEmoji(BOT_EMOJIS.HOURGLASS, "⏳")} <b>စစ်ဆေးနေပါသည် (Under Review)</b></blockquote>

ငွေလွှဲပြေစာကို Admin မှ စစ်ဆေးနေပါပြီ။ စစ်ဆေးပြီးသည်နှင့် အကောင့် အချက်အလက်များ (သို့မဟုတ်) လင့်ခ်များကို ဤ Chat ထဲသို့ ချက်ချင်း အလိုအလျောက် ပေးပို့ပေးပါမည်ခင်ဗျာ။ ကျေးဇူးတင်ပါသည်! ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}`;
}

/**
 * Formats Delivered Credentials message.
 */
export function formatDeliveryMessage(params: {
  publicOrderNo: string;
  productName: string;
  deliveryType: string;
  credentialsText: string;
}): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.PARTY, "🎉")} <b>အော်ဒါ အောင်မြင်စွာ ပို့ဆောင်ပြီးပါပြီ!</b> ❞
အော်ဒါနံပါတ်: <b>${params.publicOrderNo}</b>
ပစ္စည်း: <b>${escapeHtml(params.productName)}</b>
ပို့ဆောင်မှု အမျိုးအစား: <b>${params.deliveryType}</b></blockquote>

${tgEmoji(BOT_EMOJIS.KEY, "🔑")} <b>သင့်အကောင့် အချက်အလက်များ:</b>
<pre><code>${escapeHtml(params.credentialsText)}</code></pre>

${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <b>လုံခြုံရေး သတိပေးချက်:</b>
မိမိအကောင့်၏ Password သို့မဟုတ် လုံခြုံရေးအချက်အလက်များကို ချက်ချင်း ပြောင်းလဲပြီး သိမ်းဆည်းထားပါရန် အကြံပြုအပ်ပါသည်။

Arena Store ကို အားပေးသည့်အတွက် ကျေးဇူးအထူးတင်ရှိပါသည်! ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}`;
}
