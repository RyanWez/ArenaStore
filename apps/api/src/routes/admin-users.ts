import { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, isNotNull, or } from "drizzle-orm";
import { getDb, roles, rolePermissions, users, auditLogs } from "@arena/db";
import { authService } from "../services/auth.service";
import { writeAudit } from "../services/audit.service";
import { getRbac, requirePermission } from "../rbac/require-permission";
import { DEFAULT_ROLES, PERMISSION_CATALOG, PERMISSION_KEYS } from "../rbac/catalog";

const CreateRoleSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(255).optional(),
  permissions: z.array(z.string()).default([]),
});

const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(255).optional(),
  permissions: z.array(z.string()).optional(),
});

const CreateStaffSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().max(255).optional(),
  email: z.string().email(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleId: z.number().int().positive(),
});

const UpdateStaffSchema = z.object({
  roleId: z.number().int().positive().optional(),
  status: z.enum(["ACTIVE", "DEACTIVATED"]).optional(),
});

function slugifyRoleKey(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || `role_${Date.now()}`
  );
}

async function assertPermissionsValid(permissions: string[]): Promise<string | null> {
  const unknown = permissions.filter((p) => !PERMISSION_KEYS.has(p));
  return unknown.length > 0 ? `Unknown permission keys: ${unknown.join(", ")}` : null;
}

export async function adminUsersRoutes(server: FastifyInstance) {
  // GET /api/admin/permissions/catalog (Permission definitions for the roles UI)
  server.get(
    "/api/admin/permissions/catalog",
    { preHandler: requirePermission("roles.manage") },
    async () => {
      return {
        ok: true,
        catalog: PERMISSION_CATALOG,
        defaultRoles: DEFAULT_ROLES,
      };
    }
  );

  // GET /api/admin/roles (List all roles with their permission keys + user counts)
  server.get(
    "/api/admin/roles",
    { preHandler: requirePermission("roles.manage") },
    async () => {
      const db = getDb();
      const roleList = await db.select().from(roles).orderBy(roles.id);
      const perms = await db.select().from(rolePermissions);

      const permsByRole = new Map<number, string[]>();
      for (const p of perms) {
        const list = permsByRole.get(p.roleId) || [];
        list.push(p.permission);
        permsByRole.set(p.roleId, list);
      }

      const staffRows = await db
        .select({ roleId: users.roleId })
        .from(users)
        .where(isNotNull(users.roleId));

      const counts = new Map<number, number>();
      for (const s of staffRows) {
        if (s.roleId) counts.set(s.roleId, (counts.get(s.roleId) || 0) + 1);
      }

      return {
        ok: true,
        roles: roleList.map((r) => ({
          ...r,
          permissions: (permsByRole.get(r.id) || []).sort(),
          userCount: counts.get(r.id) || 0,
        })),
      };
    }
  );

  // POST /api/admin/roles (Create a custom role)
  server.post(
    "/api/admin/roles",
    { preHandler: requirePermission("roles.manage") },
    async (request, reply) => {
      const parseRes = CreateRoleSchema.safeParse(request.body);
      if (!parseRes.success) {
        return reply.status(400).send({
          ok: false,
          error: "Validation failed",
          issues: parseRes.error.issues,
        });
      }

      const invalid = await assertPermissionsValid(parseRes.data.permissions);
      if (invalid) {
        return reply.status(400).send({ ok: false, error: invalid });
      }

      const db = getDb();
      const key = slugifyRoleKey(parseRes.data.name);

      const [existing] = await db.select().from(roles).where(eq(roles.key, key)).limit(1);
      if (existing) {
        return reply.status(409).send({ ok: false, error: `Role key "${key}" already exists` });
      }

      const [created] = await db
        .insert(roles)
        .values({
          name: parseRes.data.name,
          key,
          description: parseRes.data.description ?? null,
          isSystem: false,
        })
        .returning();

      if (parseRes.data.permissions.length > 0) {
        await db
          .insert(rolePermissions)
          .values(
            parseRes.data.permissions.map((permission) => ({ roleId: created.id, permission }))
          )
          .onConflictDoNothing();
      }

      await writeAudit({
        actorId: getRbac(request)?.userId ?? null,
        action: "ROLE_CREATE",
        entityType: "ROLE",
        entityId: created.id,
        details: { name: created.name, key, permissions: parseRes.data.permissions },
      });

      return { ok: true, role: { ...created, permissions: parseRes.data.permissions, userCount: 0 } };
    }
  );

  // PUT /api/admin/roles/:id (Rename a role and/or replace its permission set)
  server.put<{ Params: { id: string } }>(
    "/api/admin/roles/:id",
    { preHandler: requirePermission("roles.manage") },
    async (request, reply) => {
      const roleId = parseInt(request.params.id, 10);
      const parseRes = UpdateRoleSchema.safeParse(request.body);
      if (!parseRes.success) {
        return reply.status(400).send({
          ok: false,
          error: "Validation failed",
          issues: parseRes.error.issues,
        });
      }

      const db = getDb();
      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      if (!role) {
        return reply.status(404).send({ ok: false, error: "Role not found" });
      }

      const { name, description, permissions } = parseRes.data;

      if (permissions) {
        const invalid = await assertPermissionsValid(permissions);
        if (invalid) {
          return reply.status(400).send({ ok: false, error: invalid });
        }
      }

      const previousPermissions = (
        await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId))
      ).map((p) => p.permission);

      await db.transaction(async (tx) => {
        if (name !== undefined || description !== undefined) {
          await tx
            .update(roles)
            .set({
              ...(name !== undefined ? { name } : {}),
              ...(description !== undefined ? { description } : {}),
            })
            .where(eq(roles.id, roleId));
        }

        if (permissions) {
          await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
          if (permissions.length > 0) {
            await tx
              .insert(rolePermissions)
              .values(permissions.map((permission) => ({ roleId, permission })))
              .onConflictDoNothing();
          }
        }
      });

      // Permission edits take effect immediately (checks read fresh per
      // request), but a rename/description change is worth an audit trail.
      await writeAudit({
        actorId: getRbac(request)?.userId ?? null,
        action: "ROLE_UPDATE",
        entityType: "ROLE",
        entityId: roleId,
        details: {
          name: name ?? role.name,
          addedPermissions: permissions
            ? permissions.filter((p) => !previousPermissions.includes(p))
            : [],
          removedPermissions: permissions
            ? previousPermissions.filter((p) => !permissions.includes(p))
            : [],
        },
      });

      return { ok: true };
    }
  );

  // DELETE /api/admin/roles/:id (Delete an unused role)
  server.delete<{ Params: { id: string } }>(
    "/api/admin/roles/:id",
    { preHandler: requirePermission("roles.manage") },
    async (request, reply) => {
      const roleId = parseInt(request.params.id, 10);
      const db = getDb();

      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      if (!role) {
        return reply.status(404).send({ ok: false, error: "Role not found" });
      }

      const [assignee] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.roleId, roleId))
        .limit(1);
      if (assignee) {
        return reply.status(409).send({
          ok: false,
          error: "This role is still assigned to one or more users. Reassign them first.",
        });
      }

      await db.delete(roles).where(eq(roles.id, roleId));

      await writeAudit({
        actorId: getRbac(request)?.userId ?? null,
        action: "ROLE_DELETE",
        entityType: "ROLE",
        entityId: roleId,
        details: { name: role.name, key: role.key },
      });

      return { ok: true };
    }
  );

  // GET /api/admin/staff (List admin/staff accounts with their roles)
  server.get(
    "/api/admin/staff",
    { preHandler: requirePermission("users.manage") },
    async () => {
      const db = getDb();
      const staff = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          roleId: users.roleId,
          roleName: roles.name,
          status: users.status,
          mustChangePassword: users.mustChangePassword,
          createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(roles, eq(users.roleId, roles.id))
        .where(or(isNotNull(users.roleId), eq(users.role, "SUPERADMIN")))
        .orderBy(users.id);

      return { ok: true, staff };
    }
  );

  // POST /api/admin/staff (Create an admin/staff account with a role)
  server.post(
    "/api/admin/staff",
    { preHandler: requirePermission("users.manage") },
    async (request, reply) => {
      const parseRes = CreateStaffSchema.safeParse(request.body);
      if (!parseRes.success) {
        return reply.status(400).send({
          ok: false,
          error: parseRes.error.issues[0]?.message || "Validation failed",
          issues: parseRes.error.issues,
        });
      }

      const db = getDb();
      const { firstName, lastName, email, username, password, roleId } = parseRes.data;

      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      if (!role) {
        return reply.status(400).send({ ok: false, error: "Selected role does not exist" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const [emailTaken] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);
      if (emailTaken) {
        return reply.status(409).send({ ok: false, error: "A user with this email already exists" });
      }

      if (username) {
        const [usernameTaken] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, username))
          .limit(1);
        if (usernameTaken) {
          return reply.status(409).send({ ok: false, error: "This username is already taken" });
        }
      }

      const [created] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          username: username ?? null,
          firstName,
          lastName: lastName ?? null,
          role: "ADMIN",
          roleId,
          status: "ACTIVE",
          mustChangePassword: true,
          passwordHash: authService.hashPassword(password),
        })
        .returning();

      await writeAudit({
        actorId: getRbac(request)?.userId ?? null,
        action: "STAFF_CREATE",
        entityType: "USER",
        entityId: created.id,
        details: { email: created.email, username: created.username, roleId, roleName: role.name },
      });

      return {
        ok: true,
        staff: {
          id: created.id,
          email: created.email,
          username: created.username,
          firstName: created.firstName,
          lastName: created.lastName,
          role: created.role,
          roleId: created.roleId,
          roleName: role.name,
          status: created.status,
          mustChangePassword: created.mustChangePassword,
          createdAt: created.createdAt,
        },
      };
    }
  );

  // PATCH /api/admin/staff/:id (Change a staff member's role or activation status)
  server.patch<{ Params: { id: string } }>(
    "/api/admin/staff/:id",
    { preHandler: requirePermission("users.manage") },
    async (request, reply) => {
      const targetId = parseInt(request.params.id, 10);
      const parseRes = UpdateStaffSchema.safeParse(request.body);
      if (!parseRes.success) {
        return reply.status(400).send({
          ok: false,
          error: "Validation failed",
          issues: parseRes.error.issues,
        });
      }

      const actor = getRbac(request);
      const db = getDb();
      const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target) {
        return reply.status(404).send({ ok: false, error: "Staff user not found" });
      }

      // The owner account is untouchable through the staff API — the
      // SUPERADMIN bypass must never be editable or deactivatable from here.
      if (target.role === "SUPERADMIN") {
        return reply.status(400).send({ ok: false, error: "The SUPERADMIN account cannot be modified" });
      }

      const { roleId, status } = parseRes.data;

      if (actor && target.id === actor.userId) {
        if (roleId !== undefined) {
          return reply.status(400).send({ ok: false, error: "You cannot change your own role" });
        }
        if (status === "DEACTIVATED") {
          return reply.status(400).send({ ok: false, error: "You cannot deactivate your own account" });
        }
      }

      let newRoleName: string | null = null;
      if (roleId !== undefined) {
        const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
        if (!role) {
          return reply.status(400).send({ ok: false, error: "Selected role does not exist" });
        }
        newRoleName = role.name;
      }

      await db
        .update(users)
        .set({
          ...(roleId !== undefined ? { roleId } : {}),
          ...(status !== undefined ? { status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetId));

      // Role/status changes must not linger in old sessions — same policy as
      // password rotation.
      await authService.destroyAllSessions(targetId);

      await writeAudit({
        actorId: actor?.userId ?? null,
        action: "STAFF_UPDATE",
        entityType: "USER",
        entityId: targetId,
        details: {
          email: target.email,
          ...(roleId !== undefined ? { previousRoleId: target.roleId, newRoleId: roleId, newRoleName } : {}),
          ...(status !== undefined ? { previousStatus: target.status, newStatus: status } : {}),
        },
      });

      return { ok: true };
    }
  );

  // GET /api/admin/audit (Recent audit log entries with actor names)
  server.get<{ Querystring: { limit?: string } }>(
    "/api/admin/audit",
    { preHandler: requirePermission("audit.view") },
    async (request) => {
      const db = getDb();
      const limit = Math.min(Math.max(1, Number(request.query?.limit) || 100), 200);

      const entries = await db
        .select({
          id: auditLogs.id,
          actorId: auditLogs.actorId,
          actorName: users.firstName,
          actorLastName: users.lastName,
          actorEmail: users.email,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          details: auditLogs.details,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit);

      return {
        ok: true,
        entries: entries.map((e) => ({
          id: e.id,
          actor: e.actorEmail
            ? `${e.actorName || ""} ${e.actorLastName || ""}`.trim() || e.actorEmail
            : "System",
          actorEmail: e.actorEmail,
          action: e.action,
          entityType: e.entityType,
          entityId: e.entityId,
          details: e.details,
          createdAt: e.createdAt,
        })),
      };
    }
  );
}
