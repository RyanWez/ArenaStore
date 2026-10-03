import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

/**
 * Staff roles for the admin panel. SUPERADMIN is intentionally NOT a row —
 * it stays a users.role value that bypasses all permission checks. CUSTOMER
 * users have roleId = NULL.
 */
export const roles = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 64 }).notNull().unique(),
    key: varchar("key", { length: 64 }).notNull().unique(),
    description: varchar("description", { length: 255 }),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_roles_key").on(table.key)]
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: varchar("permission", { length: 64 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permission] })]
);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type RolePermission = typeof rolePermissions.$inferSelect;
