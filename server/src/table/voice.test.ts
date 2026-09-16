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

describe("адрес микрофона", () => {
  it("на стол — адреса нет вовсе", () => {
    expect(cleanMic({ on: true })).toEqual({ on: true });
  });
  it("в ухо — адрес доходит", () => {
    expect(cleanMic({ on: true, to: "tg:7" })).toEqual({ on: true, to: "tg:7" });
  });
  it("выключенный микрофон адреса не носит", () => {
    expect(cleanMic({ on: false, to: "tg:7" })).toEqual({ on: false });
  });
  it("адрес не адрес — весть отбрасывается целиком", () => {
    expect(cleanMic({ on: true, to: "" })).toBeNull();
    expect(cleanMic({ on: true, to: 7 })).toBeNull();
    expect(cleanMic({ on: true, to: "x".repeat(65) })).toBeNull();
  });
});
