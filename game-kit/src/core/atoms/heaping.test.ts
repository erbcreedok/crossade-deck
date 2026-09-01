// HEAPING — which pile a piece belongs to, as a name it carries.
//
// The atom holds one field and interprets nothing, so what is worth pinning is not the storage: it
// is the two answers the desk leans on. That a NAMELESS piece heaps with nothing — including with
// another nameless one, which is the trap: an empty default that compared equal would make every
// piece in the kit one enormous pile the moment somebody asked. And that the name is compared
// WHOLE, so `chip:25` and `chip:100` are two piles and nobody has to say why.

import { describe, expect, it } from "vitest";
import { Heaping, heapOf, heapsTogether } from "./heaping.js";
import { node } from "../node.js";

const piece = (heap?: string): ReturnType<typeof node> =>
  heap === undefined ? node("piece") : node("piece", Heaping({ heap }));

describe("the pile a piece belongs to", () => {
  it("heaping.a-nameless-piece-heaps-with-nothing — not even with another nameless one", () => {
    // The default is the empty string, and two empty strings are equal. Left at that, every node in
    // a tree with no opinion about piles would agree with every other one that they were a pile.
    expect(heapOf(piece())).toBeUndefined();
    expect(heapOf(piece(""))).toBeUndefined();
    expect(heapsTogether(piece(), piece())).toBe(false);
    expect(heapsTogether(piece(""), piece(""))).toBe(false);
    expect(heapsTogether(piece("card"), piece())).toBe(false);
  });

  it("heaping.a-name-is-compared-whole — never picked apart", () => {
    // A denomination lives IN the name, and that only works while the name is opaque: the moment
    // anything reads the halves, a name has become a sentence and every new one has to be phrased
    // for the parser.
    expect(heapsTogether(piece("chip:25"), piece("chip:25"))).toBe(true);
    expect(heapsTogether(piece("chip:25"), piece("chip:100"))).toBe(false);
    expect(heapsTogether(piece("chip:25"), piece("chip"))).toBe(false);
    expect(heapsTogether(piece("card"), piece("chip:25"))).toBe(false);
  });
});
