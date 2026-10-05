import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, any[]>,
    updates: [] as Array<{ table: string; patch: any }>,
    inserts: [] as Array<{ table: string; values: any }>,
  };
  const reset = (seed: Record<string, any[]> = {}) => {
    for (const key of Object.keys(state.rows)) delete state.rows[key];
    Object.assign(state.rows, seed);
    state.updates.length = 0;
    state.inserts.length = 0;
  };
  return { state, reset };
});

vi.mock("../../packages/db/src/index.ts", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const tableNames = new Map<unknown, string>();
  for (const [name, value] of Object.entries(actual)) {
    if (value && typeof value === "object") tableNames.set(value, name);
  }
  const nameOf = (table: unknown): string => {
    const name = tableNames.get(table);
    if (!name) throw new Error("Mock DB: unknown table object " + String(table));
    return name;
  };

  const db = {
    select: () => ({
      from: (table: unknown) => {
        const name = nameOf(table);
        const snapshot = () => (h.state.rows[name] ?? []).map((r) => ({ ...r }));
        const builder: any = {
          where: () => builder,
          orderBy: () => builder,
          groupBy: () => builder,
          limit: () => builder,
          then: (resolve: any, reject: any) =>
            Promise.resolve(snapshot()).then(resolve, reject),
        };
        return builder;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: any) => {
        const name = nameOf(table);
        const pushAll = () => {
          const rows = Array.isArray(values) ? values : [values];
          rows.forEach((r, i) => {
            const row = { ...r, id: (h.state.rows[name]?.length ?? 0) + 1 };
            h.state.inserts.push({ table: name, values: row });
            (h.state.rows[name] ??= []).push(row);
          });
          return rows.map((_r: any, i: number) => ({
            ...values,
            id: (h.state.rows[name]?.length ?? 0) - rows.length + 1 + i,
          }));
        };
        return {
          onConflictDoNothing: () => ({
            returning: async () => pushAll(),
            then: (resolve: any, reject: any) =>
              Promise.resolve().then(() => {
                pushAll();
                resolve(undefined);
              }, reject),
          }),
          onConflictDoUpdate: () => ({
            then: (resolve: any, reject: any) =>
              Promise.resolve().then(() => {
                pushAll();
                resolve(undefined);
              }, reject),
          }),
          returning: async () => pushAll(),
          then: (resolve: any, reject: any) =>
            Promise.resolve().then(() => {
              pushAll();
              resolve(undefined);
            }, reject),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (patch: any) => {
        const name = nameOf(table);
        return {
          where: () => ({
            then: (resolve: any) => {
              h.state.updates.push({ table: name, patch });
              for (const row of h.state.rows[name] ?? []) Object.assign(row, patch);
              resolve(undefined);
            },
          }),
        };
      },
    }),
  };

  return { ...actual, getDb: () => db };
});

import { authService } from "../../apps/api/src/services/auth.service";
import { rbacService } from "../../apps/api/src/services/rbac.service";
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_ROLES,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  PERMISSION_DEPENDENCIES,
  filterSettingsForPermissions,
} from "../../apps/api/src/rbac/catalog";

const ALL = ALL_PERMISSION_KEYS;

describe("Permission catalog integrity", () => {
  it("has unique permission keys", () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("groups every permission under a page with a label and type", () => {
    for (const p of PERMISSION_CATALOG) {
      expect(p.page.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(["view", "action", "field"]).toContain(p.type);
    }
  });

  it("default role sets only use catalog keys", () => {
    for (const role of DEFAULT_ROLES) {
      for (const key of role.permissions) {
        expect(PERMISSION_KEYS.has(key), `${role.key} uses unknown key ${key}`).toBe(true);
      }
    }
  });

  it("never grants money/admin keys to SUPPORT by default", () => {
    const support = DEFAULT_ROLES.find((r) => r.key === "SUPPORT")!;
    const forbidden = [
      "payments.review",
      "customers.balance",
      "customers.delete",
      "orders.refund",
      "settings.pricing",
      "settings.payments",
      "users.manage",
      "roles.manage",
      "products.show_cost",
      "products.show_margin",
    ];
    for (const key of forbidden) {
      expect(support.permissions).not.toContain(key);
    }
  });

  it("defines valid parent-child dependencies where parent is always a view permission", () => {
    for (const [child, parent] of Object.entries(PERMISSION_DEPENDENCIES)) {
      expect(PERMISSION_KEYS.has(child), `child ${child} not in catalog`).toBe(true);
      expect(PERMISSION_KEYS.has(parent), `parent ${parent} not in catalog`).toBe(true);
      const parentDef = PERMISSION_CATALOG.find((p) => p.key === parent)!;
      expect(parentDef.type).toBe("view");
    }
  });

  it("links all Rates & Margins action permissions to settings.view", () => {
    expect(PERMISSION_DEPENDENCIES["settings.pricing"]).toBe("settings.view");
    expect(PERMISSION_DEPENDENCIES["settings.payments"]).toBe("settings.view");
    expect(PERMISSION_DEPENDENCIES["settings.operations"]).toBe("settings.view");
  });
});

describe("Settings permission filtering", () => {
  const body = {
    usdToMmkRate: "4600",
    defaultMarginPct: "30",
    kpayAccountName: "Arena",
    kpayPhone: "09xxx",
    supportTelegramHandle: "@support",
    isMaintenanceMode: "false",
    rogueKey: "nope",
  };

  it("splits keys by granted settings sub-permissions", () => {
    const { allowed, denied } = filterSettingsForPermissions(body, ["settings.pricing"]);
    expect(allowed).toEqual({ usdToMmkRate: "4600", defaultMarginPct: "30" });
    expect(denied).toEqual(["kpayAccountName", "kpayPhone", "supportTelegramHandle", "isMaintenanceMode", "rogueKey"]);
  });

  it("allows all catalog-managed keys for a role with every settings permission", () => {
    const { allowed, denied } = filterSettingsForPermissions(body, ALL);
    expect(denied).toEqual(["rogueKey"]);
    expect(Object.keys(allowed).sort()).toEqual(
      ["usdToMmkRate", "defaultMarginPct", "kpayAccountName", "kpayPhone", "supportTelegramHandle", "isMaintenanceMode"].sort()
    );
  });

  it("returns an empty allowed set for roles without settings permissions", () => {
    const { allowed } = filterSettingsForPermissions(body, ["orders.view"]);
    expect(allowed).toEqual({});
  });
});

describe("rbacService.getContext", () => {
  beforeEach(() => h.reset());

  it("gives SUPERADMIN every catalog permission", async () => {
    h.reset({
      users: [{ id: 1, role: "SUPERADMIN", roleId: null, status: "ACTIVE", mustChangePassword: false }],
    });
    const ctx = await rbacService.getContext(1);
    expect(ctx?.isSuperadmin).toBe(true);
    expect(ctx?.permissions).toEqual(ALL);
  });

  it("returns only catalog-known permissions held by the assigned role", async () => {
    h.reset({
      users: [{ id: 2, role: "ADMIN", roleId: 5, status: "ACTIVE", mustChangePassword: false }],
      roles: [{ id: 5, name: "Support", key: "SUPPORT" }],
      rolePermissions: [
        { roleId: 5, permission: "orders.view" },
        { roleId: 5, permission: "payments.view" },
        { roleId: 5, permission: "bogus.key" },
      ],
    });
    const ctx = await rbacService.getContext(2);
    expect(ctx?.roleName).toBe("Support");
    expect(ctx?.permissions.sort()).toEqual(["orders.view", "payments.view"]);
  });

  it("fails closed for deactivated staff", async () => {
    h.reset({
      users: [{ id: 3, role: "ADMIN", roleId: 5, status: "DEACTIVATED", mustChangePassword: false }],
      roles: [{ id: 5, name: "Support", key: "SUPPORT" }],
      rolePermissions: [{ roleId: 5, permission: "orders.view" }],
    });
    const ctx = await rbacService.getContext(3);
    expect(ctx).toBeNull();
    expect(rbacService.hasPermission(ctx, "orders.view")).toBe(false);
  });

  it("fails closed for staff without a role assignment", async () => {
    h.reset({
      users: [{ id: 4, role: "ADMIN", roleId: null, status: "ACTIVE", mustChangePassword: false }],
    });
    const ctx = await rbacService.getContext(4);
    expect(ctx?.permissions).toEqual([]);
    expect(rbacService.hasPermission(ctx, "orders.view")).toBe(false);
  });

  it("rejects unknown permission keys even for superadmins", async () => {
    h.reset({
      users: [{ id: 1, role: "SUPERADMIN", roleId: null, status: "ACTIVE", mustChangePassword: false }],
    });
    const ctx = await rbacService.getContext(1);
    expect(rbacService.hasPermission(ctx, "not.a.permission")).toBe(false);
  });
});

describe("rbacService.seedDefaultRoles", () => {
  beforeEach(() => h.reset());

  it("creates the default roles with their permission sets", async () => {
    await rbacService.seedDefaultRoles();
    const roles = h.state.rows.roles ?? [];
    expect(roles.map((r) => r.key).sort()).toEqual(["ADMIN", "SUPPORT"]);
    const perms = h.state.rows.rolePermissions ?? [];
    const admin = DEFAULT_ROLES.find((r) => r.key === "ADMIN")!;
    const support = DEFAULT_ROLES.find((r) => r.key === "SUPPORT")!;
    expect(perms.filter((p) => p.roleId === roles.find((r) => r.key === "ADMIN")!.id).length).toBe(
      admin.permissions.length
    );
    expect(perms.filter((p) => p.roleId === roles.find((r) => r.key === "SUPPORT")!.id).length).toBe(
      support.permissions.length
    );
  });

  it("preserves custom role permissions and does not re-add removed permissions on subsequent boots", async () => {
    // 1. Initial boot seeds the roles
    await rbacService.seedDefaultRoles();
    const adminRole = h.state.rows.roles.find((r) => r.key === "ADMIN")!;

    // 2. Admin explicitly unchecks "settings.pricing" (Rates & Margins) and saves
    h.state.rows.rolePermissions = h.state.rows.rolePermissions.filter(
      (p) => !(p.roleId === adminRole.id && p.permission === "settings.pricing")
    );
    const permsBeforeReboot = h.state.rows.rolePermissions.filter((p) => p.roleId === adminRole.id);
    expect(permsBeforeReboot.some((p) => p.permission === "settings.pricing")).toBe(false);

    // 3. Server reboots (e.g. after code deploy or push) and runs seedDefaultRoles again
    await rbacService.seedDefaultRoles();

    // 4. "settings.pricing" must NOT be forcefully re-injected!
    const permsAfterReboot = h.state.rows.rolePermissions.filter((p) => p.roleId === adminRole.id);
    expect(permsAfterReboot.some((p) => p.permission === "settings.pricing")).toBe(false);
  });
});

describe("seedDefaultAdmin SUPERADMIN promotion", () => {
  beforeEach(() => h.reset());

  it("promotes an existing ADMIN matching ADMIN_EMAIL to SUPERADMIN", async () => {
    h.reset({
      users: [{ id: 7, email: "admin@arenastore.mm", role: "ADMIN", status: "ACTIVE" }],
    });
    await authService.seedDefaultAdmin();
    const users = h.state.rows.users ?? [];
    expect(users[0].role).toBe("SUPERADMIN");
    expect(h.state.inserts.filter((i) => i.table === "users")).toHaveLength(0);
  });

  it("inserts a SUPERADMIN when no staff account exists", async () => {
    h.reset({ users: [] });
    await authService.seedDefaultAdmin();
    const inserts = h.state.inserts.filter((i) => i.table === "users");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values.role).toBe("SUPERADMIN");
  });

  it("promotes a lone legacy ADMIN even when ADMIN_EMAIL does not match", async () => {
    h.reset({
      users: [{ id: 9, email: "someone.else@arenastore.mm", role: "ADMIN", status: "ACTIVE" }],
    });
    await authService.seedDefaultAdmin();
    expect(h.state.rows.users[0].role).toBe("SUPERADMIN");
  });

  it("never hijacks a customer account registered with ADMIN_EMAIL", async () => {
    h.reset({
      users: [{ id: 11, email: "admin@arenastore.mm", role: "CUSTOMER", status: "ACTIVE" }],
    });
    await authService.seedDefaultAdmin();
    expect(h.state.rows.users[0].role).toBe("CUSTOMER");
    expect(h.state.updates.filter((u) => u.table === "users")).toHaveLength(0);
    expect(h.state.inserts.filter((i) => i.table === "users")).toHaveLength(0);
  });

  it("leaves an existing SUPERADMIN untouched", async () => {
    h.reset({
      users: [{ id: 13, email: "admin@arenastore.mm", role: "SUPERADMIN", status: "ACTIVE" }],
    });
    await authService.seedDefaultAdmin();
    expect(h.state.updates.filter((u) => u.table === "users")).toHaveLength(0);
    expect(h.state.inserts.filter((i) => i.table === "users")).toHaveLength(0);
  });
});
