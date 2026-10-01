import crypto from "node:crypto";
import { botConfig } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12 bytes is standard and optimal for GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes (128 bits) authentication tag

function deriveKey(secretKey: string): Buffer {
  return crypto.createHash("sha256").update(secretKey).digest();
}

/**
 * Encrypts arbitrary text or structured object using AES-256-GCM.
 * Output format: `ivHex:authTagHex:ciphertextHex`
 */
export function encryptPayload(data: unknown, secretKey: string = botConfig.DELIVERY_ENCRYPTION_KEY): string {
  const text = typeof data === "string" ? data : JSON.stringify(data);
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

/**
 * Decrypts a previously encrypted AES-256-GCM string.
 * Returns the decrypted string, or parses JSON if parseJson is true.
 */
export function decryptPayload<T = string>(
  encryptedString: string,
  secretKey: string = botConfig.DELIVERY_ENCRYPTION_KEY,
  parseJson: boolean = false
): T {
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

  if (parseJson) {
    try {
      return JSON.parse(decrypted) as T;
    } catch {
      throw new Error("Decrypted payload is not valid JSON.");
    }
  }

  return decrypted as unknown as T;
}
