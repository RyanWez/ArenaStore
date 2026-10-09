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

export class MmpayService {
  private get isConfigured(): boolean {
    return Boolean(config.MMPAY_PUBLISHABLE_KEY && config.MMPAY_SECRET_KEY);
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
