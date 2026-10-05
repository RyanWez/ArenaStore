import { eq } from "drizzle-orm";
import { getDb, roles, rolePermissions, users } from "@arena/db";
import { ALL_PERMISSION_KEYS, DEFAULT_ROLES, PERMISSION_KEYS } from "../rbac/catalog";

/**
 * Effective permission context resolved fresh from the database on every
 * request — never cached — so role/permission changes take effect
 * immediately without re-login.
 */
export interface RbacContext {
  userId: number;
  /** users.role: ADMIN (staff) or SUPERADMIN (owner bypass). */
  role: string;
  roleId: number | null;
  roleName: string | null;
  isSuperadmin: boolean;
  status: string;
  mustChangePassword: boolean;
  permissions: string[];
}

export class RbacService {
  /**
   * Loads the user + their role permissions. Returns null when the user
   * vanished or a staff account was deactivated — callers must fail closed.
   */
  async getContext(userId: number): Promise<RbacContext | null> {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;

    if (user.role === "SUPERADMIN") {
      return {
        userId,
        role: user.role,
        roleId: null,
        roleName: "SUPERADMIN",
        isSuperadmin: true,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        permissions: [...ALL_PERMISSION_KEYS],
      };
    }

    // Deactivated staff must not keep working through an old session.
    if (user.status !== "ACTIVE") return null;

    let roleName: string | null = null;
    let permissions: string[] = [];
    if (user.roleId) {
      const [role] = await db.select().from(roles).where(eq(roles.id, user.roleId)).limit(1);
      if (role) {
        roleName = role.name;
        const perms = await db
          .select()
          .from(rolePermissions)
          .where(eq(rolePermissions.roleId, user.roleId));
        // Unknown catalog keys are silently dropped — fail closed.
        permissions = perms.map((p) => p.permission).filter((k) => PERMISSION_KEYS.has(k));
      }
    }

    return {
      userId,
      role: user.role,
      roleId: user.roleId ?? null,
      roleName,
      isSuperadmin: false,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      permissions,
    };
  }

  hasPermission(ctx: RbacContext | null, permission: string): boolean {
    if (!ctx) return false;
    if (!PERMISSION_KEYS.has(permission)) return false;
    return ctx.isSuperadmin || ctx.permissions.includes(permission);
  }

  /** Idempotently creates the default roles and their permission sets on initial setup. */
  async seedDefaultRoles(): Promise<void> {
    const db = getDb();
    for (const def of DEFAULT_ROLES) {
      const [role] = await db
        .insert(roles)
        .values({
          name: def.name,
          key: def.key,
          description: def.description,
          isSystem: true,
        })
        // Do nothing on conflict so admin renames/edits of these roles survive boots.
        .onConflictDoNothing()
        .returning();

      // Only seed default permissions when the role is freshly inserted into the database.
      // If the role already exists, NEVER overwrite or re-inject permissions, preserving
      // all custom configurations saved by admins in the Roles UI.
      if (role) {
        await db
          .insert(rolePermissions)
          .values(def.permissions.map((permission) => ({ roleId: role.id, permission })))
          .onConflictDoNothing();
      }
    }
    console.log("[RBAC] Default roles seeded");
  }
}

export const rbacService = new RbacService();
