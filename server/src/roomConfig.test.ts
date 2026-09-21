import { afterEach, describe, expect, it } from "vitest";
import { getEmptyRoomTtlMs } from "./roomConfig.js";

afterEach(() => {
  delete process.env.EMPTY_ROOM_TTL_MS;
});

describe("тайминги комнаты", () => {
  it("без переменной окружения — значение по умолчанию", () => {
    expect(getEmptyRoomTtlMs()).toBe(30 * 60_000);
  });

  it("читается на КАЖДЫЙ вызов — тест может подставить короткий срок на лету", () => {
    process.env.EMPTY_ROOM_TTL_MS = "50";
    expect(getEmptyRoomTtlMs()).toBe(50);
    process.env.EMPTY_ROOM_TTL_MS = "70";
    expect(getEmptyRoomTtlMs()).toBe(70);
  });

  it("мусор и неположительные значения игнорируются", () => {
    for (const bad of ["", "нет", "0", "-5", "NaN"]) {
      process.env.EMPTY_ROOM_TTL_MS = bad;
      expect(getEmptyRoomTtlMs()).toBe(30 * 60_000);
    }
  });
});
