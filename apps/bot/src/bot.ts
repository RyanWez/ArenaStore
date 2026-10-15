import { Bot, session, InlineKeyboard, InputFile } from "grammy";
import { botConfig } from "./config";
import { BotContext, createInitialSessionData } from "./types";
import { botCatalog } from "./services/catalog.service";
import { botOrderService } from "./services/order.service";
import { botSettingsService, resolveTelegramSupportUrl } from "./services/settings.service";
import { generateQrImageBuffer } from "./services/qr.service";
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
  buildTopUpCancelConfirmKeyboard,
  buildPaymentMethodChoiceKeyboard,
  buildMmpayInvoiceKeyboard,
  buildMmpayCancelConfirmKeyboard,
  buildActiveMmpayPromptKeyboard,
  buildInsufficientBalanceKeyboard,
  buildPurchaseConfirmKeyboard,
  buildOrderDetailKeyboard,
  buildUnmatchedPhotoKeyboard,
  buildForceJoinKeyboard,
  buildHelpKeyboard,
  buildMaintenanceKeyboard,
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
  formatMmpayQrInvoiceMessage,
  formatPaymentMethodChoiceMessage,
  formatActiveMmpayExistsMessage,
  formatMmpaySuccessMessage,
  formatMmpayFailedMessage,
  formatTopUpSlipReceivedMessage,
  formatInsufficientBalanceMessage,
  formatPurchaseConfirmMessage,
  formatWalletDeliveryMessage,
  formatOrdersListMessage,
  formatOrderDetailMessage,
  formatAccountSuspendedMessage,
  formatForceJoinMessage,
  formatMaintenanceMessage,
} from "./formatters/messages";
import { channelVerificationService } from "./services/channel-verification.service";
import { notifyAdminGroupDepositSlip } from "./services/admin-group.service";
import { registerAdminDepositReviewHandlers } from "./handlers/admin-deposit-review";
import { BOT_EMOJIS, tgEmoji, escapeHtml, TopUpStatus } from "@arena/shared";

/**
 * Bot commands registered in the Telegram Bot menu (☰ button).
 */
export const BOT_COMMANDS = [
  { command: "start", description: "Bot ကိုစတင်ရန်" },
  { command: "products", description: "ပစ္စည်းများ ကြည့်ရှုဝယ်ယူရန်" },
  { command: "orders", description: "မှာယူထားသည်များကို ကြည့်ရန်" },
  { command: "wallet", description: "Wallet လက်ကျန်ငွေ စစ်ဆေးရန်" },
  { command: "profile", description: "မိမိ၏ အကောင့်အချက်အလက်" },
  { command: "help", description: "Customer Support & အကူအညီ" },
] as const;

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(botConfig.TELEGRAM_BOT_TOKEN);

  // In-flight locks to prevent concurrent duplicate actions (double-taps / burst photos)
  const activeTopUpLocks = new Set<string>();
  const activePhotoUploadLocks = new Set<string>();
  const activeMmpayCheckCooldowns = new Map<string, number>();

  // 0. Admin-Group Deposit Review Callbacks
  // Must be registered BEFORE the private-chat-only guard below: the guard
  // swallows every non-private update, so the ✅/❌ buttons on relayed slip
  // messages in the admin group are the one sanctioned group interaction.
  // They also never reach session/user-sync/channel-verification, so an
  // admin clicking them is not auto-created as a customer.
  registerAdminDepositReviewHandlers(bot);

  // 0.1 Private-Chat-Only Guard
  // The bot only converses in DMs. In groups (e.g. the admin Deposit relay
  // group) it is a poster only — never a participant. This stops it from
  // replying to group chatter and from bot-vs-bot loops with other bots
  // in the same group. Deposit notifications are outbound api calls and
  // the review-button callbacks above are unaffected by this guard.
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type && ctx.chat.type !== "private") return;
    await next();
  });

  // 1. Session Middleware
  bot.use(
    session({
      initial: createInitialSessionData,
    })
  );

  // 2. Global Telegram User Profile Auto-Sync Middleware
  // Immediately synchronizes Name, @username, and Telegram ID to DB on any interaction
  // and updates Last Active timestamp with 5-minute in-memory throttling
  bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id) {
      const telegramId = String(ctx.from.id);
      
      // High-performance last active tracker (5-minute in-memory cooldown, 0ms latency)
      botOrderService.touchLastActive(telegramId);

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

  // 4.05 Maintenance Mode Guard Middleware — holds customer interactions while allowing admin testing
  bot.use(async (ctx, next) => {
    const settings = await botSettingsService.getSettings();
    if (!settings.isMaintenanceMode) {
      return next();
    }

    const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
    if (!telegramId) return next();

    // Whitelist approvers and admin staff from maintenance restriction
    const approverIds = (settings.telegramApproverIds || botConfig.TELEGRAM_APPROVER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const isApprover = approverIds.includes(telegramId);

    if (isApprover) {
      return next();
    }

    const role = await botOrderService.getUserRole(telegramId);
    if (role === "ADMIN" || role === "SUPERADMIN") {
      return next();
    }

    // Normal customer blocked during maintenance mode
    if (ctx.callbackQuery) {
      await ctx
        .answerCallbackQuery({
          text: "🔧 စနစ်ကို ခေတ္တ ပြုပြင်ထိန်းသိမ်းနေပါသဖြင့် မကြာမီ ပုံမှန်အတိုင်း ပြန်လည် အသုံးပြုနိုင်ပါမည်ခင်ဗျာ။",
          show_alert: true,
        })
        .catch(() => {});
      return;
    }

    const supportUrl = resolveTelegramSupportUrl(settings.supportTelegramHandle);
    await ctx
      .reply(formatMaintenanceMessage(supportUrl), {
        parse_mode: "HTML",
        reply_markup: buildMaintenanceKeyboard(supportUrl),
      })
      .catch(() => {});
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

  // 5. Command Handlers
  bot.command(["start", "menu"], async (ctx) => {
    const telegramId = String(ctx.from?.id || "");
    if (ctx.session.awaitingTopUpSlip?.reference) {
      void botOrderService.cancelTopUpRequest(ctx.session.awaitingTopUpSlip.reference, telegramId);
    }
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    ctx.session.awaitingTopUpSlip = undefined;
    ctx.session.unmatchedPhotoFileId = undefined;
    const firstName = ctx.from?.first_name || "Customer";

    if (!(await ensureChannelMember(ctx))) return;

    // Deep-link support: /start restock_<productId>, /start prod_<productId>, or section deep links
    const deepLinkPayload = ctx.match?.trim();
    if (deepLinkPayload) {
      // 1. Product detail deep-link: /start prod_<id>, /start restock_<id>, /start <id>
      const prodMatch = deepLinkPayload.match(/^(?:restock_|prod_)?(\d+)$/);
      if (prodMatch && !deepLinkPayload.startsWith("cat_")) {
        const productId = parseInt(prodMatch[1], 10);
        const product = await botCatalog.getProductById(productId);

        if (product) {
          ctx.session.activeProductId = productId;
          ctx.session.activeCategoryId = product.categoryId;
          ctx.session.selectedQuantity = 1;

          await ctx.reply(formatProductDetailMessage(product, 1), {
            parse_mode: "HTML",
            reply_markup: buildProductDetailKeyboard(product, 1),
          });
          return;
        }
      }

      // 2. Category deep-link: /start cat_<categoryId>
      const catMatch = deepLinkPayload.match(/^(?:cat_|category_)(\d+)$/);
      if (catMatch) {
        const categoryId = parseInt(catMatch[1], 10);
        const products = await botCatalog.getProductsByCategory(categoryId);
        const category = await botCatalog.getCategoryById(categoryId);
        const categoryName = category?.name || "ပစ္စည်းများ";
        await ctx.reply(formatProductsListMessage(categoryName), {
          parse_mode: "HTML",
          reply_markup: buildProductsKeyboard(categoryId, products),
        });
        return;
      }

      // 3. Products / Store catalog deep-link: /start products, /start store
      if (["products", "store", "shop"].includes(deepLinkPayload)) {
        const categories = await botCatalog.getCategories();
        await ctx.reply(formatCategoriesMessage(), {
          parse_mode: "HTML",
          reply_markup: buildCategoriesKeyboard(categories, 0),
        });
        return;
      }

      // 4. Wallet dashboard deep-link: /start wallet
      if (deepLinkPayload === "wallet") {
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
          }
        );
        return;
      }

      // 5. Orders history deep-link: /start orders
      if (deepLinkPayload === "orders") {
        const orders = await botOrderService.getUserOrders(telegramId);
        await ctx.reply(formatOrdersListMessage(orders.length), {
          parse_mode: "HTML",
          reply_markup: buildOrderListKeyboard(orders),
        });
        return;
      }

      // 6. Profile deep-link: /start profile
      if (deepLinkPayload === "profile") {
        const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Customer";
        const stats = await botOrderService.getUserProfile(telegramId);
        await ctx.reply(
          formatProfileMessage({
            fullName,
            username: ctx.from?.username,
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
        return;
      }

      // 7. Help & Support deep-link: /start help, /start support
      if (["help", "support"].includes(deepLinkPayload)) {
        const settings = await botSettingsService.getSettings();
        const supportUrl = resolveTelegramSupportUrl(settings.supportTelegramHandle);
        await ctx.reply(
          `${tgEmoji(BOT_EMOJIS.CHAT, "💬")} <b>Customer Support</b>\n\n` +
          `အော်ဒါများနှင့် ငွေဖြည့်သွင်းမှုများအတွက် အကူအညီ လိုအပ်ပါက Support ထံ တိုက်ရိုက် ဆက်သွယ် မေးမြန်းနိုင်ပါသည်ခင်ဗျာ။`,
          {
            parse_mode: "HTML",
            reply_markup: buildHelpKeyboard(supportUrl),
          }
        );
        return;
      }
    }

    const supportUrl = await botSettingsService.getSupportUrl();
    await ctx.reply(formatStartMessage(firstName), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(supportUrl),
    });
  });

  bot.command(["products", "store", "shop"], async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    if (!(await ensureChannelMember(ctx))) return;

    const categories = await botCatalog.getCategories();
    await ctx.reply(formatCategoriesMessage(), {
      parse_mode: "HTML",
      reply_markup: buildCategoriesKeyboard(categories, 0),
    });
  });

  bot.command(["help", "support"], async (ctx) => {
    if (!(await ensureChannelMember(ctx))) return;
    const settings = await botSettingsService.getSettings();
    const supportUrl = resolveTelegramSupportUrl(settings.supportTelegramHandle);

    await ctx.reply(
      `${tgEmoji(BOT_EMOJIS.CHAT, "💬")} <b>Customer Support</b>\n\n` +
      `အော်ဒါများနှင့် ငွေဖြည့်သွင်းမှုများအတွက် အကူအညီ လိုအပ်ပါက Support ထံ တိုက်ရိုက် ဆက်သွယ် မေးမြန်းနိုင်ပါသည်ခင်ဗျာ။`,
      {
        parse_mode: "HTML",
        reply_markup: buildHelpKeyboard(supportUrl),
      }
    );
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
      }
    );
  });

  // Wallet crediting is Dashboard/admin-only — /deposit must never credit from Telegram.
  bot.command("deposit", async (ctx) => {
    await ctx.reply(
      "🔒 လုံခြုံရေးအကြောင်းပြချက်ဖြင့် တိုက်ရိုက်ငွေသွင်းသည့် command ကို ပိတ်ထားပါသည်။\n\n💰 ငွေသွင်းလိုပါက <b>Wallet → ဘဏ်/အိတ်မှ ငွေသွင်းပါ</b> မှတဆင့် slip တင်ပြီး Admin စစ်ဆေးအတည်ပြုပေးမှုဖြင့်သာ ငွေထည့်သွင်းနိုင်ပါသည်။",
      {
        parse_mode: "HTML",
        reply_markup: buildWalletKeyboard(),
      }
    );
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
    const supportUrl = await botSettingsService.getSupportUrl();
    await ctx.editMessageText(formatStartMessage(firstName), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(supportUrl),
    });
  });

  // 4. Main Menu Navigation
  bot.callbackQuery("menu_start", async (ctx) => {
    const telegramId = String(ctx.from?.id || "");
    if (ctx.session.awaitingTopUpSlip?.reference) {
      void botOrderService.cancelTopUpRequest(ctx.session.awaitingTopUpSlip.reference, telegramId);
    }
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    ctx.session.awaitingTopUpSlip = undefined;
    const firstName = ctx.from?.first_name || "Customer";

    const supportUrl = await botSettingsService.getSupportUrl();
    await ctx.editMessageText(formatStartMessage(firstName), {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(supportUrl),
    });
  });

  // 5. Categories Grid (Screenshot 1)
  bot.callbackQuery(/^menu_categories(?:_p(\d+))?$/, async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    const page = ctx.match[1] ? parseInt(ctx.match[1], 10) : 0;
    const categories = await botCatalog.getCategories();

    await ctx.editMessageText(formatCategoriesMessage(), {
      parse_mode: "HTML",
      reply_markup: buildCategoriesKeyboard(categories, page),
    });
  });

  // 6. Category Selection -> Products List (Screenshot 2)
  bot.callbackQuery(/^cat_(\d+)(?:_p(\d+))?$/, async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    const categoryId = parseInt(ctx.match[1], 10);
    const page = ctx.match[2] ? parseInt(ctx.match[2], 10) : 0;
    ctx.session.activeCategoryId = categoryId;

    const category = await botCatalog.getCategoryById(categoryId);
    const products = await botCatalog.getProductsByCategory(categoryId);
    const categoryName = category ? category.cleanName : "Category";

    await ctx.editMessageText(formatProductsListMessage(categoryName), {
      parse_mode: "HTML",
      reply_markup: buildProductsKeyboard(categoryId, products, page),
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
        ? `${tgEmoji(BOT_EMOJIS.EDIT, "✏️")} <b>စိတ်ကြိုက် အရေအတွက် သတ်မှတ်ခြင်း:</b>\nလက်ရှိတွင် စတော့ 1 ခုသာ ရနိုင်ပါသဖြင့် ဝယ်ယူလိုပါက <code>1</code> ဟု ရိုက်ထည့်ပေးပါခင်ဗျာ:`
        : `${tgEmoji(BOT_EMOJIS.EDIT, "✏️")} <b>စိတ်ကြိုက် အရေအတွက် သတ်မှတ်ခြင်း:</b>\nဝယ်ယူလိုသော အရေအတွက် (1 မှ ${product.stock} အထိ) ကို ဂဏန်းအတိအကျ ရိုက်ထည့်ပေးပါခင်ဗျာ:`;

    await ctx.reply(promptText, {
      parse_mode: "HTML",
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
        viewUrl: result.viewUrl,
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

    if (activeTopUpLocks.has(telegramId)) {
      await ctx.answerCallbackQuery({ text: "ခေတ္တစောင့်ပေးပါခင်ဗျာ..." }).catch(() => {});
      return;
    }
    activeTopUpLocks.add(telegramId);

    try {
      // 1. Check for unexpired active MMQR order (Rule 8: Single Active Order)
      const activeMmpay = await botOrderService.getActiveMmpayTopUp(telegramId);
      if (activeMmpay) {
        await ctx.editMessageText(
          formatActiveMmpayExistsMessage({
            reference: activeMmpay.reference,
            amountMmk: activeMmpay.amountMmk,
            expiresAt: activeMmpay.expiresAt,
          }),
          {
            parse_mode: "HTML",
            reply_markup: buildActiveMmpayPromptKeyboard(activeMmpay.reference),
          }
        );
        return;
      }

      const unmatchedPhoto = ctx.session.unmatchedPhotoFileId;
      if (unmatchedPhoto) {
        const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk: amount });
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
        void notifyAdminGroupDepositSlip(ctx.api, ctx.from, {
          topUpId: topUp.id,
          reference: topUp.reference,
          amountMmk: amount,
          fileId: unmatchedPhoto,
          telegramId,
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

      // Prompt choice: MMQR vs Manual Slip
      await ctx.editMessageText(
        formatPaymentMethodChoiceMessage({ amountMmk: amount }),
        {
          parse_mode: "HTML",
          reply_markup: buildPaymentMethodChoiceKeyboard(amount),
        }
      );
    } finally {
      setTimeout(() => activeTopUpLocks.delete(telegramId), 1500);
    }
  });

  // 14. Top-Up for Deficit Shortcut (Recommendation A)
  bot.callbackQuery(/^topup_deficit_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
    const productId = parseInt(ctx.match[1], 10);
    const quantity = parseInt(ctx.match[2], 10);
    const deficit = parseInt(ctx.match[3], 10);
    const telegramId = String(ctx.from?.id || "");

    ctx.session.intendedOrderAfterTopUp = { productId, quantity };

    const activeMmpay = await botOrderService.getActiveMmpayTopUp(telegramId);
    if (activeMmpay) {
      await ctx.editMessageText(
        formatActiveMmpayExistsMessage({
          reference: activeMmpay.reference,
          amountMmk: activeMmpay.amountMmk,
          expiresAt: activeMmpay.expiresAt,
        }),
        {
          parse_mode: "HTML",
          reply_markup: buildActiveMmpayPromptKeyboard(activeMmpay.reference),
        }
      );
      return;
    }

    const unmatchedPhoto = ctx.session.unmatchedPhotoFileId;
    if (unmatchedPhoto) {
      const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk: deficit });
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
      void notifyAdminGroupDepositSlip(ctx.api, ctx.from, {
        topUpId: topUp.id,
        reference: topUp.reference,
        amountMmk: deficit,
        fileId: unmatchedPhoto,
        telegramId,
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

    // Prompt payment method choice for deficit
    await ctx.editMessageText(
      formatPaymentMethodChoiceMessage({ amountMmk: deficit }),
      {
        parse_mode: "HTML",
        reply_markup: buildPaymentMethodChoiceKeyboard(deficit, `def_${productId}_${quantity}`),
      }
    );
  });

  // 14A. MyanMyanPay MMQR Instant Auto-Payment Request
  bot.callbackQuery(/^mmpay_pay_(\d+)(?:_(.+))?$/, async (ctx) => {
    const amount = parseInt(ctx.match[1], 10);
    const intendedContext = ctx.match[2];
    const telegramId = String(ctx.from?.id || "");

    if (activeTopUpLocks.has(telegramId)) {
      await ctx.answerCallbackQuery({ text: "ခေတ္တစောင့်ပေးပါခင်ဗျာ..." }).catch(() => {});
      return;
    }
    activeTopUpLocks.add(telegramId);

    try {
      await ctx.answerCallbackQuery({ text: "MMQR ဖန်တီးနေပါသည်..." }).catch(() => {});
      await ctx.replyWithChatAction("upload_photo").catch(() => {});

      const res = await botOrderService.createMmpayTopUp({
        telegramId,
        amountMmk: amount,
        intendedProduct: intendedContext,
      });

      if (!res.ok || !res.qr || !res.reference || !res.expiresAt) {
        await ctx.editMessageText(
          `${tgEmoji(BOT_EMOJIS.WARNING, "⚠️")} <b>MMQR ဖန်တီးရာတွင် အဆင်မပြေဖြစ်သွားပါသည်:</b>\n<code>${escapeHtml(res.error || "Gateway error")}</code>\n\nကျေးဇူးပြု၍ ပြေစာ စလစ်တင်သည့် နည်းလမ်းဖြင့် ဆက်လက် ပေးချေပေးပါခင်ဗျာ။`,
          {
            parse_mode: "HTML",
            reply_markup: buildPaymentMethodChoiceKeyboard(amount, intendedContext),
          }
        );
        return;
      }

      const qrBuffer = await generateQrImageBuffer(res.qr);
      await ctx.deleteMessage().catch(() => {});

      const sentQr = await ctx.replyWithPhoto(new InputFile(qrBuffer, `mmqr-${res.reference}.png`), {
        caption: formatMmpayQrInvoiceMessage({
          amountMmk: res.amountMmk || amount,
          reference: res.reference,
          expiresAt: res.expiresAt,
        }),
        parse_mode: "HTML",
        reply_markup: buildMmpayInvoiceKeyboard(res.reference),
      });
      // Remember this invoice message so the webhook can clear it on payment,
      // and delete any previously tracked QR photo so a re-issue never leaves a
      // stale card lingering in the chat.
      const prevQrId = await botOrderService.attachMmpayQrMessage(res.reference, sentQr.message_id);
      if (prevQrId && ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, prevQrId).catch(() => {});
      }
    } catch (err: any) {
      console.error("[Bot] mmpay_pay error:", err.message);
      await ctx.reply("⚠️ MMQR ပြုလုပ်ရာတွင် ချို့ယွင်းချက် ဖြစ်ပေါ်ခဲ့ပါသည်။ ခေတ္တစောင့်ပြီး ပြန်လည် ကြိုးစားပေးပါခင်ဗျာ။");
    } finally {
      setTimeout(() => activeTopUpLocks.delete(telegramId), 1500);
    }
  });

  // 14B. Manual Slip Top-Up Selection (Preserving Existing Manual Flow)
  bot.callbackQuery(/^manual_slip_(\d+)(?:_(.+))?$/, async (ctx) => {
    const amount = parseInt(ctx.match[1], 10);
    const intendedContext = ctx.match[2];
    const telegramId = String(ctx.from?.id || "");

    const topUp = await botOrderService.createTopUpRequest({
      telegramId,
      amountMmk: amount,
      intendedProduct: intendedContext,
    });

    ctx.session.awaitingTopUpSlip = {
      topUpId: topUp.reference,
      amountMmk: amount,
      reference: topUp.reference,
      dbId: topUp.id,
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

  // 14C. Re-show Active MMQR Invoice (Compliance Rule 7: Data Caching)
  bot.callbackQuery(/^mmpay_show_(.+)$/, async (ctx) => {
    const reference = ctx.match[1];
    const telegramId = String(ctx.from?.id || "");

    const active = await botOrderService.getActiveMmpayTopUp(telegramId);
    if (!active || active.reference !== reference) {
      await ctx.answerCallbackQuery({ text: "အော်ဒါ သက်တမ်းကုန်ဆုံးသွားပါပြီ သို့မဟုတ် မရှိတော့ပါခင်ဗျာ။", show_alert: true });
      const stats = await botOrderService.getUserProfile(telegramId);
      const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Customer";
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
      return;
    }

    await ctx.answerCallbackQuery({ text: "QR ကုဒ်ကို ပြသနေပါသည်..." }).catch(() => {});
    await ctx.replyWithChatAction("upload_photo").catch(() => {});
    const qrBuffer = await generateQrImageBuffer(active.qr);
    await ctx.deleteMessage().catch(() => {});

    const reshownQr = await ctx.replyWithPhoto(new InputFile(qrBuffer, `mmqr-${active.reference}.png`), {
      caption: formatMmpayQrInvoiceMessage({
        amountMmk: active.amountMmk,
        reference: active.reference,
        expiresAt: active.expiresAt,
      }),
      parse_mode: "HTML",
      reply_markup: buildMmpayInvoiceKeyboard(active.reference),
    });
    // Track the re-shown invoice so the webhook clears the latest one, and
    // remove the previously shown QR photo so only one live card remains.
    const prevShownId = await botOrderService.attachMmpayQrMessage(active.reference, reshownQr.message_id);
    if (prevShownId && ctx.chat?.id) {
      await ctx.api.deleteMessage(ctx.chat.id, prevShownId).catch(() => {});
    }
  });

  // 14D-1. Confirm and execute MMQR cancellation (Compliance Rule 8 & 9: Manual Cancellation)
  bot.callbackQuery(/^mmpay_cancel_confirm_(.+)$/, async (ctx) => {
    const reference = ctx.match[1];
    const telegramId = String(ctx.from?.id || "");

    const result = await botOrderService.cancelMmpayTopUp(reference, telegramId);

    // The customer pressed Cancel in the exact window a SUCCESS webhook credited
    // this order. The API refused to overwrite the paid row, so DO NOT tell them
    // it was cancelled — show the real "already paid" outcome and post the single
    // success card (claimed once, shared with the webhook/Refresh).
    if (
      result.ok &&
      !result.cancelled &&
      (result.status === TopUpStatus.COMPLETED || result.status === TopUpStatus.APPROVED)
    ) {
      const claimed = await botOrderService.claimMmpaySuccessNotification(reference);
      await ctx.answerCallbackQuery({
        text: "✅ ဤ QR ကို ပေးချေပြီးဖြစ်၍ ဖျက်၍ မရပါ — ငွေဝင်ပြီးပါပြီ ခင်ဗျာ။",
        show_alert: true,
      });
      await ctx.deleteMessage().catch(() => {});
      if (claimed) {
        try {
          const stats = await botOrderService.getUserProfile(telegramId);
          await ctx.reply(
            formatMmpaySuccessMessage({
              amountMmk: result.amountMmk ?? 0,
              reference,
              walletBalanceMmk: stats.walletBalanceMmk,
            }),
            {
              parse_mode: "HTML",
              reply_markup: buildWalletKeyboard(),
            }
          );
        } catch {
          await botOrderService.releaseMmpaySuccessNotification(reference);
        }
      }
      return;
    }

    activeMmpayCheckCooldowns.delete(reference);
    await ctx.answerCallbackQuery({ text: "ငွေပေးချေမှုကို ဖျက်သိမ်းပြီးပါပြီ!" });
    await ctx.deleteMessage().catch(() => {});

    await ctx.reply(
      "❌ <b>MMQR ငွေပေးချေမှုကို ဖျက်သိမ်းပြီးပါပြီ။</b>\nငွေဖြည့်သွင်းလိုပါက အသစ် ပြန်လည် တောင်းခံနိုင်ပါပြီ ခင်ဗျာ။",
      {
        parse_mode: "HTML",
        reply_markup: buildWalletKeyboard(),
      }
    );
  });

  // 14D-2. Abort cancellation and restore keyboard
  bot.callbackQuery(/^mmpay_cancel_abort_prompt_(.+)$/, async (ctx) => {
    const reference = ctx.match[1];
    await ctx.answerCallbackQuery({ text: "လက်ရှိ MMQR ကို ဆက်လက်ကြည့်ရှုနိုင်ပါသည်ခင်ဗျာ" });
    await ctx.editMessageReplyMarkup({
      reply_markup: buildActiveMmpayPromptKeyboard(reference),
    });
  });

  bot.callbackQuery(/^mmpay_cancel_abort_(.+)$/, async (ctx) => {
    const reference = ctx.match[1];
    await ctx.answerCallbackQuery({ text: "ငွေပေးချေမှုကို ဆက်လက်လုပ်ဆောင်နိုင်ပါသည်ခင်ဗျာ" });
    await ctx.editMessageReplyMarkup({
      reply_markup: buildMmpayInvoiceKeyboard(reference),
    });
  });

  // 14D-3. Ask confirmation before cancelling MMQR invoice
  bot.callbackQuery(/^mmpay_cancel_prompt_(.+)$/, async (ctx) => {
    const reference = ctx.match[1];
    await ctx.answerCallbackQuery({ text: "အော်ဒါ ဖျက်သိမ်းရန် အတည်ပြုပေးပါခင်ဗျာ" });
    await ctx.editMessageReplyMarkup({
      reply_markup: buildMmpayCancelConfirmKeyboard(reference, true),
    });
  });

  bot.callbackQuery(/^mmpay_cancel_(.+)$/, async (ctx) => {
    const reference = ctx.match[1];
    await ctx.answerCallbackQuery({ text: "ငွေပေးချေမှုကို ဖျက်သိမ်းရန် အတည်ပြုပေးပါခင်ဗျာ" });
    await ctx.editMessageReplyMarkup({
      reply_markup: buildMmpayCancelConfirmKeyboard(reference, false),
    });
  });

  // 14E. Check MMQR Status / Refresh
  bot.callbackQuery(/^mmpay_check_(.+)$/, async (ctx) => {
    const reference = ctx.match[1];
    const telegramId = String(ctx.from?.id || "");

    const lastCheck = activeMmpayCheckCooldowns.get(reference) || 0;
    const now = Date.now();
    const diffMs = now - lastCheck;

    if (diffMs < 5000) {
      const remainingSeconds = Math.ceil((5000 - diffMs) / 1000);
      await ctx.answerCallbackQuery({
        text: `⏳ ခေတ္တစောင့်ပေးပါခင်ဗျာ... နောက်ထပ် ${remainingSeconds} စက္ကန့် စောင့်ပြီးမှ ထပ်မံ စစ်ဆေးနိုင်ပါမည်။`,
        show_alert: true,
      });
      return;
    }

    const statusRes = await botOrderService.checkMmpayStatus(reference);
    if (!statusRes) {
      await ctx.answerCallbackQuery({ text: "အော်ဒါ အချက်အလက် စစ်ဆေးမရသေးပါ ခင်ဗျာ။", show_alert: true });
      return;
    }

    // Approved MMPay deposits are stored as "COMPLETED" by the deposit-review
    // service ("APPROVED" kept for backward compatibility). The gateway webhook
    // normally posts the success card and removes this invoice the moment it
    // credits — but that push is best-effort and can be dropped (Telegram blip,
    // API restart mid-flight). So Refresh is a real recovery path: it atomically
    // claims the one-time notification and, if it wins the claim (the webhook
    // did not deliver), posts the single success card itself. The shared claim
    // guarantees the customer never sees two cards.
    if (statusRes.status === TopUpStatus.COMPLETED || statusRes.status === TopUpStatus.APPROVED) {
      activeMmpayCheckCooldowns.delete(reference);
      const claimed = await botOrderService.claimMmpaySuccessNotification(reference);
      await ctx.answerCallbackQuery({
        text: "✅ ငွေဝင်ပြီးပါပြီ! Wallet Balance ကို စစ်ကြည့်နိုင်ပါပြီခင်ဗျာ။",
        show_alert: true,
      });
      await ctx.deleteMessage().catch(() => {});
      if (claimed) {
        try {
          const stats = await botOrderService.getUserProfile(telegramId);
          await ctx.reply(
            formatMmpaySuccessMessage({
              amountMmk: statusRes.amountMmk,
              reference,
              walletBalanceMmk: stats.walletBalanceMmk,
            }),
            {
              parse_mode: "HTML",
              reply_markup: buildWalletKeyboard(),
            }
          );
        } catch {
          // Posting the card failed — release the claim so a later retry (or a
          // delayed webhook push) can still deliver the confirmation.
          await botOrderService.releaseMmpaySuccessNotification(reference);
        }
      }
    } else if (statusRes.status === TopUpStatus.EXPIRED) {
      activeMmpayCheckCooldowns.delete(reference);
      // Claim the one-time cleanup so the background sweep does not also post an
      // expired notice for the same invoice (dedup via nulling the QR id).
      const owns = await botOrderService.claimMmpayInvoiceCleanup(reference);
      await ctx.answerCallbackQuery({ text: "ဤ QR ကုဒ် သက်တမ်းကုန်ဆုံးသွားပါပြီ။", show_alert: true });
      await ctx.deleteMessage().catch(() => {});
      if (owns) {
        await ctx.reply(
          "⚠️ <b>MMQR သက်တမ်းကုန်ဆုံးသွားပါပြီ (Expired)</b>\nကျေးဇူးပြု၍ ငွေပမာဏ အသစ် ရွေးချယ်ပေးပါခင်ဗျာ။",
          {
            parse_mode: "HTML",
            reply_markup: buildWalletKeyboard(),
          }
        );
      }
    } else if (statusRes.status === TopUpStatus.CANCELLED) {
      activeMmpayCheckCooldowns.delete(reference);
      await ctx.answerCallbackQuery({ text: "ဤအော်ဒါကို ဖျက်သိမ်းထားပြီးဖြစ်ပါသည်။", show_alert: true });
      await ctx.deleteMessage().catch(() => {});
      await ctx.reply("❌ <b>ဤအော်ဒါကို ဖျက်သိမ်းထားပြီးဖြစ်ပါသည်။</b>", {
        parse_mode: "HTML",
        reply_markup: buildWalletKeyboard(),
      });
    } else if (statusRes.status === TopUpStatus.FAILED) {
      activeMmpayCheckCooldowns.delete(reference);
      // The gateway reported the payment as failed. Like the success path, the
      // webhook normally posts this card and clears the QR, but Refresh is the
      // recovery when that push was dropped — the shared one-time claim keeps
      // the customer from seeing two cards.
      const claimed = await botOrderService.claimMmpaySuccessNotification(reference);
      await ctx.answerCallbackQuery({
        text: "❌ ဤ MMQR ငွေပေးချေမှု မအောင်မြင်ပါ။ သင့် Wallet မှ ငွေ နုတ်ယူခြင်း မရှိပါ။",
        show_alert: true,
      });
      await ctx.deleteMessage().catch(() => {});
      if (claimed) {
        try {
          await ctx.reply(formatMmpayFailedMessage({ reference, kind: "FAILED" }), {
            parse_mode: "HTML",
            reply_markup: buildWalletKeyboard(),
          });
        } catch {
          await botOrderService.releaseMmpaySuccessNotification(reference);
        }
      }
    } else {
      activeMmpayCheckCooldowns.set(reference, Date.now());
      await ctx.answerCallbackQuery({
        text: "⏳ ငွေပေးချေမှုကို စောင့်ဆိုင်းနေဆဲဖြစ်ပါသည်။ Mobile Banking App (KPay / WavePay) တွင် Scan ဖတ်၍ ပေးချေပေးပါခင်ဗျာ။",
        show_alert: true,
      });
    }
  });


  // 15. Custom Top-Up Amount Prompt
  bot.callbackQuery("topup_custom", async (ctx) => {
    ctx.session.awaitingCustomTopUp = true;
    const msgId = ctx.callbackQuery.message?.message_id;

    await ctx.reply(
      `${tgEmoji(BOT_EMOJIS.EDIT, "✏️")} <b>စိတ်ကြိုက် ငွေဖြည့်သွင်းခြင်း:</b>\nဖြည့်သွင်းလိုသော ပမာဏ (MMK) ကို ဂဏန်းအတိအကျ ရိုက်ထည့်ပေးပါခင်ဗျာ (ဥပမာ: <code>15000</code>):`,
      {
        parse_mode: "HTML",
      }
    );
  });

  // 16A. Ask confirmation before cancelling manual top-up
  bot.callbackQuery("cancel_topup", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: "ငွေဖြည့်ခြင်းကို ပယ်ဖျက်ရန် အတည်ပြုပေးပါခင်ဗျာ",
    });
    await ctx.editMessageReplyMarkup({
      reply_markup: buildTopUpCancelConfirmKeyboard(),
    });
  });

  // 16B. Abort manual top-up cancellation and restore invoice keyboard
  bot.callbackQuery("cancel_topup_abort", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: "ငွေလွှဲခြင်းကို ဆက်လက်လုပ်ဆောင်နိုင်ပါသည်ခင်ဗျာ",
    });
    await ctx.editMessageReplyMarkup({
      reply_markup: buildTopUpInvoiceKeyboard(),
    });
  });

  // 16C. Confirm and execute manual top-up cancellation
  bot.callbackQuery("cancel_topup_confirm", async (ctx) => {
    const telegramId = String(ctx.from?.id || "");
    const topUpRef = ctx.session.awaitingTopUpSlip?.reference || ctx.session.awaitingTopUpSlip?.topUpId;

    if (topUpRef) {
      await botOrderService.cancelTopUpRequest(topUpRef, telegramId);
    } else {
      const latestPending = await botOrderService.getLatestPendingTopUp(telegramId);
      if (latestPending) {
        await botOrderService.cancelTopUpRequest(latestPending.reference, telegramId);
      }
    }

    ctx.session.awaitingTopUpSlip = undefined;
    ctx.session.awaitingCustomTopUp = false;
    ctx.session.intendedOrderAfterTopUp = undefined;
    ctx.session.unmatchedPhotoFileId = undefined;

    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Customer";
    const stats = await botOrderService.getUserProfile(telegramId);

    await ctx.answerCallbackQuery({ text: "ငွေဖြည့်ခြင်းကို ပယ်ဖျက်လိုက်ပါပြီ။" });

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
    const activeMmpay = await botOrderService.getActiveMmpayTopUp(telegramId);

    await ctx.editMessageText(
      formatWalletMessage({
        fullName,
        balanceMmk: stats.walletBalanceMmk,
        totalSpentMmk: stats.totalSpentMmk,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildWalletKeyboard(activeMmpay?.reference),
      }
    );
  });

  // 18. Orders Menu (Listing Real Orders & Delivery Viewer)
  bot.callbackQuery(/^menu_orders(?:_p(\d+))?$/, async (ctx) => {
    ctx.session.awaitingCustomQuantity = false;
    ctx.session.awaitingCustomTopUp = false;
    const page = ctx.match[1] ? parseInt(ctx.match[1], 10) : 0;
    const telegramId = String(ctx.from?.id || "");
    const orders = await botOrderService.getUserOrders(telegramId);

    await ctx.editMessageText(formatOrdersListMessage(orders.length), {
      parse_mode: "HTML",
      reply_markup: buildOrderListKeyboard(orders, page),
    });
  });

  // 19. Single Order Detail & Credentials Viewer (owner-only — an order is
  // never readable from another customer's chat)
  bot.callbackQuery(/^view_order_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const telegramId = String(ctx.from?.id || "");
    const order = await botOrderService.getOrderById(orderId, telegramId);

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
    const telegramId = String(ctx.from?.id || "");

    if (activePhotoUploadLocks.has(telegramId)) {
      return; // Debounce burst photos
    }
    activePhotoUploadLocks.add(telegramId);

    try {
      let topUpSlip = ctx.session.awaitingTopUpSlip;

      // Fallback: If session was lost (e.g. process restart), query DB for latest pending top-up
      if (!topUpSlip && telegramId) {
        const pending = await botOrderService.getLatestPendingTopUp(telegramId);
        if (pending) {
          topUpSlip = {
            topUpId: pending.reference,
            amountMmk: pending.amountMmk,
            reference: pending.reference,
            dbId: pending.id,
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
        void notifyAdminGroupDepositSlip(ctx.api, ctx.from, {
          topUpId: topUpSlip.dbId || "",
          reference: reference || topUpId,
          amountMmk,
          fileId,
          telegramId,
        });

        ctx.session.awaitingTopUpSlip = undefined;
        ctx.session.awaitingCustomTopUp = false;
        ctx.session.unmatchedPhotoFileId = undefined;

        await ctx.reply(formatTopUpSlipReceivedMessage({ amountMmk, reference }), {
          parse_mode: "HTML",
          reply_markup: buildMainMenuKeyboard(),
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
        }
      );
    } finally {
      setTimeout(() => activePhotoUploadLocks.delete(telegramId), 2500);
    }
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
          }
        );
        return;
      }

      if (activeTopUpLocks.has(telegramId)) {
        return;
      }
      activeTopUpLocks.add(telegramId);

      try {
        ctx.session.awaitingCustomTopUp = false;

        const activeMmpay = await botOrderService.getActiveMmpayTopUp(telegramId);
        if (activeMmpay) {
          await ctx.reply(
            formatActiveMmpayExistsMessage({
              reference: activeMmpay.reference,
              amountMmk: activeMmpay.amountMmk,
              expiresAt: activeMmpay.expiresAt,
            }),
            {
              parse_mode: "HTML",
              reply_markup: buildActiveMmpayPromptKeyboard(activeMmpay.reference),
            }
          );
          return;
        }

        const unmatchedPhoto = ctx.session.unmatchedPhotoFileId;
        if (unmatchedPhoto) {
          const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk: amount });
          ctx.session.unmatchedPhotoFileId = undefined;
          ctx.session.awaitingTopUpSlip = undefined;

          await botOrderService.submitTopUpSlip({
            topUpId: topUp.reference,
            telegramId,
            fileId: unmatchedPhoto,
            amountMmk: amount,
            paymentMethod: "KPAY",
          });
          void notifyAdminGroupDepositSlip(ctx.api, ctx.from, {
            topUpId: topUp.id,
            reference: topUp.reference,
            amountMmk: amount,
            fileId: unmatchedPhoto,
            telegramId,
          });

          await ctx.reply(
            formatTopUpSlipReceivedMessage({ amountMmk: amount, reference: topUp.reference }),
            {
              parse_mode: "HTML",
              reply_markup: buildMainMenuKeyboard(),
            }
          );
          return;
        }

        // Offer choice: MMQR vs Manual Slip
        await ctx.reply(
          formatPaymentMethodChoiceMessage({ amountMmk: amount }),
          {
            parse_mode: "HTML",
            reply_markup: buildPaymentMethodChoiceKeyboard(amount),
          }
        );
        return;
      } finally {
        setTimeout(() => activeTopUpLocks.delete(telegramId), 1500);
      }
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
        });
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
    await ctx.reply(
      `မင်္ဂလာပါခင်ဗျာ! အောက်ပါ မီနူးမှတစ်ဆင့် ပစ္စည်းများကို ရွေးချယ်ဝယ်ယူနိုင်ပါသည် ${tgEmoji(BOT_EMOJIS.DOWN_ARROW, "👇")}`,
      {
        parse_mode: "HTML",
        reply_markup: buildMainMenuKeyboard(),
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

  // Preset quantity exceeds available stock — show top toast notification.
  bot.callbackQuery(/^qty_max_(\d+)$/, async (ctx) => {
    const stock = parseInt(ctx.match[1], 10);
    const text =
      stock > 0
        ? `Stock ${stock} ခုထိပဲ ရနိုင်ပါတော့မယ်ဗျာ`
        : "ဤပစ္စည်းမှာ လက်ရှိတွင် စတော့ပြတ်လပ်နေပါသည်ခင်ဗျာ။";
    await ctx.answerCallbackQuery({
      text,
      show_alert: false,
    });
  });

  return bot;
}

