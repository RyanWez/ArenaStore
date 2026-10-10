export const UserRole = {
  CUSTOMER: "CUSTOMER",
  ADMIN: "ADMIN",
  SUPPORT: "SUPPORT",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: "ACTIVE",
  BANNED: "BANNED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const OrderStatus = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PAYMENT_SUBMITTED: "PAYMENT_SUBMITTED",
  PAYMENT_VERIFIED: "PAYMENT_VERIFIED",
  PROCESSING_SUPPLIER: "PROCESSING_SUPPLIER",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = {
  KPAY: "KPAY",
  WAVEPAY: "WAVEPAY",
  CB_PAY: "CB_PAY",
  AYAPAY: "AYAPAY",
  WALLET: "WALLET",
  MMPAY: "MMPAY",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/**
 * Lifecycle statuses for a `topup_requests` row — the single source of truth
 * for top-up/deposit state, shared by the bot, API webhook and admin panel.
 *
 * Manual (KPAY/WAVEPAY) slips: PENDING (awaiting slip) → SUBMITTED (slip
 * uploaded) → COMPLETED | REJECTED. MMPay MMQR: PENDING (awaiting the gateway)
 * → COMPLETED (webhook) | FAILED | EXPIRED | CANCELLED. APPROVED is a legacy
 * alias for a credited deposit, retained for backward compatibility with older
 * rows and callers.
 */
export const TopUpStatus = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  COMPLETED: "COMPLETED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
} as const;
export type TopUpStatus = (typeof TopUpStatus)[keyof typeof TopUpStatus];

export const DeliveryType = {
  CREDENTIALS: "CREDENTIALS",
  LINK: "LINK",
  FILE: "FILE",
  TEXT: "TEXT",
  LICENSE: "LICENSE",
} as const;
export type DeliveryType = (typeof DeliveryType)[keyof typeof DeliveryType];
