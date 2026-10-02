import * as dotenv from "dotenv";
import path from "node:path";
import crypto from "node:crypto";
import { getDb, orderDeliveries } from "../src/index";
import { isNotNull, eq } from "drizzle-orm";

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config();

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(secretKey: string): Buffer {
  return crypto.createHash("sha256").update(secretKey).digest();
}

function encryptWithKey(text: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

function decryptWithKey(encryptedString: string, secretKey: string): string {
  const parts = encryptedString.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format. Expected iv:authTag:ciphertext.");
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = deriveKey(secretKey);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export interface ReEncryptionResult {
  total: number;
  migrated: number;
  alreadyUsingNewKey: number;
  failed: number;
  errors: Array<{ id: number; error: string }>;
}

export async function reEncryptDeliveries(
  oldKey: string = process.env.OLD_DELIVERY_ENCRYPTION_KEY || "arena-store-default-dev-encryption-key-32bytes!",
  newKey: string = process.env.DELIVERY_ENCRYPTION_KEY || ""
): Promise<ReEncryptionResult> {
  if (!newKey) {
    throw new Error("Target newKey (DELIVERY_ENCRYPTION_KEY) must be provided and non-empty.");
  }
  if (newKey === oldKey) {
    throw new Error("Target newKey must be different from oldKey.");
  }

  const db = getDb();
  console.log(`[Re-Encryption] Starting delivery re-encryption...`);
  console.log(`[Re-Encryption] Old Key: ${oldKey.slice(0, 6)}... (${oldKey.length} chars)`);
  console.log(`[Re-Encryption] New Key: ${newKey.slice(0, 6)}... (${newKey.length} chars)`);

  const rows = await db
    .select({
      id: orderDeliveries.id,
      orderId: orderDeliveries.orderId,
      encryptedPayload: orderDeliveries.encryptedPayload,
    })
    .from(orderDeliveries)
    .where(isNotNull(orderDeliveries.encryptedPayload));

  console.log(`[Re-Encryption] Found ${rows.length} total encrypted delivery rows.`);

  const result: ReEncryptionResult = {
    total: rows.length,
    migrated: 0,
    alreadyUsingNewKey: 0,
    failed: 0,
    errors: [],
  };

  const updates: Array<{ id: number; newPayload: string }> = [];

  for (const row of rows) {
    const currentPayload = row.encryptedPayload!;

    // Check if already encrypted with new key
    try {
      decryptWithKey(currentPayload, newKey);
      result.alreadyUsingNewKey++;
      continue;
    } catch {
      // Not decryptable with new key, proceed to decrypt with old key
    }

    try {
      // Step 1: Decrypt with old key
      const plaintext = decryptWithKey(currentPayload, oldKey);
      if (!plaintext) {
        throw new Error("Decrypted plaintext is empty");
      }

      // Step 2: Encrypt with new key
      const newEncrypted = encryptWithKey(plaintext, newKey);

      // Step 3: Verify round-trip decryption with new key
      const verifiedPlaintext = decryptWithKey(newEncrypted, newKey);
      if (verifiedPlaintext !== plaintext) {
        throw new Error("Round-trip decryption verification failed: mismatch with original plaintext");
      }

      updates.push({ id: row.id, newPayload: newEncrypted });
    } catch (err: any) {
      result.failed++;
      result.errors.push({ id: row.id, error: err.message });
      console.error(`[Re-Encryption] Failed on row ID ${row.id}: ${err.message}`);
    }
  }

  // Safety Gate: If any row failed, abort before writing to DB!
  if (result.failed > 0) {
    console.error(
      `[Re-Encryption] ABORTING: ${result.failed} records failed verification. Database was NOT modified.`
    );
    return result;
  }

  // Step 4: Batch update records in DB
  console.log(`[Re-Encryption] Applying verified updates for ${updates.length} records...`);
  for (const item of updates) {
    await db
      .update(orderDeliveries)
      .set({ encryptedPayload: item.newPayload })
      .where(eq(orderDeliveries.id, item.id));
    result.migrated++;
  }

  console.log(
    `[Re-Encryption] Complete! Migrated: ${result.migrated}, Already on new key: ${result.alreadyUsingNewKey}, Total: ${result.total}.`
  );

  return result;
}

// Allow direct CLI execution: tsx packages/db/scripts/re-encrypt-deliveries.ts
const isMain = process.argv[1] && (
  process.argv[1].endsWith("re-encrypt-deliveries.ts") ||
  process.argv[1].endsWith("re-encrypt-deliveries.js")
);
if (isMain) {
  const targetNewKey = process.env.DELIVERY_ENCRYPTION_KEY || process.argv[2];
  const sourceOldKey = process.env.OLD_DELIVERY_ENCRYPTION_KEY || process.argv[3] || "arena-store-default-dev-encryption-key-32bytes!";

  if (!targetNewKey) {
    console.error("Usage: tsx re-encrypt-deliveries.ts <NEW_KEY> [OLD_KEY]");
    console.error("Or set DELIVERY_ENCRYPTION_KEY in .env");
    process.exit(1);
  }

  reEncryptDeliveries(sourceOldKey, targetNewKey)
    .then((res) => {
      if (res.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Re-Encryption] Fatal error:", err);
      process.exit(1);
    });
}
