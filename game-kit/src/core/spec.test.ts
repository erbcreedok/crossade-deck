import { describe, it, expect } from "vitest";
import { add, node } from "./node.js";
import { caps, fieldsOf } from "./node.js";
import { Container, registerLayout } from "./atoms/container.js";
import { freeLayout } from "./atoms/layouts.js";
import { Bounded } from "./atoms/bounded.js";
import { Surfaced } from "./atoms/surfaced.js";
import { Transformable } from "./atoms/transformable.js";
import { Flippable } from "./atoms/flippable.js";
import { Marked } from "./atoms/marked.js";
import { Owned } from "./atoms/owned.js";
import { Private } from "./atoms/private.js";
import { rect } from "../presets/shapes.js";
import { fromSpec, toSpec, treeFromJson, treeJson, type NodeSpec } from "./spec.js";
import { bump, Revised, revOf } from "./atoms/revised.js";
import { project } from "./project.js";

describe("spec: toSpec / fromSpec & Revised", () => {
  function makeSampleTree() {
    registerLayout("spec.free", freeLayout);
    const rootNode = node("desk", Container({ layout: "spec.free" }), Revised({ rev: 1 }));

    const c1 = node(
      "c1",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced(),
      Transformable({ at: { x: 10, y: 20 } }),
      Flippable({ turns: 1 }),
      Marked({ mark: "flipped", by: "south" }),
      Owned({ box: "deck" }),
    );
    const c2 = node(
      "c2",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced(),
      Transformable({ at: { x: 50, y: 20 } }),
      Private({ access: ["south"] }),
    );
    const c3 = node("c3", Bounded({ bounds: rect(1, 1.4) }), Surfaced(), Transformable({ at: { x: 90, y: 20 } }));

    add(rootNode, c1);
    add(rootNode, c2);
    add(rootNode, c3);
    return rootNode;
  }

  it("spec.roundtrip — toSpec -> JSON -> fromSpec -> toSpec returns deeply equal spec and matching caps/fields", () => {
    const original = makeSampleTree();
    const spec1 = toSpec(original);

    const json = treeJson(original);
    const restored = treeFromJson(json);

    const spec2 = toSpec(restored);
    expect(spec2).toEqual(spec1);

    expect(caps(restored.children[0]!)).toEqual(caps(original.children[0]!));
    expect(fieldsOf(restored.children[0]!, "Marked")).toEqual(fieldsOf(original.children[0]!, "Marked"));
    expect(fieldsOf(restored.children[1]!, "Private")).toEqual(fieldsOf(original.children[1]!, "Private"));
  });

  it("spec.project-preserves-serialization — project(root, seat) before and after roundtrip produces identical toSpec", () => {
    const original = makeSampleTree();
    const restored = treeFromJson(treeJson(original));

    const projOriginal = toSpec(project(original, "south"));
    const projRestored = toSpec(project(restored, "south"));
    expect(projRestored).toEqual(projOriginal);
  });

  it("spec.unknown-atom-throws — fromSpec with unknown atom throws an Error naming node id and atom name", () => {
    const badSpec: NodeSpec = {
      id: "card-x",
      atoms: {
        NonExistentAtom: { foo: "bar" },
      },
      children: [],
    };
    expect(() => fromSpec(badSpec)).toThrow(/NonExistentAtom/);
    expect(() => fromSpec(badSpec)).toThrow(/card-x/);
  });

  it("spec.revised-atom-bump — revOf defaults to 0 when absent, bump increments rev by 1", () => {
    const root = node("root");
    expect(revOf(root)).toBe(0);

    bump(root);
    expect(revOf(root)).toBe(1);

    bump(root);
    expect(revOf(root)).toBe(2);
  });

  it("guard.spec-holds-no-functions — NodeSpec contains only data primitives", () => {
    const original = makeSampleTree();
    const spec = toSpec(original);

    function assertNoFunctions(obj: unknown) {
      if (obj === null || obj === undefined) return;
      expect(typeof obj).not.toBe("function");
      if (typeof obj === "object") {
        for (const val of Object.values(obj)) {
          assertNoFunctions(val);
        }
      }
    }

    assertNoFunctions(spec);
    expect(JSON.stringify(spec)).toEqual(JSON.stringify(JSON.parse(JSON.stringify(spec))));
  });
});
