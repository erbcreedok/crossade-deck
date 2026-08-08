import { beforeEach, describe, expect, it } from "vitest";
import { add, caps, node, starved } from "../node.js";
import { contextFor } from "../resolve.js";
import { Bounded } from "./bounded.js";
import { Container, registerLayout, resetLayouts } from "./container.js";
import { freeLayout, rowLayout } from "./layouts.js";
import { areaOf, resolveAlign, resolveFit, Surfaced, type SurfacedFields } from "./surfaced.js";

const box = (w: number, h: number) => Bounded({ size: { kind: "rect", w, h } });

beforeEach(() => {
  resetLayouts();
  registerLayout("free", freeLayout);
  registerLayout("row", rowLayout({ gap: 0 }));
});

describe("Surfaced", () => {
  it("atom.surfaced.area-from-box — the ordinary source", () => {
    expect(areaOf(node("s1", box(2, 3), Surfaced()))).toEqual({ w: 2, h: 3 });
  });

  it("atom.surfaced.area-from-content — the tabletop, which has no box of its own", () => {
    // This is why a requirement may be an ALTERNATIVE at all. Demanding `Bounded` here would
    // outlaw the one node the whole table is built on.
    const table = node("s2", Container({ layout: "row" }), Surfaced());
    add(table, node("s3", box(1, 1)));
    add(table, node("s4", box(1, 1)));
    expect(caps(table).has("Surfaced")).toBe(true);
    expect(areaOf(table)).toEqual({ w: 2, h: 1 });
  });

  it("atom.surfaced.starved — neither a box nor content is nothing to paint on", () => {
    const n = node("s5", Surfaced());
    expect(caps(n).has("Surfaced")).toBe(false);
    expect(starved(n).map((d) => d.name)).toEqual(["Surfaced"]);
    expect(areaOf(n)).toBeUndefined();
  });

  it("atom.surfaced.fit-not-baked — a fromOwner field defaults to absent, not to its value", () => {
    // Pre-filling `fit: "contain"` on every node would mean it is always set, and nothing
    // would ever be inherited from anywhere. The fallback belongs at resolve time.
    const early = node("s6", box(1, 1), Surfaced()).atoms.get("Surfaced")!.fields as SurfacedFields;
    expect(early.fit).toBeUndefined();
    expect(resolveFit(contextFor(node("s7", box(1, 1), Surfaced()), 100))).toBe("contain");
    expect(resolveAlign(contextFor(node("s8", box(1, 1), Surfaced()), 100))).toBe("center");
  });

  it("atom.surfaced.fit-from-owner — set once above, read everywhere below", () => {
    const table = node("s9", Container(), Surfaced({ fit: "cover" }));
    const card = node("s10", box(1, 1), Surfaced());
    add(table, card);
    expect(resolveFit(contextFor(card, 100))).toBe("cover");
  });

  it("atom.surfaced.fit-override — an override is just a value of one's own", () => {
    const table = node("s11", Container(), Surfaced({ fit: "cover" }));
    const card = node("s12", box(1, 1), Surfaced({ fit: "original" }));
    add(table, card);
    expect(resolveFit(contextFor(card, 100))).toBe("original");
  });

  it("atom.surfaced.registry — the look is named, never carried", () => {
    // `"plate"` is the same short string on every client. A palette copied onto each node
    // would be state two clients could legitimately disagree about.
    const fields = node("s13", box(1, 1), Surfaced()).atoms.get("Surfaced")!.fields as SurfacedFields;
    expect(fields.surface).toBe("plate");
    expect(Object.keys(fields).sort()).toEqual(["align", "fit", "surface"]);
  });
});
