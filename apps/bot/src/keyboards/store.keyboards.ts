import { InlineKeyboard } from "grammy";
import { BotCategory, BotProduct } from "../services/catalog.service";
import { botConfig } from "../config";
import { BOT_EMOJIS } from "@arena/shared";

/**
 * Builds the Main Start Menu Keyboard with animated custom emojis.
 */
export function buildMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "ပစ္စည်းများဝယ်ယူရန်",
      callback_data: "menu_categories",
      icon_custom_emoji_id: BOT_EMOJIS.BAGS,
    })
    .row()
    .add({
      text: "ကျွန်ုပ်၏အော်ဒါများ",
      callback_data: "menu_orders",
      icon_custom_emoji_id: BOT_EMOJIS.BOX,
    })
    .add({
      text: "Wallet",
      callback_data: "menu_wallet",
      icon_custom_emoji_id: BOT_EMOJIS.MONEY,
    })
    .row()
    .add({
      text: "Help & Support",
      url: `https://t.me/${botConfig.SUPPORT_USERNAME}`,
      icon_custom_emoji_id: BOT_EMOJIS.CHAT,
    })
    .add({
      text: "Channel",
      url: botConfig.CHANNEL_URL,
      icon_custom_emoji_id: BOT_EMOJIS.SPEAKER,
    });
}

/**
 * Builds the 2-Column Categories Grid Keyboard matching Screenshot 1.
 * Passes `icon_custom_emoji_id` when available for Telegram Premium icon rendering.
 */
export function buildCategoriesKeyboard(categories: BotCategory[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // 2 categories per row
  for (let i = 0; i < categories.length; i += 2) {
    const cat1 = categories[i];
    const cat2 = categories[i + 1];

    if (cat1) {
      keyboard.add({
        text: cat1.cleanName,
        callback_data: `cat_${cat1.id}`,
        ...(cat1.emojiId ? { icon_custom_emoji_id: cat1.emojiId } : {}),
      });
    }

    if (cat2) {
      keyboard.add({
        text: cat2.cleanName,
        callback_data: `cat_${cat2.id}`,
        ...(cat2.emojiId ? { icon_custom_emoji_id: cat2.emojiId } : {}),
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
        : `${prod.cleanName} — ပြတ်နေပါသည် ❌`;

      keyboard
        .add({
          text: label,
          callback_data: prod.inStock ? `prod_${prod.id}` : "out_of_stock",
          ...(prod.emojiId ? { icon_custom_emoji_id: prod.emojiId } : {}),
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

  // Row 1: Stepper [-] [qty] [+] with animated icons
  const canDecrease = quantity > 1;
  const canIncrease = quantity < product.stock;

  keyboard
    .add({
      text: canDecrease ? " " : "🚫",
      callback_data: canDecrease ? `qty_step_${product.id}_${quantity - 1}` : "noop",
      ...(canDecrease ? { icon_custom_emoji_id: BOT_EMOJIS.MINUS } : { icon_custom_emoji_id: BOT_EMOJIS.CANCEL }),
    })
    .add({
      text: `${quantity}`,
      callback_data: "noop",
      icon_custom_emoji_id: BOT_EMOJIS.COUNTER,
    })
    .add({
      text: canIncrease ? " " : "🚫",
      callback_data: canIncrease ? `qty_step_${product.id}_${quantity + 1}` : "noop",
      ...(canIncrease ? { icon_custom_emoji_id: BOT_EMOJIS.PLUS } : { icon_custom_emoji_id: BOT_EMOJIS.CANCEL }),
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
    })
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
export function buildCheckoutKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add({
      text: "Cancel Order",
      callback_data: `cancel_order_${orderId}`,
      icon_custom_emoji_id: BOT_EMOJIS.CANCEL,
    })
    .row()
    .add({
      text: "Need Help? Contact Admin",
      url: `https://t.me/${botConfig.SUPPORT_USERNAME}`,
      icon_custom_emoji_id: BOT_EMOJIS.CHAT,
    });
}

/**
 * Builds Order Status / Delivery Viewer Keyboard.
 */
export function buildOrderListKeyboard(orders: Array<{ id: string; publicOrderNo: string; status: string }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const ord of orders.slice(0, 8)) {
    const iconId = ord.status === "DELIVERED" ? BOT_EMOJIS.CHECK : ord.status === "PAYMENT_SUBMITTED" ? BOT_EMOJIS.HOURGLASS : BOT_EMOJIS.RECEIPT;
    keyboard.add({
      text: ord.publicOrderNo,
      callback_data: `view_order_${ord.id}`,
      icon_custom_emoji_id: iconId,
    }).row();
  }

  keyboard.add({
    text: "Back to Menu",
    callback_data: "menu_start",
    icon_custom_emoji_id: BOT_EMOJIS.BACK,
  });
  return keyboard;
}
