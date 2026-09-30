import { usdToCents } from "./money";

export interface StockCalculationParams {
  /** Real-time stock available from upstream supplier */
  supplierStock: number;
  /** Our current wallet balance in USD (string or number) */
  supplierWalletBalanceUsd: string | number;
  /** Upstream product unit cost in USD (string or number) */
  unitCostUsd: string | number;
  /** Store manager local cap / limit on sales (optional) */
  localLimit?: number | null;
  /** Number of units currently reserved by customers undergoing checkout */
  activeReservedUnits?: number;
}

/**
 * Calculates the exact number of units Arena Store can safely sell to customers.
 *
 * It ensures:
 * 1. We don't sell more than the supplier physically has.
 * 2. We don't sell more than our upstream USD wallet can afford to purchase.
 * 3. We don't exceed the store owner's local selling cap.
 * 4. We subtract pending reservations so concurrent customers don't oversell.
 * 5. The result is never negative (clamped at 0).
 */
export function calculateSellableStock(params: StockCalculationParams): {
  sellableStock: number;
  walletCapacity: number;
  isWalletConstrained: boolean;
  isSupplierConstrained: boolean;
  isLocalLimitConstrained: boolean;
} {
  const {
    supplierStock,
    supplierWalletBalanceUsd,
    unitCostUsd,
    localLimit,
    activeReservedUnits = 0,
  } = params;

  const walletCents = usdToCents(supplierWalletBalanceUsd);
  const unitCents = usdToCents(unitCostUsd);

  const walletCapacity = unitCents > 0 ? Math.floor(walletCents / unitCents) : 0;
  const safeSupplierStock = Math.max(0, Math.floor(supplierStock));
  const safeLocalLimit =
    localLimit !== null && localLimit !== undefined && localLimit >= 0
      ? Math.floor(localLimit)
      : Infinity;

  const rawAvailable = Math.min(safeSupplierStock, walletCapacity, safeLocalLimit);
  const remainingAfterReservations = rawAvailable - Math.max(0, activeReservedUnits);
  const sellableStock = Math.max(0, remainingAfterReservations);

  return {
    sellableStock,
    walletCapacity,
    isWalletConstrained: walletCapacity < safeSupplierStock,
    isSupplierConstrained: safeSupplierStock <= walletCapacity && safeSupplierStock <= safeLocalLimit,
    isLocalLimitConstrained: safeLocalLimit < safeSupplierStock && safeLocalLimit < walletCapacity,
  };
}
