import { describe, it, expect, vi } from "vitest";
import { InputRouter, type InputHandlers } from "./inputRouter";

// Токены: карта — { id, drag }, кнопка — { id }. Хит-тесты настраиваются по позиции.
type C = { id: string; drag: boolean };
type B = { id: string };

function setup(opts: { cardAt?: (x: number, y: number) => C | null; btnAt?: (x: number, y: number) => B | null } = {}) {
  const calls: string[] = [];
  const rec = (name: string) => (...a: unknown[]) => calls.push(`${name}(${a.map(String).join(",")})`);
  const h: InputHandlers<C, B> = {
    screenToContent: (x, y) => ({ x, y }), // 1:1 для простоты
    pickCard: (x, y) => opts.cardAt?.(x, y) ?? null,
    cardDraggable: (c) => c.drag,
    pickButton: (x, y) => opts.btnAt?.(x, y) ?? null,
    buttonContains: (b, x) => x < 50, // «внутри» кнопки если x<50
    onCardGrab: (c) => calls.push(`grab(${c.id})`),
    onCardMove: (c) => calls.push(`move(${c.id})`),
    onCardDrop: (c) => calls.push(`drop(${c.id})`),
    onCardCancel: (c) => calls.push(`cancel(${c.id})`),
    onCardBlocked: (c) => calls.push(`blocked(${c.id})`),
    onButtonDown: (b) => calls.push(`bdown(${b.id})`),
    onButtonMove: (b, inside) => calls.push(`bmove(${b.id},${inside})`),
    onButtonUp: (b, inside) => calls.push(`bup(${b.id},${inside})`),
    onPan: rec("pan"),
    onPinchStart: rec("pinchStart"),
    onPinch: rec("pinch"),
    onHover: (b) => calls.push(`hover(${b?.id ?? "null"})`),
    afterAny: () => {},
  };
  return { r: new InputRouter<C, B>(h), calls };
}

describe("InputRouter", () => {
  it("пусто → пан", () => {
    const { r, calls } = setup();
    r.down(1, 100, 100);
    expect(r.gesture).toBe("pan");
    r.move(1, 130, 120);
    r.up(1, 130, 120);
    expect(r.gesture).toBe("none");
    expect(calls).toEqual(["pan(30,20)"]);
  });

  it("карта → grab/move/drop", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup({ cardAt: () => card });
    r.down(1, 10, 10);
    expect(r.gesture).toBe("drag");
    r.move(1, 40, 10);
    r.up(1, 40, 10);
    expect(calls).toEqual(["grab(A)", "move(A)", "drop(A)"]);
    expect(r.gesture).toBe("none");
  });

  it("недраг-карта → blocked, жест не начинается", () => {
    const card = { id: "X", drag: false };
    const { r, calls } = setup({ cardAt: () => card });
    r.down(1, 10, 10);
    expect(r.gesture).toBe("none");
    r.move(1, 40, 10);
    expect(calls).toEqual(["blocked(X)"]); // move ничего не шлёт
  });

  it("кнопка: клик только при отпускании ВНУТРИ", () => {
    const btn = { id: "b1" };
    const { r, calls } = setup({ btnAt: () => btn });
    r.down(1, 10, 10);
    r.move(1, 80, 10); // ушли (x>=50 → снаружи)
    r.up(1, 80, 10); // отпустили снаружи → без клика
    expect(calls).toEqual(["bdown(b1)", "bmove(b1,false)", "bup(b1,false)"]);
  });

  it("пинч: два пальца → pinchStart, move → pinch, палец вверх → пан", () => {
    const { r, calls } = setup();
    r.down(1, 0, 0); // пан
    r.down(2, 100, 0); // второй → пинч
    expect(r.gesture).toBe("pinch");
    r.move(2, 120, 0);
    r.up(2, 120, 0);
    expect(r.gesture).toBe("pan"); // остался один палец
    expect(calls.some((c) => c.startsWith("pinchStart("))).toBe(true);
    expect(calls.some((c) => c.startsWith("pinch("))).toBe(true);
  });

  it("драг + второй палец → cancel драга, переход в пинч", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup({ cardAt: () => card });
    r.down(1, 10, 10); // драг
    r.down(2, 200, 10); // пинч
    expect(r.gesture).toBe("pinch");
    expect(calls).toContain("cancel(A)");
  });

  it("ховер только при смене цели", () => {
    const btn = { id: "b1" };
    const { r, calls } = setup({ btnAt: (x) => (x < 200 ? btn : null) });
    r.move(1, 10, 10); // над кнопкой
    r.move(1, 20, 10); // та же кнопка → без повтора
    r.move(1, 300, 10); // ушли → null
    expect(calls).toEqual(["hover(b1)", "hover(null)"]);
  });
});
