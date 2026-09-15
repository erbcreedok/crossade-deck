import { describe, expect, it } from "vitest";
import { cleanMic, cleanVoice, VOICE_MAX, VOICE_MAX_BYTES, VOICE_MAX_MS, VOICE_WINDOW_MS, Voices } from "./voice.js";

describe("голосовые", () => {
  it("запись из сети: длина обрезается пределом, вес — нет", () => {
    expect(cleanVoice({ ms: 9999, bytes: new Uint8Array([1, 2, 3]) })?.ms).toBe(VOICE_MAX_MS);
    expect(cleanVoice({ ms: 1200, bytes: new Uint8Array([1]) })?.ms).toBe(1200);
    expect(cleanVoice({ ms: 100, bytes: new Uint8Array(VOICE_MAX_BYTES + 1) })).toBeNull();
    expect(cleanVoice({ ms: 100, bytes: new Uint8Array(0) })).toBeNull();
    expect(cleanVoice({ ms: 100 })).toBeNull();
  });

  it("микрофон — только «включён» или «выключен»", () => {
    expect(cleanMic({ on: true })).toEqual({ on: true });
    expect(cleanMic({ on: "да" })).toBeNull();
  });

  it("не больше двух записей за окно; окно прошло — снова можно", () => {
    const voices = new Voices();
    expect(voices.send("a", 0)).toBe(true);
    expect(voices.send("a", 1000)).toBe(true);
    expect(voices.free("a", 1000)).toBe(0);
    expect(voices.send("a", 2000)).toBe(false);
    expect(voices.send("b", 2000)).toBe(true);
    expect(voices.send("a", VOICE_WINDOW_MS + 1)).toBe(true);
    expect(VOICE_MAX).toBe(2);
  });
});
