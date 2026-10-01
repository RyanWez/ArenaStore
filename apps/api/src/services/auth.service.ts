import crypto from "node:crypto";
import { eq, or } from "drizzle-orm";
import { getDb, users, User } from "@arena/db";
import { getRedis } from "./redis";
import { config } from "../config";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

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
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derivedKey}`;
  }

  /**
   * Verifies a plain password against the stored salt:derivedKey hash.
   */
  verifyPassword(password: string, storedHash: string): boolean {
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;

    const [salt, keyHex] = parts;
    const key = Buffer.from(keyHex, "hex");
    const derived = crypto.scryptSync(password, salt, 64);

    return crypto.timingSafeEqual(key, derived);
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

    const isValid = this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Current password is incorrect." };
    }

    if (newPassword.length < 8) {
      return { success: false, error: "New password must be at least 8 characters long." };
    }

    const newHash = this.hashPassword(newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { success: true };
  }

  /**
   * Ensures a default superadmin user exists in the database.
   */
  async seedDefaultAdmin(): Promise<void> {
    try {
      const db = getDb();
      const existing = await db
        .select()
        .from(users)
        .where(
          or(
            eq(users.email, config.ADMIN_EMAIL),
            eq(users.role, "ADMIN")
          )
        )
        .limit(1);

      if (existing.length === 0) {
        const passwordHash = this.hashPassword(config.ADMIN_INITIAL_PASSWORD);
        await db.insert(users).values({
          email: config.ADMIN_EMAIL,
          username: "admin",
          firstName: "Arena",
          lastName: "Superadmin",
          role: "ADMIN",
          status: "ACTIVE",
          passwordHash,
        });
        console.log(`[Auth] Default admin initialized: ${config.ADMIN_EMAIL}`);
      } else if (process.env.ADMIN_FORCE_RESET_PASSWORD === "true") {
        const passwordHash = this.hashPassword(config.ADMIN_INITIAL_PASSWORD);
        await db
          .update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, existing[0].id));
        console.log(`[Auth] Default admin password force-reset from .env: ${config.ADMIN_EMAIL}`);
      }
    } catch (err: any) {
      console.warn("[Auth] Admin seed skipped or error:", err.message);
    }
  }
}

export const authService = new AuthService();
