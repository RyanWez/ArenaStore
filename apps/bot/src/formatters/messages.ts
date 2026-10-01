import { BotCategory, BotProduct } from "../services/catalog.service";
import { botConfig } from "../config";
import { escapeHtml, BOT_EMOJIS, tgEmoji } from "@arena/shared";

/**
 * Formats the Welcome /start greeting message with animated custom emojis.
 */
export function formatStartMessage(firstName: string): string {
  return `${tgEmoji(BOT_EMOJIS.WAVE, "👋")} Hello, <b>${escapeHtml(firstName)}</b>,

<b>Arena Store</b> မှ ကြိုဆိုပါတယ်ဗျာ! ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}\n
AI Tools များနှင့် Digital Products များကို မြန်မာကျပ်ငွေ (MMK) ဖြင့် စျေးနှုန်းသက်သာစွာ ဝယ်ယူနိုင်ပါတယ် ခင်ဗျာ။\n
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

export interface DynamicPaymentInfo {
  kpayPhone?: string;
  kpayAccountName?: string;
  wavepayPhone?: string;
  wavepayAccountName?: string;
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
• ${tgEmoji(BOT_EMOJIS.KBZPAY, "🏧")} <b>KBZ Pay:</b> <code>${kpayPhone}</code> (${kpayAccount})
• ${tgEmoji(BOT_EMOJIS.WAVEPAY, "🆗")} <b>WavePay:</b> <code>${wavepayPhone}</code> (${wavepayAccount})

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

/**
 * Formats the My Profile Card matching Screenshot 2.
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
  const usernameText = params.username ? `@${escapeHtml(params.username)}` : "<i>Not set</i>";
  const joined = params.joinedDate || new Date().toISOString().split("T")[0];
  const walletBalance = (params.walletBalanceMmk ?? 0).toLocaleString("en-US");
  const totalDeposits = (params.totalDepositsMmk ?? 0).toLocaleString("en-US");
  const totalSpent = (params.totalSpentMmk ?? 0).toLocaleString("en-US");
  const orders = params.ordersCount ?? 0;

  return `<blockquote>${tgEmoji(BOT_EMOJIS.PROFILE, "👤")} <b>My Profile</b> ❞
<b>Name:</b> <b>${escapeHtml(name)}</b>
<b>Username:</b> ${usernameText}
<b>User ID:</b> <code>${params.telegramId}</code>
<b>Joined:</b> ${joined}
<b>Status:</b> <b>Active</b></blockquote>
────────────────────
${tgEmoji(BOT_EMOJIS.BUY_NOW, "💳")} <b>Wallet Balance:</b> ${walletBalance} MMK
${tgEmoji(BOT_EMOJIS.MONEY, "💰")} <b>Total Deposits:</b> ${totalDeposits} MMK
${tgEmoji(BOT_EMOJIS.BAGS, "🛍")} <b>Total Spent:</b> ${totalSpent} MMK
${tgEmoji(BOT_EMOJIS.BOX, "📦")} <b>Orders:</b> ${orders}`;
}

/**
 * Formats the Wallet Dashboard message with live balance and prompt.
 */
export function formatWalletMessage(params: {
  fullName: string;
  balanceMmk: number;
  totalSpentMmk: number;
}): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.MONEY, "💰")} <b>Arena Store Wallet</b> ❞
အကောင့်လက်ကျန်ငွေနှင့် ငွေဖြည့်သွင်းခြင်း</blockquote>

${tgEmoji(BOT_EMOJIS.PROFILE, "👤")} <b>Customer:</b> <b>${escapeHtml(params.fullName)}</b>
${tgEmoji(BOT_EMOJIS.BUY_NOW, "💳")} <b>Wallet Balance:</b> <b>${params.balanceMmk.toLocaleString("en-US")} MMK</b>
${tgEmoji(BOT_EMOJIS.BAGS, "🛍")} <b>Total Spent:</b> ${params.totalSpentMmk.toLocaleString("en-US")} MMK

ငွေဖြည့်သွင်းလိုသော ပမာဏကို အောက်တွင် ရွေးချယ်ပါ ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`;
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
ဖြည့်သွင်းမည့် ပမာဏ: <b>${params.amountMmk.toLocaleString("en-US")} MMK</b>
ကိုးကားနံပါတ်: <code>${params.reference}</code></blockquote>

${tgEmoji(BOT_EMOJIS.BUY_NOW, "💳")} <b>ငွေလွှဲလက်ခံမည့် အကောင့်များ:</b>
• ${tgEmoji(BOT_EMOJIS.KBZPAY, "🏧")} <b>KBZ Pay:</b> <code>${kpayPhone}</code> (${kpayAccount})
• ${tgEmoji(BOT_EMOJIS.WAVEPAY, "🆗")} <b>WavePay:</b> <code>${wavepayPhone}</code> (${wavepayAccount})

${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>ငွေလွှဲပြီးပါက:</b>
ငွေလွှဲပြေစာ Screenshot ပုံကို <b>ဤ Chat ထဲသို့ ဓာတ်ပုံ (Photo) အဖြစ် တိုက်ရိုက် ပေးပို့ပေးပါရန်</b> ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}

<i>Admin မှ စစ်ဆေးအတည်ပြုပြီးသည်နှင့် သင့် Wallet ထဲသို့ ငွေချက်ချင်း ရောက်ရှိမည်ဖြစ်ပြီး Bot မှ အကြောင်းကြားစာ ပေးပို့ပေးပါမည်ခင်ဗျာ ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}</i>`;
}

/**
 * Formats Top-Up slip received acknowledgment.
 */
export function formatTopUpSlipReceivedMessage(params: {
  amountMmk: number;
  reference: string;
}): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.CHECK, "✅")} <b>ငွေဖြည့်ပြေစာ လက်ခံရရှိပါပြီ!</b> ❞
ဖြည့်သွင်းသည့်ပမာဏ: <b>${params.amountMmk.toLocaleString("en-US")} MMK</b>
ကိုးကားနံပါတ်: <code>${params.reference}</code>
အခြေအနေ: ${tgEmoji(BOT_EMOJIS.HOURGLASS, "⏳")} <b>စစ်ဆေးနေပါသည် (Under Review)</b></blockquote>

ငွေလွှဲပြေစာကို Admin မှ စစ်ဆေးနေပါပြီ။ စစ်ဆေးအတည်ပြုပြီးသည်နှင့် သင့် Wallet ထဲသို့ ငွေချက်ချင်း ထည့်သွင်းပေးမည်ဖြစ်ပြီး Bot မှတစ်ဆင့် အသိပေးစာ ပေးပို့ပေးပါမည်ခင်ဗျာ ✨`;
}

/**
 * Formats Top-Up success celebration notification.
 */
export function formatTopUpSuccessMessage(params: {
  amountMmk: number;
  newBalanceMmk: number;
}): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.PARTY, "🎉")} <b>ငွေဖြည့်သွင်းမှု အောင်မြင်ပါသည်!</b> ❞
ဖြည့်သွင်းငွေ: <b>+${params.amountMmk.toLocaleString("en-US")} MMK</b>
လက်ရှိ Wallet Balance: <b>${params.newBalanceMmk.toLocaleString("en-US")} MMK</b></blockquote>

သင့် Wallet ထဲသို့ ငွေဖြည့်သွင်းပြီးပါပြီခင်ဗျာ!
ယခုပင် လိုအပ်သော AI Tools & Digital Products များကို <b>Buy Now</b> ဖြင့် စက္ကန့်ပိုင်းအတွင်း ချက်ချင်း ဝယ်ယူနိုင်ပါပြီ ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}`;
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
  return `<blockquote>${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <b>လက်ကျန်ငွေ မလုံလောက်ပါခင်ဗျာ!</b> ❞
အော်ဒါဝယ်ယူရန် Wallet ထဲသို့ ငွေဖြည့်သွင်းရန် လိုအပ်ပါသည်။</blockquote>

${tgEmoji(BOT_EMOJIS.BOX, "📦")} <b>ပစ္စည်း:</b> <b>${escapeHtml(params.productName)}</b> x ${params.quantity}
${tgEmoji(BOT_EMOJIS.PRICE, "💵")} <b>ကျသင့်ငွေ:</b> <b>${params.totalMmk.toLocaleString("en-US")} MMK</b>
${tgEmoji(BOT_EMOJIS.BUY_NOW, "💳")} <b>လက်ရှိ Wallet Balance:</b> <b>${params.walletBalanceMmk.toLocaleString("en-US")} MMK</b>
${tgEmoji(BOT_EMOJIS.ABACUS, "🧮")} <b>ထပ်မံလိုအပ်သောငွေ:</b> <b>${params.deficitMmk.toLocaleString("en-US")} MMK</b>

အောက်ပါ ခလုတ်မှတစ်ဆင့် လိုအပ်သော ငွေပမာဏကို အတိအကျ တိုက်ရိုက် ငွေဖြည့်နိုင်ပါသည် ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`;
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
  return `<blockquote>${tgEmoji(BOT_EMOJIS.BAGS, "🛍")} <b>ဝယ်ယူမှု အတည်ပြုခြင်း</b> ❞
သင့် Wallet ထဲမှ ငွေနုတ်ယူပြီး အကောင့်ကို ချက်ချင်း ပေးပို့ပါမည်။</blockquote>

${tgEmoji(BOT_EMOJIS.BOX, "📦")} <b>ပစ္စည်း:</b> <b>${escapeHtml(params.productName)}</b> x ${params.quantity}
${tgEmoji(BOT_EMOJIS.PRICE, "💵")} <b>ကျသင့်ငွေ:</b> <b>${params.totalMmk.toLocaleString("en-US")} MMK</b>
${tgEmoji(BOT_EMOJIS.BUY_NOW, "💳")} <b>လက်ရှိ Wallet Balance:</b> <b>${params.walletBalanceMmk.toLocaleString("en-US")} MMK</b>
${tgEmoji(BOT_EMOJIS.MONEY, "💰")} <b>ဝယ်ယူပြီး လက်ကျန်ငွေ:</b> <b>${params.remainingBalanceMmk.toLocaleString("en-US")} MMK</b>

ဝယ်ယူရန် သေချာပါက အောက်ပါ <b>'အတည်ပြု ဝယ်ယူမည်'</b> ခလုတ်ကို နှိပ်ပေးပါခင်ဗျာ ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`;
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
}): string {
  return `<blockquote>${tgEmoji(BOT_EMOJIS.PARTY, "🎉")} <b>အော်ဒါ အောင်မြင်စွာ ပို့ဆောင်ပြီးပါပြီ!</b> ❞
အော်ဒါနံပါတ်: <b>${params.publicOrderNo}</b>
ပစ္စည်း: <b>${escapeHtml(params.productName)} x ${params.quantity}</b>
ကျသင့်ငွေ: <b>${params.totalMmk.toLocaleString("en-US")} MMK</b> (Wallet မှ နုတ်ယူပြီး)
လက်ကျန် Wallet Balance: <b>${params.remainingBalanceMmk.toLocaleString("en-US")} MMK</b></blockquote>

${tgEmoji(BOT_EMOJIS.KEY, "🔑")} <b>သင့်အကောင့် အချက်အလက်များ:</b>
<pre><code>${escapeHtml(params.credentialsText)}</code></pre>

${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <b>လုံခြုံရေး သတိပေးချက်:</b>
မိမိအကောင့်၏ Password သို့မဟုတ် လုံခြုံရေးအချက်အလက်များကို ချက်ချင်း ပြောင်းလဲပြီး သိမ်းဆည်းထားပါရန် အကြံပြုအပ်ပါသည်။

Arena Store ကို အားပေးသည့်အတွက် ကျေးဇူးအထူးတင်ရှိပါသည်! ${tgEmoji(BOT_EMOJIS.SPARKLES, "✨")}`;
}

/**
 * Formats My Orders list header message.
 */
export function formatOrdersListMessage(ordersCount: number): string {
  if (ordersCount === 0) {
    return `<blockquote>${tgEmoji(BOT_EMOJIS.BOX, "📦")} <b>ကျွန်ုပ်၏ အော်ဒါများ (My Orders)</b> ❞
လက်ရှိတွင် ဝယ်ယူထားသော အော်ဒါမှတ်တမ်း မရှိသေးပါခင်ဗျာ။</blockquote>

ပစ္စည်းများ ကြည့်ရှုဝယ်ယူလိုပါက အောက်ပါ ခလုတ်ကို နှိပ်ပါ ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`;
  }

  return `<blockquote>${tgEmoji(BOT_EMOJIS.BOX, "📦")} <b>ကျွန်ုပ်၏ အော်ဒါများ (My Orders)</b> ❞
စုစုပေါင်း အော်ဒါ: <b>${ordersCount} ခု</b></blockquote>

အသေးစိတ်နှင့် အကောင့်အချက်အလက်များကို ပြန်လည်ကြည့်ရှုရန် အောက်ပါ အော်ဒါနံပါတ်တစ်ခုခုကို နှိပ်ပါ ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`;
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
}): string {
  const statusLabel =
    order.status === "DELIVERED"
      ? `${tgEmoji(BOT_EMOJIS.CHECK, "✅")} အောင်မြင်စွာ ပို့ဆောင်ပြီး (DELIVERED)`
      : order.status === "PAYMENT_SUBMITTED"
      ? `${tgEmoji(BOT_EMOJIS.HOURGLASS, "⏳")} စစ်ဆေးနေပါသည် (UNDER REVIEW)`
      : `${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} ငွေလွှဲရန် စောင့်ဆိုင်းဆဲ`;

  const dateFormatted = order.createdAt.split("T")[0];

  let credentialsBlock = "";
  if (order.status === "DELIVERED" && order.credentialsText) {
    credentialsBlock = `\n\n${tgEmoji(BOT_EMOJIS.KEY, "🔑")} <b>အကောင့် အချက်အလက်များ:</b>\n<pre><code>${escapeHtml(order.credentialsText)}</code></pre>`;
  }

  return `<blockquote>${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>အော်ဒါ အသေးစိတ် · ${order.publicOrderNo}</b> ❞
ရက်စွဲ: <b>${dateFormatted}</b>
အခြေအနေ: ${statusLabel}</blockquote>

${tgEmoji(BOT_EMOJIS.BOX, "📦")} <b>ပစ္စည်း:</b> <b>${escapeHtml(order.productName)}</b> x ${order.quantity}
${tgEmoji(BOT_EMOJIS.PRICE, "💵")} <b>ကျသင့်ငွေ:</b> <b>${order.totalMmk.toLocaleString("en-US")} MMK</b>${credentialsBlock}`;
}
