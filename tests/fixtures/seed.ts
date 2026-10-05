import { eq } from "drizzle-orm";
import {
  getDb,
  users,
  wallets,
  walletLedger,
  categories,
  products,
  productSupplierSnapshots,
  topUpRequests,
} from "@arena/db";

/**
 * Builders for synthetic test data. Every value is fabricated for tests only —
 * telegramIds use a reserved synthetic range (99…), names are obviously fake,
 * and no real customer or delivery data is ever used (AGENT.md rule 5).
 */

let telegramCounter = 0;

// Per-process randomness so parallel/overlapping Vitest workers can never
// collide on unique columns (slug, upstreamProductId, telegramId).
const PROCESS_TAG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
const UPSTREAM_BASE = 700_000 + Math.floor(Math.random() * 100_000);

/** Synthetic telegramId in a reserved 99-prefix range, unique per call. */
export function syntheticTelegramId(): string {
  telegramCounter += 1;
  const runStamp = (Date.now() % 1_000_000).toString().padStart(6, "0");
  const jitter = Math.floor(Math.random() * 900 + 100);
  return `99${runStamp}${jitter}${telegramCounter.toString().padStart(3, "0")}`;
}

let slugCounter = 0;

export interface SeededCatalog {
  category: { id: number; slug: string };
  product: { id: number; upstreamProductId: string | number };
}

export interface SeedCatalogOptions {
  /** Explicit products.id (used to match the bot's fallback product id). */
  productId?: number;
  upstreamProductId?: string | number;
  slugSuffix?: string;
  priceUsd?: string;
  stock?: number;
  deliveryType?: string;
  retailPriceMmk?: number;
}

/** Inserts one category + product + supplier snapshot triple. */
export async function seedCatalog(options: SeedCatalogOptions = {}): Promise<SeededCatalog> {
  const db = getDb();

  slugCounter += 1;
  const slug = `test-cat-${PROCESS_TAG}-${slugCounter}${options.slugSuffix ? `-${options.slugSuffix}` : ""}`;
  const upstreamProductId = String(options.upstreamProductId ?? UPSTREAM_BASE + slugCounter);

  const [category] = await db
    .insert(categories)
    .values({
      upstreamCategoryId: UPSTREAM_BASE + slugCounter,
      name: `{pe:4963072209334567688} TestCat ${slugCounter}`,
      slug,
      iconEmoji: "4963072209334567688",
      isActive: true,
    })
    .returning();

  const productValues: any = {
    supplier: "XPRO",
    upstreamProductId,
    categoryId: category.id,
    nameMmk: `Test Product ${slugCounter}`,
    descriptionMmk: "Synthetic test product description",
    retailPriceMmk: options.retailPriceMmk ?? 3900,
    isActive: true,
  };
  if (options.productId !== undefined) productValues.id = options.productId;

  const [product] = options.productId !== undefined
    ? await db
        .insert(products)
        .values(productValues)
        .onConflictDoUpdate({
          target: products.id,
          set: {
            retailPriceMmk: options.retailPriceMmk ?? 3900,
            updatedAt: new Date(),
          },
        })
        .returning()
    : await db.insert(products).values(productValues).returning();

  await db
    .insert(productSupplierSnapshots)
    .values({
      productId: product.id,
      supplier: "XPRO",
      upstreamProductId,
      rawName: `Test Product ${slugCounter}`,
      rawDescription: "Synthetic test product description",
      deliveryType: options.deliveryType || "CREDENTIALS",
      supplierPriceUsd: options.priceUsd || "0.69",
      supplierStock: options.stock ?? 50,
      inStock: (options.stock ?? 50) > 0,
    })
    .onConflictDoUpdate({
      target: [productSupplierSnapshots.productId, productSupplierSnapshots.supplier],
      set: {
        supplierStock: options.stock ?? 50,
        inStock: (options.stock ?? 50) > 0,
        syncedAt: new Date(),
      },
    });

  return { category, product };
}

export interface SeededCustomer {
  user: { id: number; telegramId: string };
  wallet: { id: number; balanceMmk: number };
}

/** Inserts a customer user (+wallet) with an optional starting balance. */
export async function seedCustomer(
  telegramId: string,
  balanceMmk = 0
): Promise<SeededCustomer> {
  const db = getDb();

  const [user] = await db
    .insert(users)
    .values({
      telegramId,
      firstName: "Test",
      lastName: "Customer",
      username: `test_user_${telegramId.slice(-5)}`,
      role: "CUSTOMER",
      status: "ACTIVE",
    })
    .returning();

  const [wallet] = await db
    .insert(wallets)
    .values({
      userId: user.id,
      balanceMmk,
      totalDepositedMmk: balanceMmk,
      totalSpentMmk: 0,
    })
    .returning();

  if (balanceMmk > 0) {
    await db.insert(walletLedger).values({
      walletId: wallet.id,
      amountMmk: balanceMmk,
      type: "TOPUP_CREDIT",
      referenceId: `TEST-SEED-${Date.now()}`,
      notes: "Synthetic initial balance for integration tests",
    });
  }

  // Pick only the declared fields; telegramId is non-null by construction —
  // seedCustomer() always inserts a non-empty telegramId above.
  return { user: { id: user.id, telegramId: user.telegramId! }, wallet };
}

/** Inserts a top-up request directly (bypasses bot service state). */
export async function seedTopUpRequest(params: {
  userId: number;
  amountMmk: number;
  status?: "PENDING" | "SUBMITTED";
}): Promise<{ id: number; reference: string }> {
  const db = getDb();
  const [row] = await db
    .insert(topUpRequests)
    .values({
      reference: `TOP-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: params.userId,
      amountMmk: params.amountMmk,
      paymentMethod: "KPAY",
      status: params.status || "SUBMITTED",
      slipFileId: "test-slip-file-id",
    })
    .returning();
  return { id: row.id, reference: row.reference };
}

/** Fetches the current wallet balance for a user. */
export async function getWalletBalance(userId: number): Promise<{
  balanceMmk: number;
  totalDepositedMmk: number;
  totalSpentMmk: number;
}> {
  const db = getDb();
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return {
    balanceMmk: wallet?.balanceMmk ?? 0,
    totalDepositedMmk: wallet?.totalDepositedMmk ?? 0,
    totalSpentMmk: wallet?.totalSpentMmk ?? 0,
  };
}
