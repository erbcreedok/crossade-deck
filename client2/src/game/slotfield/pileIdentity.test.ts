import { describe, expect, it } from "vitest";
import type { TableElement } from "../engine/element";
import { pileIdentity } from "./pileIdentity";

// Лёгкие фейки: pileIdentity читает только tags, faceUp (утиный) и наличие способностей-методов.
interface FakeOpts {
  tags: string[];
  faceUp?: boolean;
  draggable?: boolean;
  flippable?: boolean;
  burnable?: boolean;
  peekable?: boolean;
}
function fake(id: string, o: FakeOpts): TableElement {
  const el: Record<string, unknown> = { id, tags: new Set(o.tags) };
  if (o.faceUp !== undefined) el.faceUp = o.faceUp;
  if (o.draggable !== undefined) el.draggable = o.draggable;
  if (o.flippable) el.requestFlip = () => true;
  if (o.burnable) el.burn = () => {};
  if (o.peekable) el.peekReveal = () => null;
  return el as unknown as TableElement;
}

describe("pileIdentity", () => {
  it("пустой набор — нулевой агрегат", () => {
    const p = pileIdentity([]);
    expect(p.size).toBe(0);
    expect(p.tagsAll).toEqual(new Set());
    expect(p.tagsAny).toEqual(new Set());
    expect(p.facing).toBe("none");
    expect(p.capabilities).toEqual({ draggable: false, flippable: false, burnable: false, peekable: false });
  });

  it("tagsAll = пересечение, tagsAny = объединение", () => {
    const p = pileIdentity([
      fake("a", { tags: ["card", "suit:♦", "color:red"] }),
      fake("b", { tags: ["card", "suit:♠", "color:black"] }),
    ]);
    expect(p.tagsAll).toEqual(new Set(["card"]));
    expect(p.tagsAny).toEqual(new Set(["card", "suit:♦", "suit:♠", "color:red", "color:black"]));
  });

  it("facing: все лицом вверх → up, вниз → down, смесь → mixed", () => {
    expect(pileIdentity([fake("a", { tags: ["card"], faceUp: true }), fake("b", { tags: ["card"], faceUp: true })]).facing).toBe("up");
    expect(pileIdentity([fake("a", { tags: ["card"], faceUp: false })]).facing).toBe("down");
    expect(pileIdentity([fake("a", { tags: ["card"], faceUp: true }), fake("b", { tags: ["card"], faceUp: false })]).facing).toBe("mixed");
  });

  it("facing none, если карт нет (фишки без faceUp)", () => {
    expect(pileIdentity([fake("a", { tags: ["chip"] })]).facing).toBe("none");
  });

  it("capabilities — пересечение способностей всех членов", () => {
    const cardFull = { tags: ["card"], faceUp: true, draggable: true, flippable: true, burnable: true, peekable: true };
    const p = pileIdentity([fake("a", cardFull), fake("b", cardFull)]);
    expect(p.capabilities).toEqual({ draggable: true, flippable: true, burnable: true, peekable: true });
  });

  it("одна фишка (не Peekable/не Flippable) снимает способность у всего набора", () => {
    const card = { tags: ["card"], faceUp: true, draggable: true, flippable: true, burnable: true, peekable: true };
    const chip = { tags: ["chip"], draggable: true, burnable: true }; // не flippable, не peekable
    const p = pileIdentity([fake("a", card), fake("b", chip)]);
    expect(p.capabilities.peekable).toBe(false); // ← гибрид «карты+фишки» зона «подглядеть» не примет
    expect(p.capabilities.flippable).toBe(false);
    expect(p.capabilities.burnable).toBe(true);
    expect(p.capabilities.draggable).toBe(true);
  });

  it("недвигаемый член (draggable:false) снимает draggable у набора", () => {
    const p = pileIdentity([
      fake("a", { tags: ["card"], draggable: true }),
      fake("b", { tags: ["card"], draggable: false }),
    ]);
    expect(p.capabilities.draggable).toBe(false);
  });
});
