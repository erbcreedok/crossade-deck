import { describe, expect, it } from "vitest";
import { dmMessage, groupAppUrl, groupMessage, tableUrl } from "./links.js";

const HUB = "http://localhost:9569";

describe("tableUrl", () => {
  it("names the table the way apps/hub/src/hub/route.ts (placeOf) reads it", () => {
    expect(tableUrl(HUB, "AB12")).toBe("http://localhost:9569/#table?room=AB12");
  });
});

describe("groupAppUrl", () => {
  it("builds a startapp deep link Telegram opens as a Mini App from a group", () => {
    expect(groupAppUrl("my_bot", "play", "AB12")).toBe("https://t.me/my_bot/play?startapp=AB12");
  });
});

describe("dmMessage", () => {
  it("carries a web_app button pointing at the table", () => {
    const { text, keyboard } = dmMessage(HUB, { code: "AB12", game: "cards" });
    expect(text).toContain("AB12");
    expect(text).toContain(tableUrl(HUB, "AB12"));
    const button = keyboard.inline_keyboard[0][0];
    expect(button.text).toBe("Играть");
    expect((button as { web_app?: { url: string } }).web_app?.url).toBe(tableUrl(HUB, "AB12"));
  });
});

describe("groupMessage", () => {
  it("uses the startapp deep link when TELEGRAM_APP_NAME is set", () => {
    const { keyboard } = groupMessage(HUB, { code: "AB12", game: "chess" }, "my_bot", "play");
    const button = keyboard.inline_keyboard[0][0];
    expect((button as { url?: string }).url).toBe(groupAppUrl("my_bot", "play", "AB12"));
  });

  it("falls back to the hub URL when TELEGRAM_APP_NAME is not configured", () => {
    const { keyboard } = groupMessage(HUB, { code: "AB12", game: "nardy" }, "my_bot", undefined);
    const button = keyboard.inline_keyboard[0][0];
    expect((button as { url?: string }).url).toBe(tableUrl(HUB, "AB12"));
  });

  it("always includes the plain hub link as text for the browser", () => {
    const { text } = groupMessage(HUB, { code: "AB12", game: "nardy" }, "my_bot", "play");
    expect(text).toContain(tableUrl(HUB, "AB12"));
  });
});
