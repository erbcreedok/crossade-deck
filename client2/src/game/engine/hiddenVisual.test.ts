import { describe, expect, it } from "vitest";
import { hiddenVisualFor, resolveCardTextureKind } from "./hiddenVisual";

// issue #3: /table (TableEngine/CardVisual) должен решать между живой «пылью» и статичным
// hiddenFace ТЕМ ЖЕ правилом, что и ui/Card (reduceMotion/lowFx → статика, см. Card.idleFrozen).

describe("hiddenVisualFor", () => {
  it("живая пыль на полном профиле без reduce-motion", () => {
    expect(hiddenVisualFor("full", false)).toBe("dust");
  });

  it("статичный fallback при reduce-motion, даже на полном профиле", () => {
    expect(hiddenVisualFor("full", true)).toBe("static");
  });

  it("статичный fallback на облегчённом профиле, даже без reduce-motion", () => {
    expect(hiddenVisualFor("reduced", false)).toBe("static");
  });

  it("статичный fallback когда оба условия выполнены", () => {
    expect(hiddenVisualFor("reduced", true)).toBe("static");
  });
});

describe("resolveCardTextureKind", () => {
  it("бокс рубашкой вниз — рубашка, скрытость не важна", () => {
    expect(resolveCardTextureKind({ faceUp: false, hidden: true, visual: "dust" })).toBe("back");
    expect(resolveCardTextureKind({ faceUp: false, hidden: false, visual: "dust" })).toBe("back");
  });

  it("лицом вверх и НЕ скрыта — настоящее лицо", () => {
    expect(resolveCardTextureKind({ faceUp: true, hidden: false, visual: "dust" })).toBe("face");
  });

  it("лицом вверх и скрыта, живая пыль — фон под пыль", () => {
    expect(resolveCardTextureKind({ faceUp: true, hidden: true, visual: "dust" })).toBe("hiddenBg");
  });

  it("лицом вверх и скрыта, статичный fallback — статичное лицо-заглушка", () => {
    expect(resolveCardTextureKind({ faceUp: true, hidden: true, visual: "static" })).toBe("hiddenFace");
  });
});
