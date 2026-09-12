// СТОРОЖ `desk.one-screen-speaks-the-turn-for-the-table`.
//
// Череду считает каждый экран — она читается по общему столу. Докладывать её комнате должен один,
// иначе на каждый ход прилетает столько одинаковых сообщений, сколько людей за столом. И это должен
// быть выбор БЕЗ УГОВОРА: экраны не переговариваются, они считают одно и то же правило по одному и
// тому же ростеру.

import { describe, expect, it } from "vitest";
import { speaksForTable } from "./turn.js";

const at = (...seats: string[]) => seats.map((seat) => ({ seat }));

describe("desk.one-screen-speaks-the-turn-for-the-table", () => {
  it("говорит первое из занятых мест, и только оно", () => {
    const present = at("p1", "p2", "p3");
    expect(present.filter((one) => speaksForTable(present, one.seat))).toHaveLength(1);
    expect(speaksForTable(present, "p1")).toBe(true);
    expect(speaksForTable(present, "p2")).toBe(false);
  });

  it("говоривший ушёл — говорит следующий, и никто ни с кем не договаривался", () => {
    expect(speaksForTable(at("p2", "p3"), "p2")).toBe(true);
  });

  it("зритель не говорит за стол", () => {
    expect(speaksForTable(at("p1"), null)).toBe(false);
  });

  it("за пустым столом говорить некому", () => {
    expect(speaksForTable([], "p1")).toBe(false);
  });
});
