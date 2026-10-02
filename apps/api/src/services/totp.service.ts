import { TOTP, Secret } from "otpauth";
import { config } from "../config";

const TOTP_ISSUER = "Arena Store";

function buildTotp(secretBase32: string, accountLabel: string): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label: accountLabel,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32.replace(/\s+/g, "").toUpperCase()),
  });
}

/**
 * Time-based one-time password (Google Authenticator & compatible apps).
 * The shared secret comes from the ADMIN_TOTP_SECRET environment variable —
 * unset means 2FA is disabled and verifyCode() passes everything through.
 */
export const totpService = {
  isEnabled(): boolean {
    return Boolean(config.ADMIN_TOTP_SECRET);
  },

  /** otpauth:// URI for authenticator apps (manual entry or QR). */
  buildUri(secretBase32: string, accountLabel: string): string {
    return buildTotp(secretBase32, accountLabel).toString();
  },

  /**
   * Verifies a 6-digit code against the configured secret, tolerating one
   * 30-second period of clock drift in either direction.
   */
  verifyCode(code: string, accountLabel: string = config.ADMIN_EMAIL): boolean {
    if (!config.ADMIN_TOTP_SECRET) return true;

    const clean = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(clean)) return false;

    const delta = buildTotp(config.ADMIN_TOTP_SECRET, accountLabel).validate({
      token: clean,
      window: 1,
    });
    return delta !== null;
  },
};
