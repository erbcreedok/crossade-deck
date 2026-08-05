import { describe, it, expect } from "vitest";
import { tiltDev, zoneHitScore, type DropRect } from "./dropPolicy";

// Сторожа правил владельца по дроп-политикам песочницы: колода снепает только КАРТУ и только не
// сильно наклонённую; центр стола ловит по ЦЕНТРУ карты; свободные стопки — по пальцу.

const box: DropRect = { x: 100, y: 100, w: 100, h: 140 };
const cardOn = { x: 80, y: 120, w: 100, h: 140 }; // заезжает на зону краем
const cardOff = { x: 300, y: 300, w: 100, h: 140 };
const fingerIn = { x: 150, y: 170 };
const fingerOut = { x: 30, y: 30 };

describe("политика only — вид груза", () => {
  it("фишку в колоду не засунуть вообще: ни нахлёстом, ни пальцем", () => {
    const p = { only: "card" } as const;
    expect(zoneHitScore(p, box, { rect: cardOn, finger: fingerIn, kind: "chip" })).toBeNull();
    expect(zoneHitScore(p, box, { rect: cardOn, finger: fingerOut, kind: "card" })).not.toBeNull();
  });
});

describe("политика maxTilt — наклон груза", () => {
  const p = { maxTilt: 30 } as const;
  it("сильно наклонённая (45°) не снепается нахлёстом, но пальцем впихивается", () => {
    expect(zoneHitScore(p, box, { rect: cardOn, finger: fingerOut, tiltDeg: 45 })).toBeNull();
    expect(zoneHitScore(p, box, { rect: cardOn, finger: fingerIn, tiltDeg: 45 })).not.toBeNull();
  });
  it("лёгкий наклон (20°) и «вверх ногами» (180°±10°) снепаются как ровные", () => {
    expect(zoneHitScore(p, box, { rect: cardOn, finger: fingerOut, tiltDeg: 20 })).not.toBeNull();
    expect(zoneHitScore(p, box, { rect: cardOn, finger: fingerOut, tiltDeg: 170 })).not.toBeNull();
  });
  it("из руки/центра наклона нет (tiltDeg не задан) — снеп работает", () => {
    expect(zoneHitScore(p, box, { rect: cardOn, finger: fingerOut })).not.toBeNull();
  });
});

describe("политика hit: center — центр стола", () => {
  const p = { hit: "center", shape: "circle" } as const;
  it("край карты на круге НЕ перебивает: центр карты снаружи — мимо", () => {
    // Центр карты (130,190) вне вписанного круга (центр 150,170, r=50): dist ≈ 28 < 50 — внутри!
    const edge = { x: 30, y: 200, w: 100, h: 140 }; // центр (80,270) — вне круга, край заезжает
    expect(zoneHitScore(p, box, { rect: edge, finger: fingerOut })).toBeNull();
  });
  it("центр карты внутри круга — попадание, даже если палец снаружи", () => {
    expect(zoneHitScore(p, box, { rect: { x: 110, y: 110, w: 60, h: 80 }, finger: fingerOut })).not.toBeNull();
  });
  it("палец внутри круга ловит по-старому (как до правок)", () => {
    expect(zoneHitScore(p, box, { rect: cardOff, finger: fingerIn })).not.toBeNull();
  });
});

describe("политика hit: finger — свободные стопки как раньше", () => {
  it("нахлёст без пальца — мимо; палец внутри — попадание", () => {
    const p = { hit: "finger" } as const;
    expect(zoneHitScore(p, box, { rect: cardOn, finger: fingerOut })).toBeNull();
    expect(zoneHitScore(p, box, { rect: cardOff, finger: fingerIn })).not.toBeNull();
  });
});

describe("tiltDev", () => {
  it("наклон меряется отклонением от «ровно», 180° — ровно", () => {
    expect(tiltDev(0)).toBe(0);
    expect(tiltDev(180)).toBe(0);
    expect(tiltDev(-45)).toBe(45);
    expect(tiltDev(90)).toBe(90);
    expect(tiltDev(350)).toBe(10);
  });
});
