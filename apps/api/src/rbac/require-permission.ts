import { FastifyReply, FastifyRequest } from "fastify";
import { rbacService, RbacContext } from "../services/rbac.service";

/**
 * Route-level authorization decorator. The global hook in server.ts only
 * authenticates the session; this additionally verifies the admin's role
 * holds `permission`. Fails closed on unknown permissions, missing role
 * assignments and deactivated staff accounts. SUPERADMIN bypasses everything.
 *
 * Usage: server.get("/api/admin/…", { preHandler: requirePermission("orders.view") }, handler)
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const session = (request as any).adminUser;
    if (!session?.userId) {
      reply.status(401).send({
        ok: false,
        error: "Unauthorized. Please log in to access admin functions.",
      });
      return;
    }

    const ctx = await rbacService.getContext(session.userId);
    if (!ctx) {
      reply.status(403).send({
        ok: false,
        error: "Access denied. Your account is inactive or has no role assigned.",
      });
      return;
    }

    if (!rbacService.hasPermission(ctx, permission)) {
      reply.status(403).send({
        ok: false,
        error: `Permission denied. Required: ${permission}.`,
      });
      return;
    }

    (request as any).rbac = ctx;
  };
}

export function requireAnyPermission(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const session = (request as any).adminUser;
    if (!session?.userId) {
      reply.status(401).send({
        ok: false,
        error: "Unauthorized. Please log in to access admin functions.",
      });
      return;
    }

    const ctx = await rbacService.getContext(session.userId);
    if (!ctx) {
      reply.status(403).send({
        ok: false,
        error: "Access denied. Your account is inactive or has no role assigned.",
      });
      return;
    }

    const hasAny = permissions.some((p) => rbacService.hasPermission(ctx, p));
    if (!hasAny) {
      reply.status(403).send({
        ok: false,
        error: `Permission denied. Required one of: ${permissions.join(", ")}.`,
      });
      return;
    }

    (request as any).rbac = ctx;
  };
}

/** Handler-side accessor for the resolved RBAC context (set by requirePermission). */
export function getRbac(request: FastifyRequest): RbacContext | undefined {
  return (request as any).rbac as RbacContext | undefined;
}

