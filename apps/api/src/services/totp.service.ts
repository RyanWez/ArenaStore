import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
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

export interface TotpSetupData {
  isEnabled: boolean;
  secret: string;
  uri: string;
  qrDataUrl: string | null;
  issuer: string;
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
   * Generates setup metadata including Base32 secret, otpauth:// URI,
   * and high-resolution QR code data URL for rendering in the Admin UI.
   */
  async getSetupData(accountLabel: string = config.ADMIN_EMAIL): Promise<TotpSetupData> {
    if (!config.ADMIN_TOTP_SECRET) {
      return {
        isEnabled: false,
        secret: "",
        uri: "",
        qrDataUrl: null,
        issuer: TOTP_ISSUER,
      };
    }

    const secret = config.ADMIN_TOTP_SECRET.replace(/\s+/g, "").toUpperCase();
    const uri = this.buildUri(secret, accountLabel);
    const qrDataUrl = await QRCode.toDataURL(uri, {
      width: 280,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });

    return {
      isEnabled: true,
      secret,
      uri,
      qrDataUrl,
      issuer: TOTP_ISSUER,
    };
  },

  /**
   * Verifies a 6-digit code against the configured global secret, tolerating one
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

