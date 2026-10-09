import { z } from "zod";
import { DeliveryType, OrderStatus, PaymentMethod, PaymentStatus, UserRole, UserStatus } from "./enums";

export const UserRoleSchema = z.nativeEnum(UserRole);
export const UserStatusSchema = z.nativeEnum(UserStatus);
export const OrderStatusSchema = z.nativeEnum(OrderStatus);
export const PaymentMethodSchema = z.nativeEnum(PaymentMethod);
export const PaymentStatusSchema = z.nativeEnum(PaymentStatus);
export const DeliveryTypeSchema = z.nativeEnum(DeliveryType);

// Telegram User Input Schema
export const TelegramUserInitSchema = z.object({
  telegramId: z.string().min(1),
  username: z.string().optional().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().optional().nullable(),
  languageCode: z.string().optional().nullable(),
});
export type TelegramUserInit = z.infer<typeof TelegramUserInitSchema>;

// Order Placement from Telegram Bot
export const CreateOrderSchema = z.object({
  telegramId: z.string().min(1),
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100),
  notes: z.string().max(250).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// Customer Payment Submission
export const SubmitPaymentProofSchema = z.object({
  orderId: z.string().uuid(),
  paymentMethod: PaymentMethodSchema,
  transactionRef: z.string().max(100).optional(),
  slipFileId: z.string().min(1), // Telegram photo file_id or storage key
  submittedAmountMmk: z.number().int().positive(),
});
export type SubmitPaymentProofInput = z.infer<typeof SubmitPaymentProofSchema>;

// Admin Payment Verification
export const ReviewPaymentSchema = z.object({
  submissionId: z.number().int().positive(),
  action: z.enum(["APPROVE", "REJECT"]),
  rejectReason: z.string().max(250).optional(),
});
export type ReviewPaymentInput = z.infer<typeof ReviewPaymentSchema>;

// Admin Product Pricing & Limits Update
export const UpdateProductPricingSchema = z.object({
  productId: z.number().int().positive(),
  retailPriceMmk: z.number().int().nonnegative().optional(),
  localStockLimit: z.number().int().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
  nameMmk: z.string().min(1).max(255).optional(),
  descriptionMmk: z.string().optional(),
});
export type UpdateProductPricingInput = z.infer<typeof UpdateProductPricingSchema>;

// Exchange Rate & Setting Update
export const UpdateExchangeRateSchema = z.object({
  usdToMmkRate: z.number().int().min(1000).max(20000),
  defaultMarginPct: z.number().min(0).max(500).optional(),
});
export type UpdateExchangeRateInput = z.infer<typeof UpdateExchangeRateSchema>;

// Admin Broadcast Schema
export const CreateBroadcastSchema = z.object({
  title: z.string().max(255).optional(),
  message: z.string().min(1, "Message is required").max(4096, "Message exceeds Telegram 4096 character limit"),
  imageUrl: z.string().url("Image URL must be valid").optional().or(z.literal("")),
  buttonText: z.string().max(128).optional().or(z.literal("")),
  buttonUrl: z.string().url("Button URL must be a valid link").optional().or(z.literal("")),
  targetAudience: z.enum(["ALL", "CUSTOMERS", "WITH_BALANCE"]).default("ALL"),
});
export type CreateBroadcastInput = z.infer<typeof CreateBroadcastSchema>;

// MyanMyanPay Webhook Payload
export const MMPayWebhookPayloadSchema = z.object({
  orderId: z.string(),
  amount: z.number(),
  currency: z.string().default("MMK"),
  vendor: z.string().optional(),
  method: z.string().optional(),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED", "EXPIRED", "CANCELLED"]),
  condition: z.string().optional(),
  transactionRefId: z.string().optional(),
  vendorQrRefId: z.string().optional(),
  customMessage: z.string().optional(),
});
export type MMPayWebhookPayload = z.infer<typeof MMPayWebhookPayloadSchema>;

