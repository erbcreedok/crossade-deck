import { describe, expect, it } from "vitest";
import { at } from "../slotfield/slotField";
import { buildBoardTree } from "./boardTree";
import { applyCommand, bootState } from "./mock";
import { handOf, OFFBOARD_KEY } from "./state";
import { BOARD_LIBRARY, chessBoard, durakBoard, krestovyiBoard, monopolyBoard, munchkinBoard, pokerBoard } from "./library";

// Борды-пресеты — ДАННЫЕ: гварды на то, что каждая спека собирается в живой стол
// (bootState + дерево) и её контраст действительно работает через общий редьюсер.

const rng = () => 0.5;

describe("шахматы", () => {
  it("32 фигуры по своим клеткам, рук нет, мест ровно два", () => {
    const spec = chessBoard();
    const s = bootState(spec);
    const tree = buildBoardTree(spec, s, "p1");
    expect(spec.elements.length).toBe(32);
    expect(tree.slotOf("db1")).toBe("field:r0c1"); // тёмный конь
    expect(tree.slotOf("lp0")).toBe("field:r6c0"); // светлая пешка
    expect(tree.origins["hand:p1"]).toBeUndefined();
    expect(s.seats.length).toBe(2);
  });

  it("capture выносит жертву за борт", () => {
    const spec = chessBoard();
    let s = bootState(spec);
    s = applyCommand(spec, s, { t: "move", el: "lp0", from: "field:r6c0", to: "field:r1c0" }, rng);
    expect(at(s.field, "field:r1c0")?.members).toEqual(["lp0"]);
    expect(at(s.field, OFFBOARD_KEY)?.members).toEqual(["dp0"]);
  });
});

describe("крестовый", () => {
  it("вся колода раздаётся поровну, дилеру последним и меньше (5 игроков, 36 карт)", () => {
    const spec = krestovyiBoard();
    const s = bootState(spec, 5);
    // 36 на 5: p2..p5 по 8… нет: 36 = 7×5 + 1 → первый после дилера получает 8, остальные 7.
    const sizes = s.seats.map((seat) => handOf(s, seat.id).length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(36);
    const dealerHand = handOf(s, s.dealer).length;
    for (const n of sizes) expect(n).toBeGreaterThanOrEqual(dealerHand);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(at(s.field, "deck:0")?.members ?? []).toEqual([]);
  });

  it("цепочка живёт: ход открывает новое звено, отбой ложится поверх", () => {
    const spec = krestovyiBoard();
    let s = bootState(spec, 2);
    const [c1, c2] = [handOf(s, "p1")[0]!, handOf(s, "p2")[0]!];
    s = applyCommand(spec, s, { t: "move", el: c1, from: "hand:p1", to: "chain:0" }, rng);
    s = applyCommand(spec, s, { t: "move", el: c2, from: "hand:p2", to: "chain:0" }, rng);
    expect(at(s.field, "chain:0")?.members).toEqual([c1, c2]);
    const tree = buildBoardTree(spec, s, "p1");
    expect(tree.origins["chain:1"]).toBeDefined();
  });
});

describe("монополия", () => {
  it("токены на старте круга, деньги розданы по рукам, кубики бросаются", () => {
    const spec = monopolyBoard();
    let s = bootState(spec, 3);
    expect(at(s.field, "track:0")?.members.length).toBe(6);
    expect(handOf(s, "p1").length).toBe(3);
    s = applyCommand(spec, s, { t: "roll" }, rng);
    expect(s.dice).toEqual([4, 4]);
  });
});

describe("вторая волна", () => {
  it("дурак: пара стола держит две карты, третья не лезет (maxSize)", () => {
    const spec = durakBoard();
    let s = bootState(spec, 2);
    const [a, b, c] = [handOf(s, "p1")[0]!, handOf(s, "p1")[1]!, handOf(s, "p1")[2]!];
    s = applyCommand(spec, s, { t: "move", el: a, from: "hand:p1", to: "table:r0c0" }, rng);
    s = applyCommand(spec, s, { t: "move", el: b, from: "hand:p1", to: "table:r0c0" }, rng);
    const full = s;
    s = applyCommand(spec, s, { t: "move", el: c, from: "hand:p1", to: "table:r0c0" }, rng);
    expect(s).toEqual(full);
    expect(at(s.field, "table:r0c0")?.members).toEqual([a, b]);
  });

  it("покер: колода 52 уникальных, борд отдаёт адресные слоты", () => {
    const spec = pokerBoard();
    const cards = spec.elements.filter((e) => e.kind === "card");
    expect(cards.length).toBe(52);
    expect(new Set(cards.map((c) => c.id)).size).toBe(52);
    const tree = buildBoardTree(spec, bootState(spec, 2), "p1");
    expect(tree.origins["board:r0c4"]).toBeDefined();
  });
});

describe("perSeat-зоны (манчкин)", () => {
  it("«шмотки» существуют У КАЖДОГО места своим экземпляром, политика общая", () => {
    const spec = munchkinBoard();
    let s = bootState(spec, 3);
    const tree = buildBoardTree(spec, s, "p1");
    expect(tree.origins["gear@p1:r0c0"]).toBeDefined(); // свои — над рукой
    expect(tree.origins["gear@p2:r0c0"]).toBeDefined(); // чужие — под их стрипом
    expect(tree.origins["gear@p3:r0c0"]).toBeDefined();
    const card = handOf(s, "p1")[0]!;
    s = applyCommand(spec, s, { t: "move", el: card, from: "hand:p1", to: "gear@p1:r0c1" }, rng);
    expect(at(s.field, "gear@p1:r0c1")?.members).toEqual([card]);
  });
});

describe("библиотека", () => {
  it("каждая борда библиотеки собирается в дерево без ошибок", () => {
    for (const make of Object.values(BOARD_LIBRARY)) {
      const spec = make();
      const tree = buildBoardTree(spec, bootState(spec), "p1");
      expect(Object.keys(tree.origins).length).toBeGreaterThan(0);
    }
  });
});
