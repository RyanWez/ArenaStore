import { config } from "../config";
import crypto from "node:crypto";

export interface CreateMmpayPaymentParams {
  orderId: string;
  amountMmk: number;
  callbackUrl?: string;
  customMessage?: string;
}

export interface MmpayPaymentResponse {
  orderId: string;
  amount: number;
  currency: string;
  transactionRefId: string;
  vendorQrRefId: string;
  qr: string;
  createdAt: string;
}

/** Status a payment can report when queried from the gateway. */
export type MmpayGatewayStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED";

export interface MmpayPaymentStatus {
  orderId: string;
  status: MmpayGatewayStatus;
  /** Present on a `payment-show` response; may be absent on lightweight polls. */
  amount?: number;
  currency?: string;
  transactionRefId?: string;
  vendorQrRefId?: string;
}

const KNOWN_GATEWAY_STATUSES: readonly MmpayGatewayStatus[] = [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
];

export class MmpayService {
  private get isConfigured(): boolean {
    return Boolean(config.MMPAY_PUBLISHABLE_KEY && config.MMPAY_SECRET_KEY);
  }

  /** Whether real MMPay credentials are present (gateway calls are possible). */
  get ready(): boolean {
    return this.isConfigured;
  }

  private get isSandbox(): boolean {
    return (
      config.MMPAY_PUBLISHABLE_KEY.includes("_test_") ||
      config.MMPAY_SECRET_KEY.includes("_test_")
    );
  }

  private get baseUrl(): string {
    return config.MMPAY_API_BASE_URL.replace(/\/+$/, "");
  }

  /**
   * Server-to-server request signature, matching the official mmpay-node-sdk:
   * HMAC-SHA256 of `${nonce}.${bodyString}` with the SECRET key, sent as
   * X-Mmpay-Nonce + X-Mmpay-Signature on every gateway call.
   */
  private signHeaders(bodyString: string, nonce: string): Record<string, string> {
    const signature = crypto
      .createHmac("sha256", config.MMPAY_SECRET_KEY)
      .update(`${nonce}.${bodyString}`)
      .digest("hex");
    return { "X-Mmpay-Nonce": nonce, "X-Mmpay-Signature": signature };
  }

  /**
   * The production `/xpayments/*` endpoints gate every call on an HTTPS `Origin`
   * header: with none (or an http:// one) the gateway answers R0004 "Origin
   * Requires SSL"; with one whose host is not allowed it answers R0003 "Origin
   * Whitelist Not Allowed". Our application leaves the browser Origin whitelist
   * open, so ANY https origin is accepted — we send our own public API origin.
   * Sandbox does not enforce this, so on dev/sandbox an empty PUBLIC_API_URL
   * simply sends no Origin header.
   */
  private get originHeader(): Record<string, string> {
    const raw = config.PUBLIC_API_URL;
    if (!raw) return {};
    try {
      const { origin } = new URL(raw);
      return origin.startsWith("https://") ? { Origin: origin } : {};
    } catch {
      return {};
    }
  }

  /**
   * Turns a gateway handshake rejection into an actionable message. R0004/R0003
   * are Origin-header errors (see originHeader): in practice R0004 means
   * PUBLIC_API_URL is missing/non-https on this host, R0003 means its host is not
   * on the application's Origin whitelist. R0002 means the publishable key/appId
   * does not match a live application.
   */
  private describeHandshakeFailure(status: number, body: string): string {
    const base = `MMPay handshake failed (HTTP ${status}): ${body}`;
    if (/R0004/.test(body)) {
      return `${base} — the production gateway requires an HTTPS Origin header. Set PUBLIC_API_URL to this service's public https URL (e.g. https://arena.ryanwez.com).`;
    }
    if (/R0003/.test(body)) {
      return `${base} — the Origin we sent is not on the MMPay application's Origin whitelist. Add PUBLIC_API_URL's host, or clear the whitelist to allow any origin.`;
    }
    if (/R0002/.test(body)) {
      return `${base} — the publishable key/appId was rejected. Verify MMPAY_PUBLISHABLE_KEY and MMPAY_APP_ID match the live MyanMyanPay application.`;
    }
    return base;
  }

  /** Guard: production gateway calls are impossible without an HTTPS Origin. */
  private assertProductionOrigin(): void {
    if (!this.isSandbox && !this.originHeader.Origin) {
      throw new Error(
        "MMPay production calls require an HTTPS Origin header, but PUBLIC_API_URL is unset or not https. " +
          "Set PUBLIC_API_URL to this service's public https URL (e.g. https://arena.ryanwez.com)."
      );
    }
  }

  /**
   * Generates a dynamic MMQR payment request with MyanMyanPay gateway.
   * Performs the required JWT token handshake first, then creates the payment.
   */
  async createPayment(params: CreateMmpayPaymentParams): Promise<MmpayPaymentResponse> {
    if (!this.isConfigured) {
      throw new Error("MyanMyanPay credentials are not configured in environment.");
    }

    const envPrefix = this.isSandbox ? "sandbox" : "production";
    this.assertProductionOrigin();

    // 1. Handshake to obtain one-time authorization token (signed as a server).
    const hsNonce = Date.now().toString();
    const hsBody = JSON.stringify({ orderId: params.orderId, nonce: hsNonce });
    const tokenEndpoint = `${this.baseUrl}/xpayments/${envPrefix}-token-request`;
    const tokenRes = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        ...this.originHeader,
        ...this.signHeaders(hsBody, hsNonce),
      },
      body: hsBody,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(this.describeHandshakeFailure(tokenRes.status, errText));
    }

    const { token } = (await tokenRes.json()) as { token: string };
    if (!token) {
      throw new Error("MMPay handshake did not return authorization token.");
    }

    // 2. Create Payment Instance (signed as a server).
    const createNonce = Date.now().toString();
    const createBody = JSON.stringify({
      orderId: params.orderId,
      amount: params.amountMmk,
      currency: "MMK",
      nonce: createNonce,
      callbackUrl: params.callbackUrl,
      customMessage: params.customMessage,
    });
    const createEndpoint = `${this.baseUrl}/xpayments/${envPrefix}-payment-create`;
    const createRes = await fetch(createEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        "X-Mmpay-Btoken": token,
        ...this.originHeader,
        ...this.signHeaders(createBody, createNonce),
      },
      body: createBody,
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(this.describeHandshakeFailure(createRes.status, errText));
    }

    const data = (await createRes.json()) as MmpayPaymentResponse;
    if (!data.qr) {
      throw new Error("MMPay did not return an MMQR payload in response.");
    }

    return data;
  }

  /**
   * Queries the current status of an existing payment from the gateway.
   *
   * Mirrors the create flow's token handshake, then calls `payment-show`
   * (full retrieve — includes amount + currency, which the amount/currency
   * guard needs). This is the backend reconciliation-by-pull used as the
   * safety net when a webhook was never delivered. Throws on transport / HTTP
   * errors so the caller can log and retry on the next sweep tick.
   */
  async getPaymentStatus(orderId: string): Promise<MmpayPaymentStatus> {
    if (!this.isConfigured) {
      throw new Error("MyanMyanPay credentials are not configured in environment.");
    }
    if (!orderId) {
      throw new Error("getPaymentStatus requires an orderId.");
    }

    const envPrefix = this.isSandbox ? "sandbox" : "production";
    this.assertProductionOrigin();

    // 1. Handshake for a fresh one-time authorization token (signed as a server).
    const hsNonce = Date.now().toString();
    const hsBody = JSON.stringify({ orderId, nonce: hsNonce });
    const tokenEndpoint = `${this.baseUrl}/xpayments/${envPrefix}-token-request`;
    const tokenRes = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        ...this.originHeader,
        ...this.signHeaders(hsBody, hsNonce),
      },
      body: hsBody,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`MMPay status handshake failed (HTTP ${tokenRes.status}): ${errText}`);
    }

    const { token } = (await tokenRes.json()) as { token?: string };
    if (!token) {
      throw new Error("MMPay status handshake did not return authorization token.");
    }

    // 2. Retrieve the payment (signed as a server).
    const showNonce = Date.now().toString();
    const showBody = JSON.stringify({ orderId, nonce: showNonce });
    const showEndpoint = `${this.baseUrl}/xpayments/${envPrefix}-payment-show`;
    const showRes = await fetch(showEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        "X-Mmpay-Btoken": token,
        ...this.originHeader,
        ...this.signHeaders(showBody, showNonce),
      },
      body: showBody,
    });

    if (!showRes.ok) {
      const errText = await showRes.text();
      throw new Error(`MMPay payment-show failed (HTTP ${showRes.status}): ${errText}`);
    }

    const data = (await showRes.json()) as Record<string, unknown>;
    const rawStatus = String(data.status ?? "").toUpperCase();
    if (!KNOWN_GATEWAY_STATUSES.includes(rawStatus as MmpayGatewayStatus)) {
      throw new Error(`MMPay payment-show returned unrecognized status: "${rawStatus}"`);
    }

    const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);

    return {
      orderId: typeof data.orderId === "string" ? data.orderId : orderId,
      status: rawStatus as MmpayGatewayStatus,
      amount: Number.isFinite(amount) ? amount : undefined,
      currency: typeof data.currency === "string" ? data.currency : undefined,
      transactionRefId:
        typeof data.transactionRefId === "string" ? data.transactionRefId : undefined,
      vendorQrRefId: typeof data.vendorQrRefId === "string" ? data.vendorQrRefId : undefined,
    };
  }

  /**
   * Verifies incoming webhook HMAC-SHA256 signature against MMPAY_SECRET_KEY.
   * Uses timing-safe buffer comparison to prevent timing attacks.
   */
  verifyWebhookSignature(rawBody: string, nonce: string, signature: string): boolean {
    if (!rawBody || !nonce || !signature || !config.MMPAY_SECRET_KEY) {
      return false;
    }

    const stringToSign = `${nonce}.${rawBody}`;
    const expectedHash = crypto
      .createHmac("sha256", config.MMPAY_SECRET_KEY)
      .update(stringToSign)
      .digest("hex");

    if (expectedHash.length !== signature.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(signature));
  }
}

export const mmpayService = new MmpayService();
