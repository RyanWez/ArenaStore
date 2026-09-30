import { buildServer } from "./server";
import { config } from "./config";
import { closeDb } from "@arena/db";

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
      process.exit(0);
    });
  }
}

void main();
