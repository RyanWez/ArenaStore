import { InlineKeyboard } from "grammy";
import { BotCategory, BotProduct } from "../services/catalog.service";
import { botConfig } from "../config";
import { botSettingsService } from "../services/settings.service";
import { BOT_EMOJIS } from "@arena/shared";

/**
 * Builds the Main Start Menu Keyboard with animated custom emojis.
 */
export function buildMainMenuKeyboard(supportUrl?: string): InlineKeyboard {
  const finalSupportUrl = supportUrl || botSettingsService.getSupportUrlSync();
  return new InlineKeyboard()
    // Row 1: 2 Columns (Storefront & Orders)
    .add({
      text: "ပစ္စည်းများဝယ်ယူရန်",
      callback_data: "menu_categories",
      icon_custom_emoji_id: BOT_EMOJIS.BAGS,
      style: "success",
    } as any)
    .add({
      text: "My Profile",
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
      text: "ကျွန်ုပ်၏အော်ဒါများ",
      callback_data: "menu_orders",
      icon_custom_emoji_id: BOT_EMOJIS.BOX,
    })
    .row()
    .add({
      text: "Help & Support",
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
  return new InlineKeyboard().add({
    text: "Back",
    callback_data: "menu_start",
    icon_custom_emoji_id: BOT_EMOJIS.BACK,
  });
}

/**
 * Builds the Help & Support message keyboard with direct contact link.
 */
export function buildHelpKeyboard(supportUrl?: string, handle?: string): InlineKeyboard {
  const url = supportUrl || botSettingsService.getSupportUrlSync();
  const label = handle ? `Contact Support (${handle})` : "Contact Support";
  return new InlineKeyboard()
    .add({
      text: label,
      url,
      icon_custom_emoji_id: BOT_EMOJIS.CHAT,
    })
    .row()
    .add({
      text: "🏠 Main Menu",
      callback_data: "menu_start",
      icon_custom_emoji_id: BOT_EMOJIS.BACK,
    });
}

/**
 * Builds the 2-Column Categories Grid Keyboard matching Screenshot 1.
 * Passes `icon_custom_emoji_id` when available for Telegram Premium icon rendering.
 */
export function buildCategoriesKeyboard(categories: BotCategory[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  const isNumeric = (val?: string | null): boolean =>
    Boolean(val && /^\d+$/.test(val.trim()));

  // 2 categories per row
  for (let i = 0; i < categories.length; i += 2) {
    const cat1 = categories[i];
    const cat2 = categories[i + 1];

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

  // Back button
  keyboard.add({
    text: "Back",
    callback_data: "menu_start",
    icon_custom_emoji_id: BOT_EMOJIS.BACK,
  });
  return keyboard;
}

/**
 * Builds the Product List Keyboard matching Screenshot 2.
 * Shows Custom Emoji Icon + Clean Name + Price in Option A ("3,900 Ks") format.
 */
export function buildProductsKeyboard(categoryId: number, products: BotProduct[]): InlineKeyboard {
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
    for (const prod of products) {
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
  }

  // Back button to category selection
  keyboard.add({
    text: "Back",
    callback_data: "menu_categories",
    icon_custom_emoji_id: BOT_EMOJIS.BACK,
  });
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

  // Row 1: Stepper [-] [qty] [+] with single animated custom icons
  const canDecrease = quantity > 1;
  const canIncrease = quantity < product.stock;

  keyboard
    .add({
      text: " ",
      callback_data: canDecrease ? `qty_step_${product.id}_${quantity - 1}` : "noop",
      icon_custom_emoji_id: canDecrease ? BOT_EMOJIS.MINUS : BOT_EMOJIS.CANCEL,
    })
    .add({
      text: `${quantity}`,
      callback_data: "noop",
      icon_custom_emoji_id: BOT_EMOJIS.COUNTER,
    })
    .add({
      text: " ",
      callback_data: canIncrease ? `qty_step_${product.id}_${quantity + 1}` : "noop",
      icon_custom_emoji_id: canIncrease ? BOT_EMOJIS.PLUS : BOT_EMOJIS.CANCEL,
    })
    .row();

  // Row 2: Quick Presets (1, 5, 10, 20) with animated checkmark on active
  const presets1 = [1, 5, 10, 20];
  for (const preset of presets1) {
    const isSelected = quantity === preset;
    const isAvailable = preset <= product.stock;
    keyboard.add({
      text: `${preset}`,
      callback_data: isAvailable ? `qty_set_${product.id}_${preset}` : "noop",
      ...(isSelected ? { icon_custom_emoji_id: BOT_EMOJIS.CHECK } : {}),
    });
  }
  keyboard.row();

  // Row 3: Quick Presets (30, 50)
  const presets2 = [30, 50];
  for (const preset of presets2) {
    const isSelected = quantity === preset;
    const isAvailable = preset <= product.stock;
    keyboard.add({
      text: `${preset}`,
      callback_data: isAvailable ? `qty_set_${product.id}_${preset}` : "noop",
      ...(isSelected ? { icon_custom_emoji_id: BOT_EMOJIS.CHECK } : {}),
    });
  }
  keyboard.row();

  // Row 4: Custom Quantity Picker with animated celebration emoji
  keyboard.add({
    text: "Custom Quantity",
    callback_data: `qty_custom_${product.id}`,
    icon_custom_emoji_id: BOT_EMOJIS.PARTY,
  }).row();

  // Row 5: Buy Now with Total Price in Option A ("3,900 Ks") and animated Buy Now icon
  keyboard
    .add({
      text: `Buy Now · ${totalMmk.toLocaleString("en-US")} Ks`,
      callback_data: `checkout_${product.id}_${quantity}`,
      icon_custom_emoji_id: BOT_EMOJIS.BUY_NOW,
      style: "success",
    } as any)
    .row();

  // Row 6: Back to Category's Product List with animated arrow
  keyboard.add({
    text: "Back",
    callback_data: `cat_${product.categoryId}`,
    icon_custom_emoji_id: BOT_EMOJIS.BACK,
  });

  return keyboard;
}

/**
 * Builds Payment Slip Action Keyboard during Checkout.
 */
export function buildCheckoutKeyboard(orderId: string, supportUrl?: string): InlineKeyboard {
  const finalSupportUrl = supportUrl || botSettingsService.getSupportUrlSync();
  return new InlineKeyboard()
    .add({
      text: "Cancel Order",
      callback_data: `cancel_order_${orderId}`,
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
      style: "danger",
    } as any)
    .row()
    .add({
      text: "Need Help? Contact Admin",
      url: finalSupportUrl,
      icon_custom_emoji_id: BOT_EMOJIS.CHAT,
    });
}

/**
 * Builds Order Status / Delivery Viewer Keyboard.
 */
export function buildOrderListKeyboard(
  orders: Array<{ id: string; publicOrderNo: string; productName?: string; status: string }>
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
    for (const ord of orders.slice(0, 8)) {
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
  }

  keyboard.add({
    text: "Back to Menu",
    callback_data: "menu_start",
    icon_custom_emoji_id: BOT_EMOJIS.BACK,
  });
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
        icon_custom_emoji_id: BOT_EMOJIS.LIGHTNING,
        style: "success",
      } as any)
      .row();
  }

  return keyboard
    .add({
      text: "5,000 Ks",
      callback_data: "topup_amount_5000",
      icon_custom_emoji_id: BOT_EMOJIS.PRICE,
    })
    .add({
      text: "10,000 Ks",
      callback_data: "topup_amount_10000",
      icon_custom_emoji_id: BOT_EMOJIS.PRICE,
    })
    .row()
    .add({
      text: "20,000 Ks",
      callback_data: "topup_amount_20000",
      icon_custom_emoji_id: BOT_EMOJIS.PRICE,
    })
    .add({
      text: "50,000 Ks",
      callback_data: "topup_amount_50000",
      icon_custom_emoji_id: BOT_EMOJIS.PRICE,
    })
    .row()
    .add({
      text: "စိတ်ကြိုက်ပမာဏ ရိုက်ထည့်မည်",
      callback_data: "topup_custom",
      icon_custom_emoji_id: BOT_EMOJIS.COUNTER,
    })
    .row()
    .add({
      text: "Back to Menu",
      callback_data: "menu_start",
      icon_custom_emoji_id: BOT_EMOJIS.BACK,
    });
}

/**
 * Builds preset amount selector when user uploads an unsolicited slip photo.
 */
export function buildUnmatchedPhotoKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "5,000 Ks",
      callback_data: "topup_amount_5000",
      icon_custom_emoji_id: BOT_EMOJIS.PRICE,
    })
    .add({
      text: "10,000 Ks",
      callback_data: "topup_amount_10000",
      icon_custom_emoji_id: BOT_EMOJIS.PRICE,
    })
    .row()
    .add({
      text: "20,000 Ks",
      callback_data: "topup_amount_20000",
      icon_custom_emoji_id: BOT_EMOJIS.PRICE,
    })
    .add({
      text: "50,000 Ks",
      callback_data: "topup_amount_50000",
      icon_custom_emoji_id: BOT_EMOJIS.PRICE,
    })
    .row()
    .add({
      text: "စိတ်ကြိုက်ပမာဏ ရိုက်ထည့်မည်",
      callback_data: "topup_custom",
      icon_custom_emoji_id: BOT_EMOJIS.COUNTER,
    })
    .row()
    .add({
      text: "Main Menu",
      callback_data: "menu_start",
      icon_custom_emoji_id: BOT_EMOJIS.BACK,
    });
}

/**
 * Builds Top-Up invoice keyboard with cancel option.
 */
export function buildTopUpInvoiceKeyboard(): InlineKeyboard {
  return new InlineKeyboard().add({
    text: "Cancel Top-up",
    callback_data: "cancel_topup",
    icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
    style: "danger",
  } as any);
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
      icon_custom_emoji_id: BOT_EMOJIS.LIGHTNING,
      style: "success",
    } as any)
    .row()
    .add({
      text: "ငွေလွှဲပြေစာ ပို့မည် (Manual Slip)",
      callback_data: `manual_slip_${amountMmk}${ctxSuffix}`,
      icon_custom_emoji_id: BOT_EMOJIS.RECEIPT,
    })
    .row()
    .add({
      text: "နောက်သို့ ပြန်သွားမည်",
      callback_data: "menu_wallet",
      icon_custom_emoji_id: BOT_EMOJIS.BACK,
    });
}

/**
 * Builds MyanMyanPay MMQR invoice actions keyboard.
 */
export function buildMmpayInvoiceKeyboard(reference: string): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "အခြေအနေ ပြန်စစ်မည် (Refresh)",
      callback_data: `mmpay_check_${reference}`,
      icon_custom_emoji_id: BOT_EMOJIS.COUNTER,
    })
    .row()
    .add({
      text: "ငွေပေးချေမှု ဖျက်သိမ်းမည် (Cancel)",
      callback_data: `mmpay_cancel_${reference}`,
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
      style: "danger",
    } as any);
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
      text: "လက်ရှိ အော်ဒါ ဖျက်သိမ်းမည် (Cancel)",
      callback_data: `mmpay_cancel_${reference}`,
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
      style: "danger",
    } as any)
    .row()
    .add({
      text: "Wallet သို့ ပြန်သွားမည်",
      callback_data: "menu_wallet",
      icon_custom_emoji_id: BOT_EMOJIS.BACK,
    });
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
      text: `💳 ${params.deficitMmk.toLocaleString("en-US")} Ks အတိအကျ ငွေဖြည့်မည်`,
      callback_data: `topup_deficit_${params.productId}_${params.quantity}_${params.deficitMmk}`,
      icon_custom_emoji_id: BOT_EMOJIS.BUY_NOW,
      style: "success",
    } as any)
    .row()
    .add({
      text: "Wallet သို့ သွားမည်",
      callback_data: "menu_wallet",
      icon_custom_emoji_id: BOT_EMOJIS.MONEY,
    })
    .row()
    .add({
      text: "Back",
      callback_data: `prod_${params.productId}`,
      icon_custom_emoji_id: BOT_EMOJIS.BACK,
    });
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
    .add({
      text: "အော်ဒါများသို့ ပြန်သွားမည်",
      callback_data: "menu_orders",
      icon_custom_emoji_id: BOT_EMOJIS.BOX,
    })
    .row()
    .add({
      text: "Main Menu",
      callback_data: "menu_start",
      icon_custom_emoji_id: BOT_EMOJIS.BACK,
    });
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
