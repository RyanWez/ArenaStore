import { describe, it, expect } from "vitest";
import {
  encryptPayload,
  decryptPayload,
  formatCredentialsText,
  decryptDeliveryPayload,
  type DeliveryPayloadV2,
} from "../../apps/api/src/services/encryption";

describe("AES-256-GCM Delivery Credentials Encryption", () => {
  const secretKey = "test-secret-encryption-key-32bytes-long!";

  it("encrypts and decrypts a plain text string", () => {
    const original = "my-secret-activation-code-xyz-12345";
    const encrypted = encryptPayload(original, secretKey);

    expect(encrypted).not.toBe(original);
    expect(encrypted.split(":")).toHaveLength(3); // iv:tag:cipher

    const decrypted = decryptPayload<string>(encrypted, secretKey);
    expect(decrypted).toBe(original);
  });

  it("encrypts and decrypts structured array of account credentials", () => {
    const accounts = [
      "user1@gmail.com:password123",
      "user2@gmail.com:password456",
      "https://gemini.google.com/redeem?token=abcdef",
    ];

    const encrypted = encryptPayload(accounts, secretKey);
    const decrypted = decryptPayload<string[]>(encrypted, secretKey, true);

    expect(decrypted).toEqual(accounts);
  });

  it("encrypts and decrypts DeliveryPayloadV2 with viewUrl and supplier", () => {
    const v2: DeliveryPayloadV2 = {
      v: 2,
      lines: ["https://notion.com/redeem/abc12345"],
      viewUrl: "https://digitalcore.top/order?id=123",
      supplier: "DIGITALCORE",
    };

    const encrypted = encryptPayload(v2, secretKey);
    const result = decryptDeliveryPayload(encrypted, secretKey);

    expect(result.lines).toEqual(["https://notion.com/redeem/abc12345"]);
    expect(result.viewUrl).toBe("https://digitalcore.top/order?id=123");
    expect(result.supplier).toBe("DIGITALCORE");
    expect(result.rawText).toBe("https://notion.com/redeem/abc12345");
  });

  it("decryptDeliveryPayload handles legacy v1 string[] payloads (backward compatibility)", () => {
    const legacyV1 = ["account1@gmail.com:pass1", "account2@gmail.com:pass2"];
    const encrypted = encryptPayload(legacyV1, secretKey);

    const result = decryptDeliveryPayload(encrypted, secretKey);
    expect(result.lines).toEqual(legacyV1);
    expect(result.viewUrl).toBeUndefined();
    expect(result.supplier).toBeUndefined();
    expect(result.rawText).toBe("account1@gmail.com:pass1\naccount2@gmail.com:pass2");
  });

  it("produces unique ciphertexts for identical inputs due to random IV", () => {
    const text = "repeat-secret";
    const enc1 = encryptPayload(text, secretKey);
    const enc2 = encryptPayload(text, secretKey);

    expect(enc1).not.toBe(enc2);
    expect(decryptPayload(enc1, secretKey)).toBe(text);
    expect(decryptPayload(enc2, secretKey)).toBe(text);
  });

  it("fails to decrypt if payload is tampered with", () => {
    const text = "confidential-data";
    const encrypted = encryptPayload(text, secretKey);
    const parts = encrypted.split(":");

    // Alter ciphertext
    const tamperedCipher = parts[2].slice(0, -2) + (parts[2].endsWith("a") ? "b" : "a");
    const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedCipher}`;

    expect(() => decryptPayload(tamperedPayload, secretKey)).toThrow();
  });

  it("fails to decrypt with a different secret key", () => {
    const text = "confidential-data";
    const encrypted = encryptPayload(text, secretKey);
    const wrongKey = "wrong-different-secret-key-32bytes!!";

    expect(() => decryptPayload(encrypted, wrongKey)).toThrow();
  });

  it("successfully migrates payload from old key to new key without data loss", () => {
    const oldKey = "arena-store-default-dev-encryption-key-32bytes!";
    const newKey = "new-random-secure-encryption-key-32bytes-hex!!";
    const sensitiveCredentials = "netflix_user@arena.mm:SuperSecretPass2026!";

    // Encrypt with old key
    const oldEncrypted = encryptPayload(sensitiveCredentials, oldKey);
    expect(decryptPayload(oldEncrypted, oldKey)).toBe(sensitiveCredentials);

    // Re-encrypt to new key
    const decryptedWithOld = decryptPayload(oldEncrypted, oldKey);
    const newEncrypted = encryptPayload(decryptedWithOld, newKey);

    // Verify new key succeeds and old key fails on new ciphertext
    expect(decryptPayload(newEncrypted, newKey)).toBe(sensitiveCredentials);
    expect(() => decryptPayload(newEncrypted, oldKey)).toThrow();
  });

  describe("formatCredentialsText", () => {
    it("formats DeliveryPayloadV2 object correctly", () => {
      const v2 = {
        v: 2,
        lines: ["https://notion.com/redeem/abc12345", "https://notion.com/redeem/def67890"],
        viewUrl: "https://digitalcore.top/order?id=123",
      };
      expect(formatCredentialsText(v2)).toBe(
        "https://notion.com/redeem/abc12345\nhttps://notion.com/redeem/def67890"
      );
    });

    it("strips JSON array brackets and quotes from single-line URL", () => {
      const raw = '["https://serviceactivationgoogle.com/subscription/new/abc12345"]';
      expect(formatCredentialsText(raw)).toBe(
        "https://serviceactivationgoogle.com/subscription/new/abc12345"
      );
    });

    it("formats array of multiple lines with newline separation", () => {
      const raw = '["https://link1.com", "https://link2.com"]';
      expect(formatCredentialsText(raw)).toBe("https://link1.com\nhttps://link2.com");
    });

    it("strips wrapping quotes from a raw quoted string", () => {
      const raw = '"https://serviceactivationgoogle.com/test"';
      expect(formatCredentialsText(raw)).toBe("https://serviceactivationgoogle.com/test");
    });

    it("leaves standard plain text credentials intact", () => {
      const raw = "user: buyer@example.com\npass: Secret123!";
      expect(formatCredentialsText(raw)).toBe("user: buyer@example.com\npass: Secret123!");
    });
  });
});
