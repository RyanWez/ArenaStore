import { describe, it, expect } from "vitest";
import { SupplierError } from "@arena/suppliers";

describe("SupplierError and Mapper Matrix Unit Tests", () => {
  it("creates a SupplierError with custom canonical code and details", () => {
    const err = new SupplierError(
      "AMBIGUOUS_TIMEOUT",
      "Network timed out after buy request was dispatched",
      504,
      "req_123",
      { id: "dc-1", qty: 2 }
    );

    expect(err.name).toBe("SupplierError");
    expect(err.code).toBe("AMBIGUOUS_TIMEOUT");
    expect(err.statusCode).toBe(504);
    expect(err.requestId).toBe("req_123");
    expect(err.details).toEqual({ id: "dc-1", qty: 2 });
    expect(err.message).toContain("[SupplierError AMBIGUOUS_TIMEOUT]");
  });

  describe("fromXPro mapper matrix", () => {
    it("maps known XPro error codes to canonical codes", () => {
      expect(SupplierError.fromXPro("OUT_OF_STOCK", "Stock exhausted", 409).code).toBe("OUT_OF_STOCK");
      expect(SupplierError.fromXPro("INSUFFICIENT_BALANCE", "No balance", 402).code).toBe("INSUFFICIENT_BALANCE");
      expect(SupplierError.fromXPro("PRODUCT_NOT_FOUND", "Missing", 404).code).toBe("PRODUCT_NOT_FOUND");
      expect(SupplierError.fromXPro("INVALID_API_KEY", "Unauthorized", 401).code).toBe("AUTH_FAILED");
      expect(SupplierError.fromXPro("RATE_LIMIT_EXCEEDED", "Slow down", 429).code).toBe("RETRYABLE_ERROR");
      expect(SupplierError.fromXPro("SERVICE_UNAVAILABLE", "Down", 503).code).toBe("SUPPLIER_OUTAGE");
      expect(SupplierError.fromXPro("SOME_RANDOM_CODE", "Error", 400).code).toBe("INVALID_REQUEST");
    });
  });

  describe("fromDigitalCore mapper matrix", () => {
    it("maps known DigitalCore string messages to canonical codes", () => {
      expect(SupplierError.fromDigitalCore("OUT_OF_STOCK", 400).code).toBe("OUT_OF_STOCK");
      expect(SupplierError.fromDigitalCore("INSUFFICIENT_BALANCE", 400).code).toBe("INSUFFICIENT_BALANCE");
      expect(SupplierError.fromDigitalCore("PRODUCT_NOT_FOUND", 404).code).toBe("PRODUCT_NOT_FOUND");
      expect(SupplierError.fromDigitalCore("ORDER_NOT_FOUND", 404).code).toBe("ORDER_NOT_FOUND");
      expect(SupplierError.fromDigitalCore("MISSING_API_KEY", 401).code).toBe("AUTH_FAILED");
      expect(SupplierError.fromDigitalCore("INVALID_API_KEY", 401).code).toBe("AUTH_FAILED");
      expect(SupplierError.fromDigitalCore("MAX_COUNT_EXCEEDED", 400).code).toBe("MAX_COUNT_EXCEEDED");
      expect(SupplierError.fromDigitalCore("ID_REQUIRED", 400).code).toBe("INVALID_REQUEST");
      expect(SupplierError.fromDigitalCore("INVALID_COUNT", 400).code).toBe("INVALID_REQUEST");
    });

    it("maps 5xx status codes for unmapped messages to SUPPLIER_OUTAGE", () => {
      const err = SupplierError.fromDigitalCore("INTERNAL_SERVER_ERROR", 500);
      expect(err.code).toBe("SUPPLIER_OUTAGE");
      expect(err.statusCode).toBe(500);
    });

    it("maps 4xx status codes for unmapped messages to INVALID_REQUEST", () => {
      const err = SupplierError.fromDigitalCore("UNKNOWN_CLIENT_ERROR", 422);
      expect(err.code).toBe("INVALID_REQUEST");
      expect(err.statusCode).toBe(422);
    });
  });
});
