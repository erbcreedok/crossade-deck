import { describe, it, expect } from "vitest";
import { hudReserved, sideExtent } from "./reserve";
import type { HudEnv } from "./regions";
import { pin, placeholderW, region, zoneW } from "../core/hudSpec";
import type { HudSpec } from "../core/spec";

// Сторож резерва краёв: ЕДИНАЯ формула и для стола (fitZoom), и для угловых вычетов лейнов.
// Пустой край — ноль вторжения (пустой угол отдаёт место); занятый — safe + хром + inset +
// глубина + дыхание края; пины НЕ входят, пока явно не попросили reserve.

const env = (over: Partial<HudEnv> = {}): HudEnv => ({
  w: 1000,
  h: 800,
  safe: { top: 0, bottom: 0, left: 0, right: 0 },
  chrome: { top: 0, bottom: 0 },
  ...over,
});
const D56 = (): number => 56;
const hud = (areas: HudSpec["areas"]): HudSpec => ({ areas });

describe("sideExtent — полное вторжение края", () => {
  it("пустой край — 0 (резерв ровно своего края, чужие не трогаем)", () => {
    const h = hud([region("bottom", "start", [zoneW("hand")])]);
    expect(sideExtent(h, "top", env(), D56)).toBe(0);
    expect(sideExtent(h, "left", env(), D56)).toBe(0);
    expect(sideExtent(h, "bottom", env(), D56)).toBe(56); // depth + breath(bottom)=0
  });

  it("safe + живой хром + inset + глубина складываются; края дышат своим паддингом", () => {
    const h = hud([region("bottom", "start", [zoneW("hand")], { inset: 12 }), region("left", "start", [placeholderW("x")])]);
    const e = env({ safe: { top: 0, bottom: 28, left: 4, right: 0 }, chrome: { top: 0, bottom: 52 } });
    expect(sideExtent(h, "bottom", e, D56)).toBe(28 + 52 + 12 + 56);
    expect(sideExtent(h, "left", e, D56)).toBe(4 + 56 + 16); // вертикаль дышит 16
  });

  it("пин по умолчанию НЕ вторгается; reserve:true включает его в край якоря", () => {
    const free = hud([pin("bottom-right", [placeholderW("tool", 80)])]);
    expect(sideExtent(free, "bottom", env(), D56)).toBe(0);
    const held = hud([pin("bottom-right", [placeholderW("tool", 80)], { reserve: true, offset: { x: 0, y: -20 } })]);
    expect(sideExtent(held, "bottom", env(), D56)).toBe(56);
  });
});

describe("hudReserved — стол вписывается в остаток", () => {
  it("без HUD резерв = safe на всех краях + живой хром горизонталей", () => {
    const r = hudReserved(undefined, env({ safe: { top: 10, bottom: 20, left: 5, right: 6 }, chrome: { top: 0, bottom: 52 } }), D56);
    expect(r).toEqual({ top: 10, bottom: 20 + 52, left: 5, right: 6 });
  });

  it("занятый край резервирует вторжение, остальные держат safe", () => {
    const r = hudReserved(hud([region("bottom", "start", [zoneW("hand")])]), env({ safe: { top: 7, bottom: 7, left: 7, right: 7 } }), D56);
    expect(r.bottom).toBe(7 + 56);
    expect(r.top).toBe(7);
    expect(r.left).toBe(7);
  });

  it("пин без reserve не двигает стол", () => {
    const r = hudReserved(hud([pin("bottom-right", [placeholderW("tool", 80)], { offset: { x: 0, y: -40 } })]), env(), D56);
    expect(r.bottom).toBe(0);
  });
});
