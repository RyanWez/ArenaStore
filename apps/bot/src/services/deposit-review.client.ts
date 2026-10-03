import { botConfig } from "../config";

/** Successful review — carries the details needed to re-render the group caption. */
export interface DepositReviewApiOk {
  ok: true;
  action: "APPROVED" | "REJECTED";
  reference: string;
  amountMmk: number;
  customerLabel: string;
  telegramId: string;
}

export type DepositReviewApiResult =
  | DepositReviewApiOk
  | {
      ok: false;
      error: "ALREADY_REVIEWED";
      /** Current DB status — "COMPLETED" means approved, "REJECTED" rejected. */
      status: string;
      reference: string;
      amountMmk: number;
      customerLabel: string;
      telegramId: string;
    }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "FAILED" };

interface DepositReviewApiBody {
  action: "APPROVE" | "REJECT";
  actorTelegramId: string;
  actorUsername?: string;
}

interface DepositDetails {
  reference: string;
  amountMmk: number;
  customerLabel: string;
  telegramId: string;
}

function parseDetails(json: any): DepositDetails {
  return {
    reference: String(json?.reference ?? ""),
    amountMmk: Number(json?.amountMmk ?? 0),
    customerLabel: String(json?.customerLabel ?? ""),
    telegramId: String(json?.telegramId ?? ""),
  };
}

/**
 * Calls the API's internal bot endpoint to review a deposit — the bot never
 * touches review logic itself, so panel and group buttons behave identically.
 * One retry rides out transient connection drops; HTTP-level failures are
 * reported as typed results instead of thrown so the callback handler can
 * turn every path into a user-visible toast.
 */
export async function reviewDepositViaApi(params: {
  topUpId: number;
  action: "APPROVE" | "REJECT";
  actorTelegramId: string;
  actorUsername?: string;
}): Promise<DepositReviewApiResult> {
  if (!botConfig.INTERNAL_API_TOKEN || !botConfig.API_BASE_URL) {
    return { ok: false, error: "FAILED" };
  }

  const url = `${botConfig.API_BASE_URL.replace(/\/+$/, "")}/api/bot/deposits/${params.topUpId}/review`;
  const body: DepositReviewApiBody = {
    action: params.action,
    actorTelegramId: params.actorTelegramId,
    ...(params.actorUsername ? { actorUsername: params.actorUsername } : {}),
  };

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": botConfig.INTERNAL_API_TOKEN,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      const json: any = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        return {
          ok: true,
          action: json.action === "APPROVED" ? "APPROVED" : "REJECTED",
          ...parseDetails(json),
        };
      }
      if (res.status === 409 && json?.status) {
        return {
          ok: false,
          error: "ALREADY_REVIEWED",
          status: String(json.status),
          ...parseDetails(json),
        };
      }
      if (res.status === 404) {
        return { ok: false, error: "NOT_FOUND" };
      }
      console.error(
        `[DepositReview] API review failed for topup ${params.topUpId}: HTTP ${res.status}`,
        json?.error ?? ""
      );
      return { ok: false, error: "FAILED" };
    } catch (err: any) {
      const cause = err?.cause?.code || err?.cause?.message;
      console.error(
        `[DepositReview] API review network error for topup ${params.topUpId} (attempt ${attempt}):`,
        `${err?.message}${cause ? ` (${cause})` : ""}`
      );
      if (attempt >= 2) {
        return { ok: false, error: "FAILED" };
      }
    }
  }
}
