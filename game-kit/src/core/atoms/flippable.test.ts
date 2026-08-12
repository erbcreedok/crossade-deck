import { describe, expect, it } from "vitest";
import { classOf, atomDef } from "../atom.js";
import { add, node } from "../node.js";
import { contextFor, sumAlongChain } from "../resolve.js";
import { facing, Flippable } from "./flippable.js";

describe("Flippable — the turn, as data", () => {
  it("flip.fields-and-classes — turns SUMS, the rest are the node's own", () => {
    expect(classOf("Flippable", "flip")).toBe("own");
    expect(classOf("Flippable", "turns")).toBe("addsUp");
    expect(classOf("Flippable", "axis")).toBe("own");
    expect(classOf("Flippable", "back")).toBe("own");
  });

  it("flip.no-requirement — a container, a stack, the desk all turn without a face", () => {
    // The old atom required Surfaced; the turn is geometry and content, not one surface, so a node
    // with children and no face of its own turns too.
    expect(atomDef("Flippable")!.requires).toEqual([]);
  });

  it("flip.defaults-are-front-up-mirror — a fresh Flippable is unturned", () => {
    const f = Flippable().fields;
    expect(f).toEqual({ flip: "", turns: 0, axis: 90, back: "" });
  });

  it("flip.turns-sum-along-the-chain — a stack turns its children", () => {
    // A stack turned once, a child turned none: the child's SUMMED parity is odd, so it shows its
    // back — no per-card bookkeeping, the sum says which side is up.
    const stack = node("deckStack", Flippable({ turns: 1 }));
    const card = node("aceCard", Flippable({ turns: 0 }));
    add(stack, card);
    expect(sumAlongChain(contextFor(card, 100), "Flippable", "turns")).toBe(1);
  });

  it("flip.re-flip-sums-to-even — a card turned back inside a turned stack is face-up again", () => {
    // Case A: the stack's turn and the card's own turn sum to even, so the content is front again.
    const stack = node("deckStack", Flippable({ turns: 1 }));
    const card = node("aceCard", Flippable({ turns: 1 }));
    add(stack, card);
    expect(sumAlongChain(contextFor(card, 100), "Flippable", "turns") % 2).toBe(0);
  });

  it("flip.facing-inspector — which side is up reads off the summed parity, not a hand count", () => {
    // The inspector's question "what side now?" is answered from the SAME sum the effect uses, so a
    // tool and the picture never disagree. A card in a stack turned once shows its back...
    const stack = node("deckStack", Flippable({ turns: 1 }));
    const down = node("aceCard", Flippable({ turns: 0 }));
    add(stack, down);
    expect(facing(down)).toBe("down"); // summed 1 → odd → back
    expect(facing(stack)).toBe("down"); // the stack itself, turned once

    // ...and one turned back inside it is face-up again — case A, read through `facing`.
    const stack2 = node("deckStack2", Flippable({ turns: 1 }));
    const up = node("kingCard", Flippable({ turns: 1 }));
    add(stack2, up);
    expect(facing(up)).toBe("up"); // summed 2 → even → front
  });
});
