import * as dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

import { authService } from "../../../apps/api/src/services/auth.service";
import { catalogService } from "../../../apps/api/src/services/catalog.service";
import { closeDb } from "../src/index";

async function main() {
  console.log("🌱 Seeding initial data to Neon Database...");
  console.log("1. Initializing default admin user...");
  await authService.seedDefaultAdmin();

  console.log("2. Syncing full catalog from upstream partner (XPro)...");
  try {
    const result = await catalogService.syncFullCatalog();
    console.log(`✅ Synced ${result.categories} categories and ${result.products} products to Neon DB!`);
  } catch (err: any) {
    console.error("⚠️ Catalog sync error:", err.message);
  }

  await closeDb();
  console.log("🎉 Neon Database seeding finished successfully!");
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
