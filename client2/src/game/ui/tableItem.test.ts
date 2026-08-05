import { describe, it, expect } from "vitest";
import { makeCard } from "./cardKind";
import { makeBuilt } from "./builtKind";
import { pieceVisual } from "./pieceKinds";
import { texStub } from "../../test/texStub";
import { asFlippable, asPeekable } from "../engine/capabilities";

// ЕДИНЫЙ ПРЕДМЕТ СТОЛА: карта и фишка — один класс (TableItem), разные ВИДЫ. Способности —
// ДАННЫЕ сборки (caps), а не «есть ли метод в классе»: двери есть у всех, поэтому проверка по
// наличию метода объявила бы фишку переворачиваемой. Этот файл — сторож той границы.

const tex = texStub();
const card = () => makeCard({ id: "c", card: "A♠", faceUp: false }, tex, 1);
const chip = () => {
  const r = 30;
  const { build, shadow } = pieceVisual({ kind: "chip", color: 0xc79a3e, denom: "25" }, r);
  return makeBuilt("chip", { id: "p", w: r * 2, h: r * 2, build, shadow });
};

describe("способности — данные вида, а не тип", () => {
  it("карта переворачивается, фишка — нет, хотя дверь requestFlip есть у обеих", () => {
    const c = card();
    const p = chip();
    expect("requestFlip" in p).toBe(true); // дверь на месте — но способность не собрана
    expect(asFlippable(c)).not.toBeNull();
    expect(asFlippable(p)).toBeNull();
    expect(c.requestFlip()).toBe(true);
    expect(p.requestFlip()).toBe(false);
  });

  it("подглядеть можно только за тем, кому есть что скрывать", () => {
    const c = card(); // лежит рубашкой — подглядеть есть что
    const p = chip();
    expect(asPeekable(c)).not.toBeNull();
    expect(asPeekable(p)).toBeNull();
    expect(c.canPeek).toBe(true);
    expect(p.canPeek).toBe(false);
    expect(p.peekReveal()).toBeNull();
  });

  it("вид — данные предмета: kind различает карту и фишку вместо instanceof", () => {
    expect(card().kind).toBe("card");
    expect(chip().kind).toBe("chip");
  });

  it("двери без способности отвечают нейтрально: фишка «открыта» и «со значением»", () => {
    const p = chip();
    expect(p.faceUp).toBe(true);
    expect(p.hasValue).toBe(true);
    expect(p.card).toBe("");
    expect(p.concealed).toBe(false);
  });
});
