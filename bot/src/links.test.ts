import { describe, expect, it } from "vitest";
import { roomMessage, tableUrl } from "./links.js";

const HUB = "http://localhost:9569";

describe("tableUrl", () => {
  it("names the table the way apps/hub/src/hub/route.ts (placeOf) reads it", () => {
    expect(tableUrl(HUB, "chess", "AB12")).toBe("http://localhost:9569/#chess?room=AB12");
  });
});

describe("roomMessage", () => {
  it("carries a plain url button and the same link as text", () => {
    const { text, keyboard } = roomMessage(HUB, { code: "AB12", game: "cards" }, undefined);
    const url = tableUrl(HUB, "cards", "AB12");
    expect(text).toContain("AB12");
    expect(text).toContain(url);
    const button = keyboard.inline_keyboard[0][0];
    expect(button.text).toBe("Играть");
    expect((button as { url?: string }).url).toBe(url);
  });

  it("adds no web_app button when TELEGRAM_APP_NAME is not configured", () => {
    const { keyboard } = roomMessage(HUB, { code: "AB12", game: "cards" }, undefined);
    expect(keyboard.inline_keyboard.flat().length).toBe(1);
  });

  it("adds a second web_app button pointing at the same table when TELEGRAM_APP_NAME is configured", () => {
    const { keyboard } = roomMessage(HUB, { code: "AB12", game: "chess" }, "play");
    const url = tableUrl(HUB, "chess", "AB12");
    const buttons = keyboard.inline_keyboard.flat();
    expect(buttons.length).toBe(2);
    expect((buttons[1] as { web_app?: { url: string } }).web_app?.url).toBe(url);
  });
});
