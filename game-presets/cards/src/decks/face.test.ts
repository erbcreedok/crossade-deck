import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crossade, type CardSpec } from "../crossade.js";
import { backSvg, BACK_NAMES } from "./backs.js";
import { faceSvg, isCourt } from "./face.js";
import { figurePlacement, viewBoxOf } from "./figures.js";
import { ACCENT_PAINT, deckStyleId, deckStyleOf, DECK_STYLES, FOUR_INK, PAPER, type DeckStyle } from "./style.js";

const CLASSIC: DeckStyle = { layout: "classic", fourColour: false, cyrillic: false };
const MINIMAL: DeckStyle = { layout: "minimal", fourColour: false, cyrillic: false };
const by = (id: string): CardSpec => crossade().find((c) => c.id === id)!;
const uses = (svg: string): number => (svg.match(/<use /g) ?? []).length;
const ART = new URL("../../art/", import.meta.url).pathname;
const figure = (id: string): string => readFileSync(`${ART}courts/${id}.svg`, "utf8");

describe("decks/face", () => {
  it("face.a-number-shows-that-many-pips — rank pips plus the two corner marks, every one a <use> of ONE path", () => {
    for (const rank of ["2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
      const svg = faceSvg(by(`spade-${rank}`), CLASSIC);
      expect(uses(svg), rank).toBe(Number(rank) + 2);
      expect((svg.match(/<path id="pip"/g) ?? []).length).toBe(1);
    }
  });

  it("face.the-ace-is-one-big-pip — a single centre mark, bigger than the grid's", () => {
    const svg = faceSvg(by("heart-A"), CLASSIC);
    expect(uses(svg)).toBe(3);
    expect(svg).toContain("data-text=\"A\"");
  });

  it("face.a-court-wears-its-figure — inline, at the placement, in the accent the style asks for", () => {
    const art = figure("diamond-K");
    const plain = faceSvg(by("diamond-K"), CLASSIC, { figure: art });
    const four = faceSvg(by("diamond-K"), { ...CLASSIC, fourColour: true }, { figure: art });
    const at = figurePlacement(viewBoxOf(art));
    expect(plain).toContain(`color="${ACCENT_PAINT.red}"`);
    expect(four).toContain(`color="${ACCENT_PAINT.orange}"`);
    expect(plain).toContain(`x="${Math.round(at.x * 1000) / 1000}"`);
    // Corner marks only — a king is a drawing, not a pip layout.
    expect(uses(plain)).toBe(2);
    // Spades keep their engraving under four colours: only the diamonds' accent turns.
    const spade = faceSvg(by("spade-K"), { ...CLASSIC, fourColour: true }, { figure: figure("spade-K") });
    expect(spade).toContain(`color="${ACCENT_PAINT.red}"`);
  });

  it("face.a-court-without-art-is-still-a-face — the frame and the indices stand, nothing throws", () => {
    const svg = faceSvg(by("club-Q"), CLASSIC);
    expect(uses(svg)).toBe(2);
    expect(svg).not.toContain("<svg x=");
  });

  it("face.minimal-is-one-index-and-one-mark — courts included: a letter and a mark, no figure", () => {
    for (const id of ["spade-7", "heart-A", "club-K", "diamond-J"]) {
      const svg = faceSvg(by(id), MINIMAL, { figure: figure("club-K") });
      expect(uses(svg), id).toBe(2);
      expect(svg).not.toContain("<svg x=");
      expect((svg.match(/data-text=/g) ?? []).length, id).toBe(1);
    }
  });

  it("face.cyrillic-is-a-label — Т В Д К and «Джокер» show, keys stay Latin, numbers do not move", () => {
    const cyr = { ...CLASSIC, cyrillic: true };
    expect(faceSvg(by("spade-A"), cyr)).toContain("data-text=\"Т\"");
    expect(faceSvg(by("spade-J"), cyr)).toContain("data-text=\"В\"");
    expect(faceSvg(by("spade-Q"), cyr)).toContain("data-text=\"Д\"");
    expect(faceSvg(by("spade-K"), cyr)).toContain("data-text=\"К\"");
    expect(faceSvg(by("spade-10"), cyr)).toContain("data-text=\"10\"");
    expect(faceSvg(by("joker-red"), cyr)).toContain("data-text=\"Джокер\"");
    expect(faceSvg(by("joker-red"), { ...MINIMAL, cyrillic: true })).toContain("data-text=\"Джокер\"");
    expect(faceSvg(by("joker-black"), CLASSIC)).toContain("data-text=\"JOKER\"");
  });

  it("face.four-colours-is-one-ink-per-suit — spades blue, diamonds orange, hearts and clubs as ever", () => {
    const four = { ...CLASSIC, fourColour: true };
    expect(faceSvg(by("spade-5"), four)).toContain(FOUR_INK.spade);
    expect(faceSvg(by("diamond-5"), four)).toContain(FOUR_INK.diamond);
    expect(faceSvg(by("spade-5"), CLASSIC)).not.toContain(FOUR_INK.spade);
    expect(faceSvg(by("heart-5"), four)).toContain(PAPER.red);
    expect(faceSvg(by("club-5"), four)).toContain(PAPER.black);
    expect(faceSvg(by("club-5"), four)).not.toContain(FOUR_INK.spade);
  });

  it("face.the-jokers-wear-their-own-ink — red and black, in either layout, the hat at centre", () => {
    for (const style of [CLASSIC, MINIMAL]) {
      const red = faceSvg(by("joker-red"), style);
      const black = faceSvg(by("joker-black"), style);
      expect(red).toContain(`fill="${PAPER.red}"`);
      expect(black).not.toContain(`fill="${PAPER.red}"`);
      expect(uses(red)).toBe(0);
      // Two words: the corners in classic, top and bottom in minimal.
      expect((red.match(/data-text="JOKER"/g) ?? []).length).toBe(2);
    }
  });

  it("face.every-style-draws-every-card — 8 styles × 55 cards, each a document, distinct within a style", () => {
    expect(DECK_STYLES).toHaveLength(8);
    for (const style of DECK_STYLES) {
      const seen = new Set<string>();
      for (const spec of crossade()) {
        const svg = faceSvg(spec, style, isCourt(spec) ? { figure: figure(spec.id) } : {});
        expect(svg.startsWith("<svg "), `${deckStyleId(style)} ${spec.id}`).toBe(true);
        expect(seen.has(svg), `${deckStyleId(style)} ${spec.id} repeats a face`).toBe(false);
        seen.add(svg);
      }
    }
  });

  it("face.the-brand-card-keeps-the-classic-texture — no art in the design, so the generated one stands", () => {
    const svg = faceSvg(by("brand"), MINIMAL);
    expect(svg).toContain("crossade");
  });

  it("style.ids-round-trip — every preset has a speaking id and resolves back to itself", () => {
    for (const style of DECK_STYLES) expect(deckStyleOf(deckStyleId(style))).toEqual(style);
    expect(deckStyleId(CLASSIC)).toBe("classic");
    expect(deckStyleId({ layout: "minimal", fourColour: true, cyrillic: true })).toBe("minimal-4c-cyr");
    expect(deckStyleOf("baroque")).toBeUndefined();
  });

  it("backs.six-and-their-own — woven backs carry no crest, tiled ones do; every one is a document", () => {
    expect(BACK_NAMES).toHaveLength(6);
    for (const name of BACK_NAMES) expect(backSvg(name).startsWith("<svg ")).toBe(true);
    expect(backSvg("plaid")).not.toContain("<path");
    expect(backSvg("club")).toContain("<path");
    expect(backSvg("club")).toContain("<pattern");
  });
});
