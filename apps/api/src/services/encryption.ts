import crypto from "node:crypto";
import { config } from "../config";

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
export function encryptPayload(data: unknown, secretKey: string = config.DELIVERY_ENCRYPTION_KEY): string {
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
  secretKey: string = config.DELIVERY_ENCRYPTION_KEY,
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

export interface DeliveryPayloadV2 {
  v: 2;
  lines: string[];
  viewUrl?: string;
  supplier?: string;
}

/**
 * Decrypts delivery payload with full backward-compatibility for v1 (string[]) and v2.
 */
export function decryptDeliveryPayload(
  encryptedString: string,
  secretKey: string = config.DELIVERY_ENCRYPTION_KEY
): { lines: string[]; viewUrl?: string; supplier?: string; rawText: string } {
  const decrypted = decryptPayload<string>(encryptedString, secretKey);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decrypted);
  } catch {
    return { lines: [decrypted], rawText: decrypted };
  }

  if (parsed && typeof parsed === "object") {
    if ("v" in parsed && (parsed as any).v === 2) {
      const v2 = parsed as DeliveryPayloadV2;
      return {
        lines: v2.lines || [],
        viewUrl: v2.viewUrl,
        supplier: v2.supplier,
        rawText: (v2.lines || []).join("\n"),
      };
    }
    if (Array.isArray(parsed)) {
      return {
        lines: parsed.map(String),
        rawText: parsed.join("\n"),
      };
    }
  }

  return { lines: [decrypted], rawText: decrypted };
}

/**
 * Normalizes credentials into clean, newline-delimited text without JSON brackets,
 * quotes, or escaping (e.g. converts `["https://..."]` or `"https://..."` into `https://...`).
 * Makes it directly copyable for end-users to paste into browsers.
 */
export function formatCredentialsText(raw: unknown): string {
  if (!raw) return "";
  let val = raw;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      try {
        val = JSON.parse(trimmed);
      } catch {
        // Keep as string
      }
    }
  }

  if (typeof val === "object" && val !== null) {
    if ("lines" in val && Array.isArray((val as any).lines)) {
      val = (val as any).lines;
    }
  }

  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === "string") {
          let s = item.trim();
          if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
            try {
              s = JSON.parse(s);
            } catch {
              s = s.slice(1, -1);
            }
          }
          return s;
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof val === "object" && val !== null) {
    return JSON.stringify(val, null, 2);
  }

  let result = String(val).trim();
  if (result.startsWith('"') && result.endsWith('"') && result.length >= 2) {
    try {
      result = JSON.parse(result);
    } catch {
      result = result.slice(1, -1);
    }
  }
  return result;
}
