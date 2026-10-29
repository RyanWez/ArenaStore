export type SupplierErrorCode =
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_BALANCE"
  | "PRODUCT_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "AUTH_FAILED"
  | "INVALID_REQUEST"
  | "MAX_COUNT_EXCEEDED"
  | "SUPPLIER_OUTAGE"
  | "NETWORK_ERROR"
  | "RETRYABLE_ERROR"
  | "AMBIGUOUS_TIMEOUT"
  | "UNSUPPORTED";

export class SupplierError extends Error {
  constructor(
    public readonly code: SupplierErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly requestId?: string,
    public readonly details?: unknown
  ) {
    super(`[SupplierError ${code}]: ${message}`);
    this.name = "SupplierError";
  }

  static fromXPro(code: string, message: string, statusCode: number = 400, requestId?: string, details?: unknown): SupplierError {
    let canonicalCode: SupplierErrorCode;
    switch (code) {
      case "OUT_OF_STOCK":
        canonicalCode = "OUT_OF_STOCK";
        break;
      case "INSUFFICIENT_BALANCE":
        canonicalCode = "INSUFFICIENT_BALANCE";
        break;
      case "PRODUCT_NOT_FOUND":
        canonicalCode = "PRODUCT_NOT_FOUND";
        break;
      case "INVALID_API_KEY":
        canonicalCode = "AUTH_FAILED";
        break;
      case "RATE_LIMIT_EXCEEDED":
        canonicalCode = "RETRYABLE_ERROR";
        break;
      case "SERVICE_UNAVAILABLE":
        canonicalCode = "SUPPLIER_OUTAGE";
        break;
      default:
        canonicalCode = "INVALID_REQUEST";
    }
    return new SupplierError(canonicalCode, message, statusCode, requestId, details);
  }

  static fromDigitalCore(msg: string, statusCode: number = 400, details?: unknown): SupplierError {
    let canonicalCode: SupplierErrorCode;
    switch (msg) {
      case "OUT_OF_STOCK":
        canonicalCode = "OUT_OF_STOCK";
        break;
      case "INSUFFICIENT_BALANCE":
        canonicalCode = "INSUFFICIENT_BALANCE";
        break;
      case "PRODUCT_NOT_FOUND":
        canonicalCode = "PRODUCT_NOT_FOUND";
        break;
      case "ORDER_NOT_FOUND":
        canonicalCode = "ORDER_NOT_FOUND";
        break;
      case "MISSING_API_KEY":
      case "INVALID_API_KEY":
        canonicalCode = "AUTH_FAILED";
        break;
      case "MAX_COUNT_EXCEEDED":
        canonicalCode = "MAX_COUNT_EXCEEDED";
        break;
      case "ID_REQUIRED":
      case "INVALID_COUNT":
        canonicalCode = "INVALID_REQUEST";
        break;
      default:
        canonicalCode = statusCode >= 500 ? "SUPPLIER_OUTAGE" : "INVALID_REQUEST";
    }
    return new SupplierError(canonicalCode, `DigitalCore: ${msg}`, statusCode, undefined, details);
  }

  static fromAIVaultHub(statusCode: number, data?: any): SupplierError {
    const rawError = data?.error || data?.message || `HTTP ${statusCode}`;
    let canonicalCode: SupplierErrorCode;
    switch (statusCode) {
      case 401:
        canonicalCode = "AUTH_FAILED";
        break;
      case 402:
        canonicalCode = "INSUFFICIENT_BALANCE";
        break;
      case 404:
        canonicalCode = "PRODUCT_NOT_FOUND";
        break;
      case 409:
        canonicalCode = "OUT_OF_STOCK";
        break;
      case 429:
        canonicalCode = "RETRYABLE_ERROR";
        break;
      default:
        canonicalCode = statusCode >= 500 ? "SUPPLIER_OUTAGE" : "INVALID_REQUEST";
    }
    return new SupplierError(canonicalCode, `AIVaultHub: ${rawError}`, statusCode, undefined, data);
  }
}
