import { beforeEach, describe, expect, it } from "vitest";
import { defineAtom, resetAtoms } from "./atom.js";
import { add, node } from "./node.js";
import { inspect } from "./inspect.js";

beforeEach(() => {
  resetAtoms();
});

describe("inspect", () => {
  it("inspector.one-door — a bare tree is fully described without touching internals", () => {
    const root = node("i1");
    const child = node("i2");
    add(root, child);

    const t = inspect(root);
    expect(t.map((n) => n.depth)).toEqual([0, 1]);
    expect(t[0]!.isRoot).toBe(true);
    expect(t[0]!.childCount).toBe(1);
    expect(t[1]!.isRoot).toBe(false);
    expect(t[0]!.atoms).toEqual([]); // "none" is a real answer, not a gap
  });

  it("inspector.reflects-model — every present atom and field is shown", () => {
    const B = defineAtom({
      name: "Bounded",
      requires: [],
      defaults: { size: "1x1", shape: "rect" },
      classes: { size: "own", shape: "own" },
    });
    const root = node("i3", B());
    const [n] = inspect(root);
    expect(n!.atoms).toEqual(["Bounded"]);
    expect(n!.fields.map((f) => f.key).sort()).toEqual(["Bounded.shape", "Bounded.size"]);
    expect(n!.fields.find((f) => f.key === "Bounded.size")!.value).toBe("1x1");
  });

  it("inspector.shows-absent — a starved atom is named, with what it lacks", () => {
    defineAtom({ name: "Bounded", requires: [], defaults: {}, classes: {} });
    const S = defineAtom({
      name: "Surfaced",
      requires: [["Bounded", "Container"]],
      defaults: { surface: "plate" },
      classes: { surface: "own" },
    });
    const [n] = inspect(node("i4", S()));
    expect(n!.atoms).toEqual([]);
    expect(n!.absent).toEqual(["Surfaced (needs Bounded or Container)"]);
  });

  it("inspector.no-invented-fields — an absent atom contributes no fields", () => {
    defineAtom({ name: "Bounded", requires: [], defaults: {}, classes: {} });
    const S = defineAtom({
      name: "Surfaced",
      requires: ["Bounded"],
      defaults: { surface: "plate" },
      classes: { surface: "own" },
    });
    const [n] = inspect(node("i5", S()));
    expect(n!.fields).toEqual([]);
  });
});
