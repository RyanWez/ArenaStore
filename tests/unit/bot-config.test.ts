import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadBotConfig } from "../../apps/bot/src/config";

describe("Bot Configuration (NODE_ENV & Security Guards)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("accepts non-standard environment names such as staging and preview (flexible NODE_ENV)", () => {
    process.env.NODE_ENV = "staging";
    process.env.TELEGRAM_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz_mock_test_token";
    process.env.DELIVERY_ENCRYPTION_KEY = "custom-secure-encryption-key-32bytes-long!";

    const config = loadBotConfig();
    expect(config.NODE_ENV).toBe("staging");
  });

  it("allows default dev key when NODE_ENV is development or test", () => {
    process.env.NODE_ENV = "test";
    process.env.DELIVERY_ENCRYPTION_KEY = "arena-store-default-dev-encryption-key-32bytes!";

    const config = loadBotConfig();
    expect(config.NODE_ENV).toBe("test");
  });

  it("refuses to boot in staging/preview/production when using the insecure default encryption key", () => {
    process.env.NODE_ENV = "staging";
    process.env.TELEGRAM_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz_mock_test_token";
    process.env.DELIVERY_ENCRYPTION_KEY = "arena-store-default-dev-encryption-key-32bytes!";

    expect(() => loadBotConfig()).toThrow(/CRITICAL SECURITY ERROR/);
  });
});
