/**
 * Money utilities for Arena Store.
 *
 * Rules:
 * 1. MMK is always treated as an integer amount in whole Kyats (never floats).
 * 2. USD is internally converted to integer cents to avoid floating-point math bugs.
 */

/**
 * Converts a USD string or number (e.g., "0.69" or 0.69) to integer cents (69).
 */
export function usdToCents(usd: string | number): number {
  const num = typeof usd === "string" ? parseFloat(usd) : usd;
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid USD amount: ${usd}`);
  }
  return Math.round(num * 100);
}

/**
 * Converts integer USD cents (e.g., 69) to formatted decimal string ("0.69").
 */
export function centsToUsdString(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid USD cents: ${cents}`);
  }
  return (cents / 100).toFixed(2);
}

/**
 * Converts any MMK value to a strict integer Kyat unit.
 */
export function toIntegerMmk(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid MMK amount: ${amount}`);
  }
  return Math.round(amount);
}

export interface PricingOptions {
  /** Upstream USD cost (e.g., 0.69 or "0.69") */
  upstreamUsdCost: number | string;
  /** Current exchange rate in MMK per 1 USD (e.g., 4600) */
  exchangeRateMmk: number;
  /** Desired profit margin percentage (e.g., 25 for 25%) */
  marginPercentage?: number;
  /** Optional fixed handling fee in MMK (e.g., 500) */
  fixedFeeMmk?: number;
  /** Round up to nearest (default: 100, e.g., 450 -> 500, 1490 -> 1500) */
  roundToNearest?: 1 | 10 | 50 | 100 | 500 | 1000;
}

/**
 * Calculates customer MMK retail price from upstream USD cost with margin and exchange rate.
 */
export function calculateRetailMmk(options: PricingOptions): {
  costInMmk: number;
  profitMmk: number;
  retailPriceMmk: number;
} {
  const {
    upstreamUsdCost,
    exchangeRateMmk,
    marginPercentage = 0,
    fixedFeeMmk = 0,
    roundToNearest = 100,
  } = options;

  if (exchangeRateMmk <= 0) {
    throw new Error("Exchange rate must be greater than zero.");
  }

  const cents = usdToCents(upstreamUsdCost);
  // Base cost in MMK = (cents * exchangeRate) / 100
  const costInMmk = Math.round((cents * exchangeRateMmk) / 100);

  // Margin in MMK
  const marginFraction = Math.max(0, marginPercentage) / 100;
  const rawProfit = costInMmk * marginFraction + Math.max(0, fixedFeeMmk);
  const rawTotal = costInMmk + rawProfit;

  // Rounding to nearest step
  const roundedRetail =
    roundToNearest > 1
      ? Math.ceil(rawTotal / roundToNearest) * roundToNearest
      : Math.round(rawTotal);

  const profitMmk = roundedRetail - costInMmk;

  return {
    costInMmk,
    profitMmk,
    retailPriceMmk: roundedRetail,
  };
}

/**
 * Formats an integer MMK amount with comma separation (e.g., 3500 -> "3,500 Ks").
 */
export function formatMmk(amount: number, suffix: string = "Ks"): string {
  const rounded = toIntegerMmk(amount);
  return `${rounded.toLocaleString("en-US")} ${suffix}`.trim();
}
