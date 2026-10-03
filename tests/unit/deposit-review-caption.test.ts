import { describe, it, expect, vi } from "vitest";
import {
  DEPOSIT_REVIEW_CB_REGEX,
  EMPTY_KEYBOARD,
  buildDepositRejectConfirmKeyboard,
  buildDepositReviewKeyboard,
  buildReviewOutcomeCaption,
  buildSlipCaptionBody,
  depositReviewCallbackData,
} from "../../apps/bot/src/services/admin-group.service";
import { reviewDepositViaApi } from "../../apps/bot/src/services/deposit-review.client";

// The config guard test below relies on an unconfigured token; mocking the
// config module also keeps the client tests fully offline (UNIT_ENV may carry
// a token, which would make the client actually attempt a fetch).
vi.mock("../../apps/bot/src/config", () => ({
  botConfig: {
    INTERNAL_API_TOKEN: "",
    API_BASE_URL: "",
    TELEGRAM_GROUP_CHAT_ID: "",
    TELEGRAM_DEPOSIT_TOPIC_ID: "",
    TELEGRAM_ADMIN_MENTIONS: "",
  },
}));

/**
 * The relayed slip caption is rebuilt after a group review from API response
 * data (not by string-patching the original Telegram caption), so the builders
 * must escape every interpolated value and keep the format identical to the
 * initial relay.
 */
describe("buildSlipCaptionBody", () => {
  const base = {
    reference: "TOP-K1B2X3A4",
    amountMmk: 45000,
    customerLabel: "Kyaw Kyaw",
    telegramId: "123456789",
    postedAt: new Date(Date.UTC(2026, 9, 4, 7, 45)), // 14:15 MMT
  };

  it("renders the same details block shape the relay uses, in Yangon time", () => {
    const body = buildSlipCaptionBody(base);
    expect(body).toContain("<b>Reference:</b> <code>TOP-K1B2X3A4</code>");
    expect(body).toContain("<b>45,000 MMK</b>");
    expect(body).toContain("Kyaw Kyaw (<code>123456789</code>)");
    expect(body).toContain("04/10/2026");
    expect(body).toContain("14:15");
    expect(body).toContain("MMT</i>");
  });

  it("escapes HTML injected through the customer label and reference", () => {
    const body = buildSlipCaptionBody({
      ...base,
      customerLabel: '<img src=x onerror=alert(1)>',
      reference: "TOP-<script>",
    });
    expect(body).not.toContain("<img");
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;img");
    expect(body).toContain("TOP-&lt;script&gt;");
  });

  it("omits the telegram-id parentheses when no id is known", () => {
    const body = buildSlipCaptionBody({ ...base, telegramId: undefined });
    expect(body).toContain("Kyaw Kyaw\n");
    expect(body).not.toContain("<code></code>");
    expect(body).not.toContain("()");
  });
});

describe("buildReviewOutcomeCaption", () => {
  const base = {
    reference: "TOP-K1B2X3A4",
    amountMmk: 45000,
    customerLabel: "@kyaw",
    telegramId: "123456789",
    postedAt: new Date(Date.UTC(2026, 9, 4, 7, 45)),
  };

  it("keeps the details and appends the short approval line with the actor", () => {
    const caption = buildReviewOutcomeCaption({
      ...base,
      outcome: "APPROVED",
      actorLabel: "@ryanwez",
    });
    expect(caption).toContain("<b>Reference:</b> <code>TOP-K1B2X3A4</code>");
    expect(caption.endsWith("✅ @ryanwez က အတည်ပြုပြီး")).toBe(true);
  });

  it("appends the rejection line and escapes the actor label", () => {
    const caption = buildReviewOutcomeCaption({
      ...base,
      outcome: "REJECTED",
      actorLabel: "<b>Evil</b>",
    });
    expect(caption.endsWith("❌ &lt;b&gt;Evil&lt;/b&gt; က ပယ်ဖျက်ပြီး")).toBe(true);
  });
});

describe("deposit review callback data contract", () => {
  it("encodes id and action within Telegram's 64-byte callback_data limit", () => {
    const data = depositReviewCallbackData(123456, "APPROVE");
    expect(data).toBe("dep:123456:APPROVE");
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
  });

  it("matches only well-formed dep: callbacks", () => {
    expect(DEPOSIT_REVIEW_CB_REGEX.exec("dep:12:APPROVE")?.slice(1)).toEqual(["12", "APPROVE"]);
    expect(DEPOSIT_REVIEW_CB_REGEX.exec("dep:12:REJECT_CONFIRM")?.slice(1)).toEqual(["12", "REJECT_CONFIRM"]);
    expect(DEPOSIT_REVIEW_CB_REGEX.exec("dep:12:CANCEL")).toBeTruthy();
    expect(DEPOSIT_REVIEW_CB_REGEX.exec("dep:topup-12:APPROVE")).toBeNull();
    expect(DEPOSIT_REVIEW_CB_REGEX.exec("dep:12:DELETE")).toBeNull();
    expect(DEPOSIT_REVIEW_CB_REGEX.exec("other:12:APPROVE")).toBeNull();
  });

  it("builds the two-button keyboard and the reject confirmation keyboard", () => {
    const main = buildDepositReviewKeyboard(7);
    expect(main.inline_keyboard).toHaveLength(1);
    expect(main.inline_keyboard[0].map((b) => b.callback_data)).toEqual([
      "dep:7:APPROVE",
      "dep:7:REJECT",
    ]);

    const confirm = buildDepositRejectConfirmKeyboard(7);
    expect(confirm.inline_keyboard[0].map((b) => b.callback_data)).toEqual([
      "dep:7:REJECT_CONFIRM",
      "dep:7:CANCEL",
    ]);

    expect(EMPTY_KEYBOARD.inline_keyboard).toHaveLength(0);
  });
});

/**
 * The bot-side client must refuse to call the API when the shared internal
 * token is not configured — silently sending unauthenticated review requests
 * would be worse than a visible failure toast.
 */
describe("reviewDepositViaApi config guard", () => {
  it("returns FAILED without any network call when INTERNAL_API_TOKEN is unset", async () => {
    const result = await reviewDepositViaApi({
      topUpId: 1,
      action: "APPROVE",
      actorTelegramId: "42",
    });
    expect(result).toEqual({ ok: false, error: "FAILED" });
  });
});
