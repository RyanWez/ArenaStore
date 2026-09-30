import { InlineKeyboard } from "grammy";
import { BotCategory, BotProduct } from "../services/catalog.service";
import { botConfig } from "../config";

/**
 * Builds the Main Start Menu Keyboard.
 */
export function buildMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🛍 ပစ္စည်းများဝယ်ယူရန်", "menu_categories")
    .row()
    .text("📦 ကျွန်ုပ်၏အော်ဒါများ", "menu_orders")
    .text("💰 Wallet", "menu_wallet")
    .row()
    .url("🎧 Help & Support", `https://t.me/${botConfig.SUPPORT_USERNAME}`)
    .url("📢 Channel", botConfig.CHANNEL_URL);
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
  keyboard.text("⬅ Back", "menu_start");
  return keyboard;
}

/**
 * Builds the Product List Keyboard matching Screenshot 2.
 * Shows Custom Emoji Icon + Clean Name + Price in Option A ("3,900 Ks") format.
 */
export function buildProductsKeyboard(categoryId: number, products: BotProduct[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (products.length === 0) {
    keyboard.text("❌ လက်ရှိတွင် ပစ္စည်းများ ပြတ်လပ်နေပါသည်", "noop").row();
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
  keyboard.text("⬅ Back", "menu_categories");
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

  // Row 1: Stepper [-] [qty] [+]
  const canDecrease = quantity > 1;
  const canIncrease = quantity < product.stock;

  keyboard
    .text(canDecrease ? "➖" : "🚫", canDecrease ? `qty_step_${product.id}_${quantity - 1}` : "noop")
    .text(`🔢 ${quantity}`, "noop")
    .text(canIncrease ? "➕" : "🚫", canIncrease ? `qty_step_${product.id}_${quantity + 1}` : "noop")
    .row();

  // Row 2: Quick Presets (1, 5, 10, 20) with checkmark on active
  const presets1 = [1, 5, 10, 20];
  for (const preset of presets1) {
    const isSelected = quantity === preset;
    const isAvailable = preset <= product.stock;
    keyboard.text(
      isSelected ? `✅ ${preset}` : `${preset}`,
      isAvailable ? `qty_set_${product.id}_${preset}` : "noop"
    );
  }
  keyboard.row();

  // Row 3: Quick Presets (30, 50)
  const presets2 = [30, 50];
  for (const preset of presets2) {
    const isSelected = quantity === preset;
    const isAvailable = preset <= product.stock;
    keyboard.text(
      isSelected ? `✅ ${preset}` : `${preset}`,
      isAvailable ? `qty_set_${product.id}_${preset}` : "noop"
    );
  }
  keyboard.row();

  // Row 4: Custom Quantity Picker
  keyboard.text("🎉 Custom Quantity", `qty_custom_${product.id}`).row();

  // Row 5: Buy Now with Total Price in Option A ("3,900 Ks")
  keyboard
    .text(
      `💳 Buy Now · ${totalMmk.toLocaleString("en-US")} Ks`,
      `checkout_${product.id}_${quantity}`
    )
    .row();

  // Row 6: Back to Category's Product List
  keyboard.text("🔄 Back", `cat_${product.categoryId}`);

  return keyboard;
}

/**
 * Builds Payment Slip Action Keyboard during Checkout.
 */
export function buildCheckoutKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("❌ Cancel Order", `cancel_order_${orderId}`)
    .row()
    .url("🎧 Need Help? Contact Admin", `https://t.me/${botConfig.SUPPORT_USERNAME}`);
}

/**
 * Builds Order Status / Delivery Viewer Keyboard.
 */
export function buildOrderListKeyboard(orders: Array<{ id: string; publicOrderNo: string; status: string }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const ord of orders.slice(0, 8)) {
    const statusIcon = ord.status === "DELIVERED" ? "✅" : ord.status === "PAYMENT_SUBMITTED" ? "⏳" : "📝";
    keyboard.text(`${statusIcon} ${ord.publicOrderNo}`, `view_order_${ord.id}`).row();
  }

  keyboard.text("⬅ Back to Menu", "menu_start");
  return keyboard;
}
