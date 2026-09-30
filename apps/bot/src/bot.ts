import { Bot, session } from "grammy";
import { botConfig } from "./config";
import { BotContext, createInitialSessionData } from "./types";
import { botCatalog } from "./services/catalog.service";
import { botOrderService } from "./services/order.service";
import {
  buildMainMenuKeyboard,
  buildCategoriesKeyboard,
  buildProductsKeyboard,
  buildProductDetailKeyboard,
  buildCheckoutKeyboard,
  buildOrderListKeyboard,
} from "./keyboards/store.keyboards";
import {
  formatStartMessage,
  formatCategoriesMessage,
  formatProductsListMessage,
  formatProductDetailMessage,
  formatCheckoutMessage,
  formatSlipReceivedMessage,
} from "./formatters/messages";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(botConfig.TELEGRAM_BOT_TOKEN);

  // 1. Session Middleware
  bot.use(
    session({
      initial: createInitialSessionData,
    })
  );

  // 2. Global Zero-Clock Callback Query Auto-Acknowledge Middleware
  bot.use(async (ctx, next) => {
    if (ctx.callbackQuery) {
      // Auto acknowledge callback to dismiss Telegram loading clock instantly
      ctx.answerCallbackQuery().catch(() => {});
    }
    await next();
  });

  // 3. /start Command Handler
  bot.command("start", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    const firstName = ctx.from?.first_name || "Customer";

    await ctx.reply(formatStartMessage(firstName), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(),
    });
  });

  // 4. Main Menu Navigation
  bot.callbackQuery("menu_start", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    const firstName = ctx.from?.first_name || "Customer";

    await ctx.editMessageText(formatStartMessage(firstName), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(),
    });
  });

  // 5. Categories Grid (Screenshot 1)
  bot.callbackQuery("menu_categories", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    const categories = await botCatalog.getCategories();

    await ctx.editMessageText(formatCategoriesMessage(), {
      parse_mode: "HTML",
      reply_markup: buildCategoriesKeyboard(categories),
    });
  });

  // 6. Category Selection -> Products List (Screenshot 2)
  bot.callbackQuery(/^cat_(\d+)$/, async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    const categoryId = parseInt(ctx.match[1], 10);
    ctx.session.activeCategoryId = categoryId;

    const category = await botCatalog.getCategoryById(categoryId);
    const products = await botCatalog.getProductsByCategory(categoryId);
    const categoryName = category ? category.cleanName : "Category";

    await ctx.editMessageText(formatProductsListMessage(categoryName), {
      parse_mode: "HTML",
      reply_markup: buildProductsKeyboard(categoryId, products),
    });
  });

  // 7. Product Selection -> Interactive Detail & Stepper (Screenshot 3)
  bot.callbackQuery(/^prod_(\d+)$/, async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    const productId = parseInt(ctx.match[1], 10);
    const product = await botCatalog.getProductById(productId);

    if (!product) {
      await ctx.reply("❌ ပစ္စည်း ရှာမတွေ့ပါခင်ဗျာ။", {
        reply_markup: buildMainMenuKeyboard(),
      });
      return;
    }

    ctx.session.activeProductId = productId;
    ctx.session.selectedQuantity = 1;

    await ctx.editMessageText(formatProductDetailMessage(product, 1), {
      parse_mode: "HTML",
      reply_markup: buildProductDetailKeyboard(product, 1),
    });
  });

  // 8. Quantity Stepper [-] [+]
  bot.callbackQuery(/^qty_step_(\d+)_(\d+)$/, async (ctx) => {
    const productId = parseInt(ctx.match[1], 10);
    const targetQty = parseInt(ctx.match[2], 10);
    const product = await botCatalog.getProductById(productId);

    if (!product) return;

    // Clamp between 1 and available stock
    const newQty = Math.max(1, Math.min(targetQty, product.stock));
    ctx.session.selectedQuantity = newQty;

    await ctx.editMessageText(formatProductDetailMessage(product, newQty), {
      parse_mode: "HTML",
      reply_markup: buildProductDetailKeyboard(product, newQty),
    });
  });

  // 9. Quick Preset Selection [1, 5, 10, 20, 30, 50]
  bot.callbackQuery(/^qty_set_(\d+)_(\d+)$/, async (ctx) => {
    const productId = parseInt(ctx.match[1], 10);
    const preset = parseInt(ctx.match[2], 10);
    const product = await botCatalog.getProductById(productId);

    if (!product) return;

    ctx.session.selectedQuantity = preset;

    await ctx.editMessageText(formatProductDetailMessage(product, preset), {
      parse_mode: "HTML",
      reply_markup: buildProductDetailKeyboard(product, preset),
    });
  });

  // 10. Custom Quantity Prompt
  bot.callbackQuery(/^qty_custom_(\d+)$/, async (ctx) => {
    const productId = parseInt(ctx.match[1], 10);
    const product = await botCatalog.getProductById(productId);

    if (!product) return;

    ctx.session.awaitingCustomQuantity = true;
    ctx.session.activeProductId = productId;

    await ctx.reply(
      `🔢 <b>Custom Quantity သတ်မှတ်ခြင်း:</b>\nဝယ်ယူလိုသော အရေအတွက် (၁ မှ ${product.stock} ထိ) ကို ဂဏန်းအတိအကျ ရိုက်ထည့်ပေးပါခင်ဗျာ:`,
      { parse_mode: "HTML" }
    );
  });

  // 11. Checkout: Buy Now
  bot.callbackQuery(/^checkout_(\d+)_(\d+)$/, async (ctx) => {
    const now = Date.now();
    // Debounce multi-taps within 800ms
    if (ctx.session.lastActionTimestamp && now - ctx.session.lastActionTimestamp < 800) {
      return;
    }
    ctx.session.lastActionTimestamp = now;

    const productId = parseInt(ctx.match[1], 10);
    const quantity = parseInt(ctx.match[2], 10);
    const product = await botCatalog.getProductById(productId);

    if (!product) {
      await ctx.reply("❌ ပစ္စည်း ရှာမတွေ့ပါခင်ဗျာ။");
      return;
    }

    if (!product.inStock || quantity > product.stock) {
      await ctx.reply("⚠️ ဝမ်းနည်းပါသည်၊ စတော့လက်ကျန် မလုံလောက်တော့ပါခင်ဗျာ။");
      return;
    }

    const totalMmk = product.retailPriceMmk * quantity;
    const telegramId = String(ctx.from?.id || "");
    const customerName = ctx.from?.first_name || "Customer";
    const telegramUsername = ctx.from?.username;

    // Create order with 15-minute stock hold
    const orderResult = await botOrderService.createOrder({
      telegramId,
      telegramUsername,
      customerName,
      productId,
      quantity,
    });

    ctx.session.awaitingSlipForOrderId = orderResult.orderId;
    ctx.session.pendingOrderId = orderResult.orderId;
    ctx.session.pendingPublicOrderNo = orderResult.publicOrderNo;
    ctx.session.pendingTotalMmk = totalMmk;

    await ctx.editMessageText(
      formatCheckoutMessage({
        publicOrderNo: orderResult.publicOrderNo,
        productName: product.cleanName,
        quantity,
        totalMmk,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildCheckoutKeyboard(orderResult.orderId),
      }
    );
  });

  // 12. Cancel Order
  bot.callbackQuery(/^cancel_order_(.+)$/, async (ctx) => {
    ctx.session.awaitingSlipForOrderId = undefined;
    ctx.session.pendingOrderId = undefined;
    ctx.session.pendingTotalMmk = undefined;

    await ctx.editMessageText(
      "❌ <b>အော်ဒါကို ပယ်ဖျက်လိုက်ပါပြီခင်ဗျာ။</b>\nအချိန်မရွေး ပစ္စည်းများကို ပြန်လည် ကြည့်ရှုဝယ်ယူနိုင်ပါသည် ✨",
      {
        parse_mode: "HTML",
        reply_markup: buildMainMenuKeyboard(),
      }
    );
  });

  // 13. Customer Sends Photo (Payment Slip Receipt)
  bot.on("message:photo", async (ctx) => {
    const awaitingOrderId = ctx.session.awaitingSlipForOrderId;

    if (!awaitingOrderId) {
      await ctx.reply(
        "👋 မင်္ဂလာပါခင်ဗျာ! ငွေလွှဲပြေစာ ပေးပို့လိုပါက ကျေးဇူးပြု၍ ပစ္စည်းကို အရင် ရွေးချယ်ပြီး Buy Now နှိပ်ပေးပါခင်ဗျာ 👇",
        {
          reply_markup: buildMainMenuKeyboard(),
        }
      );
      return;
    }

    // Get the highest resolution photo
    const photo = ctx.message.photo;
    const highestRes = photo[photo.length - 1];
    const fileId = highestRes.file_id;

    const publicOrderNo = ctx.session.pendingPublicOrderNo || "ARN-2026";
    const amountMmk = ctx.session.pendingTotalMmk || 3900;
    const telegramId = String(ctx.from?.id || "");

    // Submit payment slip
    await botOrderService.submitPaymentSlip({
      orderId: awaitingOrderId,
      telegramId,
      fileId,
      paymentMethod: "KPAY",
      amountMmk,
    });

    // Clear awaiting state
    ctx.session.awaitingSlipForOrderId = undefined;
    ctx.session.pendingOrderId = undefined;
    ctx.session.pendingTotalMmk = undefined;

    await ctx.reply(formatSlipReceivedMessage(publicOrderNo), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(),
    });
  });

  // 14. Text Handler for Custom Quantity and Help
  bot.on("message:text", async (ctx) => {
    if (ctx.session.awaitingCustomQuantity && ctx.session.activeProductId) {
      const text = ctx.message.text.trim();
      const qty = parseInt(text, 10);
      const product = await botCatalog.getProductById(ctx.session.activeProductId);

      if (!product || isNaN(qty) || qty < 1 || qty > product.stock) {
        await ctx.reply(
          `⚠️ ကျေးဇူးပြု၍ ၁ မှ ${product ? product.stock : 100} အတွင်း မှန်ကန်သော ဂဏန်းကိုသာ ရိုက်ထည့်ပေးပါခင်ဗျာ:`
        );
        return;
      }

      ctx.session.awaitingCustomQuantity = false;
      ctx.session.selectedQuantity = qty;

      await ctx.reply(formatProductDetailMessage(product, qty), {
        parse_mode: "HTML",
        reply_markup: buildProductDetailKeyboard(product, qty),
      });
      return;
    }

    // Default friendly fallback
    await ctx.reply("မင်္ဂလာပါခင်ဗျာ! အောက်ပါ မီနူးမှတစ်ဆင့် ပစ္စည်းများကို ရွေးချယ်ဝယ်ယူနိုင်ပါသည် 👇", {
      reply_markup: buildMainMenuKeyboard(),
    });
  });

  // 15. Orders Menu
  bot.callbackQuery("menu_orders", async (ctx) => {
    await ctx.editMessageText(
      `📦 <b>ကျွန်ုပ်၏ အော်ဒါများ (My Orders):</b>

လတ်တလော ဝယ်ယူထားသော အော်ဒါမှတ်တမ်းများနှင့် အကောင့် အချက်အလက်များကို ဤနေရာတွင် ကြည့်ရှုနိုင်ပါသည် 👇`,
      {
        parse_mode: "HTML",
        reply_markup: buildOrderListKeyboard([]),
      }
    );
  });

  // 16. Wallet Menu
  bot.callbackQuery("menu_wallet", async (ctx) => {
    await ctx.editMessageText(
      `💰 <b>Arena Store Wallet:</b>

လက်ကျန်ငွေ: <b>0 MMK</b>

KPay သို့မဟုတ် WavePay ဖြင့် Wallet ငွေ ကြိုတင်ဖြည့်သွင်းထားပြီး ပစ္စည်းများကို စက္ကန့်ပိုင်းအတွင်း ချက်ချင်း ဝယ်ယူနိုင်ပါသည်ခင်ဗျာ။`,
      {
        parse_mode: "HTML",
        reply_markup: buildMainMenuKeyboard(),
      }
    );
  });

  // 17. No-op callback handler
  bot.callbackQuery("noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("out_of_stock", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: "ဤပစ္စည်းမှာ လက်ရှိတွင် စတော့ပြတ်လပ်နေပါသည်ခင်ဗျာ။",
      show_alert: true,
    });
  });

  return bot;
}
