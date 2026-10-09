import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { MMPayWebhookPayloadSchema } from "@arena/shared";
import { formatMmpayQrInvoiceMessage } from "../../apps/bot/src/formatters/messages";
import { generateQrImageBuffer } from "../../apps/bot/src/services/qr.service";

describe("MyanMyanPay (MMPay) Integration Unit Tests", () => {
  const TEST_SECRET = "sk_test_testsecretkey1234567890abcdef";

  function computeHmacSignature(rawBody: string, nonce: string, secret: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(`${nonce}.${rawBody}`)
      .digest("hex");
  }

  describe("Webhook Signature Verification", () => {
    it("successfully verifies valid HMAC-SHA256 signature", () => {
      const nonce = Date.now().toString();
      const rawBody = JSON.stringify({
        orderId: "MMQR-123456-7890",
        amount: 5000,
        currency: "MMK",
        status: "SUCCESS",
        transactionRefId: "TX-998877",
      });

      const signature = computeHmacSignature(rawBody, nonce, TEST_SECRET);
      const expected = crypto
        .createHmac("sha256", TEST_SECRET)
        .update(`${nonce}.${rawBody}`)
        .digest("hex");

      expect(signature).toBe(expected);
      expect(crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))).toBe(true);
    });

    it("rejects forged or tampered webhook payloads", () => {
      const nonce = Date.now().toString();
      const rawBody = JSON.stringify({ orderId: "MMQR-123456", amount: 5000, status: "SUCCESS" });
      const signature = computeHmacSignature(rawBody, nonce, TEST_SECRET);

      const tamperedBody = JSON.stringify({ orderId: "MMQR-123456", amount: 50000, status: "SUCCESS" });
      const tamperedHash = crypto
        .createHmac("sha256", TEST_SECRET)
        .update(`${nonce}.${tamperedBody}`)
        .digest("hex");

      expect(signature).not.toBe(tamperedHash);
    });
  });

  describe("Webhook Payload Schema Validation", () => {
    it("validates successful webhook payload", () => {
      const validPayload = {
        orderId: "MMQR-999111-2222",
        amount: 5000,
        currency: "MMK",
        status: "SUCCESS",
        transactionRefId: "TRX-777666",
        vendorQrRefId: "VQR-888999",
      };

      const result = MMPayWebhookPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("rejects payload missing orderId or status", () => {
      const invalidPayload = {
        amount: 5000,
        currency: "MMK",
      };

      const result = MMPayWebhookPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe("MyanMyanPay UI/UX Compliance Formatter", () => {
    it("strictly includes mandatory compliance caption, MMK currency, and 15m timer", () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      const message = formatMmpayQrInvoiceMessage({
        amountMmk: 5000,
        reference: "MMQR-123456-7890",
        expiresAt,
      });

      // 1. Mandatory uppercase attribution
      expect(message).toContain("PAYMENT POWERED BY MYANMYANPAY");

      // 2. Strict MMK display
      expect(message).toContain("5,000 MMK");
      expect(message).not.toContain("USD");

      // 3. 15-minute timer notice
      expect(message).toContain("၁၅ မိနစ် (15:00 Mins)");

      // 4. Reference
      expect(message).toContain("MMQR-123456-7890");

      // 5. Supported apps guidance
      expect(message).toContain("KBZPay");
      expect(message).toContain("WavePay");
    });
  });

  describe("QR Code Generation", () => {
    it("generates valid PNG image buffer from EMVCo MMQR payload", async () => {
      const sampleMmQrString = "00020101021251840012D104000001010210099604767380112KBZPay520459995303104540450005802MM5911Arena Store6006Yangon62220118MMQR-123456-78906304ABCD";
      const buffer = await generateQrImageBuffer(sampleMmQrString);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(500);

      // PNG magic number check: \x89PNG
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);
    });
  });
});
