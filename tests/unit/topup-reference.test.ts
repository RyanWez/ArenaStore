import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateTopUpReference,
  generateOrderReference,
} from "../../apps/bot/src/services/order.service";

/**
 * The old reference format was `TOP-` + the last 6 digits of Date.now(),
 * which is identical for any two requests in the same millisecond (and wraps
 * every ~16.7 minutes). Because `topup_requests.reference` is UNIQUE, a
 * collision made the insert throw and the request silently fell back to the
 * in-memory record the admin panel can never show.
 */
describe("generateTopUpReference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the TOP- prefix and fits the 64-char DB column", () => {
    const ref = generateTopUpReference();
    expect(ref).toMatch(/^TOP-[A-Z0-9]+$/);
    expect(ref.length).toBeLessThanOrEqual(64);
  });

  it("never collides while Date.now() is frozen (same-millisecond requests)", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_770_000_000_000);
    const refs = new Set(Array.from({ length: 10 }, () => generateTopUpReference()));
    expect(refs.size).toBe(10);
  });

  it("produces distinct references across sequential calls with a real clock", () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateTopUpReference()));
    expect(refs.size).toBe(100);
  });
});

describe("generateOrderReference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the ARN- prefix and fits the orders.public_order_no column", () => {
    const ref = generateOrderReference();
    expect(ref).toMatch(/^ARN-[A-Z0-9]+$/);
    expect(ref.length).toBeLessThanOrEqual(64);
  });

  it("never collides while Date.now() is frozen (same-millisecond purchases)", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_770_000_000_000);
    const refs = new Set(Array.from({ length: 20 }, () => generateOrderReference()));
    expect(refs.size).toBe(20);
  });

  it("produces distinct references across sequential orders with a real clock", () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateOrderReference()));
    expect(refs.size).toBe(100);
  });
});