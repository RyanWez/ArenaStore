export interface CoreConfig {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_GROUP_CHAT_ID?: string;
  INTERNAL_API_TOKEN?: string;
  API_BASE_URL?: string;
  UPSTREAM_BASE_URL?: string;
  UPSTREAM_API_KEY?: string;
  DIGITALCORE_BASE_URL?: string;
  DIGITALCORE_API_KEY?: string;
  DEFAULT_EXCHANGE_RATE_MMK?: number;
  DEFAULT_MARGIN_PERCENTAGE?: number;
  SUPPORT_USERNAME?: string;
  PAYMENT_ACCOUNT_NAME?: string;
  PAYMENT_KPAY_PHONE?: string;
  PAYMENT_WAVEPAY_PHONE?: string;
  TELEGRAM_DEPOSIT_TOPIC_ID?: string;
  TELEGRAM_BOT_ALERT_TOPIC_ID?: string;
  TELEGRAM_ADMIN_MENTIONS?: string;
  DELIVERY_ENCRYPTION_KEY?: string;
  TELEGRAM_APPROVER_IDS?: string;
}

let activeConfig: CoreConfig = {};

export function setCoreConfig(config: CoreConfig): void {
  activeConfig = { ...activeConfig, ...config };
}

export function getCoreConfig(): CoreConfig {
  return {
    TELEGRAM_BOT_TOKEN: activeConfig.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_GROUP_CHAT_ID: activeConfig.TELEGRAM_GROUP_CHAT_ID || process.env.TELEGRAM_GROUP_CHAT_ID || "",
    INTERNAL_API_TOKEN: activeConfig.INTERNAL_API_TOKEN || process.env.INTERNAL_API_TOKEN,
    API_BASE_URL: activeConfig.API_BASE_URL || process.env.API_BASE_URL,
    UPSTREAM_BASE_URL: activeConfig.UPSTREAM_BASE_URL || process.env.UPSTREAM_BASE_URL || "https://api.upstream.com",
    UPSTREAM_API_KEY: activeConfig.UPSTREAM_API_KEY || process.env.UPSTREAM_API_KEY || "",
    DIGITALCORE_BASE_URL: activeConfig.DIGITALCORE_BASE_URL || process.env.DIGITALCORE_BASE_URL || "https://api.digitalcore.com",
    DIGITALCORE_API_KEY: activeConfig.DIGITALCORE_API_KEY || process.env.DIGITALCORE_API_KEY || "",
    DEFAULT_EXCHANGE_RATE_MMK: activeConfig.DEFAULT_EXCHANGE_RATE_MMK ?? (Number(process.env.DEFAULT_EXCHANGE_RATE_MMK) || 4500),
    DEFAULT_MARGIN_PERCENTAGE: activeConfig.DEFAULT_MARGIN_PERCENTAGE ?? (Number(process.env.DEFAULT_MARGIN_PERCENTAGE) || 15),
    DELIVERY_ENCRYPTION_KEY: activeConfig.DELIVERY_ENCRYPTION_KEY || process.env.DELIVERY_ENCRYPTION_KEY || "dev-delivery-encryption-key-32chars!",
    SUPPORT_USERNAME: activeConfig.SUPPORT_USERNAME || process.env.SUPPORT_USERNAME || "ryanwez",
    PAYMENT_ACCOUNT_NAME: activeConfig.PAYMENT_ACCOUNT_NAME || process.env.PAYMENT_ACCOUNT_NAME || "Arena Store",
    PAYMENT_KPAY_PHONE: activeConfig.PAYMENT_KPAY_PHONE || process.env.PAYMENT_KPAY_PHONE || "09 123 456 789",
    PAYMENT_WAVEPAY_PHONE: activeConfig.PAYMENT_WAVEPAY_PHONE || process.env.PAYMENT_WAVEPAY_PHONE || "09 123 456 789",
    TELEGRAM_DEPOSIT_TOPIC_ID: activeConfig.TELEGRAM_DEPOSIT_TOPIC_ID || process.env.TELEGRAM_DEPOSIT_TOPIC_ID || "",
    TELEGRAM_BOT_ALERT_TOPIC_ID: activeConfig.TELEGRAM_BOT_ALERT_TOPIC_ID || process.env.TELEGRAM_BOT_ALERT_TOPIC_ID || "",
    TELEGRAM_ADMIN_MENTIONS: activeConfig.TELEGRAM_ADMIN_MENTIONS || process.env.TELEGRAM_ADMIN_MENTIONS || "",
    TELEGRAM_APPROVER_IDS: activeConfig.TELEGRAM_APPROVER_IDS || process.env.TELEGRAM_APPROVER_IDS || "",
  };
}
