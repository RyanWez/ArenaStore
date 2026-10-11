import crypto from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config";

/**
 * Timing-safe comparison of the shared internal-service token. Raw secrets of
 * equal length could leak position-wise through timingSafeEqual, so both sides
 * are hashed to fixed-length digests first. Returns false when either the
 * configured token or the supplied value is missing.
 */
export function internalTokenMatches(supplied: string | undefined): boolean {
  if (!config.INTERNAL_API_TOKEN || !supplied) return false;
  const suppliedHash = crypto.createHash("sha256").update(supplied).digest();
  const expectedHash = crypto.createHash("sha256").update(config.INTERNAL_API_TOKEN).digest();
  return crypto.timingSafeEqual(suppliedHash, expectedHash);
}

/**
 * Guards an internal, server-to-server route (bot -> API). The token is
 * enforced whenever `INTERNAL_API_TOKEN` is configured — in every environment,
 * not only production — so any real deployment rejects unauthenticated callers.
 * A local/dev/test instance with no token configured skips the check (there is
 * nothing to verify against), mirroring the MMPay webhook signature gating.
 *
 * Returns true when the request may proceed. On rejection it sends a 401 and
 * returns false, so callers should `return` immediately when it is false.
 */
export function enforceInternalToken(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.INTERNAL_API_TOKEN) {
    return true;
  }
  const supplied = request.headers["x-internal-token"] as string | undefined;
  if (!internalTokenMatches(supplied)) {
    reply.status(401).send({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}
