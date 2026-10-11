import type { FastifyInstance } from "fastify";

/**
 * Registers a scoped `application/json` body parser that preserves the exact
 * raw request bytes on `request.rawBody` while still parsing JSON into
 * `request.body` as usual.
 *
 * Webhook HMAC signatures must be verified over the raw bytes the sender
 * signed. Re-serializing the Fastify-parsed object with `JSON.stringify` can
 * change key order, whitespace, number formatting and unicode escaping, so the
 * recomputed HMAC would not match the sender's — silently rejecting legitimate
 * webhooks. Capturing the raw body is the only correct input for verification.
 *
 * The parser is encapsulated to the plugin scope it is registered in, so it
 * only affects that plugin's routes and never changes global body parsing.
 */
export function registerRawJsonBodyParser(server: FastifyInstance): void {
  server.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      const raw = (body as Buffer).toString("utf8");
      (req as unknown as { rawBody: string }).rawBody = raw;
      if (!raw) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    }
  );
}
