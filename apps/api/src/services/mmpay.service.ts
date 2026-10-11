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
   * Generates a dynamic MMQR payment request with MyanMyanPay gateway.
   * Performs the required JWT token handshake first, then creates the payment.
   */
  async createPayment(params: CreateMmpayPaymentParams): Promise<MmpayPaymentResponse> {
    if (!this.isConfigured) {
      throw new Error("MyanMyanPay credentials are not configured in environment.");
    }

    const nonce = Date.now().toString();
    const envPrefix = this.isSandbox ? "sandbox" : "production";

    // 1. Handshake to obtain one-time authorization token
    const tokenEndpoint = `${this.baseUrl}/xpayments/${envPrefix}-token-request`;
    const tokenRes = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        orderId: params.orderId,
        nonce,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`MMPay handshake failed (HTTP ${tokenRes.status}): ${errText}`);
    }

    const { token } = (await tokenRes.json()) as { token: string };
    if (!token) {
      throw new Error("MMPay handshake did not return authorization token.");
    }

    // 2. Create Payment Instance
    const createEndpoint = `${this.baseUrl}/xpayments/${envPrefix}-payment-create`;
    const createRes = await fetch(createEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        "X-Mmpay-Btoken": token,
      },
      body: JSON.stringify({
        orderId: params.orderId,
        amount: params.amountMmk,
        currency: "MMK",
        nonce,
        callbackUrl: params.callbackUrl,
        customMessage: params.customMessage,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`MMPay payment create failed (HTTP ${createRes.status}): ${errText}`);
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

    const nonce = `${Date.now()}_show`;
    const envPrefix = this.isSandbox ? "sandbox" : "production";

    // 1. Handshake for a fresh one-time authorization token (same as create).
    const tokenEndpoint = `${this.baseUrl}/xpayments/${envPrefix}-token-request`;
    const tokenRes = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ orderId, nonce }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`MMPay status handshake failed (HTTP ${tokenRes.status}): ${errText}`);
    }

    const { token } = (await tokenRes.json()) as { token?: string };
    if (!token) {
      throw new Error("MMPay status handshake did not return authorization token.");
    }

    // 2. Retrieve the payment.
    const showEndpoint = `${this.baseUrl}/xpayments/${envPrefix}-payment-show`;
    const showRes = await fetch(showEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.MMPAY_PUBLISHABLE_KEY}`,
        "X-Mmpay-Btoken": token,
      },
      body: JSON.stringify({ orderId, nonce }),
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
