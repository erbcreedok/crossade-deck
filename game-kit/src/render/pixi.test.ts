// THE LAW THIS FILE EXISTS FOR: a frame that changes nothing builds nothing.
//
// The renderer used to destroy the whole stage and make it again on every single `draw` — and a
// `draw` happens sixty times a second while anything at all is moving. A `new Text` rasterises a
// glyph atlas, a `new Graphics` uploads geometry, a `new Filter` compiles a program; doing that
// per frame is what froze the scenes this rewrite came from.
//
// Real Pixi cannot run here (jsdom has no WebGL, and the suite runs in plain node), and that is
// precisely why the claim is worded as a COUNT OF CONSTRUCTOR CALLS: it is the one thing about
// the renderer a headless fake can hold down honestly. What the pixels look like is held down
// elsewhere — by the browser suite, which photographs the stories.
//
// The fake is deliberately dumb: it counts, keeps a child list, and answers the handful of calls
// `apply` makes. It is not a Pixi emulator and must never grow into one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDENTITY, type Transform } from "../core/transform.js";
import { type Mark, type Quad } from "./scenePlan.js";

interface Tally {
  container: number;
  graphics: number;
  text: number;
  matrix: number;
  filter: number;
  /** Every object above, whatever its sort — the number the law is actually about. */
  total: number;
}

const made: Tally = { container: 0, graphics: 0, text: 0, matrix: 0, filter: 0, total: 0 };
const destroyed: string[] = [];

function reset(): void {
  for (const key of Object.keys(made) as Array<keyof Tally>) made[key] = 0;
  destroyed.length = 0;
}

/** What was built since the mark — the shape every assertion below is written in. */
function since(mark: Tally): Tally {
  const out = { ...made };
  for (const key of Object.keys(out) as Array<keyof Tally>) out[key] -= mark[key];
  return out;
}

// ONE SORT OF OBJECT, ASKED WHAT IT IS. A hierarchy would have been the obvious shape and the
// kit forbids one (`node.no-inheritance`) — for the same reason here as everywhere: three thin
// subclasses of a fake are three places to forget something.
class FakeNode {
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  destroyed = false;
  filters: unknown = null;
  mask: unknown = null;
  x = 0;
  y = 0;
  text = "";
  style: unknown = null;
  constructor(
    readonly sort: "container" | "graphics" | "text",
    options?: { text?: string; style?: unknown },
  ) {
    made.total += 1;
    made[sort] += 1;
    if (options) {
      this.text = options.text ?? "";
      this.style = options.style;
    }
  }
  addChild(...kids: FakeNode[]): FakeNode {
    for (const kid of kids) {
      kid.removeFromParent();
      kid.parent = this;
      this.children.push(kid);
    }
    return kids[0]!;
  }
  addChildAt(kid: FakeNode, index: number): FakeNode {
    if (index > this.children.length) throw new Error(`addChildAt out of bounds: ${index}`);
    kid.removeFromParent();
    kid.parent = this;
    this.children.splice(index, 0, kid);
    return kid;
  }
  removeFromParent(): void {
    const owner = this.parent;
    if (!owner) return;
    const at = owner.children.indexOf(this);
    if (at >= 0) owner.children.splice(at, 1);
    this.parent = null;
  }
  removeChildren(): FakeNode[] {
    const gone = this.children;
    for (const kid of gone) kid.parent = null;
    this.children = [];
    return gone;
  }
  setFromMatrix(): void {
    /* the pose is a number this fake has no use for */
  }
  destroy(options?: { children?: boolean }): void {
    this.destroyed = true;
    destroyed.push(this.sort);
    const kids = this.removeChildren();
    this.removeFromParent();
    if (options?.children) for (const kid of kids) kid.destroy(options);
  }
  // The drawing verbs, every one a no-op that chains — the fake counts objects, not paths.
  clear(): this {
    return this;
  }
  moveTo(): this {
    return this;
  }
  lineTo(): this {
    return this;
  }
  closePath(): this {
    return this;
  }
  rect(): this {
    return this;
  }
  fill(): this {
    return this;
  }
  stroke(): this {
    return this;
  }
}

type Born<T> = new (options?: { text?: string; style?: unknown }) => T;
const asContainer = FakeNode.bind(null, "container") as unknown as Born<FakeNode>;
const asGraphics = FakeNode.bind(null, "graphics") as unknown as Born<FakeNode>;
const asText = FakeNode.bind(null, "text") as unknown as Born<FakeNode>;

vi.mock("pixi.js", () => {
  class FakeMatrix {
    constructor() {
      made.matrix += 1;
      made.total += 1;
    }
  }
  class FakeFilter {
    constructor() {
      made.filter += 1;
      made.total += 1;
    }
    destroy(): void {
      destroyed.push("filter");
    }
  }
  class FakeApplication {
    stage = new asContainer();
    renders = 0;
    ticks: Array<(t: { deltaMS: number }) => void> = [];
    ticker = {
      add: (fn: (t: { deltaMS: number }) => void) => this.ticks.push(fn),
      remove: () => undefined,
    };
    renderer = {
      resize: () => undefined,
      background: { clearBeforeRender: true },
      render: () => undefined,
      extract: { pixels: () => ({ width: 1, height: 1, pixels: new Uint8Array(4) }) },
    };
    init(): Promise<void> {
      return Promise.resolve();
    }
    render(): void {
      this.renders += 1;
    }
    destroy(): void {
      this.stage.destroy({ children: true });
    }
  }
  return {
    Application: FakeApplication,
    Assets: { load: () => new Promise(() => undefined) },
    BlurFilter: FakeFilter,
    Container: asContainer,
    defaultFilterVert: "",
    Filter: FakeFilter,
    GlProgram: { from: () => ({}) },
    Graphics: asGraphics,
    Matrix: FakeMatrix,
    RenderTexture: { create: () => ({ destroy: () => undefined }) },
    Text: asText,
    Texture: class {},
    UniformGroup: class {
      uniforms: Record<string, number> = {};
    },
  };
});

const { pixiPainter } = await import("./pixi.js");

/** A card-shaped quad: a filled contour, a stroke and a two-line caption. */
function card(id: string, pose: Transform = IDENTITY): Quad {
  return {
    id,
    x: 0,
    y: 0,
    w: 60,
    h: 90,
    points: [
      { x: -30, y: -45 },
      { x: 30, y: -45 },
      { x: 30, y: 45 },
      { x: -30, y: 45 },
    ],
    transform: pose,
    layers: [{ paint: "panelBg", image: undefined, opacity: 1 }],
    stroke: {
      color: "accent",
      width: 2,
      opacity: 1,
      alignment: 0.5,
      cap: "butt",
      join: "miter",
      miterLimit: 10,
      dashes: undefined,
      dash: undefined,
    },
    text: {
      font: { family: "serif", size: 14, weight: 400 },
      fill: "text",
      lines: [
        { text: "ace", x: -20, y: -20, ascent: 11 },
        { text: "of spades", x: -20, y: 0, ascent: 11 },
      ],
    },
    z: 0,
  };
}

/** The SAME plan, as a different set of objects — a fresh one is what `scenePlan` hands down. */
function again(plan: readonly Quad[]): Quad[] {
  return structuredClone(plan) as Quad[];
}

async function standing(plan: readonly Quad[], marks: readonly Mark[] = []) {
  const painter = pixiPainter({} as HTMLCanvasElement, { width: 400, height: 400, resolution: 1 });
  await painter.ready;
  painter.draw(plan, marks, "dark");
  return painter;
}

describe("the painter keeps its objects between frames", () => {
  beforeEach(reset);

  it("pixi.a-still-frame-builds-nothing — the same plan again costs no object at all", async () => {
    // THE LAW. `scenePlan` is a pure function that builds a fresh plan every frame, so the
    // second frame is a different set of objects carrying the same numbers — which is exactly
    // the case a renderer must recognise, and exactly the one an identity check would miss.
    const plan = [card("a"), card("b")];
    const painter = await standing(plan);
    const mark = { ...made };
    painter.draw(again(plan), [], "dark");
    expect(since(mark)).toEqual({ container: 0, graphics: 0, text: 0, matrix: 0, filter: 0, total: 0 });
    painter.destroy();
  });

  it("pixi.a-moved-quad-builds-only-its-pose — a card that flies keeps its glyphs", async () => {
    // The animation case, and the reason a live quad's contour is in its own space: the pose
    // moves, the geometry does not, and the caption's atlas is not rasterised again.
    const painter = await standing([card("a")]);
    const mark = { ...made };
    painter.draw([card("a", { a: 1, b: 0, c: 0, d: 1, e: 120, f: 40 })], [], "dark");
    const built = since(mark);
    expect({ graphics: built.graphics, text: built.text, container: built.container }).toEqual({
      graphics: 0,
      text: 0,
      container: 0,
    });
    // One matrix, which is the whole of what moving costs.
    expect(built.matrix).toBe(1);
    painter.destroy();
  });

  it("pixi.a-restyled-caption-is-rebuilt — a new string is a new atlas, and only then", async () => {
    const painter = await standing([card("a")]);
    const mark = { ...made };
    const spoken = card("a");
    const lines = [...spoken.text!.lines];
    lines[0] = { ...lines[0]!, text: "king" };
    painter.draw([{ ...spoken, text: { ...spoken.text!, lines } }], [], "dark");
    // The STRING is set on the standing object; nothing is constructed for it.
    expect(since(mark).text).toBe(0);
    painter.destroy();
  });

  it("pixi.a-dropped-quad-is-destroyed — what leaves the plan leaves the stage", async () => {
    const painter = await standing([card("a"), card("b")]);
    reset();
    painter.draw([card("a")], [], "dark");
    // The box, its fill, its stroke and both of its lines.
    expect(destroyed.length).toBeGreaterThanOrEqual(5);
    painter.destroy();
  });

  it("pixi.the-plan-owns-the-order — a reordered plan reorders the stage and builds nothing", async () => {
    const painter = await standing([card("a"), card("b"), card("c")]);
    const mark = { ...made };
    painter.draw([card("c"), card("a"), card("b")], [], "dark");
    expect(since(mark).total).toBe(0);
    painter.destroy();
  });
});
