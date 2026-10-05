/**
 * Animated Custom Emojis provided for Arena Store Telegram Bot
 */
export const BOT_EMOJIS = {
  // Navigation & Greetings
  WAVE: "5215248074498128418",      // 👋
  SPARKLES: "5325547803936572038",  // ✨
  LIGHTNING: "5226570145161302027", // ⚡️
  DOWN_ARROW: "5193062103103058714",// 👇
  BAGS: "4958714256343171878",       // 🛍
  BOX: "5472335930549347896",        // 📦
  MONEY: "5316661434996765842",      // 💰
  CHAT: "5443038326535759644",       // 💬
  SPEAKER: "5836698068061261980",    // 📢
  PROFILE: "5373012449597335010",    // 👤

  // Store & Stepper Controls
  BUY_NOW: "5267300544094948794",    // 💳
  MINUS: "5255775038010829248",      // ➖
  PLUS: "5314382246176637382",       // ➕
  COUNTER: "5226929552319594190",    // 🔢
  CHECK: "5206607081334906820",      // ✅
  PARTY: "5420289585575904153",      // 🎉(🥳)
  BACK: "5456187398977247949",       // ⬅️

  // Detail Card & Status
  PRICE: "5409048419211682843",      // 💵
  GIFT: "5449800250032143374",       // 🎁
  ABACUS: "5472404950673791399",     // 🧮
  RECEIPT: "6334448145891592172",    // 🧾
  HOURGLASS: "5255765065096774716",  // ⏳
  KEY: "5278573677900752088",        // 🔑
  WARNING: "5447644880824181073",    // ⚠️
  CANCEL: "5210952531676504517",     // ❌

  // Payment Providers
  KBZPAY: "6206487605421280759",     // 🏧 KBZ Pay
  WAVEPAY: "6057728063049830775",    // 🆗 WavePay
  UABPAY: "5391349017898656371",     // 💚 UAB Pay
  AYAPAY: "5282730523343474638",     // 🙂 AYA Pay

  // Admin Group Notices
  CLOCK: "5359535585251838264",      // 🕐
  BELL: "6260097382914986431",       // 🔔
} as const;

/**
 * Escapes special HTML characters to prevent message parse errors or XSS in Telegram HTML mode.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Creates a valid Telegram <tg-emoji> tag with safe HTML escaping.
 */
export function tgEmoji(emojiId: string, fallbackEmoji: string = "✨"): string {
  return `<tg-emoji emoji-id="${emojiId}">${escapeHtml(fallbackEmoji)}</tg-emoji>`;
}

/**
 * Parses raw text containing {pe:<id>} placeholders and produces safe Telegram HTML.
 * Consumes any immediate unicode emoji following {pe:<id>} into the <tg-emoji> tag
 * to prevent double emoji display (e.g. animated emoji + duplicate standard emoji).
 */
export function formatTelegramCustomEmoji(rawText: string, fallbackEmoji: string = "✨"): string {
  if (!rawText) return "";

  // Split on the placeholder pattern: {pe:<numeric-id>} followed optionally by immediate unicode emoji
  const regex = /\{pe:(\d+)\}(?:\s*([\p{Extended_Pictographic}\uFE0F\u200D]+))?/gu;
  let lastIndex = 0;
  let result = "";
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const textBefore = rawText.slice(lastIndex, match.index);
    result += escapeHtml(textBefore);

    const emojiId = match[1];
    const immediateEmoji = match[2];
    const displayFallback = immediateEmoji || fallbackEmoji;

    result += `<tg-emoji emoji-id="${emojiId}">${escapeHtml(displayFallback)}</tg-emoji>`;

    lastIndex = regex.lastIndex;
  }

  // Append remaining text escaped
  result += escapeHtml(rawText.slice(lastIndex));
  return result;
}

/**
 * Strips {pe:<id>} placeholders entirely for plain text contexts (e.g. logs, plain text receipts).
 */
export function stripCustomEmojiPlaceholders(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/\{pe:\d+\}(?:\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)?/gu, "")
    .trim();
}

export interface ParsedEmojiText {
  emojiId: string | null;
  cleanText: string;
}

/**
 * Extracts custom emoji ID and clean label for Telegram inline keyboard buttons (icon_custom_emoji_id).
 * Strips both the {pe:<id>} placeholder and any immediate duplicate fallback emoji,
 * ensuring buttons and headers don't show double emojis (e.g. [G] 🤖 Gemini -> [G] Gemini).
 */
export function parseCustomEmoji(rawText: string): ParsedEmojiText {
  if (!rawText) return { emojiId: null, cleanText: "" };
  const match = /\{pe:(\d+)\}/.exec(rawText);
  const emojiId = match ? match[1] : null;

  // Strip placeholder and immediately following unicode emoji if present
  const cleanText = rawText
    .replace(/\{pe:\d+\}(?:\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)?/gu, "")
    .trim();

  return { emojiId, cleanText };
}

/**
 * Known brand-to-emoji mappings extracted from catalog upstream emojis.
 * Allows products without explicit {pe:<id>} in their titles (e.g. DigitalCore)
 * to automatically render corresponding Telegram custom animated icons.
 */
export const BRAND_EMOJI_MAP: Record<string, string> = {
  gemini: "5069075201950483359",
  duolingo: "4963072209334567688",
  notion: "5364199932620194408",
  youtube: "5934029049260150525",
  adobe: "6066600185583116873",
  lovable: "6104729848675050039",
  elevenlabs: "5285437624050263173",
  eleven: "5285437624050263173",
  coursera: "6307450973606389056",
  nordvpn: "5796345694969140339",
  vpn: "5794362687093740845",
  canva: "5229235451541338986",
  spotify: "5233578612665375810",
  chatgpt: "5069347335373325316",
  claude: "6174520215376763867",
  steam: "4956506857901392912",
  jetbrains: "5301168530182383496",
  netflix: "5936178658916964051",
  capcut: "5474521476197536994",
  outlook: "5944862266745688389",
  office: "6102808052673548025",
  prime: "6084483883942811660",
  autodesk: "6305045014531548800",
  researchgate: "6131674493510231476",
};

export function findBrandEmojiId(text?: string | null): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [brand, emojiId] of Object.entries(BRAND_EMOJI_MAP)) {
    if (lower.includes(brand)) {
      return emojiId;
    }
  }
  return null;
}

