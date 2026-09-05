import { describe, expect, it } from "vitest";
import { isTelegramWebview } from "./telegram.js";

describe("isTelegramWebview", () => {
  it("is true when Telegram.WebApp reports a known platform", () => {
    expect(isTelegramWebview({ platform: "ios" }, "Mozilla/5.0")).toBe(true);
  });

  it("is false when the script loaded but platform stayed unknown, and the UA is a plain browser", () => {
    expect(isTelegramWebview({ platform: "unknown" }, "Mozilla/5.0 Safari")).toBe(false);
  });

  it("is false with no Telegram object at all in a plain browser", () => {
    expect(isTelegramWebview(undefined, "Mozilla/5.0 Chrome")).toBe(false);
  });

  it("falls back to the user agent when platform is missing", () => {
    expect(isTelegramWebview(undefined, "Mozilla/5.0 (Telegram-iOS)")).toBe(true);
  });
});
