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

export const DeliveryType = {
  CREDENTIALS: "CREDENTIALS",
  LINK: "LINK",
  FILE: "FILE",
  TEXT: "TEXT",
  LICENSE: "LICENSE",
} as const;
export type DeliveryType = (typeof DeliveryType)[keyof typeof DeliveryType];
