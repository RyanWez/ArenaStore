/**
 * Minimal process supervisor for the single Render web service that hosts
 * both the API and the Telegram bot.
 *
 * Why not `pnpm start & pnpm start`? A shell `&` background job never receives
 * the platform's SIGTERM, so graceful shutdown (bot polling stop, DB close,
 * Sentry flush) never ran on deploys, and one crashed child left the other
 * running as an orphan. This forwards signals to both children and, when one
 * dies unexpectedly, stops the sibling and exits non-zero so the platform
 * restarts the whole pair in a consistent state.
 */
import { spawn } from "node:child_process";

const services = [
  { label: "API", filter: "@arena/api" },
  { label: "Bot", filter: "@arena/bot" },
];

const children = services.map(({ label, filter }) => {
  const proc = spawn("pnpm", ["--filter", filter, "start"], {
    stdio: "inherit",
    env: process.env,
  });
  proc.on("error", (err) => {
    console.error(`[Supervisor] Failed to spawn ${label}: ${err.message}`);
    process.exit(1);
  });
  return { label, proc };
});

let stopping = false;

const stopAll = (signal) => {
  for (const { proc } of children) {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill(signal);
  }
};

process.on("SIGTERM", () => {
  if (!stopping) console.log("[Supervisor] SIGTERM — stopping API and Bot gracefully.");
  stopping = true;
  stopAll("SIGTERM");
});
process.on("SIGINT", () => {
  if (!stopping) console.log("[Supervisor] SIGINT — stopping API and Bot gracefully.");
  stopping = true;
  stopAll("SIGINT");
});

let exited = 0;
let failing = false;

for (const { label, proc } of children) {
  proc.on("exit", (code, signal) => {
    exited += 1;

    if (!stopping && exited < children.length) {
      // One service died unexpectedly — bring the sibling down so the platform
      // restarts the pair instead of running half a system.
      failing = true;
      stopping = true;
      console.error(`[Supervisor] ${label} exited unexpectedly (code=${code ?? signal ?? "?"}). Stopping the remaining service.`);
      stopAll("SIGTERM");
    }

    if (exited === children.length) {
      process.exit(failing ? 1 : 0);
    }
  });
}
