import { describe, it, expect } from "vitest";
import { roundTableBoard } from "../library/roundTable";
import { initialState, type BoardState } from "../core/state";
import { buildBoardTree } from "./boardTree";
import { dropTargetRect, type DropProbe } from "../../slot/slot";
import { CARD } from "../../crossade/tree";

// Сторожа дроп-механики ПЕСОЧНИЦЫ (правила владельца) на настоящем дереве круглого стола:
// колода снепает по нахлёсту только КАРТУ и только ровную (сильно наклонённую — лишь пальцем;
// фишку — никак); центр стола ловит по ЦЕНТРУ карты; свободная стопка — по пальцу, как раньше.

const spec = roundTableBoard({ seats: 2, dealt: 2 });

function world(mutate?: (s: BoardState) => BoardState): { state: BoardState; tree: ReturnType<typeof buildBoardTree> } {
  let state = initialState(spec, 2);
  if (mutate) state = mutate(state);
  return { state, tree: buildBoardTree(spec, state, "p1", state.free) };
}

/** Проба: карта центром в (cx,cy), палец в (fx,fy). */
function probe(cx: number, cy: number, fx: number, fy: number, extra?: Partial<DropProbe>): DropProbe {
  return { rect: { x: cx - CARD.w / 2, y: cy - CARD.h / 2, w: CARD.w, h: CARD.h }, finger: { x: fx, y: fy }, kind: "card", ...extra };
}

describe("песочница: политики дропа на дереве круглого стола", () => {
  const { tree } = world();
  const deck = tree.origins["board:0"]!;
  const deckC = { x: deck.x + CARD.w / 2, y: deck.y + CARD.h / 2 };
  const table = tree.cellRects["table:0"]!;
  const tableC = { x: table.x + table.w / 2, y: table.y + table.h / 2 };

  it("карта краем на колоде, палец в стороне — снеп в колоду", () => {
    const p = probe(deckC.x - CARD.w * 0.8, deckC.y, deckC.x - CARD.w * 1.6, deckC.y);
    expect(dropTargetRect(tree.root, p)?.group.id).toBe("board:0");
  });

  it("фишку в колоду не засунуть: ни нахлёстом, ни пальцем прямо над ней", () => {
    const p = probe(deckC.x, deckC.y, deckC.x, deckC.y, { kind: "chip" });
    expect(dropTargetRect(tree.root, p)?.group.id).not.toBe("board:0");
  });

  it("сильно наклонённая (45°) не снепается нахлёстом, но пальцем над колодой впихивается", () => {
    const off = probe(deckC.x - CARD.w * 0.8, deckC.y, deckC.x - CARD.w * 1.6, deckC.y, { tiltDeg: 45 });
    expect(dropTargetRect(tree.root, off)?.group.id).not.toBe("board:0");
    const byFinger = probe(deckC.x - CARD.w * 0.8, deckC.y, deckC.x, deckC.y, { tiltDeg: 45 });
    expect(dropTargetRect(tree.root, byFinger)?.group.id).toBe("board:0");
  });

  it("центр стола ловит по ЦЕНТРУ карты: край на круге не перебивает внешний круг", () => {
    const r = Math.min(table.w, table.h) / 2;
    // Центр карты за кромкой круга, край заезжает; палец у центра карты.
    const edge = probe(tableC.x - r - CARD.w * 0.4, tableC.y, tableC.x - r - CARD.w * 0.4, tableC.y);
    expect(dropTargetRect(tree.root, edge)?.group.id).not.toBe("table:0");
    // Центр карты внутри круга — попадание, даже с пальцем снаружи.
    const inside = probe(tableC.x, tableC.y, tableC.x - r - 40, tableC.y);
    expect(dropTargetRect(tree.root, inside)?.group.id).toBe("table:0");
  });

  it("свободная стопка ловит ПАЛЬЦЕМ: случайный нахлёст соседки дроп не утаскивает", () => {
    const { tree: t } = world((s) => ({
      ...s,
      field: { ...s.field, slots: { ...s.field.slots, "board:1": { members: ["A♠"] } } },
      free: { offset: {}, loose: { "board:1": { x: 200, y: 500 } } },
    }));
    const box = t.cellRects["board:0"]!; // бокс free-зоны; loose-координаты локальны ему
    const stackC = { x: box.x + 200, y: box.y + 500 };
    const brush = probe(stackC.x - CARD.w * 0.8, stackC.y, stackC.x - CARD.w * 1.6, stackC.y);
    expect(dropTargetRect(t.root, brush)?.group.id).not.toBe("board:1");
    const byFinger = probe(stackC.x, stackC.y, stackC.x, stackC.y);
    expect(dropTargetRect(t.root, byFinger)?.group.id).toBe("board:1");
  });

  it("магнит объявлен данными у колоды (визуал ведёт сцена)", () => {
    expect(spec.zones.find((z) => z.id === "board")?.drop?.magnet).toBe(true);
  });
});
