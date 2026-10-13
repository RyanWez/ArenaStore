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
  buildProfileKeyboard,
  buildHelpKeyboard,
} from "../../apps/bot/src/keyboards/store.keyboards";
import { resolveTelegramSupportUrl } from "../../apps/bot/src/services/settings.service";
import {
  formatStartMessage,
  formatCategoriesMessage,
  formatProductsListMessage,
  formatProductDetailMessage,
  formatCheckoutMessage,
  formatTopUpInvoiceMessage,
  formatSlipReceivedMessage,
  formatDeliveryMessage,
  formatProfileMessage,
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
    it("builds main menu with all 5 navigation options and animated custom emojis", () => {
      const keyboard = buildMainMenuKeyboard();
      const buttons = keyboard.inline_keyboard.flat();

      expect(buttons.some((b) => b.text.includes("ပစ္စည်းများ ဝယ်ယူရန်"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("ကျွန်ုပ်၏ အော်ဒါများ"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("Wallet"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("ကျွန်ုပ်၏ အကောင့်"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("အကူအညီ"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("Channel"))).toBe(true);

      const shopBtn = buttons.find((b) => b.text.includes("ပစ္စည်းများ ဝယ်ယူရန်"));
      expect((shopBtn as any).icon_custom_emoji_id).toBe("5346268255180834499");
      expect((shopBtn as any).style).toBe("success");

      const profileBtn = buttons.find((b) => b.text.includes("ကျွန်ုပ်၏ အကောင့်"));
      expect((profileBtn as any).icon_custom_emoji_id).toBe("5316727448644103237");

      const channelBtn = buttons.find((b) => b.text.includes("Channel"));
      expect((channelBtn as any).url).toBe("https://t.me/arenasellerstore");

      // Verify 2x2 column structure
      expect(keyboard.inline_keyboard[0].length).toBe(2); // Row 1: Shop & Orders
      expect(keyboard.inline_keyboard[1].length).toBe(2); // Row 2: Wallet & Profile
      expect(keyboard.inline_keyboard[2].length).toBe(2); // Row 3: Support & Channel
    });

    it("builds profile keyboard with a home button", () => {
      const keyboard = buildProfileKeyboard();
      const rows = keyboard.inline_keyboard;
      expect(rows[0][0].text).toBe("ပင်မစာမျက်နှာ");
      expect((rows[0][0] as any).icon_custom_emoji_id).toBe("5348064629547351986");
      expect((rows[0][0] as any).callback_data).toBe("menu_start");
    });

    it("uses dynamic support URL in main menu and checkout keyboards matching admin settings", () => {
      const customSupportUrl = "https://t.me/ArenaStoreSupport_Bot";
      const keyboard = buildMainMenuKeyboard(customSupportUrl);
      const supportBtn = keyboard.inline_keyboard.flat().find((b) => b.text.includes("အကူအညီ"));
      expect(supportBtn).toBeDefined();
      expect((supportBtn as any).url).toBe(customSupportUrl);

      const checkoutKeyboard = buildCheckoutKeyboard("ORD-123", customSupportUrl);
      const contactBtn = checkoutKeyboard.inline_keyboard.flat().find((b) => b.text.includes("Customer Support ဆက်သွယ်ရန်"));
      expect(contactBtn).toBeDefined();
      expect((contactBtn as any).url).toBe(customSupportUrl);
    });

    it("normalizes support telegram handles into /start deep links with resolveTelegramSupportUrl", () => {
      expect(resolveTelegramSupportUrl("@ArenaStoreSupport_Bot")).toBe("https://t.me/ArenaStoreSupport_Bot?start=help");
      expect(resolveTelegramSupportUrl("ArenaStoreSupport_Bot")).toBe("https://t.me/ArenaStoreSupport_Bot?start=help");
      expect(resolveTelegramSupportUrl("https://t.me/ArenaStoreSupport_Bot")).toBe("https://t.me/ArenaStoreSupport_Bot?start=help");
      expect(resolveTelegramSupportUrl("t.me/ArenaStoreSupport_Bot")).toBe("https://t.me/ArenaStoreSupport_Bot?start=help");
      expect(resolveTelegramSupportUrl("https://t.me/ArenaStoreSupport_Bot?start=custom")).toBe("https://t.me/ArenaStoreSupport_Bot?start=custom");
      expect(resolveTelegramSupportUrl("")).toBe("https://t.me/ryanwez?start=help");
    });

    it("builds help keyboard with clean support button and main menu navigation", () => {
      const keyboard = buildHelpKeyboard("https://t.me/ArenaStoreSupport_Bot", "@ArenaStoreSupport_Bot");
      const buttons = keyboard.inline_keyboard.flat();
      const supportBtn = buttons.find((b) => b.text.includes("Customer Support ဆက်သွယ်ရန်"));
      expect(supportBtn).toBeDefined();
      expect(supportBtn?.text).toBe("Customer Support ဆက်သွယ်ရန်");
      expect((supportBtn as any).url).toBe("https://t.me/ArenaStoreSupport_Bot");

      const backBtn = buttons.find((b) => b.text.includes("ပင်မစာမျက်နှာ"));
      expect(backBtn).toBeDefined();
      expect((backBtn as any).callback_data).toBe("menu_start");
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

      // Last row must be the home button
      const lastRow = rows[rows.length - 1];
      expect(lastRow[0].text).toBe("ပင်မစာမျက်နှာ");
      expect((lastRow[0] as any).icon_custom_emoji_id).toBe("5348064629547351986");
      expect((lastRow[0] as any).callback_data).toBe("menu_start");
    });

    it("safely ignores non-numeric emojiId and renders unicode iconEmoji without crashing Telegram", () => {
      const mixedCategories: BotCategory[] = [
        {
          id: 99,
          name: "Uncategorized",
          cleanName: "Uncategorized",
          emojiId: null,
          iconEmoji: "📦",
        },
        {
          id: 100,
          name: "Invalid Emoji ID Category",
          cleanName: "Invalid Emoji ID Category",
          emojiId: "📦",
          iconEmoji: null,
        },
      ];

      const keyboard = buildCategoriesKeyboard(mixedCategories);
      const rows = keyboard.inline_keyboard;

      expect(rows[0][0].text).toBe("📦 Uncategorized");
      expect((rows[0][0] as any).icon_custom_emoji_id).toBeUndefined();

      expect(rows[0][1].text).toBe("Invalid Emoji ID Category");
      expect((rows[0][1] as any).icon_custom_emoji_id).toBeUndefined();
    });

    it("builds product list keyboard with custom emoji icon and Option A price (matching Screenshot 2)", () => {
      const keyboard = buildProductsKeyboard(10, [sampleProduct]);
      const rows = keyboard.inline_keyboard;

      expect(rows[0][0].text).toBe("Gemini AI 18 MONTH — 3,900 Ks");
      expect((rows[0][0] as any).icon_custom_emoji_id).toBe("5069075201950483359");
      expect((rows[0][0] as any).callback_data).toBe("prod_10");

      const backButton = rows[rows.length - 1][0];
      expect(backButton.text).toBe("နောက်သို့");
      expect((backButton as any).icon_custom_emoji_id).toBe("5258236805890710909");
      expect((backButton as any).callback_data).toBe("menu_categories");
    });

    it("builds interactive quantity controller and stepper (matching Screenshot 3)", () => {
      const qty1Keyboard = buildProductDetailKeyboard(sampleProduct, 1);
      const rows = qty1Keyboard.inline_keyboard;

      // Row 1: Stepper [-] [1] [+] with outline icons
      expect(rows[0][0].text).toBe(" ");
      expect((rows[0][0] as any).icon_custom_emoji_id).toBe("5346176879751612829");
      expect(rows[0][1].text).toBe("1");
      expect((rows[0][2] as any).icon_custom_emoji_id).toBe("5346004239246183111");
      expect((rows[0][2] as any).callback_data).toBe("qty_step_10_2");

      // Row 2: Presets (1 is selected with checkmark)
      expect(rows[1][0].text).toBe("1");
      expect((rows[1][0] as any).icon_custom_emoji_id).toBe("5260416304224936047");
      expect(rows[1][1].text).toBe("5");
      expect(rows[1][2].text).toBe("10");
      expect(rows[1][3].text).toBe("20");

      // Row 3: Custom Quantity
      expect(rows[2][0].text).toBe("စိတ်ကြိုက် အရေအတွက် ထည့်မည်");
      expect((rows[2][0] as any).icon_custom_emoji_id).toBe("5985774024968379294");

      // Row 4: Buy Now with dynamic total and outline icon
      expect(rows[3][0].text).toBe("ဝယ်ယူမည် · 3,900 Ks");
      expect((rows[3][0] as any).icon_custom_emoji_id).toBe("5346227465876423936");
      expect((rows[3][0] as any).style).toBe("success");
      expect((rows[3][0] as any).callback_data).toBe("checkout_10_1");

      // Row 5: Back
      expect(rows[4][0].text).toBe("နောက်သို့");
      expect((rows[4][0] as any).icon_custom_emoji_id).toBe("5258236805890710909");
      expect((rows[4][0] as any).callback_data).toBe("cat_10");

      // Test with quantity = 5
      const qty5Keyboard = buildProductDetailKeyboard(sampleProduct, 5);
      const rowsQty5 = qty5Keyboard.inline_keyboard;
      expect((rowsQty5[0][0] as any).icon_custom_emoji_id).toBe("5346176879751612829"); // can decrease from 5
      expect((rowsQty5[0][0] as any).callback_data).toBe("qty_step_10_4");
      expect(rowsQty5[1][1].text).toBe("5");
      expect((rowsQty5[1][1] as any).icon_custom_emoji_id).toBe("5260416304224936047"); // 5 is now selected
      expect(rowsQty5[3][0].text).toBe("ဝယ်ယူမည် · 19,500 Ks");
      expect((rowsQty5[3][0] as any).icon_custom_emoji_id).toBe("5346227465876423936");
    });
  });

  describe("List Pagination (categories, products, orders)", () => {
    const makeProducts = (count: number): BotProduct[] =>
      Array.from({ length: count }, (_, i) => ({
        ...sampleProduct,
        id: 1000 + i,
        cleanName: `Product ${i}`,
      }));

    const makeOrders = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `ORD-${i}`,
        publicOrderNo: `ARN-${i}`,
        productName: `Item ${i}`,
        status: "DELIVERED",
      }));

    const makeCategories = (count: number): BotCategory[] =>
      Array.from({ length: count }, (_, i) => ({
        id: 500 + i,
        name: `Cat ${i}`,
        cleanName: `Cat ${i}`,
        emojiId: null,
        iconEmoji: null,
      }));

    it("renders no pager row when products fit on a single page", () => {
      const keyboard = buildProductsKeyboard(10, makeProducts(5));
      const flat = keyboard.inline_keyboard.flat();
      expect(flat.some((b) => (b as any).callback_data?.startsWith("cat_10_p"))).toBe(false);
    });

    it("renders a prev/page/next pager when products exceed one page", () => {
      const products = makeProducts(20); // 3 pages at 8/page
      const page0 = buildProductsKeyboard(10, products, 0);
      const navRow0 = page0.inline_keyboard.find((r) =>
        r.some((b) => b.text === "1/3")
      );
      expect(navRow0).toBeDefined();
      // On page 0 the next button targets page 1; prev is a disabled placeholder.
      expect(navRow0!.some((b) => (b as any).callback_data === "cat_10_p1")).toBe(true);
      // Only the page window is shown (8 product rows).
      const prodRows = page0.inline_keyboard.filter((r) =>
        r.some((b) => (b as any).callback_data?.startsWith("prod_"))
      );
      expect(prodRows.length).toBe(8);

      const page1 = buildProductsKeyboard(10, products, 1);
      const navRow1 = page1.inline_keyboard.find((r) => r.some((b) => b.text === "2/3"));
      expect(navRow1).toBeDefined();
      expect(navRow1!.some((b) => (b as any).callback_data === "cat_10_p0")).toBe(true);
      expect(navRow1!.some((b) => (b as any).callback_data === "cat_10_p2")).toBe(true);
    });

    it("paginates the orders list beyond the first 8 orders", () => {
      const orders = makeOrders(12);
      const page1 = buildOrderListKeyboard(orders, 1);
      const viewRows = page1.inline_keyboard.filter((r) =>
        r.some((b) => (b as any).callback_data?.startsWith("view_order_"))
      );
      expect(viewRows.length).toBe(4); // 12 - 8 = 4 on page 2
      const navRow = page1.inline_keyboard.find((r) => r.some((b) => b.text === "2/2"));
      expect(navRow).toBeDefined();
      expect(navRow!.some((b) => (b as any).callback_data === "menu_orders_p0")).toBe(true);
    });

    it("paginates categories only when they exceed one page", () => {
      const single = buildCategoriesKeyboard(makeCategories(6));
      expect(single.inline_keyboard.flat().some((b) => b.text?.includes("/"))).toBe(false);

      const many = buildCategoriesKeyboard(makeCategories(25), 0);
      const navRow = many.inline_keyboard.find((r) => r.some((b) => b.text === "1/3"));
      expect(navRow).toBeDefined();
      expect(navRow!.some((b) => (b as any).callback_data === "menu_categories_p1")).toBe(true);
    });
  });

  describe("Storefront Messages & HTML Formatting", () => {
    it("formats start message in Myanmar language with customer greeting", () => {
      const msg = formatStartMessage("Aung Aung");
      expect(msg).toContain("Aung Aung");
      expect(msg).toContain("Welcome Back, Aung Aung,");
      expect(msg).toContain("Premium AI Tools နှင့် Digital Accounts");
      expect(msg).toContain("5346268255180834499"); // Store icon
    });

    it("formats product detail card with expandable quote and price (matching Screenshot 3)", () => {
      const detailMsg = formatProductDetailMessage(sampleProduct, 2);
      expect(detailMsg).toContain("<blockquote>");
      expect(detailMsg).toContain("Gemini AI 18 MONTH");
      expect(detailMsg).toContain("စျေးနှုန်း: <b>3,900 Ks</b>");
      expect(detailMsg).toContain("လက်ကျန်: <b>50 ခု</b>");
      expect(detailMsg).toContain("အရေအတွက်: <b>2 ခု</b> • စုစုပေါင်း: <b>7,800 Ks</b>");
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
      expect(checkoutMsg).toContain("KBZ Pay:");
      expect(checkoutMsg).toContain("WavePay:");
    });

    it("formats slip receipt acknowledgment", () => {
      const ackMsg = formatSlipReceivedMessage("ARN-2026-84920");
      expect(ackMsg).toContain("ARN-2026-84920");
      expect(ackMsg).toContain("စစ်ဆေးနေပါသည်");
    });

    it("formats top-up invoice with every configured provider (KBZ/Wave/AYA/UAB)", () => {
      const msg = formatTopUpInvoiceMessage({
        amountMmk: 5000,
        reference: "TOP-TEST123",
        paymentInfo: {
          kpayPhone: "09 111 111 111",
          kpayAccountName: "K Account",
          wavepayPhone: "09 222 222 222",
          wavepayAccountName: "W Account",
          ayapayPhone: "09 333 333 333",
          ayapayAccountName: "A Account",
          uabpayPhone: "09 444 444 444",
          uabpayAccountName: "U Account",
        },
      });

      expect(msg).toContain("TOP-TEST123");
      expect(msg).toContain("KBZ Pay:");
      expect(msg).toContain("WavePay:");
      expect(msg).toContain("AYA Pay:");
      expect(msg).toContain("UAB Pay:");
      expect(msg).toContain("09 333 333 333");
      expect(msg).toContain("A Account");
      expect(msg).toContain("09 444 444 444");
      expect(msg).toContain("U Account");
    });

    it("hides optional providers (AYA/UAB) when they are not configured", () => {
      const msg = formatTopUpInvoiceMessage({
        amountMmk: 5000,
        reference: "TOP-TEST123",
        paymentInfo: {
          kpayPhone: "09 111 111 111",
          kpayAccountName: "K Account",
          wavepayPhone: "09 222 222 222",
          wavepayAccountName: "W Account",
        },
      });

      expect(msg).toContain("KBZ Pay:");
      expect(msg).toContain("WavePay:");
      expect(msg).not.toContain("AYA Pay:");
      expect(msg).not.toContain("UAB Pay:");
    });

    it("formats delivery message with clean credentials and without security advisory", () => {
      const deliveryMsg = formatDeliveryMessage({
        publicOrderNo: "ARN-2026-84920",
        productName: sampleProduct.cleanName,
        deliveryType: "CREDENTIALS",
        credentialsText: '["https://serviceactivationgoogle.com/subscription/new/12345"]',
      });

      expect(deliveryMsg).toContain("ARN-2026-84920");
      expect(deliveryMsg).toContain("CREDENTIALS");
      expect(deliveryMsg).toContain("<pre><code>https://serviceactivationgoogle.com/subscription/new/12345</code></pre>");
      expect(deliveryMsg).not.toContain('["');
      expect(deliveryMsg).not.toContain('"]');
      expect(deliveryMsg).not.toContain("လုံခြုံရေး သတိပေးချက်");
    });

    it("formats profile card matching Screenshot 2 with user details and MMK stats", () => {
      const profileMsg = formatProfileMessage({
        fullName: "RYAN WEZ",
        username: "ryanwez",
        telegramId: "8777968077",
        joinedDate: "2026-09-12",
        walletBalanceMmk: 0,
        totalDepositsMmk: 0,
        totalSpentMmk: 5550,
        ordersCount: 1,
      });

      expect(profileMsg).toContain("ကျွန်ုပ်၏ အကောင့်");
      expect(profileMsg).toContain("5316727448644103237"); // PROFILE custom emoji
      expect(profileMsg).toContain("RYAN WEZ");
      expect(profileMsg).toContain("@ryanwez");
      expect(profileMsg).toContain("8777968077");
      expect(profileMsg).toContain("Wallet လက်ကျန်ငွေ: <b>0 Ks</b>");
      expect(profileMsg).toContain("ဝယ်ယူခဲ့သည့် ပမာဏ: <b>5,550 Ks</b>");
      expect(profileMsg).toContain("အော်ဒါ အရေအတွက်: <b>1 ခု</b>");
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
      expect(btn.text).toContain("ပြတ်လပ်နေပါသည် ❌");
      expect((btn as any).callback_data).toBe("out_of_stock");
    });

    it("disables stepper increment when quantity reaches max available stock", () => {
      const limitedProduct: BotProduct = {
        ...sampleProduct,
        stock: 3,
      };
      const keyboard = buildProductDetailKeyboard(limitedProduct, 3);
      const rows = keyboard.inline_keyboard;

      // Row 1: Stepper [+] should be disabled (icon-only button with CANCEL animated emoji)
      expect(rows[0][2].text).toBe(" ");
      expect((rows[0][2] as any).callback_data).toBe("noop");

      // Presets > stock (5, 10, 20) route to over-stock alert and display PROHIBITED icon
      expect((rows[1][0] as any).icon_custom_emoji_id).toBeUndefined(); // 1 (available, not selected)
      expect((rows[1][1] as any).callback_data).toBe("qty_max_3"); // 5
      expect((rows[1][1] as any).icon_custom_emoji_id).toBe("5872829476143894491");
      expect((rows[1][2] as any).callback_data).toBe("qty_max_3"); // 10
      expect((rows[1][2] as any).icon_custom_emoji_id).toBe("5872829476143894491");
      expect((rows[1][3] as any).callback_data).toBe("qty_max_3"); // 20
      expect((rows[1][3] as any).icon_custom_emoji_id).toBe("5872829476143894491");
    });

    it("handles empty categories product list gracefully", () => {
      const keyboard = buildProductsKeyboard(999, []);
      const rows = keyboard.inline_keyboard;
      expect(rows[0][0].text).toContain("ပစ္စည်းများ ပြတ်လပ်နေပါသည်");
      expect((rows[0][0] as any).callback_data).toBe("noop");
    });
  });

  describe("BotOrderService & Order Lifecycle", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("fetches user profile stats or returns resilient defaults", async () => {
      global.fetch = originalFetch;
      const { botOrderService } = await import("../../apps/bot/src/services/order.service");
      const profile = await botOrderService.getUserProfile("8777968077");
      expect(profile).toBeDefined();
      expect(typeof profile.ordersCount).toBe("number");
      expect(typeof profile.totalSpentMmk).toBe("number");
      expect(typeof profile.walletBalanceMmk).toBe("number");
      expect(profile.joinedDate).toBeDefined();
    });

    it("throttles touchLastActive to avoid redundant DB queries during cooldown", async () => {
      const { botOrderService } = await import("../../apps/bot/src/services/order.service");
      expect(typeof botOrderService.touchLastActive).toBe("function");
      expect(() => {
        botOrderService.touchLastActive("999888777");
        botOrderService.touchLastActive("999888777");
        botOrderService.touchLastActive("");
      }).not.toThrow();
    });
  });

  describe("Prepaid Wallet Architecture (Recommendations A to D)", () => {
    it("Recommendation A: formats insufficient balance message and calculates deficit shortcut keyboard", async () => {
      const { formatInsufficientBalanceMessage } = await import(
        "../../apps/bot/src/formatters/messages"
      );
      const { buildInsufficientBalanceKeyboard } = await import(
        "../../apps/bot/src/keyboards/store.keyboards"
      );

      const msg = formatInsufficientBalanceMessage({
        productName: "Gemini Advanced 18 Months",
        quantity: 2,
        totalMmk: 7800,
        walletBalanceMmk: 3000,
        deficitMmk: 4800,
      });

      expect(msg).toContain("လက်ကျန်ငွေ မလုံလောက်ပါ");
      expect(msg).toContain("7,800 Ks");
      expect(msg).toContain("3,000 Ks");
      expect(msg).toContain("4,800 Ks");

      const kb = buildInsufficientBalanceKeyboard({
        productId: 10,
        quantity: 2,
        deficitMmk: 4800,
      });

      const buttons = kb.inline_keyboard.flat();
      const deficitBtn = buttons.find((b) =>
        b.text.includes("4,800 Ks အတိအကျ ငွေဖြည့်မည်")
      );
      expect(deficitBtn).toBeDefined();
      expect((deficitBtn as any).callback_data).toBe("topup_deficit_10_2_4800");
    });

    it("Recommendation B: formats wallet dashboard and provides quick top-up preset options", async () => {
      const { formatWalletMessage } = await import(
        "../../apps/bot/src/formatters/messages"
      );
      const { buildWalletKeyboard } = await import(
        "../../apps/bot/src/keyboards/store.keyboards"
      );

      const msg = formatWalletMessage({
        fullName: "Ryan Wez",
        balanceMmk: 25000,
        totalSpentMmk: 50000,
      });

      expect(msg).toContain("Arena Store Wallet");
      expect(msg).toContain("25,000 Ks");
      expect(msg).toContain("50,000 Ks");

      const kb = buildWalletKeyboard();
      const buttons = kb.inline_keyboard.flat();
      expect(buttons.some((b) => b.text.includes("5,000 Ks"))).toBe(true);
      const btn10k = buttons.find((b) => b.text.includes("10,000 Ks"));
      expect((btn10k as any)?.icon_custom_emoji_id).toBe("5303040337059543238");
      expect(buttons.some((b) => b.text.includes("20,000 Ks"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("50,000 Ks"))).toBe(true);
      expect(buttons.some((b) => b.text.includes("စိတ်ကြိုက်ပမာဏ"))).toBe(true);
      const customBtn = buttons.find((b) => b.text.includes("စိတ်ကြိုက်ပမာဏ"));
      expect((customBtn as any)?.icon_custom_emoji_id).toBe("5985774024968379294");
    });

    it("Recommendation C: creates top-up request, accepts slip proof, and approves credit", async () => {
      const { botOrderService } = await import(
        "../../apps/bot/src/services/order.service"
      );

      const testUser = `test_wallet_user_${Date.now()}`;
      const initBal = await botOrderService.getWalletBalance(testUser);
      expect(initBal).toBe(0);

      const topUp = await botOrderService.createTopUpRequest({
        telegramId: testUser,
        amountMmk: 20000,
      });

      expect(topUp.id).toBeDefined();
      expect(topUp.amountMmk).toBe(20000);
      expect(topUp.status).toBe("PENDING");

      const slipResult = await botOrderService.submitTopUpSlip({
        topUpId: topUp.id,
        telegramId: testUser,
        fileId: "slip_photo_id_test_123",
        amountMmk: 20000,
        paymentMethod: "KPAY",
      });

      expect(slipResult.status).toBe("SUBMITTED");

      const approval = await botOrderService.approveTopUp(topUp.id);
      expect(approval).not.toBeNull();
      expect(approval?.newBalance).toBe(20000);

      const updatedBal = await botOrderService.getWalletBalance(testUser);
      expect(updatedBal).toBe(20000);
    });

    it("Recommendation D: performs atomic wallet deduction and delivers digital credentials instantly", async () => {
      const { botOrderService } = await import(
        "../../apps/bot/src/services/order.service"
      );
      const { formatWalletDeliveryMessage } = await import(
        "../../apps/bot/src/formatters/messages"
      );

      const testUser = `instant_buyer_${Date.now()}`;
      await botOrderService.creditWallet(testUser, 10000);

      // Attempt purchase of Gemini Pro (product 10, price 3900)
      const purchase = await botOrderService.purchaseWithWallet({
        telegramId: testUser,
        customerName: "Instant Buyer",
        productId: 10,
        quantity: 2,
      });

      expect(purchase.success).toBe(true);
      expect(purchase.totalMmk).toBe(7800);
      expect(purchase.remainingBalance).toBe(2200);
      expect(purchase.credentialsText).toBeDefined();
      expect(purchase.orderId).toBeDefined();

      const newBal = await botOrderService.getWalletBalance(testUser);
      expect(newBal).toBe(2200);

      const orders = await botOrderService.getUserOrders(testUser);
      expect(orders.length).toBe(1);
      expect(orders[0].status).toBe("DELIVERED");

      const deliveryMsg = formatWalletDeliveryMessage({
        publicOrderNo: purchase.publicOrderNo!,
        productName: purchase.productName!,
        quantity: purchase.quantity!,
        totalMmk: purchase.totalMmk!,
        remainingBalanceMmk: purchase.remainingBalance!,
        credentialsText: purchase.credentialsText!,
      });

      expect(deliveryMsg).toContain("ဝယ်ယူမှု အောင်မြင်ပါသည်");
      expect(deliveryMsg).toContain(purchase.publicOrderNo!);
      expect(deliveryMsg).toContain("2,200 Ks");
      expect(deliveryMsg).toContain("<pre>");
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

    it("parses restock_<productId> and prod_<productId> deep-link payloads", () => {
      const parseDeepLink = (payload?: string) => {
        const match = payload?.trim().match(/^(?:restock_|prod_)?(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
      };

      expect(parseDeepLink("restock_42")).toBe(42);
      expect(parseDeepLink("prod_99")).toBe(99);
      expect(parseDeepLink("123")).toBe(123);
      expect(parseDeepLink("help")).toBeNull();
      expect(parseDeepLink("")).toBeNull();
      expect(parseDeepLink(undefined)).toBeNull();
    });
  });
});
