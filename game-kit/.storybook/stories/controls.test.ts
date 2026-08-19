// A control that does not exist is a claim the kit cannot do the thing. That is the failure
// this file guards: the catalog offered `rect` and `circle` while `poly` had been in the model
// since the first day, and a reader has no way to tell "cannot" from "was not asked".

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extentOf, outlineOf, surfaceNames, transformShape } from "../../src/index.js";
import { documented, PRESETS, SHAPE_ARGS, shapeArgTypes, shapeOf, shapeSource } from "./surfaceControls.js";
import { overriddenSliceOf, OVERRIDE_ARGS, recordOf, RECORD_ARGS, RECORD_ARG_TYPES, type RecordArgs } from "./surfaceControls.js";
import { POSE_ARGS, poseArgsAt, poseFields, poseSliceOf, poseSourceOf } from "./pose.js";

const STORIES = new URL("./", import.meta.url).pathname;
const CHROME = new URL("../locales/chrome/en.json", import.meta.url).pathname;

describe("the words a control names", () => {
  it("controls.every-word-a-control-names-exists — or the panel prints the key at the reader", () => {
    // A MISSING WORD IS NOT A CRASH, which is exactly why this has to be scanned. The bundle's
    // lookup falls back to the key, so the row arrives reading `— arg.headSurface` and the page
    // stays up: a control with no description, in the one place a reader goes to find out what
    // the control is. The locale suite cannot catch it either — both languages are equally
    // complete, and neither has ever heard of the key.
    const words = new Set(Object.keys(JSON.parse(readFileSync(CHROME, "utf8")) as Record<string, unknown>));
    const missing: string[] = [];
    for (const name of readdirSync(STORIES).filter((f) => f.endsWith(".ts"))) {
      readFileSync(join(STORIES, name), "utf8")
        .split("\n")
        .forEach((line, i) => {
          // EVERY `arg.` LITERAL, not only the ones handed straight to `documented`. Half the
          // controls on the path scenes go through a two-line helper, so a scan tied to the call
          // shape would have declared the page clean while three of its rows read as keys.
          for (const m of line.matchAll(/"(arg\.[A-Za-z0-9_.-]+)"/g)) {
            if (!words.has(m[1]!)) missing.push(`${name}:${i + 1}  ${m[1]}`);
          }
        });
    }
    expect(missing).toEqual([]);
  });
});

describe("record controls", () => {
  it("controls.an-untouched-override-is-its-base — empty is inherit, for every field at once", () => {
    // `Restyle` stands a base record beside its clone and claims the clone is the base plus
    // ONLY what the reader set. Checked over a base with every optional part present — an
    // image, a dash, a non-default cap — because a field the merge skips is invisible against
    // a base that keeps its defaults.
    const base: RecordArgs = { ...RECORD_ARGS, image: "tile", dash: true, cap: "round" };
    expect(overriddenSliceOf(OVERRIDE_ARGS, base)).toEqual(base);
    // A set field is an override, not a rebuild: one value set, one field changed.
    expect(overriddenSliceOf({ ...OVERRIDE_ARGS, overStrokeWidth: 0.2 }, base)).toEqual({ ...base, strokeWidth: 0.2 });
    // And the three-way switch reaches the record's own toggles, in both directions.
    expect(overriddenSliceOf({ ...OVERRIDE_ARGS, overStroke: "off" }, base).stroke).toBe(false);
    expect(overriddenSliceOf({ ...OVERRIDE_ARGS, overDash: "on" }, { ...base, dash: false }).dash).toBe(true);
  });
});

describe("pose controls", () => {
  it("controls.an-untouched-pose-is-not-printed — the default must be invisible", () => {
    // The snippet's rule, the same one the shape builder obeys: a default is not a decision.
    // `scale`'s neutral is ONE — a builder that compared everything to zero would print an
    // untouched scale on every pose and hide a set zero.
    expect(poseSourceOf(POSE_ARGS)).toBe("{}");
    expect(poseFields(POSE_ARGS)).toEqual({});
    expect(poseSourceOf({ ...POSE_ARGS, angle: 45 })).toBe("{ angle: 45 }");
    expect(poseSourceOf({ ...POSE_ARGS, scale: 1 })).toBe("{}");
    expect(poseFields({ ...POSE_ARGS, scale: 0 })).toEqual({ scale: 0 });
    // Half a position is still a position: one axis set writes the whole `at`.
    expect(poseFields({ ...POSE_ARGS, x: 0.4 })).toEqual({ at: { x: 0.4, y: 0 } });
  });

  it("controls.a-prefixed-pose-reads-its-own-rows — handAngle is the hand's, never the card's", () => {
    // Two whole poses on one panel, told apart by prefix alone — a slice that read a neighbour's
    // row would show one node wearing the other's turn, and no scene would say which.
    const args = { ...poseArgsAt("hand", { angle: 30 }), ...poseArgsAt("card", { x: 0.5 }) };
    expect(poseSliceOf(args, "hand")).toEqual({ ...POSE_ARGS, angle: 30 });
    expect(poseSliceOf(args, "card")).toEqual({ ...POSE_ARGS, x: 0.5 });
  });
});

describe("shape controls", () => {
  it("controls.every-preset-is-offered — the catalog does not narrow the kit", () => {
    // Hand-written against the panel: a helper added to the kit and not offered here is a
    // shape the catalog silently claims does not exist.
    const options = (shapeArgTypes()["preset"] as { options: readonly string[] }).options;
    expect([...options]).toEqual([...PRESETS]);
  });

  it("controls.every-preset-builds-a-real-shape", () => {
    for (const preset of PRESETS) {
      const shape = shapeOf({ ...SHAPE_ARGS, preset });
      const { w, h } = extentOf(shape);
      expect(Number.isFinite(w) && Number.isFinite(h), preset).toBe(true);
      // `path` IS THE EXCEPTION, and it is the point of it: a hand-written path need not enclose
      // anything. Its default is a line — two points, no area at all — and a single point is
      // just as legal. Every other preset calls a helper that closes a region, and an open one
      // there would mean the helper is broken.
      if (preset === "path") {
        expect(outlineOf(shape).length, preset).toBeGreaterThan(0);
        continue;
      }
      expect(outlineOf(shape).length, preset).toBeGreaterThan(2);
      expect(w > 0 && h > 0, preset).toBe(true);
    }
  });

  it("controls.every-preset-has-its-own-parameters — an option nobody can size is not an option", () => {
    const types = shapeArgTypes();
    const shownFor = (preset: string): string[] =>
      Object.entries(types)
        .filter(([, spec]) => {
          const when = (spec as { if?: { eq?: string; in?: readonly string[] } }).if;
          return when?.eq === preset || when?.in?.includes(preset);
        })
        .map(([name]) => name);
    for (const preset of PRESETS) expect(shownFor(preset).length, `${preset} has no parameters`).toBeGreaterThan(0);
  });

  it("controls.every-control-names-its-field — the panel says whose these are", () => {
    // TWO sections, and the split is the point. `bounds` holds what makes the FIELD; the
    // builder holds the catalog's own — the scale/turn/move that fit a pasted shape before it
    // becomes `bounds`. Put together, `rotate` under `bounds` said the atom has a rotation.
    const builder = ["scaleX", "scaleY", "rotate", "offsetX", "offsetY"];
    for (const [name, spec] of Object.entries(shapeArgTypes())) {
      const category = (spec as { table?: { category?: string } }).table?.category;
      expect(category, name).toBe(builder.includes(name) ? "builder" : "bounds");
    }
  });


  it("controls.a-condition-uses-an-operator-storybook-has", () => {
    // `eq`, `neq`, `exists`, `truthy` — and nothing else. A condition written as a list of
    // presets is not rejected, it is IGNORED, so the control shows on every page: that is how a
    // width turned up on the circle. Silent, and invisible in every headless test but this one.
    const allowed = new Set(["arg", "global", "eq", "neq", "exists", "truthy"]);
    for (const [name, spec] of Object.entries(shapeArgTypes())) {
      const when = (spec as { if?: Record<string, unknown> }).if;
      if (!when) continue;
      for (const key of Object.keys(when)) expect(allowed.has(key), `${name}.if.${key}`).toBe(true);
    }
  });
  it("controls.a-type-badge-is-not-guessed — the fallback calls everything a boolean", () => {
    // The badge is inferred from the control, and the last line of that inference is "boolean".
    // A `Shape` handed over as an object control came out labelled `boolean` — in the one row
    // on the shelf where the type IS the lesson.
    const shown = (spec: Record<string, unknown>): string => {
      const d = Object.getOwnPropertyDescriptor(documented("arg.bounds", spec), "description")!;
      return String(d.get!.call(undefined)).slice(0, 40);
    };
    expect(shown({ control: "object" }).startsWith("`object`")).toBe(true);
    expect(shown({ control: "boolean" }).startsWith("`boolean`")).toBe(true);
  });

  it("controls.a-long-list-is-not-a-type — the picker is the list, the badge is not", () => {
    // The surface picker offers every registered record: ninety-odd names, several of them paths.
    // Spelled out they filled the row end to end, and the badge sits IN FRONT of the sentence
    // saying what the field is worth — so the answer the reader came for fell off the end.
    const shown = (spec: Record<string, unknown>): string => {
      const d = Object.getOwnPropertyDescriptor(documented("arg.surfaceName", spec), "description")!;
      return String(d.get!.call(undefined));
    };
    const many = surfaceNames();
    expect(many.length, "too few registered surfaces to be a wall").toBeGreaterThan(20);
    const wall = shown({ control: "select", options: many });
    expect(wall).toContain(`one of ${many.length}`);
    expect(wall.length).toBeLessThan(80);
    // The useful half is kept: a short list is still worth more than the word `string`.
    expect(shown({ control: "select", options: ["contain", "cover"] })).toContain("contain | cover");
  });

  it("controls.zero-is-typeable — the catalog does not put a floor the model has not", () => {
    // The floor was 0.1, for no reason anyone could give, and a box of nothing is legal — an
    // anchor a layout still places.
    const types = shapeArgTypes();
    for (const name of ["w", "h", "r", "rx", "ry", "polyR", "outerR", "innerR"]) {
      expect((types[name] as { control: { min: number } }).control.min, name).toBe(0);
    }
  });
});

describe("the snippet says what the reader would write", () => {
  it("controls.a-preset-prints-as-its-call — not as a soup of coordinates", () => {
    // Every name in it is exported by the KIT. Printing the resulting path would be honest and
    // useless: twenty numbers say nothing, `star(5, 0.9, 0.42)` says what it is.
    expect(shapeSource({ ...SHAPE_ARGS, preset: "star", points: 5, outerR: 0.9, innerR: 0.42 })).toBe(
      "star(5, 0.9, 0.42)",
    );
    expect(shapeSource({ ...SHAPE_ARGS, preset: "rect", w: 1, h: 1.4 })).toBe("rect(1, 1.4)");
    expect(shapeSource({ ...SHAPE_ARGS, preset: "ellipse", rx: 1.2, ry: 0.8 })).toBe("ellipse(1.2, 0.8)");
  });

  it("controls.an-untouched-transform-is-not-printed — the default must be invisible", () => {
    expect(shapeSource({ ...SHAPE_ARGS, preset: "circle", r: 1 })).toBe("circle(1)");
    expect(shapeSource({ ...SHAPE_ARGS, preset: "circle", r: 1, rotate: 15 })).toBe(
      "transformShape(circle(1), { rotate: 15 })",
    );
  });
});

describe("the shape as a whole", () => {
  // A designer opens a star, makes it a node's bounds, and then wants it bigger, turned, or
  // moved onto its origin. Before these there was no way to do any of it but edit every point.
  const T = { scaleX: 1, scaleY: 1, rotate: 0, offsetX: 0, offsetY: 0 };

  it("controls.identity-changes-nothing — the default must be invisible", () => {
    const shape = shapeOf({ ...SHAPE_ARGS, preset: "star" });
    expect(transformShape(shape, T)).toBe(shape);
  });

  it("controls.a-transform-is-exact-on-the-handles — a scaled curve is not a coarser one", () => {
    // An affine map takes a cubic to a cubic. Flattening first and scaling the points would
    // freeze the sampling of whatever size it happened to be at.
    const oval = shapeOf({ ...SHAPE_ARGS, preset: "ellipse", rx: 1, ry: 0.5 });
    const big = transformShape(oval, { ...T, scaleX: 2, scaleY: 2 });
    expect(big.segments).toHaveLength(oval.segments.length);
    expect(extentOf(big).w).toBeCloseTo(extentOf(oval).w * 2, 9);
  });

  it("controls.offset-moves-the-shape-off-its-origin — which is the point", () => {
    const moved = transformShape(shapeOf({ ...SHAPE_ARGS, preset: "rect", w: 1, h: 1 }), { ...T, offsetX: 2 });
    for (const p of outlineOf(moved)) expect(p.x).toBeGreaterThan(0);
  });
});

describe("the record", () => {
  it("controls.every-record-control-names-its-field — the panel says whose these are", () => {
    // A ROW WITHOUT A SECTION IS A ROW WITHOUT AN OWNER. The record's twenty controls sat loose
    // above a group called `surface` that held exactly one of them, so the panel read as a
    // deliberate arrangement rather than the nineteen omissions it was — and `stroke`, the
    // toggle fifteen of the others hang off, had no declaration at all: Storybook inferred it
    // from the default and gave it no description, no type and no heading.
    //
    // Written against `RECORD_ARGS`, not against the declarations, so the failure is "a field
    // nobody can read" rather than "a declaration nobody uses". The next field added to the
    // record has to be introduced here or the panel says nothing about it.
    for (const name of Object.keys(RECORD_ARGS)) {
      const spec = RECORD_ARG_TYPES[name] as { table?: { category?: string } } | undefined;
      expect(spec, `${name} has no control declared`).toBeDefined();
      expect(spec?.table?.category, name).toBe("surface");
    }
  });

  it("controls.a-literal-colour-beats-the-token — that is the lesson, not a convenience", () => {
    // A CSS name rather than a hex, because `guard.no-raw-colour` is right: a literal colour
    // outside the theme is how a palette stops being one, and a test is not an exception.
    const record = recordOf({ ...RECORD_ARGS, fill: "panelBg", fillCustom: "rebeccapurple" });
    expect(record.layers[0]!.paint).toBe("rebeccapurple");
  });
});
describe("the raw shape", () => {
  it("controls.a-path-preset-is-the-raw-value — the one preset printed as what it IS", () => {
    // Every other preset prints as the helper that built it, because `star(5, 1, 0.5)` says
    // what it is and a list of ten coordinates says nothing. `path` is the opposite case: it
    // has no helper worth naming, and the value is the lesson — `{ start, segments }`, which is
    // all a `Shape` has ever been. It is the only place a reader sees that with no call in the
    // way, and the section opens on it for exactly that reason.
    const raw = shapeOf({ ...SHAPE_ARGS, preset: "path", vertices: "-1,-1 1,-1 0,1" });
    expect(Object.keys(raw).sort()).toEqual(["segments", "start"]);
    expect(raw.start).toEqual({ x: -1, y: -1 });
    // Two points are a line and one is a point: an open list keeps its LENGTH, and neither has
    // an area to close over.
    expect(shapeOf({ ...SHAPE_ARGS, preset: "path", vertices: "0,0 1,0" }).segments).toHaveLength(1);
    expect(shapeOf({ ...SHAPE_ARGS, preset: "path", vertices: "0,0" }).segments).toHaveLength(0);
    // And the snippet prints the value, not a call — no helper name appears in it at all.
    const printed = shapeSource({ ...SHAPE_ARGS, preset: "path", vertices: "-1,-1 1,-1 0,1" });
    expect(printed).toContain("start");
    expect(printed).toContain("segments");
    for (const helper of PRESETS.filter((n) => n !== "path" && n !== "svg")) {
      expect(printed, `${helper}( should not appear`).not.toContain(`${helper}(`);
    }
  });
});
