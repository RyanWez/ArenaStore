import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseCustomEmoji,
  formatTelegramCustomEmoji,
  calculateRetailMmk,
} from "@arena/shared";
import {
  buildMainMenuKeyboard,
  buildCategoriesKeyboard,
  buildProductsKeyboard,
  buildProductDetailKeyboard,
  buildCheckoutKeyboard,
  buildOrderListKeyboard,
} from "../../apps/bot/src/keyboards/store.keyboards";
import {
  formatStartMessage,
  formatCategoriesMessage,
  formatProductsListMessage,
  formatProductDetailMessage,
  formatCheckoutMessage,
  formatSlipReceivedMessage,
  formatDeliveryMessage,
} from "../../apps/bot/src/formatters/messages";
import { BotProduct, BotCategory } from "../../apps/bot/src/services/catalog.service";

describe("Phase 4 Customer Telegram Bot", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });
  const sampleProduct: BotProduct = {
    id: 10,
    categoryId: 10,
    name: "{pe:5069075201950483359}🤖 Gemini AI 18 MONTH",
    cleanName: "Gemini AI 18 MONTH",
    emojiId: "5069075201950483359",
    description: "Instant activation on your personal Google account\nNo Card Required • No Country Issue",
    formattedDescription: "Instant activation on your personal Google account\nNo Card Required • No Country Issue",
    supplierPriceUsd: "0.69",
    retailPriceMmk: 3900,
    formattedPriceMmk: "3,900 Ks",
    stock: 50,
    supplierStock: 60,
    deliveryType: "LINK",
    inStock: true,
  };

  const sampleCategories: BotCategory[] = [
    { id: 18, name: "{pe:4956506857901392912} steam", cleanName: "steam", emojiId: "4956506857901392912" },
    { id: 36, name: "{pe:4963072209334567688} Duolingo", cleanName: "Duolingo", emojiId: "4963072209334567688" },
    { id: 10, name: "{pe:5069075201950483359} GEMINI AI", cleanName: "GEMINI AI", emojiId: "5069075201950483359" },
    { id: 15, name: "{pe:5229235451541338986} Canva", cleanName: "Canva", emojiId: "5229235451541338986" },
  ];

  describe("Telegram Custom Emoji & Option A Price Formatting", () => {
    it("extracts custom emoji ID and clean label for inline buttons", () => {
      const parsed = parseCustomEmoji(sampleProduct.name);
      expect(parsed.emojiId).toBe("5069075201950483359");
      expect(parsed.cleanText).toContain("Gemini AI 18 MONTH");
    });

    it("formats retail pricing using Option A (<amount> Ks)", () => {
      const pricing = calculateRetailMmk({
        upstreamUsdCost: 0.69,
        exchangeRateMmk: 4500,
        marginPercentage: 25,
      });
      const formatted = `${pricing.retailPriceMmk.toLocaleString("en-US")} Ks`;
      expect(formatted).toBe("3,900 Ks");
    });
  });

  describe("Storefront Keyboards Architecture", () => {
    it("builds main menu with all 5 navigation options", () => {
      const keyboard = buildMainMenuKeyboard();
      const buttons = keyboard.inline_keyboard.flat();

      expect(buttons.some((b) => b.text.includes("ပစ္စည်းများဝယ်ယူရန်"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("ကျွန်ုပ်၏အော်ဒါများ"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("Wallet"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("Help & Support"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("Channel"))).toBe(true);
    });

    it("builds 2-column categories grid with icon_custom_emoji_id (matching Screenshot 1)", () => {
      const keyboard = buildCategoriesKeyboard(sampleCategories);
      const rows = keyboard.inline_keyboard;

      // First row should have 2 category buttons
      expect(rows[0].length).toBe(2);
      expect(rows[0][0].text).toBe("steam");
      expect((rows[0][0] as any).icon_custom_emoji_id).toBe("4956506857901392912");

      expect(rows[0][1].text).toBe("Duolingo");
      expect((rows[0][1] as any).icon_custom_emoji_id).toBe("4963072209334567688");

      // Last row must be Back button
      const lastRow = rows[rows.length - 1];
      expect(lastRow[0].text).toBe("⬅ Back");
      expect(lastRow[0].callback_data).toBe("menu_start");
    });

    it("builds product list keyboard with custom emoji icon and Option A price (matching Screenshot 2)", () => {
      const keyboard = buildProductsKeyboard(10, [sampleProduct]);
      const rows = keyboard.inline_keyboard;

      expect(rows[0][0].text).toBe("Gemini AI 18 MONTH — 3,900 Ks");
      expect((rows[0][0] as any).icon_custom_emoji_id).toBe("5069075201950483359");
      expect(rows[0][0].callback_data).toBe("prod_10");

      const backButton = rows[rows.length - 1][0];
      expect(backButton.text).toBe("⬅ Back");
      expect(backButton.callback_data).toBe("menu_categories");
    });

    it("builds interactive quantity controller and stepper (matching Screenshot 3)", () => {
      const qty1Keyboard = buildProductDetailKeyboard(sampleProduct, 1);
      const rows = qty1Keyboard.inline_keyboard;

      // Row 1: Stepper [-] [1] [+]
      expect(rows[0][0].text).toBe("🚫"); // cannot decrease below 1
      expect(rows[0][1].text).toBe("🔢 1");
      expect(rows[0][2].text).toBe("➕");
      expect(rows[0][2].callback_data).toBe("qty_step_10_2");

      // Row 2: Presets (1 is selected with checkmark)
      expect(rows[1][0].text).toBe("✅ 1");
      expect(rows[1][1].text).toBe("5");
      expect(rows[1][2].text).toBe("10");
      expect(rows[1][3].text).toBe("20");

      // Row 4: Custom Quantity
      expect(rows[3][0].text).toBe("🎉 Custom Quantity");

      // Row 5: Buy Now with dynamic total
      expect(rows[4][0].text).toBe("💳 Buy Now · 3,900 Ks");
      expect(rows[4][0].callback_data).toBe("checkout_10_1");

      // Row 6: Back
      expect(rows[5][0].text).toBe("🔄 Back");
      expect(rows[5][0].callback_data).toBe("cat_10");

      // Test with quantity = 5
      const qty5Keyboard = buildProductDetailKeyboard(sampleProduct, 5);
      const rowsQty5 = qty5Keyboard.inline_keyboard;
      expect(rowsQty5[0][0].text).toBe("➖"); // can decrease from 5
      expect(rowsQty5[0][0].callback_data).toBe("qty_step_10_4");
      expect(rowsQty5[1][1].text).toBe("✅ 5"); // 5 is now selected
      expect(rowsQty5[4][0].text).toBe("💳 Buy Now · 19,500 Ks"); // 3900 * 5 = 19500
    });
  });

  describe("Storefront Messages & HTML Formatting", () => {
    it("formats start message in Myanmar language with customer greeting", () => {
      const msg = formatStartMessage("Aung Aung");
      expect(msg).toContain("Aung Aung");
      expect(msg).toContain("Arena Store");
      expect(msg).toContain("KPay / WavePay");
    });

    it("formats product detail card with expandable quote and price (matching Screenshot 3)", () => {
      const detailMsg = formatProductDetailMessage(sampleProduct, 2);
      expect(detailMsg).toContain("<blockquote>");
      expect(detailMsg).toContain("Gemini AI 18 MONTH");
      expect(detailMsg).toContain("Price:</b> 3,900 Ks");
      expect(detailMsg).toContain("Selected ·</b> 2");
      expect(detailMsg).toContain("Total ·</b> 7,800 Ks");
    });

    it("formats checkout message with 15-minute reservation and payment numbers", () => {
      const checkoutMsg = formatCheckoutMessage({
        publicOrderNo: "ARN-2026-84920",
        productName: sampleProduct.cleanName,
        quantity: 2,
        totalMmk: 7800,
      });

      expect(checkoutMsg).toContain("ARN-2026-84920");
      expect(checkoutMsg).toContain("7,800 Ks");
      expect(checkoutMsg).toContain("15 မိနစ်အတွင်း");
      expect(checkoutMsg).toContain("KPay:");
      expect(checkoutMsg).toContain("WavePay:");
    });

    it("formats slip receipt acknowledgment", () => {
      const ackMsg = formatSlipReceivedMessage("ARN-2026-84920");
      expect(ackMsg).toContain("ARN-2026-84920");
      expect(ackMsg).toContain("စစ်ဆေးနေပါသည်");
    });

    it("formats delivery message with credentials and security advisory", () => {
      const deliveryMsg = formatDeliveryMessage({
        publicOrderNo: "ARN-2026-84920",
        productName: sampleProduct.cleanName,
        deliveryType: "CREDENTIALS",
        credentialsText: "user: premium@gemini.ai\npass: Secret12345",
      });

      expect(deliveryMsg).toContain("ARN-2026-84920");
      expect(deliveryMsg).toContain("CREDENTIALS");
      expect(deliveryMsg).toContain("<pre><code>user: premium@gemini.ai\npass: Secret12345</code></pre>");
      expect(deliveryMsg).toContain("လုံခြုံရေး သတိပေးချက်");
    });
  });

  describe("BotCatalogService & Stock Edge Cases", () => {
    it("formats price with comma and Option A 'Ks' suffix", async () => {
      const { botCatalog } = await import("../../apps/bot/src/services/catalog.service");
      expect(botCatalog.formatPrice(3900)).toBe("3,900 Ks");
      expect(botCatalog.formatPrice(19500)).toBe("19,500 Ks");
      expect(botCatalog.formatPrice(120000)).toBe("120,000 Ks");
    });

    it("retrieves fallback categories and products seamlessly when upstream fails", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Upstream connection offline"));
      const { botCatalog } = await import("../../apps/bot/src/services/catalog.service");
      const cats = await botCatalog.getCategories();
      expect(cats.length).toBeGreaterThan(0);
      expect(cats.some((c) => c.cleanName === "GEMINI AI")).toBe(true);

      const geminiCat = await botCatalog.getCategoryById(10);
      expect(geminiCat).toBeDefined();
      expect(geminiCat?.cleanName).toBe("GEMINI AI");

      const geminiProd = await botCatalog.getProductById(10);
      expect(geminiProd).toBeDefined();
      expect(geminiProd?.cleanName).toContain("Gemini AI");
    });

    it("handles out of stock products in keyboard gracefully", () => {
      const outOfStockProd: BotProduct = {
        ...sampleProduct,
        stock: 0,
        inStock: false,
      };
      const keyboard = buildProductsKeyboard(10, [outOfStockProd]);
      const btn = keyboard.inline_keyboard[0][0];
      expect(btn.text).toContain("ပြတ်နေပါသည် ❌");
      expect(btn.callback_data).toBe("out_of_stock");
    });

    it("disables stepper increment when quantity reaches max available stock", () => {
      const limitedProduct: BotProduct = {
        ...sampleProduct,
        stock: 3,
      };
      const keyboard = buildProductDetailKeyboard(limitedProduct, 3);
      const rows = keyboard.inline_keyboard;

      // Row 1: Stepper [+] should be disabled (🚫)
      expect(rows[0][2].text).toBe("🚫");
      expect(rows[0][2].callback_data).toBe("noop");

      // Presets > stock (5, 10, 20, 30, 50) should be noop
      expect(rows[1][1].callback_data).toBe("noop"); // 5
      expect(rows[1][2].callback_data).toBe("noop"); // 10
    });

    it("handles empty categories product list gracefully", () => {
      const keyboard = buildProductsKeyboard(999, []);
      const rows = keyboard.inline_keyboard;
      expect(rows[0][0].text).toContain("ပစ္စည်းများ ပြတ်လပ်နေပါသည်");
      expect(rows[0][0].callback_data).toBe("noop");
    });
  });

  describe("BotOrderService & Order Lifecycle", () => {
    it("creates order and returns orderId, publicOrderNo, and totalMmk", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          order: {
            orderId: "ord-test-uuid",
            publicOrderNo: "ARN-2026-12345",
            totalAmountMmk: 7800,
          },
        }),
      } as Response);

      const { botOrderService } = await import("../../apps/bot/src/services/order.service");
      const order = await botOrderService.createOrder({
        telegramId: "12345678",
        telegramUsername: "testuser",
        customerName: "Test Customer",
        productId: 10,
        quantity: 2,
      });

      expect(order.orderId).toBe("ord-test-uuid");
      expect(order.publicOrderNo).toBe("ARN-2026-12345");
      expect(order.totalMmk).toBe(7800);
    });

    it("submits payment slip proof successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          submission: {
            id: 888,
            status: "SUBMITTED",
          },
        }),
      } as Response);

      const { botOrderService } = await import("../../apps/bot/src/services/order.service");
      const submission = await botOrderService.submitPaymentSlip({
        orderId: "ord-test-uuid",
        telegramId: "12345678",
        fileId: "AgACAgUAAxkBAAIC8...",
        paymentMethod: "KPAY",
        amountMmk: 7800,
      });

      expect(submission.submissionId).toBe(888);
      expect(submission.status).toBe("SUBMITTED");
    });
  });

  describe("Bot Initialization & Session", () => {
    it("initializes default session state correctly", async () => {
      const { createInitialSessionData } = await import("../../apps/bot/src/types");
      const session = createInitialSessionData();
      expect(session.selectedQuantity).toBe(1);
      expect(session.awaitingCustomQuantity).toBe(false);
      expect(session.pendingOrderId).toBeUndefined();
    });

    it("creates grammY bot instance without runtime exception", async () => {
      const { createBot } = await import("../../apps/bot/src/bot");
      const bot = createBot();
      expect(bot).toBeDefined();
      expect(typeof bot.start).toBe("function");
    });
  });
});
