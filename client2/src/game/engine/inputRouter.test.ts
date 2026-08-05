import { describe, it, expect, vi } from "vitest";
import { InputRouter, type InputHandlers } from "./inputRouter";

// Токены: фигура — { id, drag }, кнопка — { id }. Хит-тесты настраиваются по позиции.
type C = { id: string; drag: boolean };
type B = { id: string };

function setup(
  opts: { cardAt?: (x: number, y: number) => C | null; btnAt?: (x: number, y: number) => B | null; dragOnTap?: (c: C) => boolean; dragOnHold?: (c: C) => boolean; handAt?: (sx: number, sy: number) => C | null } = {}
) {
  const calls: string[] = [];
  const rec = (name: string) => (...a: unknown[]) => calls.push(`${name}(${a.map(String).join(",")})`);
  const h: InputHandlers<C, B> = {
    screenToContent: (x, y) => ({ x, y }), // 1:1 для простоты
    pickPiece: (x, y) => opts.cardAt?.(x, y) ?? null,
    pickOverlayPiece: (sx, sy) => opts.handAt?.(sx, sy) ?? null,
    pieceDraggable: (c) => c.drag,
    dragOnTap: opts.dragOnTap,
    dragOnHold: opts.dragOnHold,
    pickButton: (x, y) => opts.btnAt?.(x, y) ?? null,
    buttonContains: (b, x) => x < 50, // «внутри» кнопки если x<50
    onPieceGrab: (c, _cp, _sp, mode) => calls.push(`grab(${c.id},${mode})`),
    onPieceMove: (c) => calls.push(`move(${c.id})`),
    onPieceDrop: (c) => calls.push(`drop(${c.id})`),
    onPieceCancel: (c) => calls.push(`cancel(${c.id})`),
    onPieceBlocked: (c) => calls.push(`blocked(${c.id})`),
    onPieceTap: (c) => calls.push(`tap(${c.id})`),
    onButtonDown: (b) => calls.push(`bdown(${b.id})`),
    onButtonMove: (b, inside) => calls.push(`bmove(${b.id},${inside})`),
    onButtonUp: (b, inside) => calls.push(`bup(${b.id},${inside})`),
    onPanStart: rec("panStart"),
    onPan: rec("pan"),
    onPanEnd: rec("panEnd"),
    onPinchStart: rec("pinchStart"),
    onPinch: rec("pinch"),
    onHover: (b) => calls.push(`hover(${b?.id ?? "null"})`),
    afterAny: () => {},
  };
  return { r: new InputRouter<C, B>(h), calls };
}

describe("InputRouter", () => {
  it("пусто → пан, со стартом/концом (для инерции)", () => {
    const { r, calls } = setup();
    r.down(1, 100, 100);
    expect(r.gesture).toBe("pan");
    r.move(1, 130, 120);
    r.up(1, 130, 120);
    expect(r.gesture).toBe("none");
    expect(calls).toEqual(["panStart()", "pan(30,20)", "panEnd()"]);
  });

  it("фигура → grab/move/drop", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup({ cardAt: () => card });
    r.down(1, 10, 10);
    expect(r.gesture).toBe("drag");
    r.move(1, 40, 10);
    r.up(1, 40, 10);
    expect(calls).toEqual(["grab(A,tap)", "move(A)", "drop(A)"]);
    expect(r.gesture).toBe("none");
  });

  // «Стоп»-отказ — ответ на ПОПЫТКУ ТАЩИТЬ, а не на прикосновение. Тык по недрагабельной фигуре не
  // ошибка игрока, и качать её в ответ значит ругать за то, чего он не делал.
  it("недраг-фигура: тык НЕ отбивается, а приходит ТАПОМ", () => {
    // Два разных события на одном проводе стоили песочнице выбора набора: стоило отложить отказ
    // до сдвига пальца — и тап по невыделенной фигуре перестал доходить вовсе.
    const card = { id: "X", drag: false };
    const { r, calls } = setup({ cardAt: () => card });
    r.down(1, 10, 10);
    expect(r.gesture).toBe("blocked");
    r.up(1, 10, 10);
    expect(calls).toEqual(["tap(X)"]); // отказа не было, был тап
  });

  it("поехал пальцем — это ОТКАЗ, и тапа уже нет", () => {
    const card = { id: "X", drag: false };
    const { r, calls } = setup({ cardAt: () => card });
    r.down(1, 10, 10);
    r.move(1, 30, 10);
    r.up(1, 30, 10);
    expect(calls).toEqual(["blocked(X)"]);
  });

  it("недраг-фигура: отказ приходит, когда палец ПОЕХАЛ", () => {
    const card = { id: "X", drag: false };
    const { r, calls } = setup({ cardAt: () => card });
    r.down(1, 10, 10);
    r.move(1, 12, 10); // в пределах порога — ещё не попытка
    expect(calls).toEqual([]);
    r.move(1, 40, 10);
    expect(calls).toEqual(["blocked(X)"]);
  });

  it("отказ звучит ОДИН раз за жест — иначе качание превратилось бы в дрожь", () => {
    const card = { id: "X", drag: false };
    const { r, calls } = setup({ cardAt: () => card });
    r.down(1, 10, 10);
    r.move(1, 40, 10);
    r.move(1, 80, 10);
    r.move(1, 120, 10);
    expect(calls).toEqual(["blocked(X)"]);
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

  it("экранная фигура руки (pickOverlayPiece) выигрывает у контентной и сразу тащится", () => {
    // Мост драга руки↔борда: карта HUD-руки нарисована поверх стола и берётся ПЕРВОЙ, даже если под
    // точкой есть контентная фигура. Дальше — обычный tap-драг (grab), а не захват стола.
    const hand = { id: "hcard", drag: true };
    const board = { id: "bcard", drag: true };
    const { r, calls } = setup({ handAt: () => hand, cardAt: () => board });
    r.down(1, 30, 30);
    expect(r.gesture).toBe("drag");
    expect(calls).toContain("grab(hcard,tap)");
    expect(calls.some((c) => c.startsWith("grab(bcard"))).toBe(false);
  });
});

describe("drag by hold (только hold-интент)", () => {
  const holdOnly = (card: C) => ({ cardAt: () => card, dragOnTap: () => false, dragOnHold: () => true });

  it("держим фигуру дольше HOLD_SEC → захват (grab hold), а не сразу на down", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup(holdOnly(card));
    r.down(1, 10, 10);
    expect(r.gesture).toBe("press");
    r.tick(0.1);
    r.tick(0.1);
    expect(calls).toEqual([]); // ещё не набежало HOLD_SEC (0.35)
    r.tick(0.2); // 0.1+0.1+0.2 = 0.4 ≥ 0.35 → повышаем в drag
    expect(calls).toEqual(["grab(A,hold)"]);
    expect(r.gesture).toBe("drag");
  });

  it("сдвиг раньше HOLD_SEC → не драг, а пан (стопку листают/скроллят)", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup(holdOnly(card));
    r.down(1, 10, 10);
    r.tick(0.1); // ещё держим, не набежало
    r.move(1, 40, 10); // уехали дальше DRAG_SLOP до истечения HOLD_SEC
    expect(r.gesture).toBe("pan");
    r.tick(1); // дальнейшее время уже не должно ничего повышать в drag
    expect(calls.some((c) => c.startsWith("grab("))).toBe(false);
    expect(calls).toContain("panStart()");
  });

  it("быстрый тап (отпустили до HOLD_SEC) → onPieceTap, без grab", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup(holdOnly(card));
    r.down(1, 10, 10);
    r.tick(0.1);
    r.up(1, 10, 10);
    expect(calls).toEqual(["tap(A)"]);
    expect(r.gesture).toBe("none");
  });

  it("регрессия: обычная драгабельная фигура (интенты не заданы) хватается сразу тапом, как раньше", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup({ cardAt: () => card }); // dragOnTap/dragOnHold не заданы → default tap
    r.down(1, 10, 10);
    expect(r.gesture).toBe("drag");
    r.move(1, 40, 10);
    expect(calls).toEqual(["grab(A,tap)", "move(A)"]);
  });
});

// Два интента на одном элементе: жест выбирает, какой сработает. Домен (KitScene) вешает на них
// разные вещи (тап → фигура, hold → стек, или наоборот) — здесь проверяем сам РАЗВОД по жесту.
describe("два драг-интента (tap и hold) на одном элементе", () => {
  const both = (card: C) => ({ cardAt: () => card, dragOnTap: () => true, dragOnHold: () => true });

  it("ранний сдвиг (до HOLD_SEC) запускает ТАП-драг, а не пан", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup(both(card));
    r.down(1, 10, 10);
    expect(r.gesture).toBe("press"); // ждём, чем окажется жест
    r.tick(0.1);
    r.move(1, 40, 10); // поехал раньше HOLD_SEC → это тап-драг
    expect(r.gesture).toBe("drag");
    expect(calls).toEqual(["grab(A,tap)"]);
    expect(calls).not.toContain("panStart()");
  });

  it("выстоял HOLD_SEC без сдвига → HOLD-драг", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup(both(card));
    r.down(1, 10, 10);
    r.tick(0.2);
    r.tick(0.2); // ≥ HOLD_SEC
    expect(calls).toEqual(["grab(A,hold)"]);
    expect(r.gesture).toBe("drag");
  });

  it("быстрый тап без сдвига → onPieceTap (ни тот, ни другой драг)", () => {
    const card = { id: "A", drag: true };
    const { r, calls } = setup(both(card));
    r.down(1, 10, 10);
    r.tick(0.1);
    r.up(1, 10, 10);
    expect(calls).toEqual(["tap(A)"]);
  });
});

describe("long-press по пустому месту (контекстное меню)", () => {
  function setupLP() {
    const calls: string[] = [];
    const base = setupHandlers(calls);
    const h = {
      ...base,
      longPressAt: () => true,
      onLongPress: (_c: { x: number; y: number }, s: { x: number; y: number }) => calls.push(`longPress(${s.x},${s.y})`),
      onTap: (_c: { x: number; y: number }, s: { x: number; y: number }) => calls.push(`tapAt(${s.x},${s.y})`),
    };
    return { r: new InputRouter<C, B>(h), calls };
  }
  function setupHandlers(calls: string[]): InputHandlers<C, B> {
    const rec = (name: string) => (...a: unknown[]) => calls.push(`${name}(${a.map(String).join(",")})`);
    return {
      screenToContent: (x, y) => ({ x, y }),
      pickPiece: () => null,
      pieceDraggable: () => false,
      pickButton: () => null,
      buttonContains: () => false,
      onPieceGrab: () => {},
      onPieceMove: () => {},
      onPieceDrop: () => {},
      onPieceCancel: () => {},
      onPieceBlocked: () => {},
      onPieceTap: () => {},
      onButtonDown: () => {},
      onButtonMove: () => {},
      onButtonUp: () => {},
      onPanStart: rec("panStart"),
      onPan: rec("pan"),
      onPanEnd: rec("panEnd"),
      onPinchStart: () => {},
      onPinch: () => {},
      onHover: () => {},
      afterAny: () => {},
    };
  }

  it("палец настоялся → onLongPress, и отпускание НЕ даёт тап (не закрыть меню тут же)", () => {
    const { r, calls } = setupLP();
    r.down(1, 100, 100);
    expect(r.gesture).toBe("press");
    r.tick(0.2);
    r.tick(0.2); // 0.4 ≥ HOLD_SEC
    expect(calls).toEqual(["longPress(100,100)"]);
    expect(r.gesture).toBe("none");
    r.up(1, 100, 100);
    expect(calls).toEqual(["longPress(100,100)"]); // тапа после меню нет
  });

  it("ранний сдвиг — это пан, как раньше; быстрый тык остаётся тапом", () => {
    const { r, calls } = setupLP();
    r.down(1, 100, 100);
    r.move(1, 120, 100); // > DRAG_SLOP до срока: сдвиг-слоп съеден, дальше — обычный пан
    expect(r.gesture).toBe("pan");
    r.move(1, 130, 100);
    r.up(1, 130, 100);
    expect(calls).toEqual(["panStart()", "pan(10,0)", "panEnd()"]);

    r.down(1, 50, 50);
    r.up(1, 50, 50); // отпустили до HOLD_SEC без сдвига
    expect(calls.slice(3)).toEqual(["tapAt(50,50)"]);
  });
});
