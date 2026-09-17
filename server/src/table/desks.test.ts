// РОДА СТОЛОВ — проверка 3в словами владельца: «создать стол с конфигом песочницы и стол с пустым
// конфигом игры — оба открываются».
//
// «Пустой конфиг игры» здесь буквально: род, у которого своих зон нет и все права — как у песочницы.
// Он заводится ПРЯМО В ТЕСТЕ, дописыванием строки в каталог, и именно это и проверяется: чтобы
// появился новый стол, кода трогать не нужно.

import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_DESK, DESKS, deskOf, isDesk } from "./desks.js";
import { SANDBOX, type DeskRules } from "./rules.js";
import { forgetAll, kindOf, openEntry } from "./lobby.js";
import { Table } from "./table.js";
import type { Face } from "./contract.js";

const cards: { id: string; face: Face }[] = [{ id: "a", face: { suit: "s", rank: "6" } }];
const home = { kind: "inline" as const, message: "m1" };

afterEach(() => {
  delete DESKS["пустая-игра"];
  forgetAll();
});

describe("род стола — это имя конфига", () => {
  it("песочница есть всегда и она же ответ на «род не сказан»", () => {
    expect(isDesk(DEFAULT_DESK)).toBe(true);
    expect(deskOf(undefined)).toBe(SANDBOX);
    expect(deskOf("sandbox")).toBe(SANDBOX);
  });

  it("новый род — строка в каталоге, и стол с ним открывается", () => {
    const empty: DeskRules = { ...SANDBOX, kind: "пустая игра" };
    DESKS["пустая-игра"] = () => empty;
    expect(isDesk("пустая-игра")).toBe(true);
    const desk = new Table(cards.slice(), null, deskOf("пустая-игра"));
    expect(desk.seenBy("кто-то").piles.map((p) => p.id)).toEqual(["deck"]);
  });

  it("незнакомый род НЕ закрывает дверь, а даёт песочницу", () => {
    // Бот и сервер обновляются порознь: бот, который уже умеет новый род, не должен ронять сервер.
    expect(deskOf("такого-нет")).toBe(SANDBOX);
    expect(deskOf(42)).toBe(SANDBOX);
    expect(deskOf(null)).toBe(SANDBOX);
  });

  it("комната помнит свой род, и стол получает его правила", () => {
    DESKS["пустая-игра"] = () => ({ ...SANDBOX, kind: "пустая игра" });
    openEntry("комната-1", home, "хозяин", undefined, Date.now(), "пустая-игра");
    expect(kindOf("комната-1")).toBe("пустая-игра");
    expect(deskOf(kindOf("комната-1")).kind).toBe("пустая игра");
  });

  it("комната без рода — песочница, и комната с чужим родом тоже", () => {
    openEntry("комната-2", { ...home, message: "m2" }, "хозяин");
    openEntry("комната-3", { ...home, message: "m3" }, "хозяин", undefined, Date.now(), "такого-нет");
    expect(kindOf("комната-2")).toBe(DEFAULT_DESK);
    expect(kindOf("комната-3")).toBe(DEFAULT_DESK);
    expect(kindOf("комнаты-нет-вовсе")).toBe(DEFAULT_DESK);
  });

  it("два стола разных родов стоят рядом и не путают правила", () => {
    DESKS["пустая-игра"] = () => ({ ...SANDBOX, kind: "пустая игра", zones: [{ id: "круг", x: 0, y: 0, pose: "ring" }] });
    const sandbox = new Table(cards.slice(), null, deskOf("sandbox"));
    const other = new Table(cards.slice(), null, deskOf("пустая-игра"));
    expect(sandbox.seenBy("x").piles.map((p) => p.id)).toEqual(["deck"]);
    expect(other.seenBy("x").piles.map((p) => p.id).sort()).toEqual(["deck", "круг"]);
  });
});

describe("крестовый стоит в каталоге и приносит своё кольцо", () => {
  it("род «krest» известен, и у него зона-кольцо в середине", () => {
    expect(isDesk("krest")).toBe(true);
    const desk = deskOf("krest");
    expect(desk.kind).toBe("крестовый");
    expect(desk.zones.map((z) => z.pose)).toEqual(["ring"]);
  });

  it("стол крестового открывается с кольцом на сукне", () => {
    const seen = new Table(cards.slice(), null, deskOf("krest")).seenBy("кто-то");
    expect(seen.piles.map((p) => p.id).sort()).toEqual(["deck", "ring"]);
    expect(seen.piles.find((p) => p.id === "ring")!.pose).toBe("ring");
  });

  it("два стола одного рода не делят живое состояние", () => {
    expect(deskOf("krest")).not.toBe(deskOf("krest"));
  });
});
