import crypto from "node:crypto";
import { promisify } from "node:util";
import { eq, or } from "drizzle-orm";
import { getDb, users, User } from "@arena/db";
import { getRedis } from "./redis";
import { config } from "../config";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Async scrypt so password hashing/verification runs on libuv's threadpool
// instead of blocking the event loop (scryptSync stalls every other request
// for the duration of each login/password change).
const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number
) => Promise<Buffer>;

export interface AdminSession {
  userId: number;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  role: string;
}

export class AuthService {
  /**
   * Hashes a plain password using scrypt with a unique random salt.
   * Format: `saltHex:derivedKeyHex`
   */
  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = (await scryptAsync(password, salt, 64)).toString("hex");
    return `${salt}:${derivedKey}`;
  }

  /**
   * Verifies a plain password against the stored salt:derivedKey hash.
   */
  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;

    const [salt, keyHex] = parts;
    const key = Buffer.from(keyHex, "hex");
    const derived = await scryptAsync(password, salt, 64);

    return key.length === derived.length && crypto.timingSafeEqual(key, derived);
  }

  /**
   * Creates a secure session token and stores the session metadata in Redis.
   */
  async createSession(admin: User): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const sessionData: AdminSession = {
      userId: admin.id,
      email: admin.email || "",
      username: admin.username,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
    };

    const redis = getRedis();
    await redis.setex(
      `arena:admin_session:${token}`,
      SESSION_TTL_SECONDS,
      JSON.stringify(sessionData)
    );

    return token;
  }

  /**
   * Retrieves and verifies an active session from Redis.
   */
  async getSession(token: string): Promise<AdminSession | null> {
    if (!token) return null;
    const redis = getRedis();
    const data = await redis.get(`arena:admin_session:${token}`);
    if (!data) return null;

    try {
      return JSON.parse(data) as AdminSession;
    } catch {
      return null;
    }
  }

  /**
   * Destroys an active session in Redis.
   */
  async destroySession(token: string): Promise<void> {
    if (!token) return;
    const redis = getRedis();
    await redis.del(`arena:admin_session:${token}`);
  }

  /**
   * Revokes every active admin session — optionally scoped to one user. Used
   * after a password change so a stolen session token cannot outlive the
   * rotated credential.
   */
  async destroyAllSessions(userId?: number): Promise<number> {
    const redis = getRedis();
    let cursor = "0";
    let destroyed = 0;

    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "arena:admin_session:*", "COUNT", 100);
      cursor = next;

      for (const key of keys) {
        if (userId) {
          const raw = await redis.get(key);
          if (raw) {
            try {
              if ((JSON.parse(raw) as AdminSession).userId !== userId) continue;
            } catch {
              // Unparsable session data — clear it anyway.
            }
          }
        }
        destroyed += await redis.del(key);
      }
    } while (cursor !== "0");

    return destroyed;
  }

  /**
   * Updates an admin user's password after verifying their current password.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.passwordHash) {
      return { success: false, error: "User not found or has no password set." };
    }

    const isValid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Current password is incorrect." };
    }

    if (newPassword.length < 8) {
      return { success: false, error: "New password must be at least 8 characters long." };
    }

    const newHash = await this.hashPassword(newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // The rotated password must not leave old session tokens valid.
    await this.destroyAllSessions(userId);

    return { success: true };
  }

  /**
   * Ensures exactly one SUPERADMIN exists, driven by ADMIN_EMAIL /
   * ADMIN_INITIAL_PASSWORD. Deployments created before the SUPERADMIN role
   * existed get a one-time promotion of their seeded admin; customer accounts
   * are never hijacked.
   */
  async seedDefaultAdmin(): Promise<void> {
    try {
      const db = getDb();

      const [byEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, config.ADMIN_EMAIL))
        .limit(1);

      if (byEmail && byEmail.role !== "ADMIN" && byEmail.role !== "SUPERADMIN") {
        console.warn(
          `[Auth] ADMIN_EMAIL belongs to a ${byEmail.role} user; admin seed skipped.`
        );
        return;
      }

      let target = byEmail ?? null;

      if (!target) {
        const staff = await db
          .select()
          .from(users)
          .where(or(eq(users.role, "ADMIN"), eq(users.role, "SUPERADMIN")));

        if (staff.some((u) => u.role === "SUPERADMIN")) {
          console.log("[Auth] SUPERADMIN already exists; admin seed skipped.");
          return;
        }
        if (staff.length > 1) {
          console.warn(
            `[Auth] ${staff.length} admins exist without a SUPERADMIN; promote one manually.`
          );
          return;
        }
        target = staff[0] ?? null;
      }

      if (!target) {
        const passwordHash = await this.hashPassword(config.ADMIN_INITIAL_PASSWORD);
        await db.insert(users).values({
          email: config.ADMIN_EMAIL,
          username: "admin",
          firstName: "Arena",
          lastName: "Superadmin",
          role: "SUPERADMIN",
          status: "ACTIVE",
          passwordHash,
        });
        console.log(`[Auth] Default SUPERADMIN initialized: ${config.ADMIN_EMAIL}`);
        return;
      }

      if (target.role === "ADMIN") {
        await db
          .update(users)
          .set({ role: "SUPERADMIN", updatedAt: new Date() })
          .where(eq(users.id, target.id));
        console.log(`[Auth] Admin promoted to SUPERADMIN: ${target.email}`);
      }

      if (process.env.ADMIN_FORCE_RESET_PASSWORD === "true") {
        const passwordHash = await this.hashPassword(config.ADMIN_INITIAL_PASSWORD);
        await db
          .update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, target.id));
        console.log(`[Auth] SUPERADMIN password force-reset from .env: ${target.email}`);
      }
    } catch (err: any) {
      console.warn("[Auth] Admin seed skipped or error:", err.message);
    }
  }
}

export const authService = new AuthService();
