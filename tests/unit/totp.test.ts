import { describe, it, expect, vi, afterEach } from "vitest";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";

/**
 * Unit tests for the TOTP (admin 2FA) service. The service reads its secret
 * from config at import time, so each test re-imports with a stubbed env.
 */

// Classic RFC 4226 sample secret (valid Base32, 32 chars).
const TEST_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

function generateCode(secret = TEST_SECRET): string {
  const totp = new TOTP({
    issuer: "Arena Store",
    label: "admin@arenastore.mm",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.generate();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

async function importService(envSecret?: string) {
  vi.resetModules();
  vi.stubEnv("ADMIN_TOTP_SECRET", envSecret ?? "");
  const mod = await import("../../apps/api/src/services/totp.service");
  return mod.totpService;
}

describe("totp service", () => {
  it("accepts a valid current code when 2FA is configured", async () => {
    const totpService = await importService(TEST_SECRET);
    expect(totpService.isEnabled()).toBe(true);
    expect(totpService.verifyCode(generateCode())).toBe(true);
  });

  it("tolerates spaces and one period of clock drift", async () => {
    const totpService = await importService(TEST_SECRET);
    const code = generateCode();
    expect(totpService.verifyCode(`${code.slice(0, 3)} ${code.slice(3)}`)).toBe(true);

    // A code from one period in the past/future also verifies (window: 1).
    const drifted = new TOTP({
      issuer: "Arena Store",
      label: "admin@arenastore.mm",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(TEST_SECRET),
    });
    const pastOrFutureToken = drifted.generate({
      timestamp: Date.now() + 30_000 * (Date.now() % 30_000 > 15_000 ? -1 : 1),
    });
    expect(totpService.verifyCode(pastOrFutureToken)).toBe(true);
  });

  it("rejects codes from a different secret and malformed input", async () => {
    const totpService = await importService(TEST_SECRET);
    expect(totpService.verifyCode(generateCode("JBSWY3DPEHPK3PXP"))).toBe(false);
    expect(totpService.verifyCode("12345")).toBe(false);
    expect(totpService.verifyCode("abcdef")).toBe(false);
    expect(totpService.verifyCode("")).toBe(false);
  });

  it("passes everything through when 2FA is not configured", async () => {
    const totpService = await importService("");
    expect(totpService.isEnabled()).toBe(false);
    expect(totpService.verifyCode("")).toBe(true);
    expect(totpService.verifyCode("garbage")).toBe(true);
  });


  it("builds valid otpauth URI for QR code generation", async () => {
    const totpService = await importService("");
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const uri = totpService.buildUri(secret, "admin@arenastore.mm");

    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("Arena%20Store");
    expect(uri).toContain(secret);

    const dataUrl = await QRCode.toDataURL(uri);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("returns setup data with high-res QR data URL when 2FA is configured", async () => {
    const totpService = await importService(TEST_SECRET);
    const data = await totpService.getSetupData("admin@arenastore.mm");

    expect(data.isEnabled).toBe(true);
    expect(data.secret).toBe(TEST_SECRET);
    expect(data.uri).toContain("otpauth://totp/");
    expect(data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(data.issuer).toBe("Arena Store");
  });

  it("returns disabled setup data when 2FA is not configured", async () => {
    const totpService = await importService("");
    const data = await totpService.getSetupData("admin@arenastore.mm");

    expect(data.isEnabled).toBe(false);
    expect(data.secret).toBe("");
    expect(data.uri).toBe("");
    expect(data.qrDataUrl).toBeNull();
  });
});

