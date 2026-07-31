import { describe, expect, it } from "vitest";
import { createInitialState, dealNewGame, type SolitaireGameState } from "../board/solitaireState";
import { createDeck52 } from "../board/solitaireDeck";
import { BOARD_H, BOARD_W, CARD, CASCADE_STEP, buildSolitaireTree } from "./tree";

// Дерево слотов — единственный источник геометрии Косынки, поэтому тесты здесь про то, что уже
// ломалось руками у владельца (SOLITAIRE-REBUILD-HANDOFF §5): каскад vs веер, центр карты vs угол
// слота, пустой слот как цель дропа. Pixi тут нет вовсе — всё считается в node.

function withSlots(slots: Record<string, string[]>): SolitaireGameState {
  const state = createInitialState();
  for (const [id, members] of Object.entries(slots)) state.board.slots[id] = { members };
  return { ...state, phase: "playing" };
}

describe("buildSolitaireTree — раскладка", () => {
  it("колонка идёт вертикальным КАСКАДОМ вниз, а не веером вверх", () => {
    const tree = buildSolitaireTree(withSlots({ "tab:0": ["K♠", "Q♥", "J♠"] }));
    const homes = ["K♠", "Q♥", "J♠"].map((id) => tree.homeOf(id)!);

    expect(homes.every((h) => h.x === homes[0]!.x)).toBe(true); // ни на пиксель вбок
    expect(homes[1]!.y - homes[0]!.y).toBe(CASCADE_STEP);
    expect(homes[2]!.y - homes[1]!.y).toBe(CASCADE_STEP);
    expect(homes[2]!.y).toBeGreaterThan(homes[0]!.y); // ВНИЗ: веер уводил карты вверх на верхний ряд
  });

  it("дом карты — её ЦЕНТР, и он попадает ровно в зону своего слота", () => {
    // Ловушка §5.3: карта позиционируется центром, слот задан прямоугольником от левого верхнего
    // угла. Без перевода карты стояли на полкарты выше и левее, и дроп считался мимо.
    const tree = buildSolitaireTree(withSlots({ "tab:3": ["9♦"], "found:S": ["A♠"] }));
    const home = tree.homeOf("9♦")!;
    const origin = tree.origins["tab:3"]!;

    expect(home).toEqual({ x: origin.x + CARD.w / 2, y: origin.y + CARD.h / 2 });
    expect(tree.slotAt(home)).toBe("tab:3");
    expect(tree.slotAt(tree.homeOf("A♠")!)).toBe("found:S");
  });

  it("верхний ряд и колонки не наезжают друг на друга", () => {
    const tree = buildSolitaireTree(createInitialState());
    const top = tree.origins.stock!.y + CARD.h;
    for (let i = 0; i < 7; i++) expect(tree.origins[`tab:${i}`]!.y).toBeGreaterThanOrEqual(top);
    expect(tree.origins["found:C"]!.x + CARD.w).toBeLessThanOrEqual(BOARD_W);
  });

  it("габарит доски стабилен, но растёт под переросшую колонку", () => {
    const short = buildSolitaireTree(withSlots({ "tab:0": ["K♠"] }));
    expect(short.size).toEqual({ w: BOARD_W, h: BOARD_H });

    const long = buildSolitaireTree(withSlots({ "tab:0": createDeck52().slice(0, 20) }));
    expect(long.size.h).toBeGreaterThan(BOARD_H);
    expect(long.size.w).toBe(BOARD_W);
  });

  it("порядок отрисовки: карта выше по стопке рисуется поверх", () => {
    const tree = buildSolitaireTree(withSlots({ "tab:0": ["K♠", "Q♥"] }));
    expect(tree.depthOf("Q♥")).toBeGreaterThan(tree.depthOf("K♠"));
  });
});

describe("buildSolitaireTree — дропзоны", () => {
  it("ПУСТОЙ слот держит место и ловит дроп", () => {
    // Пустая куча меряется в 0×0 без резерва ячейки — колонка и фундамент тогда пропадали бы как
    // цели ровно в тот момент, когда в них и надо положить (короля / туза).
    const tree = buildSolitaireTree(createInitialState());
    const emptyCol = tree.origins["tab:4"]!;
    const emptyFound = tree.origins["found:H"]!;

    expect(tree.slotAt({ x: emptyCol.x + CARD.w / 2, y: emptyCol.y + CARD.h / 2 })).toBe("tab:4");
    expect(tree.slotAt({ x: emptyFound.x + CARD.w / 2, y: emptyFound.y + CARD.h / 2 })).toBe("found:H");
  });

  it("сток и сброс дропзонами не являются", () => {
    const tree = buildSolitaireTree(withSlots({ stock: ["2♣"], waste: ["3♦"] }));
    expect(tree.slotAt(tree.homeOf("2♣")!)).toBeNull();
    expect(tree.slotAt(tree.homeOf("3♦")!)).toBeNull();
  });

  it("дроп мимо доски — ничей", () => {
    const tree = buildSolitaireTree(createInitialState());
    expect(tree.slotAt({ x: -50, y: -50 })).toBeNull();
    expect(tree.slotAt({ x: BOARD_W + 100, y: BOARD_H + 100 })).toBeNull();
  });

  it("зона сама решает по правилам Клондайка, кого принять", () => {
    const tree = buildSolitaireTree(withSlots({ "tab:0": [], "tab:1": ["8♥"], "found:S": [], "found:H": ["A♥"] }));

    expect(tree.accepts("tab:0", "K♠")).toBe(true); // пусто — только король
    expect(tree.accepts("tab:0", "Q♠")).toBe(false);
    expect(tree.accepts("tab:1", "7♠")).toBe(true); // на 8♥ — чёрная семёрка
    expect(tree.accepts("tab:1", "7♥")).toBe(false); // тот же цвет
    expect(tree.accepts("found:S", "A♠")).toBe(true); // пусто — только туз своей масти
    expect(tree.accepts("found:S", "A♥")).toBe(false);
    expect(tree.accepts("found:H", "2♥")).toBe(true);
    expect(tree.accepts("found:H", "3♥")).toBe(false);
  });

  it("после раздачи каждая карта знает свой слот и лежит в нём", () => {
    const tree = buildSolitaireTree(dealNewGame(createDeck52()));
    for (const card of createDeck52()) {
      const slot = tree.slotOf(card);
      expect(slot).not.toBeNull();
      const home = tree.homeOf(card);
      expect(home).not.toBeNull();
      // Карта лежит внутри своего слота (для дропзон это проверяется тем же деревом, что и рендер).
      if (slot!.startsWith("tab:")) expect(tree.slotAt(home!)).toBe(slot);
    }
  });
});
