export * from "./types";
export * from "./errors";
export * from "./xpro";
export * from "./digitalcore";

import { XProClient } from "./xpro";
import { DigitalCoreClient } from "./digitalcore";
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
    default:
      throw new Error(`Unknown supplier: ${supplier}`);
  }
}
