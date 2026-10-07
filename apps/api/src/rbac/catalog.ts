/**
 * Permission catalog — the single source of truth for every admin permission
 * key the API enforces and the roles UI renders. Permissions are grouped by
 * admin-panel page (page-first) so the Roles & Permissions checklist mirrors
 * the sidebar structure.
 *
 * Only keys listed here can ever be stored in role_permissions or granted —
 * the RBAC service filters anything else out (fail closed).
 */

export type PermissionType = "view" | "action" | "field";

export interface PermissionDef {
  key: string;
  /** Admin panel page/group label — matches the sidebar. */
  page: string;
  /** Short label shown in the Roles & Permissions checklist. */
  label: string;
  type: PermissionType;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // Overview
  { key: "overview.view", page: "Overview", label: "View dashboard", type: "view" },

  // Analytics & Profit
  { key: "analytics.view", page: "Analytics", label: "View financial analytics & profit reports", type: "view" },

  // Partner Suppliers
  { key: "supplier.view", page: "Partner Suppliers", label: "View supplier status & wallet balance", type: "view" },
  { key: "supplier.sync", page: "Partner Suppliers", label: "Sync catalog from supplier", type: "action" },

  // Products
  { key: "products.view", page: "Products", label: "View products & categories", type: "view" },
  { key: "products.edit", page: "Products", label: "Edit products, prices & categories", type: "action" },
  { key: "products.show_cost", page: "Products", label: "Show USD Cost column", type: "field" },
  { key: "products.show_margin", page: "Products", label: "Show Margin %", type: "field" },

  // Product Orders
  { key: "orders.view", page: "Product Orders", label: "View orders & credentials", type: "view" },
  { key: "orders.refund", page: "Product Orders", label: "Refund orders to wallets", type: "action" },
  { key: "orders.resend", page: "Product Orders", label: "Re-send credentials to customers", type: "action" },

  // Deposit Slips
  { key: "payments.view", page: "Deposit Slips", label: "View deposit slips", type: "view" },
  { key: "payments.review", page: "Deposit Slips", label: "Approve / reject deposits", type: "action" },

  // Customer Wallets
  { key: "customers.view", page: "Customer Wallets", label: "View customers & wallets", type: "view" },
  { key: "customers.balance", page: "Customer Wallets", label: "Adjust wallet balances", type: "action" },
  { key: "customers.status", page: "Customer Wallets", label: "Deactivate / restore customers", type: "action" },
  { key: "customers.delete", page: "Customer Wallets", label: "Permanently delete customers", type: "action" },

  // Rates & Margins
  { key: "settings.pricing", page: "Rates & Margins", label: "Edit exchange rate & margins", type: "action" },

  // Store Settings
  { key: "settings.view", page: "Store Settings", label: "View store settings", type: "view" },
  { key: "settings.payments", page: "Store Settings", label: "Edit payment accounts", type: "action" },
  { key: "settings.operations", page: "Store Settings", label: "Edit support & bot operations", type: "action" },

  // User Management
  { key: "users.manage", page: "User Management", label: "Create & manage admin users", type: "action" },
  { key: "roles.manage", page: "User Management", label: "Create & manage roles", type: "action" },

  // Broadcast Announcements
  { key: "broadcast.view", page: "Broadcast", label: "View broadcast announcements & history", type: "view" },
  { key: "broadcast.send", page: "Broadcast", label: "Compose and send broadcasts to bot users", type: "action" },

  // Audit Log
  { key: "audit.view", page: "Audit Log", label: "View audit log", type: "view" },
];

/**
 * Maps action and field permission keys to their parent view permission.
 */
export const PERMISSION_DEPENDENCIES: Record<string, string> = {
  "supplier.sync": "supplier.view",
  "products.edit": "products.view",
  "products.show_cost": "products.view",
  "products.show_margin": "products.view",
  "orders.refund": "orders.view",
  "orders.resend": "orders.view",
  "payments.review": "payments.view",
  "customers.balance": "customers.view",
  "customers.status": "customers.view",
  "customers.delete": "customers.view",
  "settings.pricing": "settings.view",
  "settings.payments": "settings.view",
  "settings.operations": "settings.view",
  "broadcast.send": "broadcast.view",
};

export const PERMISSION_KEYS: ReadonlySet<string> = new Set(
  PERMISSION_CATALOG.map((p) => p.key)
);

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.map((p) => p.key);

/**
 * app_settings keys grouped by the permission that grants both write access
 * (PUT /api/admin/settings) and read visibility (GET /api/admin/settings).
 */
export const SETTINGS_PERMISSION_KEYS: Record<string, string[]> = {
  "settings.pricing": ["usdToMmkRate", "defaultMarginPct"],
  "settings.payments": [
    "kpayAccountName",
    "kpayPhone",
    "wavepayAccountName",
    "wavepayPhone",
    "ayapayAccountName",
    "ayapayPhone",
    "uabpayAccountName",
    "uabpayPhone",
  ],
  "settings.operations": [
    "supportTelegramHandle",
    "isMaintenanceMode",
    "orderTimeoutMinutes",
    "restockNotificationsEnabled",
    "telegramGroupChatId",
    "telegramDepositTopicId",
    "telegramBotAlertTopicId",
    "telegramAdminMentions",
    "telegramApproverIds",
    "balanceAlertThresholdUsd",
    "supplier.balanceAlertThresholdUsd",
  ],
};

/**
 * Splits a settings payload into keys the permissions allow and keys they
 * deny. Used both to filter GET responses and to enforce the PUT whitelist —
 * any denied key present in a PUT body must be rejected, never ignored.
 */
export function filterSettingsForPermissions(
  body: Record<string, unknown>,
  permissions: string[]
): { allowed: Record<string, unknown>; denied: string[] } {
  const granted = new Set(
    Object.entries(SETTINGS_PERMISSION_KEYS).flatMap(([perm, keys]) =>
      permissions.includes(perm) ? keys : []
    )
  );

  const allowed: Record<string, unknown> = {};
  const denied: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (granted.has(key)) {
      allowed[key] = value;
    } else {
      denied.push(key);
    }
  }
  return { allowed, denied };
}

export interface DefaultRoleDef {
  name: string;
  key: string;
  description: string;
  permissions: string[];
}

/** Seeded idempotently at boot. SUPERADMIN is intentionally absent (bypass). */
export const DEFAULT_ROLES: DefaultRoleDef[] = [
  {
    name: "Operations Admin",
    key: "ADMIN",
    description: "Runs day-to-day operations: catalog, orders, deposits, customers and settings.",
    permissions: [
      "overview.view",
      "analytics.view",
      "supplier.view",
      "supplier.sync",
      "products.view",
      "products.edit",
      "products.show_cost",
      "products.show_margin",
      "orders.view",
      "orders.refund",
      "orders.resend",
      "payments.view",
      "payments.review",
      "customers.view",
      "customers.balance",
      "customers.status",
      "settings.view",
      "settings.pricing",
      "settings.payments",
      "settings.operations",
    ],
  },
  {
    name: "Support",
    key: "SUPPORT",
    description: "View-only helper: sees orders, deposits and customers; cannot touch money or settings.",
    permissions: [
      "overview.view",
      "products.view",
      "orders.view",
      "orders.resend",
      "payments.view",
      "customers.view",
    ],
  },
];
