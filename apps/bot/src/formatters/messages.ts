import { BotCategory, BotProduct } from "../services/catalog.service";
import { botConfig } from "../config";
import { escapeHtml, BOT_EMOJIS, tgEmoji } from "@arena/shared";
import { formatCredentialsText } from "../services/encryption";

/**
 * Formats the Welcome /start greeting message.
 */
export function formatStartMessage(firstName: string): string {
  return `${tgEmoji(BOT_EMOJIS.STORE, "🛍")} <b>Welcome Back, ${escapeHtml(firstName)},</b>\n\nPremium AI Tools နှင့် Digital Accounts များကို တစ်နေရာထဲတွင် 24/7 ရနိုင်ပါပြီ ဗျာ။\nအောက်ပါ Menu များမှ ရွေးချယ်ပါ။`;
}

/**
 * Formats the Categories header message.
 */
export function formatCategoriesMessage(): string {
  return `${tgEmoji(BOT_EMOJIS.STORE, "🛍")} <b>ပစ္စည်း အမျိုးအစားများ</b>\n\nဝယ်ယူလိုသော အမျိုးအစားကို ရွေးချယ်ပေးပါခင်ဗျာ။`;
}

/**
 * Formats the Product List header message.
 */
export function formatProductsListMessage(categoryName: string): string {
  return `${tgEmoji(BOT_EMOJIS.STORE, "🛍")} <b>${escapeHtml(categoryName)} ပစ္စည်းများ</b>\n\nအသေးစိတ် ကြည့်ရှုလိုသည့် ပစ္စည်းကို ရွေးချယ်ပေးပါခင်ဗျာ။`;
}

/**
 * Formats the Product Detail Card.
 */
export function formatProductDetailMessage(product: BotProduct, quantity: number): string {
  const totalMmk = product.retailPriceMmk * quantity;

  // Title with custom emoji if available
  const emojiHeader = product.emojiId
    ? `<tg-emoji emoji-id="${product.emojiId}">🛍</tg-emoji>`
    : tgEmoji(BOT_EMOJIS.STORE, "🛍");

  // Clean description or fallback
  const descriptionText = product.formattedDescription || escapeHtml(product.description) || "Instant activation on your personal account.";

  return `<blockquote>${emojiHeader} <b>${escapeHtml(product.cleanName)}</b> ❞
${descriptionText}</blockquote>

စျေးနှုန်း: <b>${product.formattedPriceMmk}</b>
လက်ကျန်: <b>${product.stock} ခု</b>
အရေအတွက်: <b>${quantity} ခု</b> • စုစုပေါင်း: <b>${totalMmk.toLocaleString("en-US")} Ks</b>`;
}

export interface DynamicPaymentInfo {
  kpayPhone?: string;
  kpayAccountName?: string;
  wavepayPhone?: string;
  wavepayAccountName?: string;
  ayapayPhone?: string;
  ayapayAccountName?: string;
  uabpayPhone?: string;
  uabpayAccountName?: string;
}

/**
 * Optional payment-provider block — rendered only when the admin configured
 * both a phone number and an account name, so a half-filled provider never
 * shows a broken entry.
 */
function optionalProviderBlock(emoji: string, label: string, phone?: string, account?: string): string {
  if (!phone || !account) return "";
  return (
    `\n\n${emoji} <b>${label}:</b>\n` +
    `├ ဖုန်းနံပါတ်: <code>${escapeHtml(phone)}</code> <i>(နှိပ်၍ ကူးယူပါ)</i>\n` +
    `└ အကောင့်အမည်: <b>${escapeHtml(account)}</b>`
  );
}

/**
 * Formats Checkout Order Reservation message with payment instructions.
 */
export function formatCheckoutMessage(params: {
  publicOrderNo: string;
  productName: string;
  quantity: number;
  totalMmk: number;
  paymentInfo?: DynamicPaymentInfo;
}): string {
  const kpayPhone = params.paymentInfo?.kpayPhone || botConfig.PAYMENT_KPAY_PHONE;
  const kpayAccount = params.paymentInfo?.kpayAccountName || botConfig.PAYMENT_ACCOUNT_NAME;
  const wavepayPhone = params.paymentInfo?.wavepayPhone || botConfig.PAYMENT_WAVEPAY_PHONE;
  const wavepayAccount = params.paymentInfo?.wavepayAccountName || botConfig.PAYMENT_ACCOUNT_NAME;

  return `<blockquote>${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>Order Created · ${params.publicOrderNo}</b> ❞
<b>Item:</b> ${escapeHtml(params.productName)} x ${params.quantity}
<b>Total Amount:</b> ${params.totalMmk.toLocaleString("en-US")} Ks
<b>Reservation Timer:</b> ${tgEmoji(BOT_EMOJIS.HOURGLASS, "⏳")} 15 မိနစ်အတွင်း ငွေလွှဲပေးပါရန်</blockquote>

${tgEmoji(BOT_EMOJIS.BUY_NOW, "💳")} <b>ငွေလွှဲလက်ခံမည့် အကောင့်များ:</b>

${tgEmoji(BOT_EMOJIS.KBZPAY, "🏧")} <b>KBZ Pay:</b>
├ ဖုန်းနံပါတ်: <code>${kpayPhone}</code> <i>(နှိပ်၍ ကူးယူပါ)</i>
└ အကောင့်အမည်: <b>${kpayAccount}</b>

${tgEmoji(BOT_EMOJIS.WAVEPAY, "🆗")} <b>WavePay:</b>
├ ဖုန်းနံပါတ်: <code>${wavepayPhone}</code> <i>(နှိပ်၍ ကူးယူပါ)</i>
└ အကောင့်အမည်: <b>${wavepayAccount}</b>${optionalProviderBlock(
    tgEmoji(BOT_EMOJIS.AYAPAY, "🙂"),
    "AYA Pay",
    params.paymentInfo?.ayapayPhone,
    params.paymentInfo?.ayapayAccountName
  )}${optionalProviderBlock(
    tgEmoji(BOT_EMOJIS.UABPAY, "💚"),
    "UAB Pay",
    params.paymentInfo?.uabpayPhone,
    params.paymentInfo?.uabpayAccountName
  )}

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
  viewUrl?: string;
}): string {
  const cleanCreds = formatCredentialsText(params.credentialsText);
  const showViewUrl = Boolean(
    params.viewUrl &&
      !params.viewUrl.includes("digitalcore.top") &&
      !cleanCreds.includes(params.viewUrl)
  );
  const viewUrlBlock = showViewUrl
    ? `\n\n🔗 <b>Order Status / Access Link:</b>\n<a href="${escapeHtml(params.viewUrl!)}">${escapeHtml(params.viewUrl!)}</a>`
    : "";

  return `<blockquote>${tgEmoji(BOT_EMOJIS.PARTY, "🎉")} <b>အော်ဒါ အောင်မြင်စွာ ပို့ဆောင်ပြီးပါပြီ!</b> ❞
အော်ဒါနံပါတ်: <b>${params.publicOrderNo}</b>
ပစ္စည်း: <b>${escapeHtml(params.productName)}</b>
ပို့ဆောင်မှု အမျိုးအစား: <b>${params.deliveryType}</b></blockquote>

${tgEmoji(BOT_EMOJIS.KEY, "🔑")} <b>သင့်အကောင့် အချက်အလက်များ:</b>
<pre><code>${escapeHtml(cleanCreds)}</code></pre>${viewUrlBlock}

Arena Store ကို အားပေးသည့်အတွက် ကျေးဇူးအထူးတင်ရှိပါသည်! ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}`;
}

/**
 * Formats the My Profile Card.
 */
export function formatProfileMessage(params: {
  fullName: string;
  username?: string;
  telegramId: string;
  joinedDate?: string;
  walletBalanceMmk?: number;
  totalDepositsMmk?: number;
  totalSpentMmk?: number;
  ordersCount?: number;
}): string {
  const name = params.fullName || "Customer";
  const usernameText = params.username ? `@${escapeHtml(params.username)}` : "<i>မရှိပါ</i>";
  const walletBalance = (params.walletBalanceMmk ?? 0).toLocaleString("en-US");
  const totalSpent = (params.totalSpentMmk ?? 0).toLocaleString("en-US");
  const orders = params.ordersCount ?? 0;

  return `${tgEmoji(BOT_EMOJIS.PROFILE, "👤")} <b>ကျွန်ုပ်၏ အကောင့်</b>

အမည်: <b>${escapeHtml(name)}</b> (${usernameText})
User ID: <code>${params.telegramId}</code>

Wallet လက်ကျန်ငွေ: <b>${walletBalance} Ks</b>
ဝယ်ယူခဲ့သည့် ပမာဏ: <b>${totalSpent} Ks</b>
အော်ဒါ အရေအတွက်: <b>${orders} ခု</b>`;
}

/**
 * Formats the Wallet Dashboard message with live balance and prompt.
 */
export function formatWalletMessage(params: {
  fullName: string;
  balanceMmk: number;
  totalSpentMmk: number;
}): string {
  return `${tgEmoji(BOT_EMOJIS.WALLET, "💰")} <b>Arena Store Wallet</b>

လက်ရှိ လက်ကျန်ငွေ: <b>${params.balanceMmk.toLocaleString("en-US")} Ks</b>
စုစုပေါင်း သုံးစွဲမှု: <b>${params.totalSpentMmk.toLocaleString("en-US")} Ks</b>

ဖြည့်သွင်းလိုသော ငွေပမာဏကို ရွေးချယ်ပေးပါခင်ဗျာ။`;
}

/**
 * Formats Top-Up invoice message with payment instructions.
 */
export function formatTopUpInvoiceMessage(params: {
  amountMmk: number;
  reference: string;
  paymentInfo?: DynamicPaymentInfo;
}): string {
  const kpayPhone = params.paymentInfo?.kpayPhone || botConfig.PAYMENT_KPAY_PHONE;
  const kpayAccount = params.paymentInfo?.kpayAccountName || botConfig.PAYMENT_ACCOUNT_NAME;
  const wavepayPhone = params.paymentInfo?.wavepayPhone || botConfig.PAYMENT_WAVEPAY_PHONE;
  const wavepayAccount = params.paymentInfo?.wavepayAccountName || botConfig.PAYMENT_ACCOUNT_NAME;

  return `<blockquote>${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>Wallet ငွေဖြည့်သွင်းရန် အချက်အလက်များ</b> ❞
ဖြည့်သွင်းမည့် ပမာဏ: <b>${params.amountMmk.toLocaleString("en-US")} Ks</b>
ကိုးကားနံပါတ်: <code>${params.reference}</code></blockquote>

${tgEmoji(BOT_EMOJIS.BUY_NOW, "💳")} <b>ငွေလွှဲလက်ခံမည့် အကောင့်များ:</b>

${tgEmoji(BOT_EMOJIS.KBZPAY, "🏧")} <b>KBZ Pay:</b>
├ ဖုန်းနံပါတ်: <code>${kpayPhone}</code> <i>(နှိပ်၍ ကူးယူပါ)</i>
└ အကောင့်အမည်: <b>${kpayAccount}</b>

${tgEmoji(BOT_EMOJIS.WAVEPAY, "🆗")} <b>WavePay:</b>
├ ဖုန်းနံပါတ်: <code>${wavepayPhone}</code> <i>(နှိပ်၍ ကူးယူပါ)</i>
└ အကောင့်အမည်: <b>${wavepayAccount}</b>${optionalProviderBlock(
    tgEmoji(BOT_EMOJIS.AYAPAY, "🙂"),
    "AYA Pay",
    params.paymentInfo?.ayapayPhone,
    params.paymentInfo?.ayapayAccountName
  )}${optionalProviderBlock(
    tgEmoji(BOT_EMOJIS.UABPAY, "💚"),
    "UAB Pay",
    params.paymentInfo?.uabpayPhone,
    params.paymentInfo?.uabpayAccountName
  )}

${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>ငွေလွှဲပြီးပါက:</b>
ငွေလွှဲပြေစာ Screenshot ပုံကို <b>ဤ Chat ထဲသို့ ဓာတ်ပုံ (Photo) အဖြစ် တိုက်ရိုက် ပေးပို့ပေးပါရန်</b> ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}

<i>Admin မှ စစ်ဆေးအတည်ပြုပြီးသည်နှင့် သင့် Wallet ထဲသို့ ငွေချက်ချင်း ရောက်ရှိမည်ဖြစ်ပြီး အသိပေးစာ ပေးပို့ပေးပါမည်ခင်ဗျာ။</i>`;
}

/**
 * Formats Top-Up slip received acknowledgment.
 */
export function formatTopUpSlipReceivedMessage(params: {
  amountMmk: number;
  reference: string;
}): string {
  return `${tgEmoji(BOT_EMOJIS.CHECK, "✅")} <b>ငွေဖြည့်ပြေစာ လက်ခံရရှိပါပြီ</b>

ဖြည့်သွင်းသည့်ပမာဏ: <b>${params.amountMmk.toLocaleString("en-US")} Ks</b>
ကိုးကားနံပါတ်: <code>${params.reference}</code>
အခြေအနေ: <b>စစ်ဆေးနေဆဲ</b>

Admin မှ အတည်ပြုပြီးသည်နှင့် သင့် Wallet ထဲသို့ ငွေချက်ချင်း ထည့်သွင်းပေးမည်ဖြစ်ပြီး အသိပေးစာ ပေးပို့ပေးပါမည်ခင်ဗျာ။`;
}

/**
 * Formats Top-Up success celebration notification.
 */
export function formatTopUpSuccessMessage(params: {
  amountMmk: number;
  newBalanceMmk: number;
}): string {
  return `${tgEmoji(BOT_EMOJIS.CHECK, "✅")} <b>ငွေဖြည့်သွင်းမှု အောင်မြင်ပါသည်</b>

ဖြည့်သွင်းငွေ: <b>+${params.amountMmk.toLocaleString("en-US")} Ks</b>
လက်ရှိ Wallet Balance: <b>${params.newBalanceMmk.toLocaleString("en-US")} Ks</b>

သင့် Wallet ထဲသို့ ငွေဖြည့်သွင်းပြီးပါပြီခင်ဗျာ။ ယခုပင် လိုအပ်သော ပစ္စည်းများကို ချက်ချင်း ဝယ်ယူနိုင်ပါပြီ။`;
}

/**
 * Formats Insufficient Balance warning message with direct Top-up shortcut.
 */
export function formatInsufficientBalanceMessage(params: {
  productName: string;
  quantity: number;
  totalMmk: number;
  walletBalanceMmk: number;
  deficitMmk: number;
}): string {
  return `${tgEmoji(BOT_EMOJIS.ALERT, "⚠️")} <b>Wallet လက်ကျန်ငွေ မလုံလောက်ပါခင်ဗျာ</b>

ကျသင့်ငွေ: <b>${params.totalMmk.toLocaleString("en-US")} Ks</b>
လက်ရှိငွေ: <b>${params.walletBalanceMmk.toLocaleString("en-US")} Ks</b>
ထပ်ဖြည့်ရန် လိုငွေ: <b>${params.deficitMmk.toLocaleString("en-US")} Ks</b>

အောက်ပါခလုတ်ဖြင့် လိုအပ်သော ငွေပမာဏကို တိုက်ရိုက် ဖြည့်သွင်းနိုင်ပါသည်ခင်ဗျာ။`;
}

/**
 * Formats Instant Purchase Confirmation message.
 */
export function formatPurchaseConfirmMessage(params: {
  productName: string;
  quantity: number;
  totalMmk: number;
  walletBalanceMmk: number;
  remainingBalanceMmk: number;
}): string {
  return `${tgEmoji(BOT_EMOJIS.STORE, "🛍")} <b>ဝယ်ယူမှု အတည်ပြုရန်</b>

ပစ္စည်း: <b>${escapeHtml(params.productName)}</b> (x${params.quantity})
ကျသင့်ငွေ: <b>${params.totalMmk.toLocaleString("en-US")} Ks</b>
ဝယ်ယူပြီး လက်ကျန်ငွေ: <b>${params.remainingBalanceMmk.toLocaleString("en-US")} Ks</b>

ဝယ်ယူရန် သေချာပါက အောက်ပါခလုတ်ကို နှိပ်ပေးပါခင်ဗျာ။`;
}

/**
 * Formats Instant Delivery Message with remaining balance after wallet deduction.
 */
export function formatWalletDeliveryMessage(params: {
  publicOrderNo: string;
  productName: string;
  quantity: number;
  totalMmk: number;
  remainingBalanceMmk: number;
  credentialsText: string;
  viewUrl?: string;
}): string {
  const cleanCreds = formatCredentialsText(params.credentialsText);
  const showViewUrl = Boolean(
    params.viewUrl &&
      !params.viewUrl.includes("digitalcore.top") &&
      !cleanCreds.includes(params.viewUrl)
  );
  const viewUrlBlock = showViewUrl
    ? `\n\n🔗 <b>လင့်ခ်:</b> <a href="${escapeHtml(params.viewUrl!)}">${escapeHtml(params.viewUrl!)}</a>`
    : "";

  return `${tgEmoji(BOT_EMOJIS.CHECK, "✅")} <b>ဝယ်ယူမှု အောင်မြင်ပါသည်</b>

အော်ဒါအမှတ်: <code>${params.publicOrderNo}</code>
ပစ္စည်း: <b>${escapeHtml(params.productName)}</b> (x${params.quantity})
လက်ကျန်ငွေ: <b>${params.remainingBalanceMmk.toLocaleString("en-US")} Ks</b>

${tgEmoji(BOT_EMOJIS.KEY, "🔑")} <b>သင့်အကောင့် အချက်အလက်များ:</b>
<pre><code>${escapeHtml(cleanCreds)}</code></pre>${viewUrlBlock}

အားပေးမှုကို အထူးပင် ကျေးဇူးတင်ရှိပါသည်ခင်ဗျာ။`;
}

/**
 * Formats My Orders list header message.
 */
export function formatOrdersListMessage(ordersCount: number): string {
  if (ordersCount === 0) {
    return `${tgEmoji(BOT_EMOJIS.ORDERS, "📦")} <b>ကျွန်ုပ်၏ အော်ဒါများ</b>

လက်ရှိတွင် ဝယ်ယူထားသော အော်ဒါမှတ်တမ်း မရှိသေးပါခင်ဗျာ။`;
  }

  return `${tgEmoji(BOT_EMOJIS.ORDERS, "📦")} <b>ကျွန်ုပ်၏ အော်ဒါများ</b>

စုစုပေါင်း အော်ဒါ: <b>${ordersCount} ခု</b>
အသေးစိတ် ကြည့်ရှုလိုသည့် အော်ဒါကို အောက်တွင် ရွေးချယ်ပေးပါခင်ဗျာ။`;
}

/**
 * Formats single Order detail card with credentials viewer.
 */
export function formatOrderDetailMessage(order: {
  publicOrderNo: string;
  productName: string;
  quantity: number;
  totalMmk: number;
  status: string;
  createdAt: string;
  credentialsText?: string;
  viewUrl?: string;
}): string {
  const statusLabel =
    order.status === "DELIVERED"
      ? `${tgEmoji(BOT_EMOJIS.CHECK, "✅")} ပို့ဆောင်ပြီး`
      : order.status === "PAYMENT_SUBMITTED"
      ? `${tgEmoji(BOT_EMOJIS.HOURGLASS, "⏳")} စစ်ဆေးဆဲ`
      : `${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} ငွေလွှဲစောင့်ဆိုင်းဆဲ`;

  const dateFormatted = order.createdAt.split("T")[0];

  let credentialsBlock = "";
  if (order.status === "DELIVERED" && order.credentialsText) {
    const cleanCreds = formatCredentialsText(order.credentialsText);
    const showViewUrl = Boolean(
      order.viewUrl &&
        !order.viewUrl.includes("digitalcore.top") &&
        !cleanCreds.includes(order.viewUrl)
    );
    const viewUrlLine = showViewUrl
      ? `\n\n🔗 <b>လင့်ခ်:</b> <a href="${escapeHtml(order.viewUrl!)}">${escapeHtml(order.viewUrl!)}</a>`
      : "";
    credentialsBlock = `\n\n${tgEmoji(BOT_EMOJIS.KEY, "🔑")} <b>သင့်အကောင့် အချက်အလက်များ:</b>\n<pre><code>${escapeHtml(cleanCreds)}</code></pre>${viewUrlLine}`;
  }

  return `${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>အော်ဒါ အသေးစိတ် · ${order.publicOrderNo}</b>

ရက်စွဲ: <b>${dateFormatted}</b>
အခြေအနေ: <b>${statusLabel}</b>

ပစ္စည်း: <b>${escapeHtml(order.productName)}</b> (x${order.quantity})
ကျသင့်ငွေ: <b>${order.totalMmk.toLocaleString("en-US")} Ks</b>${credentialsBlock}`;
}

/**
 * Formats the suspension notice shown to customers whose account
 * has been deactivated by an admin.
 */
export function formatAccountSuspendedMessage(): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.SPEAKER, "📢")} <b>Account Suspended</b> ❞
သင့်အကောင့်ကို ယာယီပိတ်ထားပါသည်။</blockquote>

ဤအကောင့်ဖြင့် အော်ဒါများ ဝယ်ယူနိုင်မည်မဟုတ်ပါ။ အသေးစိတ်သိရှိလိုပါက Support ကို ဆက်သွယ်စစ်ဆေးပါ ${tgEmoji(BOT_EMOJIS.CHAT, "💬")}`;
}

/**
 * Formats the Force-Subscription announcement prompt for non-channel members.
 */
export function formatForceJoinMessage(channelUsername: string): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.LIGHTNING, "⚡")} <b>Welcome to Arena Store!</b> ❞
Bot ကို စတင်အသုံးပြုရန် ကျွန်ုပ်တို့၏ တရားဝင် <b>Announcement Channel (${channelUsername})</b> ကို အရင် Join ပေးရန် လိုအပ်ပါသည်ခင်ဗျာ။</blockquote>

${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")} အောက်ပါ <b>"Join Channel"</b> ခလုတ်ကို နှိပ်ပြီး Join ပြီးပါက <b>"Joined ပြီးပါပြီ"</b> ကို နှိပ်ပေးပါခင်ဗျာ:`;
}

/**
 * Formats the maintenance notice shown when bot maintenance mode is active.
 * Uses custom animated emojis for a welcoming, calm presentation.
 */
export function formatMaintenanceMessage(supportUrl?: string): string {
  const contactText = supportUrl
    ? `\n\n${tgEmoji(BOT_EMOJIS.CHAT, "💬")} အရေးပေါ် အကူအညီ လိုအပ်ပါက Customer Support သို့ ဆက်သွယ်နိုင်ပါတယ်ခင်ဗျာ။`
    : "";

  return `<blockquote>${tgEmoji(BOT_EMOJIS.WRENCH, "🔧")} <b>စနစ် ခေတ္တ ပြုပြင်ထိန်းသိမ်းနေပါသည်</b> ❞
System Maintenance</blockquote>

လူကြီးမင်းတို့ ပိုမို အဆင်ပြေချောမွေ့စွာ အသုံးပြုနိုင်စေဖို့အတွက် စနစ်ကို ခေတ္တ အဆင့်မြှင့်တင်နေပါတယ်ခင်ဗျာ ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}

လုပ်ဆောင်ချက်များ မကြာမီ ပြီးစီးတော့မှာဖြစ်ပြီး ပြန်ဖွင့်ချိန်တွင် ပုံမှန်အတိုင်း ပြန်လည် ဝယ်ယူနိုင်ပါမည်။${contactText}`;
}

/**
 * Formats the MyanMyanPay dynamic MMQR invoice message.
 * Strictly complies with MyanMyanPay guidelines:
 * 1. MMK currency only
 * 2. 15-minute countdown and expiration time
 * 3. "Powered by MyanMyanPay" attribution is rendered on the QR card image
 *    (see qr.service.ts); the caption text is kept concise and omits it.
 */
export function formatMmpayQrInvoiceMessage(params: {
  amountMmk: number;
  reference: string;
  expiresAt: Date;
}): string {
  const expiresTimeStr = params.expiresAt.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Yangon",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Live countdown: recomputed on every render (initial send + scheduler
  // caption refreshes) so the customer sees the remaining minutes tick down.
  const remainingMs = params.expiresAt.getTime() - Date.now();
  const remainingMin = Math.max(0, Math.ceil(remainingMs / 60000));
  const countdownStr =
    remainingMin > 0
      ? `⏳ <b>ကျန်ချိန်:</b> ~${remainingMin} မိနစ်`
      : `⏳ <b>ကျန်ချိန်:</b> သက်တမ်းကုန်လုနီးပါပြီ`;

  return `<blockquote>${tgEmoji(BOT_EMOJIS.MMQR, "⚡")} <b>MMQR အလိုအလျောက် ငွေပေးချေလွှာ</b>
ငွေပမာဏ: <b>${params.amountMmk.toLocaleString("en-US")} MMK</b> (၁၅ မိနစ်အတွင်း ပေးချေပါ)</blockquote>

${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>အော်ဒါ:</b> <code>${escapeHtml(params.reference)}</code>
🕒 <b>နောက်ဆုံးအချိန်:</b> <b>${expiresTimeStr} MMT</b>
${countdownStr}

💡 <i>KPay / WavePay စသည့် (MMQR ဖြင့် လက်ခံနိုင်သည့်) မည်သည့် E-Wallet ဖြင့်မဆို Scan ဖတ်ပြီးသည်နှင့် စက္ကန့်ပိုင်းအတွင်း အလိုအလျောက် ငွေဝင်ပါမည်။ (ပြေစာ စလစ် တင်ရန် မလိုပါ)</i>`;
}

/**
 * Formats the notice shown when an MMQR invoice reaches its expiry — used by
 * both the manual "Refresh" button and the background auto-expiry scheduler so
 * the customer sees the same message whether or not they tapped Refresh.
 */
export function formatMmpayExpiredMessage(): string {
  return `${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <b>MMQR သက်တမ်းကုန်ဆုံးသွားပါပြီ (Expired)</b>
ဤ QR ကုဒ်ဖြင့် ငွေပေးချေ၍ မရတော့ပါ။ ဆက်လက် ငွေဖြည့်လိုပါက ငွေပမာဏ အသစ် ရွေးချယ်ပေးပါခင်ဗျာ။`;
}

/**
 * Formats the notice shown when the gateway reports an MMQR payment as
 * terminally unsuccessful (FAILED) or cancelled (CANCELLED) — used by the
 * manual "Refresh" button so the customer sees the final outcome instead of a
 * stale "still waiting" state.
 */
export function formatMmpayFailedMessage(params: {
  reference: string;
  kind?: "FAILED" | "CANCELLED";
}): string {
  const cancel = tgEmoji(BOT_EMOJIS.CANCEL, "❌");
  const headline =
    params.kind === "CANCELLED"
      ? "MMQR ငွေပေးချေမှုကို ဖျက်သိမ်းလိုက်ပါပြီ"
      : "MMQR ငွေပေးချေမှု မအောင်မြင်ပါ";
  return `<blockquote>${cancel} <b>${headline}</b>
အော်ဒါ အမှတ်: <code>${escapeHtml(params.reference)}</code></blockquote>

သင့် Wallet မှ ငွေ နုတ်ယူခြင်း မရှိပါ။ ဆက်လက် ငွေဖြည့်လိုပါက ငွေပမာဏ အသစ် ရွေးချယ်ပေးပါခင်ဗျာ။`;
}

/**
 * Formats the Payment Method Choice prompt (Instant MMQR vs Manual Slip).
 */
export function formatPaymentMethodChoiceMessage(params: {
  amountMmk: number;
}): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.MONEY, "💰")} <b>ငွေပေးချေမှု နည်းလမ်း ရွေးချယ်ပါ</b> ❞
ငွေပမာဏ: <b>${params.amountMmk.toLocaleString("en-US")} MMK</b></blockquote>

${tgEmoji(BOT_EMOJIS.MMQR, "⚡")} <b>MMQR:</b> စလစ်တင်ရန် မလိုဘဲ စက္ကန့်ပိုင်းအတွင်း အလိုအလျောက် ငွေဝင်မည်။
${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>Manual Slip:</b> ပုံမှန် KPay/WavePay သို့ လွှဲပြီး ပြေစာ ပုံ တင်ပေးရမည်။

အဆင်ပြေရာ နည်းလမ်းကို အောက်တွင် ရွေးချယ်ပေးပါ ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`;
}

/**
 * Formats notice when user attempts to create a new top-up while an unexpired
 * MMQR order is already active (Strict MyanMyanPay compliance rule).
 */
export function formatActiveMmpayExistsMessage(params: {
  reference: string;
  amountMmk: number;
  expiresAt: Date;
}): string {
  const expiresTimeStr = params.expiresAt.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Yangon",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `<blockquote>${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <b>မပြီးပြတ်သေးသော MMQR အော်ဒါ ရှိနေပါသည်</b> ❞
အော်ဒါ အမှတ်: <b>${escapeHtml(params.reference)}</b>
ငွေပမာဏ: <b>${params.amountMmk.toLocaleString("en-US")} MMK</b>
သက်တမ်းကုန်ဆုံးချိန်: <b>${expiresTimeStr} MMT</b></blockquote>

MyanMyanPay စည်းကမ်းချက်အရ လက်ရှိ အော်ဒါကို ပြီးဆုံးအောင် ပေးချေခြင်း သို့မဟုတ် Cancel လုပ်ခြင်း မပြုမချင်း နောက်ထပ် ငွေပေးချေမှု အသစ် ထပ်မံ တောင်းခံခွင့် မရှိပါခင်ဗျာ။

လက်ရှိ QR ကုဒ်ကို ပြန်လည်ကြည့်ရှုလိုပါက သို့မဟုတ် အော်ဒါ ဖျက်သိမ်းလိုပါက အောက်ပါ ခလုတ်ကို ရွေးချယ်ပါ ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`;
}

/**
 * Formats notice after a successful MMQR top-up confirmation.
 */
export function formatMmpaySuccessMessage(params: {
  amountMmk: number;
  reference: string;
  walletBalanceMmk: number;
}): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.CHECK, "✅")} <b>MMQR ငွေပေးချေမှု အောင်မြင်ပါပြီ!</b> ❞
အော်ဒါ အမှတ်: <b>${escapeHtml(params.reference)}</b>
ဖြည့်သွင်းငွေ: <b>+${params.amountMmk.toLocaleString("en-US")} MMK</b>
လက်ရှိ Wallet Balance: <b>${params.walletBalanceMmk.toLocaleString("en-US")} MMK</b></blockquote>

ကျေးဇူးတင်ရှိပါသည်ခင်ဗျာ! အခုပဲ ပစ္စည်းများကို ဆက်လက် ဝယ်ယူနိုင်ပါပြီ ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}`;
}

