// ПРОПУСК ПУСКАЕТ В ОДНУ КОМНАТУ И НЕНАДОЛГО.
//
// Закон: пропуск нельзя подделать, нельзя пережить его срок и нельзя перенести на другую комнату.

import { describe, it, expect } from "vitest";
import { mintPass, passRoom } from "./pass.js";

const SECRET = "секрет-стола";
const SOON = 10_000;

describe("pass.a-pass-opens-one-room-and-not-for-long", () => {
  it("свой пропуск называет свою комнату", () => {
    expect(passRoom(mintPass("к1", SECRET, SOON), SECRET, 0)).toBe("к1");
  });

  it("протухший не годится", () => {
    const pass = mintPass("к1", SECRET, SOON);
    expect(passRoom(pass, SECRET, SOON - 1)).toBe("к1");
    expect(passRoom(pass, SECRET, SOON + 1)).toBeNull();
  });

  it("чужой подписью не открыть", () => {
    expect(passRoom(mintPass("к1", "другой-секрет", SOON), SECRET, 0)).toBeNull();
  });

  it("комнату в пропуске не подменить", () => {
    const pass = mintPass("к1", SECRET, SOON);
    expect(passRoom(pass.replace("к1", "к2"), SECRET, 0)).toBeNull();
  });

  it("срок в пропуске не продлить", () => {
    const pass = mintPass("к1", SECRET, SOON);
    expect(passRoom(pass.replace(String(SOON), String(SOON * 100)), SECRET, SOON + 1)).toBeNull();
  });

  it("мусор вместо пропуска не пускает", () => {
    for (const raw of [undefined, "", "abc", "к1.123", "к1.123.", ".123.xyz", "...."]) {
      expect(passRoom(raw, SECRET, 0)).toBeNull();
    }
  });

  it("пропуск на одну комнату не открывает соседнюю", () => {
    const pass = mintPass("к1", SECRET, SOON);
    expect(passRoom(pass, SECRET, 0)).not.toBe("к2");
  });

  it("настоящее имя комнаты переживает дорогу", () => {
    // Комнаты подписаны и состоят из букв, цифр, дефиса и подчёркивания — точек в них нет.
    const room = "LoY5N6es_8YEqwsJO2G3UQ4";
    expect(passRoom(mintPass(room, SECRET, SOON), SECRET, 0)).toBe(room);
  });
});
