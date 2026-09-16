import { describe, expect, it } from "vitest";
import { bytesOf, cleanMic } from "./voice.js";

describe("микрофон", () => {
  it("байты доезжают и обычным объектом — так их шлёт Colyseus", () => {
    expect(bytesOf({ 0: 7, 1: 8, 2: 9 })).toEqual(new Uint8Array([7, 8, 9]));
    expect(bytesOf({ type: "Buffer", data: [7, 8] })).toEqual(new Uint8Array([7, 8]));
    expect(bytesOf(new Uint8Array([1, 2]))).toEqual(new Uint8Array([1, 2]));
    expect(bytesOf(new Uint8Array([1, 2]).buffer)).toEqual(new Uint8Array([1, 2]));
    expect(bytesOf([3, 4])).toEqual(new Uint8Array([3, 4]));
    expect(bytesOf({})).toBeNull();
    expect(bytesOf({ a: 1 })).toBeNull();
    expect(bytesOf(null)).toBeNull();
  });

  it("микрофон — только «включён» или «выключен»", () => {
    expect(cleanMic({ on: true })).toEqual({ on: true });
    expect(cleanMic({ on: false })).toEqual({ on: false });
    expect(cleanMic({ on: "да" })).toBeNull();
    expect(cleanMic(null)).toBeNull();
  });
});
