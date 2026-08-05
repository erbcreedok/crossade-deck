import { describe, it, expect } from "vitest";
import { handOnBoard, hudDocks, hudSpans, hudWidgetAt } from "./hudLayout";
import type { HudSpec } from "../core/spec";

// Сторож flex-раскладки HUD: порядок — порядок массива, px-константы держатся, доли делят
// свободное, justify прижимает ряд; где живёт рука — решает hudLayout, не рука.

describe("hudSpans — flex-ряд дока как данные", () => {
  it("auto-доля забирает всё свободное рядом с px-константой", () => {
    const [hand, panel] = hudSpans(1000, { widgets: [{ kind: "hand", size: "auto" }, { kind: "placeholder", size: 220 }], gap: 10 });
    expect(hand!.from).toBe(0);
    expect(hand!.len).toBe(1000 - 220 - 10);
    expect(panel!.from).toBe(hand!.len + 10);
    expect(panel!.len).toBe(220);
  });

  it("доли {fr} делят свободное пропорционально", () => {
    const [a, b] = hudSpans(310, { widgets: [{ kind: "placeholder", size: { fr: 2 } }, { kind: "placeholder", size: { fr: 1 } }], gap: 10 });
    expect(a!.len).toBeCloseTo(200, 5);
    expect(b!.len).toBeCloseTo(100, 5);
  });

  it("одни константы: justify end прижимает ряд к концу, center — в центр", () => {
    const [end] = hudSpans(500, { widgets: [{ kind: "placeholder", size: 180 }], justify: "end", gap: 10 });
    expect(end!.from).toBe(320);
    const [mid] = hudSpans(500, { widgets: [{ kind: "placeholder", size: 180 }], justify: "center", gap: 10 });
    expect(mid!.from).toBe(160);
  });

  it("переполнение констант не роняет ряд: доли ужимаются в ноль, from не уходит в минус", () => {
    const spans = hudSpans(100, { widgets: [{ kind: "placeholder", size: 300 }, { kind: "hand", size: "auto" }], gap: 10 });
    expect(spans[1]!.len).toBe(0);
    expect(spans[0]!.from).toBe(0);
  });
});

describe("hud-помощники: где рука", () => {
  const hud: HudSpec = { bottom: { widgets: [{ kind: "placeholder" }, { kind: "hand" }] }, top: { widgets: [{ kind: "placeholder" }] } };

  it("hudWidgetAt находит руку с её краем и позицией в доке", () => {
    expect(hudWidgetAt(hud, "hand")).toMatchObject({ side: "bottom", index: 1 });
    expect(hudWidgetAt({}, "hand")).toBeNull();
  });

  it("handOnBoard: рука на борде ТОЛЬКО когда её нет в HUD", () => {
    expect(handOnBoard({ hand: { reorder: true }, hud })).toBe(false);
    expect(handOnBoard({ hand: { reorder: true } })).toBe(true);
    expect(handOnBoard({})).toBe(false); // рук нет вовсе
  });

  it("hudDocks отдаёт только непустые доки", () => {
    expect(hudDocks(hud).map((d) => d.side)).toEqual(["top", "bottom"]);
    expect(hudDocks(undefined)).toEqual([]);
  });
});
