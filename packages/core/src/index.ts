// Configuration
export { type CoreConfig, setCoreConfig, getCoreConfig } from "./config";

// Encryption & Credentials Security
export {
  encryptPayload,
  decryptPayload,
  formatCredentialsText,
  decryptDeliveryPayload,
  type DeliveryPayloadV2,
} from "./services/encryption.service";

// App Settings & Telegram Support Links
export {
  type BotAppSettings,
  BotSettingsService,
  botSettingsService,
  resolveTelegramSupportUrl,
} from "./services/settings.service";

// Catalog & Inventory
export {
  type BotProduct,
  type BotCategory,
  BotCatalogService,
  botCatalog,
} from "./services/catalog.service";

// Referral & Commission Engine
export {
  type ReferralStats,
  type TelegramMessageSender,
  ReferralService,
  referralService,
} from "./services/referral.service";

// Order, Wallet & Payment Services
export {
  type CreateOrderResult,
  type SubmitSlipResult,
  type OrderRecord,
  type TopUpRecord,
  generateTopUpReference,
  generateOrderReference,
  BotOrderService,
  botOrderService,
} from "./services/order.service";

// Redis Infrastructure
export {
  getCoreRedis,
  setCoreRedis,
  createSubscriberRedis,
  getSharedSubscriberRedis,
  setSharedSubscriberRedis,
} from "./redis";

// Storefront Customer Auth Engine
export {
  type AuthTicket,
  type CustomerSession,
  type MiniAppInitDataUser,
  StoreAuthService,
  storeAuthService,
  TICKET_TTL_SECONDS,
  STORE_SESSION_TTL_SECONDS,
  MINI_APP_MAX_AGE_SECONDS,
} from "./services/store-auth.service";
