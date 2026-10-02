#!/usr/bin/env node
/**
 * Admin 2FA enrollment helper.
 *
 * Generates a Base32 TOTP secret, prints the otpauth:// setup key, renders a
 * scannable QR (PNG file + terminal), and shows the exact Render env var to
 * set. The same secret can be passed as an argument to re-print a QR for an
 * existing secret:
 *
 *   pnpm totp:enroll                        # generate a new secret
 *   pnpm totp:enroll admin@arenastore.mm    # label a new secret for this admin
 *   pnpm totp:enroll admin@x.mm JBSWY3DP... # re-print QR for an existing secret
 */
import crypto from "node:crypto";
import path from "node:path";
import QRCode from "qrcode";

const ISSUER = "Arena Store";
const args = process.argv.slice(2);
const email = args.find((a) => !/^[A-Z2-7=]{16,}$/i.test(a)) || "admin@arenastore.mm";
const providedSecret = args.find((a) => /^[A-Z2-7=]{16,}$/i.test(a));

function toBase32(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

const secret = providedSecret || toBase32(crypto.randomBytes(20));

const uri =
  `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(email)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;

console.log("\n=== Arena Store — Admin 2FA enrollment ===\n");
console.log("1) Put this in Render env vars (and local .env) — it enables 2FA:\n");
console.log(`   ADMIN_TOTP_SECRET=${secret}\n`);
console.log("2) Add the secret to Google Authenticator — either scan the QR below,");
console.log("   or choose 'Enter a setup key' and paste:\n");
console.log(`   ${uri}\n`);

// Scannable PNG (gitignored — it encodes the secret).
const outPath = path.resolve("scripts/totp-qr.png");
await QRCode.toFile(outPath, uri, { width: 512, margin: 2 });
console.log(`3) QR image also saved to: ${outPath}\n`);

const terminalQr = await QRCode.toString(uri, { type: "terminal", small: true });
console.log(terminalQr);
console.log("After adding it, verify a code appears and rotates every 30 seconds.");
console.log("Note: 2FA activates on the API only after the env var is set and the service redeploys.\n");
