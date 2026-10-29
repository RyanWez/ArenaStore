export * from "./types";
export * from "./errors";
export * from "./xpro";
export * from "./digitalcore";
export * from "./aivaulthub";

import { XProClient } from "./xpro";
import { DigitalCoreClient } from "./digitalcore";
import { AIVaultHubClient } from "./aivaulthub";
import type { ISupplierClient, SupplierId, SupplierClientOptions } from "./types";

export function createSupplierClient(
  supplier: SupplierId,
  options?: SupplierClientOptions
): ISupplierClient {
  switch (supplier) {
    case "XPRO":
      return new XProClient(options);
    case "DIGITALCORE":
      return new DigitalCoreClient(options);
    case "AIVAULTHUB":
      return new AIVaultHubClient(options);
    default:
      throw new Error(`Unknown supplier: ${supplier}`);
  }
}
