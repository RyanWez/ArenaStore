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
   * Maps a gateway rejection to actionable guidance. The server API uses the
   * KA* (API-key layer) and BA* (JWT/Btoken layer) error families. The R000x
   * codes are the BROWSER-SDK Origin errors — seeing one means MMPAY_API_BASE_URL
   * points at the browser host (bbapi) instead of the server host.
   */
  private describeFailure(stage: string, status: number, body: string): string {
    const base = `MMPay ${stage} failed (HTTP ${status}): ${body}`;
    if (/KA0001/.test(body))
      return `${base} — Bearer token missing; check MMPAY_PUBLISHABLE_KEY is set.`;
    if (/KA0002/.test(body))
      return `${base} — the publishable key is not LIVE; activate the application or use the live key.`;
    if (/KA0003/.test(body))
      return `${base} — signature mismatch; verify MMPAY_SECRET_KEY matches the application.`;
    if (/KA0005/.test(body))
      return `${base} — this server's IP is not on the application's IP whitelist.`;
    if (/BA00[0-2]/.test(body))
      return `${base} — handshake Btoken/nonce rejected (the create/get nonce must equal the handshake nonce).`;
    if (/R000?[0-9]/.test(body))
      return `${base} — this is a BROWSER-SDK Origin error, which means MMPAY_API_BASE_URL is the browser host. Set it to the server host https://ezapi.myanmyanpay.com.`;
    return base;
  }

  /**
   * Generates a dynamic MMQR payment request with MyanMyanPay gateway.
   * Performs the required JWT token handshake first, then creates the payment.
   */
  async createPayment(params: CreateMmpayPaymentParams): Promise<MmpayPaymentResponse> {
    if (!this.isConfigured) {
      throw new Error("MyanMyanPay credentials are not configured in environment.");
    }

    // Production segments are bare (`handshake`/`create`); sandbox keys use the
    // `sandbox-` prefix. One nonce is shared by the handshake and the create: the
    // handshake Btoken embeds this nonce and the create's X-Mmpay-Nonce must equal
    // it, or the gateway rejects with BA002 "Btoken nonce mismatch".
    const seg = this.isSandbox ? "sandbox-" : "";
    const nonce = Date.now().toString();

    // 1. Handshake to obtain the one-time Btoken.
    const hsBody = JSON.stringify({ orderId: params.orderId, nonce });
    const tokenRes = await fetch(`${this.baseUrl}/payments/${seg}handshake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        ...this.signHeaders(hsBody, nonce),
      },
      body: hsBody,
    });

    if (!tokenRes.ok) {
      throw new Error(this.describeFailure("handshake", tokenRes.status, await tokenRes.text()));
    }

    const { token } = (await tokenRes.json()) as { token: string };
    if (!token) {
      throw new Error("MMPay handshake did not return authorization token.");
    }

    // 2. Create the payment with the SAME nonce + the Btoken.
    const createBody = JSON.stringify({
      appId: config.MMPAY_APP_ID,
      amount: params.amountMmk,
      orderId: params.orderId,
      callbackUrl: params.callbackUrl,
      customMessage: params.customMessage,
      nonce,
    });
    const createRes = await fetch(`${this.baseUrl}/payments/${seg}create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        "X-Mmpay-Btoken": token,
        ...this.signHeaders(createBody, nonce),
      },
      body: createBody,
    });

    if (!createRes.ok) {
      throw new Error(this.describeFailure("payment create", createRes.status, await createRes.text()));
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

    const seg = this.isSandbox ? "sandbox-" : "";
    const nonce = Date.now().toString();

    // 1. Handshake for a fresh one-time Btoken (same nonce reused on get → BA002 otherwise).
    const hsBody = JSON.stringify({ orderId, nonce });
    const tokenRes = await fetch(`${this.baseUrl}/payments/${seg}handshake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        ...this.signHeaders(hsBody, nonce),
      },
      body: hsBody,
    });

    if (!tokenRes.ok) {
      throw new Error(this.describeFailure("status handshake", tokenRes.status, await tokenRes.text()));
    }

    const { token } = (await tokenRes.json()) as { token?: string };
    if (!token) {
      throw new Error("MMPay status handshake did not return authorization token.");
    }

    // 2. Retrieve the payment with the SAME nonce + the Btoken.
    const getBody = JSON.stringify({ orderId, nonce });
    const showRes = await fetch(`${this.baseUrl}/payments/${seg}get`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        "X-Mmpay-Btoken": token,
        ...this.signHeaders(getBody, nonce),
      },
      body: getBody,
    });

    if (!showRes.ok) {
      throw new Error(this.describeFailure("payment get", showRes.status, await showRes.text()));
    }

    const data = (await showRes.json()) as Record<string, unknown>;
    const rawStatus = String(data.status ?? "").toUpperCase();
    if (!KNOWN_GATEWAY_STATUSES.includes(rawStatus as MmpayGatewayStatus)) {
      throw new Error(`MMPay payment get returned unrecognized status: "${rawStatus}"`);
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
