import { xproClient, digitalcoreClient, aivaulthubClient } from "./xpro-client";
import { notifyLowSupplierBalance } from "./telegram-notifier";
import { getDb, appSettings } from "@arena/db";
import { eq } from "drizzle-orm";
import { getEnabledSuppliers } from "../config";

export interface BalanceCheckResult {
  supplier: string;
  balanceUsd: string;
  thresholdUsd: number;
  alertSent: boolean;
}

export class SupplierBalanceMonitor {
  private alertedSuppliers = new Set<string>();

  /**
   * Checks balances for all enabled suppliers against the configured threshold.
   * Coalesced: only alerts when dropping below threshold; re-arms when recovering.
   */
  async checkBalances(thresholdUsd: number = 5.0): Promise<{
    XPRO?: BalanceCheckResult;
    DIGITALCORE?: BalanceCheckResult;
    AIVAULTHUB?: BalanceCheckResult;
  }> {
    const results: {
      XPRO?: BalanceCheckResult;
      DIGITALCORE?: BalanceCheckResult;
      AIVAULTHUB?: BalanceCheckResult;
    } = {};

    // Dynamic threshold from DB if set
    let effectiveThreshold = thresholdUsd;
    try {
      const db = getDb();
      const [row] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, "supplier.balanceAlertThresholdUsd"));
      if (row && row.value) {
        const parsed = parseFloat(row.value);
        if (!isNaN(parsed) && parsed > 0) {
          effectiveThreshold = parsed;
        }
      }
    } catch {
      // Keep passed threshold
    }

    // Check XPRO
    try {
      const xproBal = await xproClient.getBalance();
      const balNum = parseFloat(xproBal.balanceUsd);
      if (!isNaN(balNum)) {
        if (balNum < effectiveThreshold) {
          if (!this.alertedSuppliers.has("XPRO")) {
            this.alertedSuppliers.add("XPRO");
            await notifyLowSupplierBalance({
              supplier: "XPRO",
              balanceUsd: xproBal.balanceUsd,
              thresholdUsd: effectiveThreshold,
            });
            results.XPRO = {
              supplier: "XPRO",
              balanceUsd: xproBal.balanceUsd,
              thresholdUsd: effectiveThreshold,
              alertSent: true,
            };
          } else {
            results.XPRO = {
              supplier: "XPRO",
              balanceUsd: xproBal.balanceUsd,
              thresholdUsd: effectiveThreshold,
              alertSent: false,
            };
          }
        } else {
          // Recovered above threshold -> re-arm
          this.alertedSuppliers.delete("XPRO");
          results.XPRO = {
            supplier: "XPRO",
            balanceUsd: xproBal.balanceUsd,
            thresholdUsd: effectiveThreshold,
            alertSent: false,
          };
        }
      }
    } catch (err: any) {
      console.warn("[BalanceMonitor] Failed to fetch XPro balance:", err.message);
    }

    // Check DIGITALCORE
    try {
      const dcBal = await digitalcoreClient.getBalance();
      const balNum = parseFloat(dcBal.balanceUsd);
      if (!isNaN(balNum)) {
        if (balNum < effectiveThreshold) {
          if (!this.alertedSuppliers.has("DIGITALCORE")) {
            this.alertedSuppliers.add("DIGITALCORE");
            await notifyLowSupplierBalance({
              supplier: "DIGITALCORE",
              balanceUsd: dcBal.balanceUsd,
              thresholdUsd: effectiveThreshold,
            });
            results.DIGITALCORE = {
              supplier: "DIGITALCORE",
              balanceUsd: dcBal.balanceUsd,
              thresholdUsd: effectiveThreshold,
              alertSent: true,
            };
          } else {
            results.DIGITALCORE = {
              supplier: "DIGITALCORE",
              balanceUsd: dcBal.balanceUsd,
              thresholdUsd: effectiveThreshold,
              alertSent: false,
            };
          }
        } else {
          // Recovered above threshold -> re-arm
          this.alertedSuppliers.delete("DIGITALCORE");
          results.DIGITALCORE = {
            supplier: "DIGITALCORE",
            balanceUsd: dcBal.balanceUsd,
            thresholdUsd: effectiveThreshold,
            alertSent: false,
          };
        }
      }
    } catch (err: any) {
      console.warn("[BalanceMonitor] Failed to fetch DigitalCore balance:", err.message);
    }

    // Check AIVAULTHUB if enabled
    if (getEnabledSuppliers().includes("AIVAULTHUB")) {
      try {
        const avhBal = await aivaulthubClient.getBalance();
        const balNum = parseFloat(avhBal.balanceUsd);
        if (!isNaN(balNum)) {
          if (balNum < effectiveThreshold) {
            if (!this.alertedSuppliers.has("AIVAULTHUB")) {
              this.alertedSuppliers.add("AIVAULTHUB");
              await notifyLowSupplierBalance({
                supplier: "AIVAULTHUB",
                balanceUsd: avhBal.balanceUsd,
                thresholdUsd: effectiveThreshold,
              });
              results.AIVAULTHUB = {
                supplier: "AIVAULTHUB",
                balanceUsd: avhBal.balanceUsd,
                thresholdUsd: effectiveThreshold,
                alertSent: true,
              };
            } else {
              results.AIVAULTHUB = {
                supplier: "AIVAULTHUB",
                balanceUsd: avhBal.balanceUsd,
                thresholdUsd: effectiveThreshold,
                alertSent: false,
              };
            }
          } else {
            // Recovered above threshold -> re-arm
            this.alertedSuppliers.delete("AIVAULTHUB");
            results.AIVAULTHUB = {
              supplier: "AIVAULTHUB",
              balanceUsd: avhBal.balanceUsd,
              thresholdUsd: effectiveThreshold,
              alertSent: false,
            };
          }
        }
      } catch (err: any) {
        console.warn("[BalanceMonitor] Failed to fetch AIVaultHub balance:", err.message);
      }
    }

    return results;
  }

  isAlerted(supplier: string): boolean {
    return this.alertedSuppliers.has(supplier.toUpperCase());
  }

  reset(): void {
    this.alertedSuppliers.clear();
  }
}

export const supplierBalanceMonitor = new SupplierBalanceMonitor();
