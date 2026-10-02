import { Bot, session } from "grammy";
import { botConfig } from "./config";
import { BotContext, createInitialSessionData } from "./types";
import { botCatalog } from "./services/catalog.service";
import { botOrderService } from "./services/order.service";
import { botSettingsService } from "./services/settings.service";
import {
  buildMainMenuKeyboard,
  buildCategoriesKeyboard,
  buildProductsKeyboard,
  buildProductDetailKeyboard,
  buildCheckoutKeyboard,
  buildOrderListKeyboard,
  buildProfileKeyboard,
  buildWalletKeyboard,
  buildTopUpInvoiceKeyboard,
  buildInsufficientBalanceKeyboard,
  buildPurchaseConfirmKeyboard,
  buildOrderDetailKeyboard,
  buildUnmatchedPhotoKeyboard,
  buildForceJoinKeyboard,
} from "./keyboards/store.keyboards";
import {
  formatStartMessage,
  formatCategoriesMessage,
  formatProductsListMessage,
  formatProductDetailMessage,
  formatCheckoutMessage,
  formatSlipReceivedMessage,
  formatProfileMessage,
  formatWalletMessage,
  formatTopUpInvoiceMessage,
  formatTopUpSlipReceivedMessage,
  formatTopUpSuccessMessage,
  formatInsufficientBalanceMessage,
  formatPurchaseConfirmMessage,
  formatWalletDeliveryMessage,
  formatOrdersListMessage,
  formatOrderDetailMessage,
  formatAccountSuspendedMessage,
  formatForceJoinMessage,
} from "./formatters/messages";
import { channelVerificationService } from "./services/channel-verification.service";
import { BOT_EMOJIS, tgEmoji, escapeHtml } from "@arena/shared";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(botConfig.TELEGRAM_BOT_TOKEN);

  // 1. Session Middleware
  bot.use(
    session({
      initial: createInitialSessionData,
    })
  );

  // 2. Global Telegram User Profile Auto-Sync Middleware
  // Immediately synchronizes Name, @username, and Telegram ID to DB on any interaction
  bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id) {
      const telegramId = String(ctx.from.id);
      const firstName = ctx.from.first_name || "Customer";
      const lastName = ctx.from.last_name || null;
      const username = ctx.from.username || null;

      botOrderService
        .upsertTelegramUser({
          telegramId,
          firstName,
          lastName,
          username,
        })
        .catch((err) => {
          console.warn("[Bot] Auto user sync warning:", err.message);
        });
    }
    await next();
  });

  // 3. Global Zero-Clock Callback Query Auto-Acknowledge Middleware
  bot.use(async (ctx, next) => {
    if (ctx.callbackQuery) {
      // Auto acknowledge callback to dismiss Telegram loading clock instantly
      ctx.answerCallbackQuery().catch(() => {});
    }
    await next();
  });

  // 4. Suspension Guard Middleware — blocks deactivated customers from any bot interaction
  bot.use(async (ctx, next) => {
    const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
    if (!telegramId) return next();

    const status = await botOrderService.getUserStatus(telegramId);
    if (status && status !== "ACTIVE") {
      console.warn(`[Bot] Blocked interaction from suspended user ${telegramId} (status: ${status})`);
      await ctx.reply(formatAccountSuspendedMessage(), { parse_mode: "HTML" }).catch(() => {});
      return;
    }
    return next();
  });

  // 4.1 Channel Membership Verification Helper
  async function ensureChannelMember(ctx: BotContext): Promise<boolean> {
    const userId = ctx.from?.id;
    if (!userId || !botConfig.FORCE_CHANNEL_JOIN || process.env.NODE_ENV === "test") {
      return true;
    }

    const now = Date.now();
    if (
      ctx.session.isChannelMember === true &&
      ctx.session.channelMemberCheckedAt &&
      now - ctx.session.channelMemberCheckedAt < 10 * 60 * 1000
    ) {
      return true;
    }

    const check = await channelVerificationService.checkMembership(ctx.api, userId);
    if (!check.isMember) {
      ctx.session.isChannelMember = false;
      await ctx.reply(formatForceJoinMessage(check.channelUsername), {
        parse_mode: "HTML",
        reply_markup: buildForceJoinKeyboard(check.channelUrl),
        ...(ctx.message ? { reply_parameters: { message_id: ctx.message.message_id } } : {}),
      });
      return false;
    }

    ctx.session.isChannelMember = true;
    ctx.session.channelMemberCheckedAt = now;
    return true;
  }

  // 4.2 Callback Query Channel Join Guard
  bot.use(async (ctx, next) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data !== "verify_channel_join") {
      const userId = ctx.from?.id;
      if (userId && botConfig.FORCE_CHANNEL_JOIN && process.env.NODE_ENV !== "test") {
        const now = Date.now();
        if (
          !ctx.session.isChannelMember ||
          !ctx.session.channelMemberCheckedAt ||
          now - ctx.session.channelMemberCheckedAt >= 10 * 60 * 1000
        ) {
          const check = await channelVerificationService.checkMembership(ctx.api, userId);
          if (!check.isMember) {
            ctx.session.isChannelMember = false;
            await ctx.answerCallbackQuery({
              text: `⚠️ ကျေးဇူးပြု၍ ကျွန်ုပ်တို့၏ Channel (${check.channelUsername}) ကို အရင် Join ပေးပါခင်ဗျာ။`,
              show_alert: true,
            });
            return;
          }
          ctx.session.isChannelMember = true;
          ctx.session.channelMemberCheckedAt = now;
        }
      }
    }
    return next();
  });

  // 5. Command Handlers (quoting user's message)
  bot.command(["start", "menu", "help"], async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    ctx.session.awaitingTopUpSlip = undefined;
    ctx.session.unmatchedPhotoFileId = undefined;
    const firstName = ctx.from?.first_name || "Customer";

    if (ctx.from?.id) {
      await botOrderService
        .upsertTelegramUser({
          telegramId: String(ctx.from.id),
          firstName: ctx.from.first_name || "Customer",
          lastName: ctx.from.last_name || null,
          username: ctx.from.username || null,
        })
        .catch(() => {});
    }

    if (!(await ensureChannelMember(ctx))) return;

    await ctx.reply(formatStartMessage(firstName), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(),
      ...(ctx.message ? { reply_parameters: { message_id: ctx.message.message_id } } : {}),
    });
  });

  bot.command("orders", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    if (!(await ensureChannelMember(ctx))) return;
    const telegramId = String(ctx.from?.id || "");
    const orders = await botOrderService.getUserOrders(telegramId);

    await ctx.reply(formatOrdersListMessage(orders.length), {
      parse_mode: "HTML",
      reply_markup: buildOrderListKeyboard(orders),
      ...(ctx.message ? { reply_parameters: { message_id: ctx.message.message_id } } : {}),
    });
  });

  bot.command("wallet", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    if (!(await ensureChannelMember(ctx))) return;
    const telegramId = String(ctx.from?.id || "");
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Customer";
    const stats = await botOrderService.getUserProfile(telegramId);

    await ctx.reply(
      formatWalletMessage({
        fullName,
        balanceMmk: stats.walletBalanceMmk,
        totalSpentMmk: stats.totalSpentMmk,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildWalletKeyboard(),
        ...(ctx.message ? { reply_parameters: { message_id: ctx.message.message_id } } : {}),
      }
    );
  });

  bot.command("profile", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    if (!(await ensureChannelMember(ctx))) return;
    const telegramId = String(ctx.from?.id || "");
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Customer";
    const username = ctx.from?.username;

    const stats = await botOrderService.getUserProfile(telegramId);

    await ctx.reply(
      formatProfileMessage({
        fullName,
        username,
        telegramId,
        joinedDate: stats.joinedDate,
        walletBalanceMmk: stats.walletBalanceMmk,
        totalDepositsMmk: stats.totalDepositsMmk,
        totalSpentMmk: stats.totalSpentMmk,
        ordersCount: stats.ordersCount,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildProfileKeyboard(),
        ...(ctx.message ? { reply_parameters: { message_id: ctx.message.message_id } } : {}),
      }
    );
  });

  // Developer & Instant Test Deposit Command (/deposit <amount>)
  bot.command("deposit", async (ctx) => {
    const telegramId = String(ctx.from?.id || "");
    const text = ctx.message?.text?.split(" ")[1] || "50000";
    const amount = parseInt(text, 10);

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("💡 အသုံးပြုပုံ: <code>/deposit 50000</code>", {
        parse_mode: "HTML",
        ...(ctx.message ? { reply_parameters: { message_id: ctx.message.message_id } } : {}),
      });
      return;
    }

    const newBalance = await botOrderService.creditWallet(telegramId, amount);
    await ctx.reply(formatTopUpSuccessMessage({ amountMmk: amount, newBalanceMmk: newBalance }), {
      parse_mode: "HTML",
      reply_markup: buildWalletKeyboard(),
      ...(ctx.message ? { reply_parameters: { message_id: ctx.message.message_id } } : {}),
    });
  });

  // 3.1 Force Channel Join Verification Callback
  bot.callbackQuery("verify_channel_join", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.answerCallbackQuery({ text: "အသုံးပြုသူ ရှာမတွေ့ပါ" });
      return;
    }

    const check = await channelVerificationService.checkMembership(ctx.api, userId);

    if (!check.isMember) {
      if (check.error === "BOT_NOT_ADMIN_OR_CHAT_NOT_FOUND") {
        await ctx.answerCallbackQuery({
          text: `⚠️ Bot သည် ${check.channelUsername} တွင် Admin ခန့်ထားခြင်း မရှိသေးပါ သို့မဟုတ် Channel ရှာမတွေ့ပါ။\nကျေးဇူးပြု၍ Bot ကို Channel Admin ခန့်ပေးပါရန် လိုအပ်ပါသည်။`,
          show_alert: true,
        });
      } else {
        await ctx.answerCallbackQuery({
          text: `❌ ${check.channelUsername} ကို မ Join ရသေးပါခင်ဗျာ!\n\nကျေးဇူးပြု၍ "📢 Join Channel" ခလုတ်ကို နှိပ်၍ အရင် Join ပြီးမှ ပြန်လည်နှိပ်ပေးပါရန်။`,
          show_alert: true,
        });
      }
      return;
    }

    // Successfully verified!
    ctx.session.isChannelMember = true;
    ctx.session.channelMemberCheckedAt = Date.now();

    await ctx.answerCallbackQuery({
      text: "🎉 Channel Join ထားရှိမှု အတည်ပြုပြီးပါပြီ! Arena Store မှ ကြိုဆိုပါသည်ခင်ဗျာ ✨",
    });

    const firstName = ctx.from?.first_name || "Customer";
    await ctx.editMessageText(formatStartMessage(firstName), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(),
    });
  });

  // 4. Main Menu Navigation
  bot.callbackQuery("menu_start", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    ctx.session.awaitingTopUpSlip = undefined;
    const firstName = ctx.from?.first_name || "Customer";

    await ctx.editMessageText(formatStartMessage(firstName), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(),
    });
  });

  // 5. Categories Grid (Screenshot 1)
  bot.callbackQuery("menu_categories", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    const categories = await botCatalog.getCategories();

    await ctx.editMessageText(formatCategoriesMessage(), {
      parse_mode: "HTML",
      reply_markup: buildCategoriesKeyboard(categories),
    });
  });

  // 6. Category Selection -> Products List (Screenshot 2)
  bot.callbackQuery(/^cat_(\d+)$/, async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
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
    ctx.session.awaitingCustomTopUp = false;
    const productId = parseInt(ctx.match[1], 10);
    const product = await botCatalog.getProductById(productId);

    if (!product) {
      await ctx.answerCallbackQuery({ text: "❌ ပစ္စည်း ရှာမတွေ့ပါခင်ဗျာ။", show_alert: true });
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

    const msgId = ctx.callbackQuery.message?.message_id;
    const promptText =
      product.stock === 1
        ? `${tgEmoji(BOT_EMOJIS.COUNTER, "🔢")} <b>Custom Quantity သတ်မှတ်ခြင်း:</b>\nလက်ရှိတွင် စတော့ 1 ခုသာ ရနိုင်ပါသဖြင့် ဝယ်ယူလိုပါက <code>1</code> ဟု ရိုက်ထည့်ပေးပါခင်ဗျာ:`
        : `${tgEmoji(BOT_EMOJIS.COUNTER, "🔢")} <b>Custom Quantity သတ်မှတ်ခြင်း:</b>\nဝယ်ယူလိုသော အရေအတွက် (1 မှ ${product.stock} အထိ) ကို ဂဏန်းအတိအကျ ရိုက်ထည့်ပေးပါခင်ဗျာ:`;

    await ctx.reply(promptText, {
      parse_mode: "HTML",
      ...(msgId ? { reply_parameters: { message_id: msgId } } : {}),
    });
  });

  // 11. Checkout: Buy Now — Wallet Balance Verification (Recommendations A & D)
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
      await ctx.answerCallbackQuery({ text: "❌ ပစ္စည်း ရှာမတွေ့ပါခင်ဗျာ။", show_alert: true });
      return;
    }

    if (!product.inStock || quantity > product.stock) {
      await ctx.answerCallbackQuery({
        text: "⚠️ ဝမ်းနည်းပါသည်၊ စတော့လက်ကျန် မလုံလောက်တော့ပါခင်ဗျာ။",
        show_alert: true,
      });
      return;
    }

    const totalMmk = product.retailPriceMmk * quantity;
    const telegramId = String(ctx.from?.id || "");
    const walletBalance = await botOrderService.getWalletBalance(telegramId);

    // Case 1: Insufficient Balance -> Smart Top-up Shortcut (Recommendation A)
    if (walletBalance < totalMmk) {
      const deficitMmk = totalMmk - walletBalance;
      await ctx.editMessageText(
        formatInsufficientBalanceMessage({
          productName: product.cleanName,
          quantity,
          totalMmk,
          walletBalanceMmk: walletBalance,
          deficitMmk,
        }),
        {
          parse_mode: "HTML",
          reply_markup: buildInsufficientBalanceKeyboard({ productId, quantity, deficitMmk }),
        }
      );
      return;
    }

    // Case 2: Sufficient Balance -> Confirmation Dialog (Recommendation D)
    const remainingBalance = walletBalance - totalMmk;
    await ctx.editMessageText(
      formatPurchaseConfirmMessage({
        productName: product.cleanName,
        quantity,
        totalMmk,
        walletBalanceMmk: walletBalance,
        remainingBalanceMmk: remainingBalance,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildPurchaseConfirmKeyboard({ productId, quantity }),
      }
    );
  });

  // 12. Instant Purchase Execution with Wallet Deduction (Recommendation D)
  bot.callbackQuery(/^buy_confirm_(\d+)_(\d+)$/, async (ctx) => {
    const productId = parseInt(ctx.match[1], 10);
    const quantity = parseInt(ctx.match[2], 10);
    const telegramId = String(ctx.from?.id || "");
    const customerName = ctx.from?.first_name || "Customer";
    const telegramUsername = ctx.from?.username;

    const result = await botOrderService.purchaseWithWallet({
      telegramId,
      customerName,
      telegramUsername,
      productId,
      quantity,
    });

    if (!result.success) {
      await ctx.answerCallbackQuery({
        text: result.errorMessage || "⚠️ ဝယ်ယူမှု မအောင်မြင်ပါခင်ဗျာ။",
        show_alert: true,
      });
      return;
    }

    // Instant Delivery right in chat!
    await ctx.editMessageText(
      formatWalletDeliveryMessage({
        publicOrderNo: result.publicOrderNo!,
        productName: result.productName!,
        quantity: result.quantity!,
        totalMmk: result.totalMmk!,
        remainingBalanceMmk: result.remainingBalance!,
        credentialsText: result.credentialsText!,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildOrderDetailKeyboard(),
      }
    );
  });

  // 13. Top-Up Presets Callbacks (Recommendation B)
  bot.callbackQuery(/^topup_amount_(\d+)$/, async (ctx) => {
    const amount = parseInt(ctx.match[1], 10);
    const telegramId = String(ctx.from?.id || "");

    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk: amount });
    const unmatchedPhoto = ctx.session.unmatchedPhotoFileId;

    if (unmatchedPhoto) {
      ctx.session.unmatchedPhotoFileId = undefined;
      ctx.session.awaitingTopUpSlip = undefined;
      ctx.session.awaitingCustomTopUp = false;

      await botOrderService.submitTopUpSlip({
        topUpId: topUp.reference,
        telegramId,
        fileId: unmatchedPhoto,
        amountMmk: amount,
        paymentMethod: "KPAY",
      });

      await ctx.answerCallbackQuery({ text: "ပြေစာပုံကို အလိုအလျောက် ပူးတွဲတင်ပြပြီးပါပြီ!" });
      await ctx.editMessageText(
        formatTopUpSlipReceivedMessage({ amountMmk: amount, reference: topUp.reference }),
        {
          parse_mode: "HTML",
          reply_markup: buildMainMenuKeyboard(),
        }
      );
      return;
    }

    ctx.session.awaitingTopUpSlip = {
      topUpId: topUp.reference,
      amountMmk: amount,
      reference: topUp.reference,
    };
    ctx.session.awaitingCustomTopUp = false;
    const settings = await botSettingsService.getSettings();

    await ctx.editMessageText(
      formatTopUpInvoiceMessage({ amountMmk: amount, reference: topUp.reference, paymentInfo: settings }),
      {
        parse_mode: "HTML",
        reply_markup: buildTopUpInvoiceKeyboard(),
      }
    );
  });

  // 14. Top-Up for Deficit Shortcut (Recommendation A)
  bot.callbackQuery(/^topup_deficit_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
    const productId = parseInt(ctx.match[1], 10);
    const quantity = parseInt(ctx.match[2], 10);
    const deficit = parseInt(ctx.match[3], 10);
    const telegramId = String(ctx.from?.id || "");

    ctx.session.intendedOrderAfterTopUp = { productId, quantity };
    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk: deficit });
    const unmatchedPhoto = ctx.session.unmatchedPhotoFileId;

    if (unmatchedPhoto) {
      ctx.session.unmatchedPhotoFileId = undefined;
      ctx.session.awaitingTopUpSlip = undefined;
      ctx.session.awaitingCustomTopUp = false;

      await botOrderService.submitTopUpSlip({
        topUpId: topUp.reference,
        telegramId,
        fileId: unmatchedPhoto,
        amountMmk: deficit,
        paymentMethod: "KPAY",
      });

      await ctx.answerCallbackQuery({ text: "ပြေစာပုံကို အလိုအလျောက် ပူးတွဲတင်ပြပြီးပါပြီ!" });
      await ctx.editMessageText(
        formatTopUpSlipReceivedMessage({ amountMmk: deficit, reference: topUp.reference }),
        {
          parse_mode: "HTML",
          reply_markup: buildMainMenuKeyboard(),
        }
      );
      return;
    }

    ctx.session.awaitingTopUpSlip = {
      topUpId: topUp.reference,
      amountMmk: deficit,
      reference: topUp.reference,
    };
    ctx.session.awaitingCustomTopUp = false;
    const settings = await botSettingsService.getSettings();

    await ctx.editMessageText(
      formatTopUpInvoiceMessage({ amountMmk: deficit, reference: topUp.reference, paymentInfo: settings }),
      {
        parse_mode: "HTML",
        reply_markup: buildTopUpInvoiceKeyboard(),
      }
    );
  });

  // 15. Custom Top-Up Amount Prompt
  bot.callbackQuery("topup_custom", async (ctx) => {
    ctx.session.awaitingCustomTopUp = true;
    const msgId = ctx.callbackQuery.message?.message_id;

    await ctx.reply(
      `${tgEmoji(BOT_EMOJIS.COUNTER, "🔢")} <b>စိတ်ကြိုက် ငွေဖြည့်သွင်းခြင်း:</b>\nဖြည့်သွင်းလိုသော ပမာဏ (MMK) ကို ဂဏန်းအတိအကျ ရိုက်ထည့်ပေးပါခင်ဗျာ (ဥပမာ: <code>15000</code>):`,
      {
        parse_mode: "HTML",
        ...(msgId ? { reply_parameters: { message_id: msgId } } : {}),
      }
    );
  });

  // 16. Cancel Top-Up
  bot.callbackQuery("cancel_topup", async (ctx) => {
    ctx.session.awaitingTopUpSlip = undefined;
    ctx.session.awaitingCustomTopUp = false;
    ctx.session.intendedOrderAfterTopUp = undefined;
    ctx.session.unmatchedPhotoFileId = undefined;

    const telegramId = String(ctx.from?.id || "");
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Customer";
    const stats = await botOrderService.getUserProfile(telegramId);

    await ctx.editMessageText(
      formatWalletMessage({
        fullName,
        balanceMmk: stats.walletBalanceMmk,
        totalSpentMmk: stats.totalSpentMmk,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildWalletKeyboard(),
      }
    );
  });

  // 17. Wallet Dashboard (Recommendation B)
  bot.callbackQuery("menu_wallet", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    const telegramId = String(ctx.from?.id || "");
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Customer";
    const stats = await botOrderService.getUserProfile(telegramId);

    await ctx.editMessageText(
      formatWalletMessage({
        fullName,
        balanceMmk: stats.walletBalanceMmk,
        totalSpentMmk: stats.totalSpentMmk,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildWalletKeyboard(),
      }
    );
  });

  // 18. Orders Menu (Listing Real Orders & Delivery Viewer)
  bot.callbackQuery("menu_orders", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    const telegramId = String(ctx.from?.id || "");
    const orders = await botOrderService.getUserOrders(telegramId);

    await ctx.editMessageText(formatOrdersListMessage(orders.length), {
      parse_mode: "HTML",
      reply_markup: buildOrderListKeyboard(orders),
    });
  });

  // 19. Single Order Detail & Credentials Viewer
  bot.callbackQuery(/^view_order_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const order = await botOrderService.getOrderById(orderId);

    if (!order) {
      await ctx.answerCallbackQuery({ text: "အော်ဒါ ရှာမတွေ့ပါခင်ဗျာ။", show_alert: true });
      return;
    }

    await ctx.editMessageText(formatOrderDetailMessage(order), {
      parse_mode: "HTML",
      reply_markup: buildOrderDetailKeyboard(),
    });
  });

  // 20. My Profile Menu Navigation
  bot.callbackQuery("menu_profile", async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    const telegramId = String(ctx.from?.id || "");
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Customer";
    const username = ctx.from?.username;

    const stats = await botOrderService.getUserProfile(telegramId);

    await ctx.editMessageText(
      formatProfileMessage({
        fullName,
        username,
        telegramId,
        joinedDate: stats.joinedDate,
        walletBalanceMmk: stats.walletBalanceMmk,
        totalDepositsMmk: stats.totalDepositsMmk,
        totalSpentMmk: stats.totalSpentMmk,
        ordersCount: stats.ordersCount,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildProfileKeyboard(),
      }
    );
  });

  // 21. Customer Sends Photo (Top-Up Slip Proof Receipt)
  bot.on("message:photo", async (ctx) => {
    let topUpSlip = ctx.session.awaitingTopUpSlip;
    const telegramId = String(ctx.from?.id || "");

    // Fallback: If session was lost (e.g. process restart), query DB for latest pending top-up
    if (!topUpSlip && telegramId) {
      const pending = await botOrderService.getLatestPendingTopUp(telegramId);
      if (pending) {
        topUpSlip = {
          topUpId: pending.reference,
          amountMmk: pending.amountMmk,
          reference: pending.reference,
        };
      }
    }

    // Top-up receipt slip
    if (topUpSlip) {
      const { topUpId, amountMmk, reference } = topUpSlip;
      const photo = ctx.message.photo;
      const highestRes = photo[photo.length - 1];
      const fileId = highestRes.file_id;

      await botOrderService.submitTopUpSlip({
        topUpId: reference || topUpId,
        telegramId,
        fileId,
        amountMmk,
        paymentMethod: "KPAY",
      });

      ctx.session.awaitingTopUpSlip = undefined;
      ctx.session.awaitingCustomTopUp = false;
      ctx.session.unmatchedPhotoFileId = undefined;

      await ctx.reply(formatTopUpSlipReceivedMessage({ amountMmk, reference }), {
        parse_mode: "HTML",
        reply_markup: buildMainMenuKeyboard(),
        reply_parameters: { message_id: ctx.message.message_id },
      });
      return;
    }

    // Unmatched photo: user sent photo before selecting top-up amount
    const photo = ctx.message.photo;
    const highestRes = photo[photo.length - 1];
    const fileId = highestRes?.file_id;
    if (fileId) {
      ctx.session.unmatchedPhotoFileId = fileId;
    }

    // Friendly photo guidance with parse_mode: "HTML" and quick preset options
    await ctx.reply(
      `${tgEmoji(BOT_EMOJIS.RECEIPT, "🧾")} <b>ငွေလွှဲပြေစာ ပုံ လက်ခံရရှိပါသည်!</b>\n\n` +
      `Wallet ထဲသို့ ငွေဖြည့်သွင်းလိုပါက လွှဲပြောင်းခဲ့သည့် <b>ငွေပမာဏ (MMK)</b> ကို အောက်တွင် ရွေးချယ်ပေးပါခင်ဗျာ ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}\n\n` +
      `<i>(ရွေးချယ်ပြီးပါက သင်ပေးပို့ထားသော ပြေစာပုံဖြင့် အလိုအလျောက် ပူးတွဲတင်ပြပေးသွားပါမည်)</i>`,
      {
        parse_mode: "HTML",
        reply_markup: buildUnmatchedPhotoKeyboard(),
        reply_parameters: { message_id: ctx.message.message_id },
      }
    );
  });

  // 22. Text Handler (Custom Quantity, Custom Top-Up, Custom Emoji Detection, Fallback)
  bot.on("message:text", async (ctx) => {
    // Custom Emoji Detector (extracts custom emoji ID and HTML tag, replying to user msg)
    const customEmojiEntity = ctx.message.entities?.find(
      (e) => e.type === "custom_emoji" && (e as any).custom_emoji_id
    );
    if (customEmojiEntity) {
      const customId = (customEmojiEntity as any).custom_emoji_id;
      const emojiText = ctx.message.text.slice(
        customEmojiEntity.offset,
        customEmojiEntity.offset + customEmojiEntity.length
      );
      await ctx.reply(
        `✨ <b>Custom Emoji Detected</b>\n\n• <b>Emoji:</b> ${escapeHtml(emojiText)}\n• <b>Custom ID:</b> <code>${customId}</code> <i>(tap to copy)</i>\n• <b>HTML Tag:</b> <code>&lt;tg-emoji emoji-id="${customId}"&gt;${escapeHtml(emojiText)}&lt;/tg-emoji&gt;</code>\n\n💡 <i>You can copy this ID into the Admin Panel under Animated Emojis!</i>`,
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message.message_id },
        }
      );
      return;
    }

    // Custom Top-Up Amount Input
    if (ctx.session.awaitingCustomTopUp) {
      const text = ctx.message.text.trim();
      const amount = parseInt(text, 10);
      const telegramId = String(ctx.from?.id || "");

      if (isNaN(amount) || amount < 1000) {
        await ctx.reply(
          `${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} အနည်းဆုံး 1,000 MMK မှစ၍ မှန်ကန်သော ငွေပမာဏကိုသာ ရိုက်ထည့်ပေးပါခင်ဗျာ (ဥပမာ: <code>15000</code>):`,
          {
            parse_mode: "HTML",
            reply_parameters: { message_id: ctx.message.message_id },
          }
        );
        return;
      }

      ctx.session.awaitingCustomTopUp = false;
      const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk: amount });
      const unmatchedPhoto = ctx.session.unmatchedPhotoFileId;

      if (unmatchedPhoto) {
        ctx.session.unmatchedPhotoFileId = undefined;
        ctx.session.awaitingTopUpSlip = undefined;

        await botOrderService.submitTopUpSlip({
          topUpId: topUp.reference,
          telegramId,
          fileId: unmatchedPhoto,
          amountMmk: amount,
          paymentMethod: "KPAY",
        });

        await ctx.reply(
          formatTopUpSlipReceivedMessage({ amountMmk: amount, reference: topUp.reference }),
          {
            parse_mode: "HTML",
            reply_markup: buildMainMenuKeyboard(),
            reply_parameters: { message_id: ctx.message.message_id },
          }
        );
        return;
      }

      ctx.session.awaitingTopUpSlip = {
        topUpId: topUp.reference,
        amountMmk: amount,
        reference: topUp.reference,
      };

      const settings = await botSettingsService.getSettings();
      await ctx.reply(
        formatTopUpInvoiceMessage({ amountMmk: amount, reference: topUp.reference, paymentInfo: settings }),
        {
          parse_mode: "HTML",
          reply_markup: buildTopUpInvoiceKeyboard(),
          reply_parameters: { message_id: ctx.message.message_id },
        }
      );
      return;
    }

    // Custom Product Quantity Input
    if (ctx.session.awaitingCustomQuantity && ctx.session.activeProductId) {
      const text = ctx.message.text.trim();
      const qty = parseInt(text, 10);
      const product = await botCatalog.getProductById(ctx.session.activeProductId);

      if (!product || isNaN(qty) || qty < 1 || qty > product.stock) {
        const errorMsg =
          product && product.stock === 1
            ? `${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} လက်ရှိတွင် စတော့ 1 ခုသာ ရနိုင်ပါသဖြင့် <code>1</code> ဟုသာ ရိုက်ထည့်ပေးပါခင်ဗျာ:`
            : `${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} ကျေးဇူးပြု၍ 1 မှ ${product ? product.stock : 100} အထိ မှန်ကန်သော ဂဏန်းကိုသာ ရိုက်ထည့်ပေးပါခင်ဗျာ:`;

        await ctx.reply(errorMsg, {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message.message_id },
        });
        return;
      }

      ctx.session.awaitingCustomQuantity = false;
      ctx.session.selectedQuantity = qty;

      await ctx.reply(formatProductDetailMessage(product, qty), {
        parse_mode: "HTML",
        reply_markup: buildProductDetailKeyboard(product, qty),
        reply_parameters: { message_id: ctx.message.message_id },
      });
      return;
    }

    // Default friendly fallback
    await ctx.reply(
      `မင်္ဂလာပါခင်ဗျာ! အောက်ပါ မီနူးမှတစ်ဆင့် ပစ္စည်းများကို ရွေးချယ်ဝယ်ယူနိုင်ပါသည် ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`,
      {
        parse_mode: "HTML",
        reply_markup: buildMainMenuKeyboard(),
        reply_parameters: { message_id: ctx.message.message_id },
      }
    );
  });

  // 23. No-op callback handler
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
