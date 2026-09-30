import { describe, it, expect } from "vitest";
import {
  CreateOrderSchema,
  SubmitPaymentProofSchema,
  ReviewPaymentSchema,
  UpdateProductPricingSchema,
  TelegramUserInitSchema,
  PaymentMethod,
} from "@arena/shared";

describe("Shared Zod Schemas Validation", () => {
  it("validates TelegramUserInit schema", () => {
    const valid = {
      telegramId: "8777968077",
      username: "ryanwez",
      firstName: "RYAN",
      lastName: "WEZ",
    };
    expect(TelegramUserInitSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      telegramId: "",
      firstName: "",
    };
    expect(TelegramUserInitSchema.safeParse(invalid).success).toBe(false);
  });

  it("validates CreateOrder schema", () => {
    const valid = {
      telegramId: "8777968077",
      productId: 12,
      quantity: 2,
      notes: "Please deliver fast",
    };
    expect(CreateOrderSchema.safeParse(valid).success).toBe(true);

    const invalidQuantity = {
      telegramId: "8777968077",
      productId: 12,
      quantity: 0, // must be positive
    };
    expect(CreateOrderSchema.safeParse(invalidQuantity).success).toBe(false);
  });

  it("validates SubmitPaymentProof schema", () => {
    const valid = {
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      paymentMethod: PaymentMethod.KPAY,
      transactionRef: "123456",
      slipFileId: "AgACAgUAAxkBAAI...",
      submittedAmountMmk: 5000,
    };
    expect(SubmitPaymentProofSchema.safeParse(valid).success).toBe(true);

    const invalidUuid = {
      ...valid,
      orderId: "invalid-uuid",
    };
    expect(SubmitPaymentProofSchema.safeParse(invalidUuid).success).toBe(false);
  });

  it("validates ReviewPayment schema", () => {
    const validApprove = {
      submissionId: 1,
      action: "APPROVE",
    };
    expect(ReviewPaymentSchema.safeParse(validApprove).success).toBe(true);

    const validReject = {
      submissionId: 1,
      action: "REJECT",
      rejectReason: "Slip amount does not match order total",
    };
    expect(ReviewPaymentSchema.safeParse(validReject).success).toBe(true);
  });

  it("validates UpdateProductPricing schema", () => {
    const valid = {
      productId: 12,
      retailPriceMmk: 4500,
      localStockLimit: 50,
      isActive: true,
    };
    expect(UpdateProductPricingSchema.safeParse(valid).success).toBe(true);
  });
});
