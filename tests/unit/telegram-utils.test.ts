import { describe, it, expect } from "vitest";
import { isMessageNotModified } from "@arena/shared";

describe("Telegram Helper - isMessageNotModified", () => {
  it("identifies Telegram 400 Bad Request message is not modified from description", () => {
    const err = {
      error_code: 400,
      description: "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message",
    };
    expect(isMessageNotModified(err)).toBe(true);
  });

  it("identifies GrammyError style error with description property", () => {
    const err = {
      name: "GrammyError",
      message: "Call to 'editMessageText' failed! (400: Bad Request: message is not modified: ...)",
      description: "Bad Request: message is not modified",
    };
    expect(isMessageNotModified(err)).toBe(true);
  });

  it("identifies error message string containing message is not modified", () => {
    const err = new Error("400: Bad Request: MESSAGE IS NOT MODIFIED");
    expect(isMessageNotModified(err)).toBe(true);
  });

  it("identifies string input directly", () => {
    expect(isMessageNotModified("Bad Request: message is not modified")).toBe(true);
  });

  it("returns false for genuine Telegram errors", () => {
    expect(isMessageNotModified({ error_code: 403, description: "Forbidden: bot was blocked by the user" })).toBe(false);
    expect(isMessageNotModified({ error_code: 400, description: "Bad Request: message to edit not found" })).toBe(false);
    expect(isMessageNotModified({ error_code: 429, description: "Too Many Requests: retry after 5" })).toBe(false);
    expect(isMessageNotModified(new Error("ETIMEDOUT"))).toBe(false);
    expect(isMessageNotModified(null)).toBe(false);
    expect(isMessageNotModified(undefined)).toBe(false);
    expect(isMessageNotModified({})).toBe(false);
  });
});
