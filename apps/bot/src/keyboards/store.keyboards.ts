import { InlineKeyboard } from "grammy";
import { BotCategory, BotProduct } from "../services/catalog.service";
import { botConfig } from "../config";
import { botSettingsService } from "../services/settings.service";
import { BOT_EMOJIS } from "@arena/shared";

/** How many list items render on a single page (products & orders). */
export const LIST_PAGE_SIZE = 8;
/** Categories render two-per-row, so a slightly larger page keeps the grid full. */
export const CATEGORY_PAGE_SIZE = 10;

/**
 * Canonical "home" button — always returns to the main menu, carrying the 🏡
 * premium animated icon with a plain "Main Menu" label (fallback 🏡 renders on
 * non-premium clients).
 */
function homeButton(label = "ပင်မစာမျက်နှာ") {
  return { text: label, callback_data: "menu_start", icon_custom_emoji_id: BOT_EMOJIS.HOME };
}

/**
 * Canonical "back" button — returns to the parent screen. The ⬅️ animated icon
 * carries the arrow, so the label stays plain to avoid a double arrow.
 */
function backButton(callbackData: string, label = "နောက်သို့") {
  return { text: label, callback_data: callbackData, icon_custom_emoji_id: BOT_EMOJIS.BACK };
}

/**
 * Builds a prev/page/next navigation row for a paginated list. Returns null
 * when everything fits on one page, so single-page lists render unchanged.
 */
function buildPagerRow(
  totalItems: number,
  page: number,
  pageSize: number,
  prefix: string
): Array<Record<string, unknown>> | null {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const current = Math.min(Math.max(page, 0), totalPages - 1);
  const row: Array<Record<string, unknown>> = [];

  row.push(
    current > 0
      ? { text: "◀️", callback_data: `${prefix}${current - 1}` }
      : { text: " ", callback_data: "noop", icon_custom_emoji_id: BOT_EMOJIS.CANCEL }
  );
  row.push({ text: `${current + 1}/${totalPages}`, callback_data: "noop" });
  row.push(
    current < totalPages - 1
      ? { text: "▶️", callback_data: `${prefix}${current + 1}` }
      : { text: " ", callback_data: "noop", icon_custom_emoji_id: BOT_EMOJIS.CANCEL }
  );

  return row;
}

/**
 * Builds the Main Start Menu Keyboard with animated custom emojis.
 */
export function buildMainMenuKeyboard(supportUrl?: string): InlineKeyboard {
  const finalSupportUrl = supportUrl || botSettingsService.getSupportUrlSync();
  return new InlineKeyboard()
    // Row 1: 2 Columns (Storefront & Orders)
    .add({
      text: "ပစ္စည်းများ ဝယ်ယူရန်",
      callback_data: "menu_categories",
      icon_custom_emoji_id: BOT_EMOJIS.STORE,
      style: "success",
    } as any)
    .add({
      text: "ကျွန်ုပ်၏ အကောင့်",
      callback_data: "menu_profile",
      icon_custom_emoji_id: BOT_EMOJIS.PROFILE,
    })
    .row()
    // Row 2: 2 Columns (Wallet & My Profile -> 2x2 core store grid)
    .add({
      text: "Wallet",
      callback_data: "menu_wallet",
      icon_custom_emoji_id: BOT_EMOJIS.MONEY,
    })
    .add({
      text: "ကျွန်ုပ်၏ အော်ဒါများ",
      callback_data: "menu_orders",
      icon_custom_emoji_id: BOT_EMOJIS.BOX,
    })
    .row()
    .add({
      text: "အကူအညီ",
      url: finalSupportUrl,
      icon_custom_emoji_id: BOT_EMOJIS.CHAT,
    })
    .add({
      text: "Channel",
      url: botConfig.CHANNEL_URL,
      icon_custom_emoji_id: BOT_EMOJIS.SPEAKER,
    });
}

/**
 * Builds My Profile Keyboard with Back navigation.
 */
export function buildProfileKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "Referral အချက်အလက်",
      callback_data: "menu_referral",
      icon_custom_emoji_id: BOT_EMOJIS.GIFT,
    })
    .row()
    .add({
      text: "Wallet ထဲငွေဖြည့်မည်",
      callback_data: "menu_wallet",
      icon_custom_emoji_id: BOT_EMOJIS.WALLET,
    })
    .row()
    .add(homeButton());
}

/**
 * Builds Referral details keyboard with Telegram Inline Share (with Start button) and back navigation.
 */
export function buildReferralKeyboard(inviteLink: string): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "သူငယ်ချင်းများသို့ မျှဝေရန်",
      switch_inline_query: "",
      icon_custom_emoji_id: BOT_EMOJIS.SHARE,
    })
    .row()
    .add(backButton("menu_profile"))
    .add(homeButton());
}

/**
 * Builds the Help & Support message keyboard with direct contact link.
 */
export function buildHelpKeyboard(supportUrl?: string, _handle?: string): InlineKeyboard {
  const url = supportUrl || botSettingsService.getSupportUrlSync();
  const label = "Customer Support ဆက်သွယ်ရန်";
  return new InlineKeyboard()
    .add({
      text: label,
      url,
      icon_custom_emoji_id: BOT_EMOJIS.CHAT,
    })
    .row()
    .add(homeButton());
}

/**
 * Builds the 2-Column Categories Grid Keyboard matching Screenshot 1.
 * Passes `icon_custom_emoji_id` when available for Telegram Premium icon rendering.
 */
export function buildCategoriesKeyboard(categories: BotCategory[], page = 0): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  const isNumeric = (val?: string | null): boolean =>
    Boolean(val && /^\d+$/.test(val.trim()));

  const totalPages = Math.max(1, Math.ceil(categories.length / CATEGORY_PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), totalPages - 1);
  const start = current * CATEGORY_PAGE_SIZE;
  const pageItems = categories.slice(start, start + CATEGORY_PAGE_SIZE);

  // 2 categories per row
  for (let i = 0; i < pageItems.length; i += 2) {
    const cat1 = pageItems[i];
    const cat2 = pageItems[i + 1];

    if (cat1) {
      const hasCustomEmoji = isNumeric(cat1.emojiId);
      const buttonText = !hasCustomEmoji && cat1.iconEmoji
        ? `${cat1.iconEmoji} ${cat1.cleanName}`
        : cat1.cleanName;

      keyboard.add({
        text: buttonText,
        callback_data: `cat_${cat1.id}`,
        ...(hasCustomEmoji ? { icon_custom_emoji_id: cat1.emojiId! } : {}),
      });
    }

    if (cat2) {
      const hasCustomEmoji = isNumeric(cat2.emojiId);
      const buttonText = !hasCustomEmoji && cat2.iconEmoji
        ? `${cat2.iconEmoji} ${cat2.cleanName}`
        : cat2.cleanName;

      keyboard.add({
        text: buttonText,
        callback_data: `cat_${cat2.id}`,
        ...(hasCustomEmoji ? { icon_custom_emoji_id: cat2.emojiId! } : {}),
      });
    }

    keyboard.row();
  }

  const pager = buildPagerRow(categories.length, current, CATEGORY_PAGE_SIZE, "menu_categories_p");
  if (pager) {
    for (const btn of pager) keyboard.add(btn as any);
    keyboard.row();
  }

  // Home button
  keyboard.add(homeButton());
  return keyboard;
}

/**
 * Builds the Product List Keyboard matching Screenshot 2.
 * Shows Custom Emoji Icon + Clean Name + Price in Option A ("3,900 Ks") format.
 */
export function buildProductsKeyboard(categoryId: number, products: BotProduct[], page = 0): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  const isNumeric = (val?: string | null): boolean =>
    Boolean(val && /^\d+$/.test(val.trim()));

  if (products.length === 0) {
    keyboard.add({
      text: "လက်ရှိတွင် ပစ္စည်းများ ပြတ်လပ်နေပါသည်",
      callback_data: "noop",
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
    }).row();
  } else {
    const totalPages = Math.max(1, Math.ceil(products.length / LIST_PAGE_SIZE));
    const current = Math.min(Math.max(page, 0), totalPages - 1);
    const start = current * LIST_PAGE_SIZE;
    const pageItems = products.slice(start, start + LIST_PAGE_SIZE);

    for (const prod of pageItems) {
      const label = prod.inStock
        ? `${prod.cleanName} — ${prod.formattedPriceMmk}`
        : `${prod.cleanName} — ပြတ်လပ်နေပါသည် ❌`;

      const hasCustomEmoji = isNumeric(prod.emojiId);

      keyboard
        .add({
          text: label,
          callback_data: prod.inStock ? `prod_${prod.id}` : "out_of_stock",
          ...(hasCustomEmoji ? { icon_custom_emoji_id: prod.emojiId! } : {}),
        })
        .row();
    }

    const pager = buildPagerRow(products.length, current, LIST_PAGE_SIZE, `cat_${categoryId}_p`);
    if (pager) {
      for (const btn of pager) keyboard.add(btn as any);
      keyboard.row();
    }
  }

  // Back button to category selection
  keyboard.add(backButton("menu_categories"));
  return keyboard;
}

/**
 * Builds the Interactive Quantity Controller matching Screenshot 3.
 * Includes Stepper [-] [1] [+], Quick Presets, Custom Quantity, and Buy Now button with dynamic total MMK.
 */
export function buildProductDetailKeyboard(
  product: BotProduct,
  quantity: number
): InlineKeyboard {
  const totalMmk = product.retailPriceMmk * quantity;
  const keyboard = new InlineKeyboard();

  // Row 1: Stepper [-] [qty] [+] with clean outline icons and no stray bottle icons
  const canDecrease = quantity > 1;
  const canIncrease = quantity < product.stock;

  keyboard
    .add({
      text: " ",
      callback_data: canDecrease ? `qty_step_${product.id}_${quantity - 1}` : "noop",
      icon_custom_emoji_id: BOT_EMOJIS.MINUS,
    })
    .add({
      text: `${quantity}`,
      callback_data: "noop",
    })
    .add({
      text: " ",
      callback_data: canIncrease ? `qty_step_${product.id}_${quantity + 1}` : "noop",
      icon_custom_emoji_id: BOT_EMOJIS.PLUS,
    })
    .row();

  // Row 2: Quick Presets (1, 5, 10, 20) with checkmark on active
  const presets = [1, 5, 10, 20];
  for (const preset of presets) {
    const isSelected = quantity === preset;
    const isAvailable = preset <= product.stock;
    keyboard.add({
      text: `${preset}`,
      callback_data: isAvailable ? `qty_set_${product.id}_${preset}` : `qty_max_${product.stock}`,
      ...(isSelected
        ? { icon_custom_emoji_id: BOT_EMOJIS.CHECK }
        : !isAvailable
          ? { icon_custom_emoji_id: BOT_EMOJIS.PROHIBITED }
          : {}),
    });
  }
  keyboard.row();

  // Row 3: Custom Quantity Picker
  keyboard.add({
    text: "စိတ်ကြိုက် အရေအတွက် ထည့်မည်",
    callback_data: `qty_custom_${product.id}`,
    icon_custom_emoji_id: BOT_EMOJIS.EDIT,
  }).row();

  // Row 5: Buy Now with Total Price
  keyboard
    .add({
      text: `ဝယ်ယူမည် · ${totalMmk.toLocaleString("en-US")} Ks`,
      callback_data: `checkout_${product.id}_${quantity}`,
      icon_custom_emoji_id: BOT_EMOJIS.BUY_NOW,
      style: "success",
    } as any)
    .row();

  // Row 6: Back to Category's Product List
  keyboard.add(backButton(`cat_${product.categoryId}`));

  return keyboard;
}

/**
 * Builds Payment Slip Action Keyboard during Checkout.
 */
export function buildCheckoutKeyboard(orderId: string, supportUrl?: string): InlineKeyboard {
  const finalSupportUrl = supportUrl || botSettingsService.getSupportUrlSync();
  return new InlineKeyboard()
    .add({
      text: "အော်ဒါ ပယ်ဖျက်မည်",
      callback_data: `cancel_order_${orderId}`,
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
      style: "danger",
    } as any)
    .row()
    .add({
      text: "Customer Support ဆက်သွယ်ရန်",
      url: finalSupportUrl,
      icon_custom_emoji_id: BOT_EMOJIS.CHAT,
    });
}

/**
 * Builds Order Status / Delivery Viewer Keyboard.
 */
export function buildOrderListKeyboard(
  orders: Array<{ id: string; publicOrderNo: string; productName?: string; status: string }>,
  page = 0
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (orders.length === 0) {
    keyboard
      .add({
        text: "ပစ္စည်းများ စတင်ဝယ်ယူရန်",
        callback_data: "menu_categories",
        icon_custom_emoji_id: BOT_EMOJIS.BAGS,
        style: "success",
      } as any)
      .row();
  } else {
    const totalPages = Math.max(1, Math.ceil(orders.length / LIST_PAGE_SIZE));
    const current = Math.min(Math.max(page, 0), totalPages - 1);
    const start = current * LIST_PAGE_SIZE;
    const pageItems = orders.slice(start, start + LIST_PAGE_SIZE);

    for (const ord of pageItems) {
      const iconId =
        ord.status === "DELIVERED"
          ? BOT_EMOJIS.CHECK
          : ord.status === "PAYMENT_SUBMITTED"
          ? BOT_EMOJIS.HOURGLASS
          : BOT_EMOJIS.RECEIPT;
      const label = ord.productName
        ? `${ord.publicOrderNo} · ${ord.productName.slice(0, 16)}`
        : ord.publicOrderNo;

      keyboard
        .add({
          text: label,
          callback_data: `view_order_${ord.id}`,
          icon_custom_emoji_id: iconId,
        })
        .row();
    }

    const pager = buildPagerRow(orders.length, current, LIST_PAGE_SIZE, "menu_orders_p");
    if (pager) {
      for (const btn of pager) keyboard.add(btn as any);
      keyboard.row();
    }
  }

  keyboard.add(homeButton());
  return keyboard;
}

/**
 * Builds Wallet Dashboard Top-Up Presets Keyboard.
 */
export function buildWalletKeyboard(activeMmpayRef?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (activeMmpayRef) {
    keyboard
      .add({
        text: "လက်ရှိ MMQR ငွေပေးချေလွှာ ပြန်ကြည့်မည်",
        callback_data: `mmpay_show_${activeMmpayRef}`,
        icon_custom_emoji_id: BOT_EMOJIS.MMQR,
        style: "success",
      } as any)
      .row();
  }

  return keyboard
    .add({
      text: "5,000 Ks",
      callback_data: "topup_amount_5000",
    })
    .add({
      text: "10,000 Ks",
      callback_data: "topup_amount_10000",
      icon_custom_emoji_id: BOT_EMOJIS.FIRE,
    })
    .row()
    .add({
      text: "20,000 Ks",
      callback_data: "topup_amount_20000",
    })
    .add({
      text: "50,000 Ks",
      callback_data: "topup_amount_50000",
    })
    .row()
    .add({
      text: "စိတ်ကြိုက်ပမာဏ ရိုက်ထည့်မည်",
      callback_data: "topup_custom",
      icon_custom_emoji_id: BOT_EMOJIS.EDIT,
    })
    .row()
    .add(homeButton());
}

/**
 * Builds preset amount selector when user uploads an unsolicited slip photo.
 */
export function buildUnmatchedPhotoKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "5,000 Ks",
      callback_data: "topup_amount_5000",
    })
    .add({
      text: "10,000 Ks",
      callback_data: "topup_amount_10000",
      icon_custom_emoji_id: BOT_EMOJIS.FIRE,
    })
    .row()
    .add({
      text: "20,000 Ks",
      callback_data: "topup_amount_20000",
    })
    .add({
      text: "50,000 Ks",
      callback_data: "topup_amount_50000",
    })
    .row()
    .add({
      text: "စိတ်ကြိုက်ပမာဏ ရိုက်ထည့်မည်",
      callback_data: "topup_custom",
      icon_custom_emoji_id: BOT_EMOJIS.EDIT,
    })
    .row()
    .add(homeButton());
}

/**
 * Builds Top-Up invoice keyboard with cancel option.
 */
export function buildTopUpInvoiceKeyboard(): InlineKeyboard {
  return new InlineKeyboard().add({
    text: "ငွေဖြည့်မှု ပယ်ဖျက်မည်",
    callback_data: "cancel_topup",
    icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
    style: "danger",
  } as any);
}

/**
 * Builds Confirmation Keyboard when user initiates cancellation of manual top-up.
 */
export function buildTopUpCancelConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "သေချာပါသည်၊ ဖျက်သိမ်းမည်",
      callback_data: "cancel_topup_confirm",
      icon_custom_emoji_id: BOT_EMOJIS.ALERT,
      style: "danger",
    } as any)
    .row()
    .add({
      text: "မဖျက်တော့ပါ (ဆက်လက်လွှဲမည်)",
      callback_data: "cancel_topup_abort",
      icon_custom_emoji_id: BOT_EMOJIS.BACK,
    });
}

/**
 * Builds Payment Method Selection Keyboard (MMQR Auto-Pay vs Manual Bank Slip).
 */
export function buildPaymentMethodChoiceKeyboard(amountMmk: number, contextData?: string): InlineKeyboard {
  const ctxSuffix = contextData ? `_${contextData}` : "";
  return new InlineKeyboard()
    .add({
      text: "MMQR ဖြင့် အလိုအလျောက် ပေးချေမည်",
      callback_data: `mmpay_pay_${amountMmk}${ctxSuffix}`,
      icon_custom_emoji_id: BOT_EMOJIS.MMQR,
      style: "success",
    } as any)
    .row()
    .add({
      text: "ငွေလွှဲပြေစာ ပို့မည် (Manual Slip)",
      callback_data: `manual_slip_${amountMmk}${ctxSuffix}`,
      icon_custom_emoji_id: BOT_EMOJIS.RECEIPT,
    })
    .row()
    .add(backButton("menu_wallet"));
}

/**
 * Builds MyanMyanPay MMQR invoice actions keyboard.
 */
export function buildMmpayInvoiceKeyboard(reference: string): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "အခြေအနေ ပြန်စစ်မည်",
      callback_data: `mmpay_check_${reference}`,
      icon_custom_emoji_id: BOT_EMOJIS.REFRESH,
    })
    .row()
    .add({
      text: "ငွေပေးချေမှု ဖျက်သိမ်းမည်",
      callback_data: `mmpay_cancel_${reference}`,
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
      style: "danger",
    } as any);
}

/**
 * Builds Confirmation Keyboard when user initiates cancellation of active MMQR invoice.
 */
export function buildMmpayCancelConfirmKeyboard(reference: string, fromPrompt = false): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "သေချာပါသည်၊ ဖျက်သိမ်းမည်",
      callback_data: `mmpay_cancel_confirm_${reference}`,
      icon_custom_emoji_id: BOT_EMOJIS.ALERT,
      style: "danger",
    } as any)
    .row()
    .add({
      text: "မဖျက်တော့ပါ (ဆက်လက်ပေးချေမည်)",
      callback_data: fromPrompt ? `mmpay_cancel_abort_prompt_${reference}` : `mmpay_cancel_abort_${reference}`,
      icon_custom_emoji_id: BOT_EMOJIS.BACK,
    });
}

/**
 * Builds prompt keyboard when an unexpired active MMQR order is blocking a new request.
 */
export function buildActiveMmpayPromptKeyboard(reference: string): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "လက်ရှိ QR ပြန်ကြည့်မည်",
      callback_data: `mmpay_show_${reference}`,
      icon_custom_emoji_id: BOT_EMOJIS.BOX,
      style: "success",
    } as any)
    .row()
    .add({
      text: "လက်ရှိ အော်ဒါ ဖျက်သိမ်းမည်",
      callback_data: `mmpay_cancel_prompt_${reference}`,
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
      style: "danger",
    } as any)
    .row()
    .add(backButton("menu_wallet", "Wallet သို့ ပြန်သွားမည်"));
}


/**
 * Builds Insufficient Balance Keyboard with direct Top-up shortcut.
 */
export function buildInsufficientBalanceKeyboard(params: {
  productId: number;
  quantity: number;
  deficitMmk: number;
}): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: `${params.deficitMmk.toLocaleString("en-US")} Ks အတိအကျ ငွေဖြည့်မည်`,
      callback_data: `topup_deficit_${params.productId}_${params.quantity}_${params.deficitMmk}`,
      icon_custom_emoji_id: BOT_EMOJIS.PRICE,
      style: "success",
    } as any)
    .row()
    .add({
      text: "Wallet သို့ သွားမည်",
      callback_data: "menu_wallet",
      icon_custom_emoji_id: BOT_EMOJIS.WALLET,
    })
    .row()
    .add(backButton(`prod_${params.productId}`));
}

/**
 * Builds Purchase Confirmation Keyboard.
 */
export function buildPurchaseConfirmKeyboard(params: {
  productId: number;
  quantity: number;
}): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "အတည်ပြု ဝယ်ယူမည်",
      callback_data: `buy_confirm_${params.productId}_${params.quantity}`,
      icon_custom_emoji_id: BOT_EMOJIS.CHECK,
      style: "success",
    } as any)
    .row()
    .add({
      text: "မဝယ်ယူတော့ပါ",
      callback_data: `prod_${params.productId}`,
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
      style: "danger",
    } as any);
}

/**
 * Builds Order Detail viewer back navigation keyboard.
 */
export function buildOrderDetailKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(backButton("menu_orders", "အော်ဒါများသို့ ပြန်သွားမည်"))
    .row()
    .add(homeButton());
}

/**
 * Builds the Force-Subscription keyboard with Join Channel URL button
 * and interactive "Joined ပြီးပါပြီ" verification button.
 */
export function buildForceJoinKeyboard(channelUrl: string): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "Join Channel",
      url: channelUrl,
      icon_custom_emoji_id: BOT_EMOJIS.SPEAKER,
    })
    .row()
    .add({
      text: "Joined ပြီးပါပြီ",
      callback_data: "verify_channel_join",
      icon_custom_emoji_id: BOT_EMOJIS.CHECK,
    });
}

/**
 * Builds the maintenance notice keyboard with Contact Support button.
 */
export function buildMaintenanceKeyboard(supportUrl?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (supportUrl) {
    keyboard.add({
      text: "Customer Support ဆက်သွယ်ရန်",
      url: supportUrl,
      icon_custom_emoji_id: BOT_EMOJIS.CHAT,
    });
  }
  return keyboard;
}
