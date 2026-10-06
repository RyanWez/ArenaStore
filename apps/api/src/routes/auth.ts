import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { getDb, users } from "@arena/db";
import { authService } from "../services/auth.service";
import { totpService } from "../services/totp.service";
import { rbacService } from "../services/rbac.service";
import { config } from "../config";

const LoginSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
  totpCode: z.string().optional(),
});

export async function authRoutes(server: FastifyInstance) {
  // POST /api/admin/auth/login (Brute-force protection: max 5 attempts per 5 minutes per IP)
  server.post(
    "/api/admin/auth/login",
    {
      config: {
        rateLimit: {
          hook: "preHandler",
          max: 5,
          timeWindow: 1000 * 60 * 5, // 5 minutes
          keyGenerator: (req) => {
            const rawEmail = (req.body as any)?.email;
            const identifier = rawEmail ? String(rawEmail).toLowerCase().trim() : "anon";
            return `login_${req.ip}_${identifier}`;
          },
        },
      },
    },
    async (request, reply) => {
    const parseRes = LoginSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        ok: false,
        error: "Validation failed",
        issues: parseRes.error.issues,
      });
    }

    const { email, password } = parseRes.data;
    const db = getDb();

    // Find admin by email or username
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, email.toLowerCase().trim()),
          eq(users.username, email.trim())
        )
      )
      .limit(1);

    if (!user || !user.passwordHash) {
      return reply.status(401).send({
        ok: false,
        error: "Invalid credentials.",
      });
    }

    if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") {
      return reply.status(403).send({
        ok: false,
        error: "Access denied. Administrator privileges required.",
      });
    }

    const isValid = authService.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({
        ok: false,
        error: "Invalid credentials.",
      });
    }

    // 2FA gate (TOTP): checked whenever ADMIN_TOTP_SECRET is configured
    if (totpService.isEnabled()) {
      const code = parseRes.data.totpCode || "";
      if (!code) {
        return reply.status(401).send({
          ok: false,
          error: "Two-factor authentication code required.",
          code: "TOTP_REQUIRED",
        });
      }
      const isTotpValid = totpService.verifyCode(code, user.email || user.username || "");
      if (!isTotpValid) {
        return reply.status(401).send({
          ok: false,
          error: "Invalid two-factor authentication code.",
          code: "TOTP_INVALID",
        });
      }
    }

    // Create session in Redis
    const token = await authService.createSession(user);

    // Set HttpOnly cookie for defense-in-depth against XSS token exfiltration
    const isProd = config.NODE_ENV === "production";
    const cookieDirectives = [
      `arena_admin_token=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${60 * 60 * 24 * 7}`, // 7 days
    ];
    if (isProd) cookieDirectives.push("Secure");
    reply.header("Set-Cookie", cookieDirectives.join("; "));

    return {
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      mustChangePassword: user.mustChangePassword,
    };
  });

  // GET /api/admin/auth/me
  server.get("/api/admin/auth/me", async (request, reply) => {
    let token: string | null = (request as any).adminUserToken || null;
    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.replace("Bearer ", "").trim();
      } else if (request.headers.cookie) {
        const match = request.headers.cookie.match(/arena_admin_token=([^;]+)/);
        if (match) token = decodeURIComponent(match[1]);
      }
    }

    if (!token) {
      return reply.status(401).send({
        ok: false,
        error: "Unauthorized. Missing or invalid Bearer token or session cookie.",
      });
    }

    const session =
      (request as any).adminUser || (await authService.getSession(token));

    if (!session) {
      return reply.status(401).send({
        ok: false,
        error: "Session expired or invalid.",
      });
    }

    // Resolve effective permissions fresh from the DB so the admin panel's
    // sidebar/actions always reflect the current role definition.
    const ctx = await rbacService.getContext(session.userId).catch(() => null);

    return {
      ok: true,
      token,
      user: session,
      role: ctx
        ? {
            id: ctx.roleId,
            name: ctx.roleName,
            isSuperadmin: ctx.isSuperadmin,
          }
        : null,
      permissions: ctx?.permissions ?? [],
      mustChangePassword: ctx?.mustChangePassword ?? false,
    };
  });

  // POST /api/admin/auth/logout
  server.post("/api/admin/auth/logout", async (request, reply) => {
    let token: string | null = null;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "").trim();
    } else if (request.headers.cookie) {
      const match = request.headers.cookie.match(/arena_admin_token=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (token) {
      await authService.destroySession(token);
    }

    // Clear HttpOnly cookie
    const isProd = config.NODE_ENV === "production";
    const cookieDirectives = [
      "arena_admin_token=",
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
    ];
    if (isProd) cookieDirectives.push("Secure");
    reply.header("Set-Cookie", cookieDirectives.join("; "));

    return {
      ok: true,
      message: "Logged out successfully",
    };
  });

  // POST /api/admin/auth/change-password
  server.post("/api/admin/auth/change-password", async (request, reply) => {
    const adminUser = (request as any).adminUser;
    if (!adminUser || !adminUser.userId) {
      return reply.status(401).send({
        ok: false,
        error: "Unauthorized. Admin session required.",
      });
    }

    const parseRes = z
      .object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(8, "New password must be at least 8 characters long"),
      })
      .safeParse(request.body);

    if (!parseRes.success) {
      return reply.status(400).send({
        ok: false,
        error: parseRes.error.issues[0]?.message || "Validation failed",
        issues: parseRes.error.issues,
      });
    }

    const { currentPassword, newPassword } = parseRes.data;
    const result = await authService.changePassword(
      adminUser.userId,
      currentPassword,
      newPassword
    );

    if (!result.success) {
      return reply.status(400).send({
        ok: false,
        error: result.error || "Failed to update password",
      });
    }

    return {
      ok: true,
      message: "Password changed successfully",
    };
  });
}
