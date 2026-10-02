import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { getDb, users } from "@arena/db";
import { authService } from "../services/auth.service";

const LoginSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

export async function authRoutes(server: FastifyInstance) {
  // POST /api/admin/auth/login (Brute-force protection: max 5 attempts per 5 minutes per IP)
  server.post(
    "/api/admin/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 1000 * 60 * 5, // 5 minutes
          keyGenerator: (req) => `login_${req.ip}`,
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

    // Create session in Redis
    const token = await authService.createSession(user);

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
    };
  });

  // GET /api/admin/auth/me
  server.get("/api/admin/auth/me", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({
        ok: false,
        error: "Unauthorized. Missing or invalid Bearer token.",
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const session = await authService.getSession(token);

    if (!session) {
      return reply.status(401).send({
        ok: false,
        error: "Session expired or invalid.",
      });
    }

    return {
      ok: true,
      user: session,
    };
  });

  // POST /api/admin/auth/logout
  server.post("/api/admin/auth/logout", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      await authService.destroySession(token);
    }

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
