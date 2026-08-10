import { beforeEach, describe, expect, it } from "vitest";
import { add, caps, node, starved } from "../node.js";
import { Bounded } from "./bounded.js";
import { Container, registerLayout, resetLayouts } from "./container.js";
import { freeLayout, rowLayout } from "./layouts.js";
import { areaOf, Surfaced, type SurfacedFields } from "./surfaced.js";
import { rect } from "../../presets/shapes.js";

const box = (w: number, h: number) => Bounded({ bounds: rect(w, h) });

beforeEach(() => {
  resetLayouts();
  registerLayout("free", freeLayout);
  registerLayout("row", rowLayout({ gap: 0 }));
});

describe("Surfaced", () => {
  it("atom.surfaced.area-from-box — the ordinary source", () => {
    expect(areaOf(node("s1", box(2, 3), Surfaced()))).toEqual({ w: 2, h: 3 });
  });

  it("atom.surfaced.area-from-content — the desk, which has no box of its own", () => {
    // This is why a requirement may be an ALTERNATIVE at all. Demanding `Bounded` here would
    // outlaw the one node the whole desk is built on.
    const desk = node("s2", Container({ layout: "row" }), Surfaced());
    add(desk, node("s3", box(1, 1)));
    add(desk, node("s4", box(1, 1)));
    expect(caps(desk).has("Surfaced")).toBe(true);
    expect(areaOf(desk)).toEqual({ w: 2, h: 1 });
  });

  it("atom.surfaced.starved — neither a box nor content is nothing to paint on", () => {
    const n = node("s5", Surfaced());
    expect(caps(n).has("Surfaced")).toBe(false);
    expect(starved(n).map((d) => d.name)).toEqual(["Surfaced"]);
    expect(areaOf(n)).toBeUndefined();
  });

  it("atom.surfaced.one-field — the atom names a record and says nothing else", () => {
    // `fit` and `align` used to sit here and were read by nobody: declared before the record
    // had layers or pictures, they were two controls a reader could move to no effect. Their
    // home is the layer, where a picture and an area actually meet.
    const fields = node("s6", box(1, 1), Surfaced()).atoms.get("Surfaced")!.fields as SurfacedFields;
    expect(Object.keys(fields)).toEqual(["surface"]);
  });

  it("atom.surfaced.registry — the look is named, never carried", () => {
    // `"plate"` is the same short string on every client. A palette copied onto each node
    // would be state two clients could legitimately disagree about.
    const fields = node("s13", box(1, 1), Surfaced()).atoms.get("Surfaced")!.fields as SurfacedFields;
    expect(fields.surface).toBe("plate");
  });
});
