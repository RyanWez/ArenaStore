// Must stay the first import: Sentry instrumentation has to initialize
// before Fastify and its diagnostics-channel hooks load (see instrument.ts).
import "./instrument";
import { closeSentry } from "./instrument";
import * as Sentry from "@sentry/node";
import { buildServer } from "./server";
import { config } from "./config";
import { closeDb } from "@arena/db";

// Last-resort fault handlers. An uncaught exception means unknown process
// state, so log, flush Sentry, and exit — Render restarts the service. A
// stray unhandled rejection (e.g. a failed notification) only gets logged so
// one bad promise cannot take checkout down for every customer.
process.on("uncaughtException", (err) => {
  console.error("[API] Uncaught exception:", err);
  Sentry.captureException(err);
  void closeSentry();
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[API] Unhandled promise rejection:", reason);
  Sentry.captureException(reason);
});

async function main() {
  const server = await buildServer();

  try {
    const address = await server.listen({
      port: config.PORT,
      host: config.HOST,
    });
    console.log(`🚀 Arena Store API server listening at ${address}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}, gracefully shutting down...`);
      await server.close();
      await closeDb();
      await closeSentry();
      process.exit(0);
    });
  }
}

void main().catch((err) => {
  console.error("[API] Fatal error during startup:", err);
  process.exit(1);
});
