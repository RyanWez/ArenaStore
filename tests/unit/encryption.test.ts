import { describe, it, expect } from "vitest";
import { encryptPayload, decryptPayload } from "../../apps/api/src/services/encryption";

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
});
