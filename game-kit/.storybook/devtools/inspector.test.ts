// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { add, inspect, node } from "../../src/index.js";
import { catalogText } from "../locales/catalog.js";
import { clearInspect, liveReports, onInspect, publishInspect, setNextSceneId, takeSceneId } from "./inspectorBus.js";
import { inspectorMarkup } from "./inspectorPanel.js";
import { inspectorOpen, inspectorTab, setInspectorOpen, setInspectorTab } from "./inspectorPrefs.js";
import { registerSnippetValue, storySource, stripMember } from "./storySource.js";

beforeEach(() => {
  localStorage.clear();
  for (const r of liveReports()) clearInspect(r.sceneId);
});

describe("the tree finds its reader", () => {
  it("inspector.bus-late-subscriber — a panel that opens after the scene still sees it", () => {
    const root = node("b1");
    publishInspect({ sceneId: "s1", nodes: inspect(root) });
    let seen = 0;
    const stop = onInspect((r) => {
      seen = r.nodes.length;
    });
    expect(seen).toBe(1);
    stop();
  });

  it("inspector.bus-gone-scene — a disposed scene stops speaking for the tree", () => {
    publishInspect({ sceneId: "s1", nodes: inspect(node("b2")) });
    clearInspect("s1");
    let called = false;
    const stop = onInspect(() => (called = true));
    expect(called).toBe(false);
    stop();
  });

  it("inspector.markup-is-pure — the same view renders without a scene or a document", () => {
    const root = node("b3");
    add(root, node("b4"));
    const ru = catalogText("ru");
    const html = inspectorMarkup(inspect(root), ru);
    expect(html).toContain(ru.text("inspector.root"));
    expect(html).toContain(ru.text("inspector.noAtoms"));
    expect(html).not.toContain("undefined");
  });

  it("inspector.markup-empty — no scene reporting yet is a blank tree, not a crash", () => {
    expect(inspectorMarkup([], catalogText("en"))).toContain(catalogText("en").text("inspector.title"));
  });
});

describe("where the tree is drawn", () => {
  it("inspector.scene-named-after-story — a docs page matches each tree to its own canvas", () => {
    setNextSceneId("start-basics-root--alone");
    expect(takeSceneId()).toBe("start-basics-root--alone");
    // The name is consumed, not sticky: the next scene must not inherit it.
    expect(takeSceneId()).not.toBe("start-basics-root--alone");
  });

  it("inspector.two-scenes — stories on one page do not overwrite each other", () => {
    publishInspect({ sceneId: "a", nodes: inspect(node("b5")) });
    publishInspect({ sceneId: "b", nodes: inspect(node("b6")) });
    expect(liveReports().map((r) => r.sceneId).sort()).toEqual(["a", "b"]);
  });

  it("inspector.open-persists — folding the block is remembered across stories", () => {
    // Folded until asked: a docs page is prose first, and a card that opens itself on every
    // story pushes the next paragraph below the fold. The one exception — a bare canvas, where
    // the tree is all there is to show — is the page's call, not this preference's.
    expect(inspectorOpen()).toBe(false);
    setInspectorOpen(true);
    expect(inspectorOpen()).toBe(true);
    setInspectorOpen(false);
    expect(inspectorOpen()).toBe(false);
  });

  it("inspector.tab-starts-on-the-tree — the view a reader has not chosen yet", () => {
    // In this slice the tree is the only thing a scene has to show, so a card that opened on
    // the controls would open on the emptier half.
    expect(inspectorTab()).toBe("tree");
  });

  it("inspector.tab-persists — a chosen view survives the next story", () => {
    setInspectorTab("controls");
    expect(inspectorTab()).toBe("controls");
  });

  it("inspector.tab-forgets-a-name-that-is-gone — a stored value is not a promise", () => {
    // A tab removed in a later version is still sitting in somebody's localStorage. Reading it
    // back as-is renders a card with no body at all — a blank panel and no way to tell why.
    localStorage.setItem("gk.inspector.tab", "whatever");
    expect(inspectorTab()).toBe("tree");
  });
});

describe("show code", () => {
  it("source.is-the-story — the snippet is source, never the rendered DOM", () => {
    expect(storySource.type).toBe("code");
  });

  it("source.imports — a snippet says where its names come from, or it reads as magic", () => {
    const out = storySource.transform('const root = node("desk"); add(root, node("hand"))');
    expect(out).toContain('import { node, add } from "game-kit"');
    // Only what the snippet actually uses: an import of names that are not there teaches
    // the wrong API surface.
    expect(out).not.toContain("localIds");
  });

  it("source.scene-becomes-mount — the catalog's shell is not part of the kit", () => {
    // `scene` exists on this website and nowhere else. Left in the snippet it teaches an API
    // that a reader cannot import.
    const out = storySource.transform('scene(node("root")).el');
    expect(out).not.toContain("scene(");
    expect(out).toContain('mount(document.querySelector("#app")!, node("root"))');
  });

  it("source.imports-follow-the-rewrite — mount is imported because mount is what is shown", () => {
    expect(storySource.transform('scene(node("root")).el')).toContain('import { node, mount } from "game-kit"');
  });

  it("source.the-drag-wiring-unwraps — the catalog's finger is not part of the kit either", () => {
    // `wireDrag` exists on this website and nowhere else, exactly like `scene`. The wrapper
    // unwraps to the scene it wired, and ONE comment line says what stood there — a drag needs
    // pointer wiring, and a snippet that hid that would teach a scene that drags by itself.
    const out = storySource.transform('wireDrag(scene(node("desk")), { style: "rigid" }).el');
    expect(out).not.toContain("wireDrag(");
    expect(out).toContain('mount(document.querySelector("#app")!, node("desk"))');
    expect(out).toContain("pointer wiring");
  });

  it("source.plain-code-is-left-alone — a snippet that is already a program is not unwrapped", () => {
    const out = storySource.transform('const root = node("root")');
    expect(out).toContain('const root = node("root")');
  });

  it("source.a-story-becomes-a-program — no object literal, no story members", () => {
    const csf = [
      "{",
      "  render: () => {",
      '    const root = node("root");',
      '    add(root, node("hand"));',
      "    return scene(root).el;",
      "  },",
      "  parameters: {",
      '    gkDocStory: "root.withChildren"',
      "  }",
      "}",
    ].join("\n");
    const out = storySource.transform(csf);
    expect(out).toContain('add(root, node("hand"))');
    // What a reader copies is a program, not a Storybook story.
    expect(out).not.toMatch(/render:|parameters|gkDocStory/);
    // Body lines start at column zero: they were indented by the story that is now gone.
    expect(out).toContain('\nconst root = node("root");');
    // The braces still balance — a snippet that does not parse is worse than a noisy one.
    expect(out.split("{").length).toBe(out.split("}").length);
  });

  it("source.args-become-constants — the knobs are values, and the body still names them", () => {
    const csf = [
      "{",
      '  args: { children: ["hand", "discard"] },',
      "  render: ({ children }) => {",
      '    const root = node("root");',
      "    for (const name of children) add(root, node(name));",
      "    return scene(root).el;",
      "  }",
      "}",
    ].join("\n");
    const out = storySource.transform(csf);
    expect(out).toContain('const children = ["hand", "discard"]');
    expect(out).toContain("for (const name of children) add(root, node(name));");
    // The destructured parameter list is gone with the wrapper it belonged to.
    expect(out).not.toContain("({ children })");
  });

  it("source.a-comma-in-a-name-is-text — the scanner reads syntax, not punctuation", () => {
    // A comma inside a string used to end the member early and cut the snippet in half —
    // wrong in the worst way, because the half left still looked like code.
    const csf = '{ args: { id: "hand, discard" }, render: () => scene(node("root")).el }';
    expect(storySource.transform(csf)).toContain('const id = "hand, discard"');
  });

  it("source.no-orphan-hint — an unextracted story shows nothing at all", () => {
    expect(storySource.transform("   ")).toBe("");
  });

  it("source.keeps-a-story-without-parameters — nothing to strip is not a reason to change it", () => {
    expect(stripMember('{ render: () => scene(node("root")).el }', "parameters")).toBe(
      '{ render: () => scene(node("root")).el }',
    );
  });
});

describe("show code · argument shapes", () => {
  it("code.a-spread-argument-survives-whole — invalid syntax is worse than none", () => {
    // The first colon anywhere split `...shapeArgs(x, { shape: "rect" })` INSIDE the call, and
    // the panel printed `const ...shapeArgs(x, { shape = "rect" }` — wrong in a way that still
    // looks like code, which is the worst kind of wrong.
    const csf = `{
  render: ({ w }) => scene(node("card", Bounded({ bounds: { kind: "rect", w, h: 1 } }))).el,
  args: { w: 2, ...shapeArgs("override", { shape: "rect", h: 1 }) },
}`;
    const out = storySource.transform(csf);
    expect(out).toContain("const w = 2");
    expect(out).toContain('...shapeArgs("override", { shape: "rect", h: 1 })');
    expect(out).not.toMatch(/const \.\.\./);
  });

  it("code.a-whole-argument-stays-whole — loose constants would refer to nothing", () => {
    // `(a) => … a.w …` with the arguments spilled into `const w = 2` is a snippet that cannot
    // run: the body goes on asking for `a`, and nothing here is called that.
    const csf = `{
  render: (a) => scene(node(a.id)).el,
  args: { id: "card", w: 2 },
}`;
    const out = storySource.transform(csf);
    expect(out).toContain('const a = { id: "card", w: 2 }');
    expect(out).not.toContain("const id =");
  });

  it("code.a-catalog-helper-becomes-its-value — the snippet shows the shape, not the way we got it", () => {
    // A story's render is driven by the panel, so it cannot write a shape out: it calls
    // something that turns flat controls into one. Honest code, useless snippet — the reader
    // has no `shapeOf`, and what they came for is what a `bounds` value LOOKS like.
    registerSnippetValue("boxOf", (a) => ({ kind: "rect", w: a["w"], h: 1 }));
    const csf = `{
  render: (a) => scene(node(a.id, Bounded({ bounds: boxOf(a) }))).el,
  args: { id: "card", w: 2 },
}`;
    const out = storySource.transform(csf, { args: { id: "card", w: 2 } });
    expect(out).toContain("bounds: { kind: \"rect\", w: 2, h: 1 }");
    expect(out).not.toContain("boxOf");
    // And what fed the helper is pruned with it: a reader editing `w` in a constant nothing
    // reads any more is a reader being lied to.
    expect(out).toContain('const a = { id: "card" }');
  });

  it("code.no-arguments-no-inlining — a snippet without a story context is left as written", () => {
    // The panel asks for source in places that have no live arguments. Guessing them would be
    // worse than showing the call: a shape invented here is a shape nobody chose.
    registerSnippetValue("boxOf", (a) => ({ kind: "rect", w: a["w"], h: 1 }));
    const csf = `{
  render: (a) => scene(node(a.id, Bounded({ bounds: boxOf(a) }))).el,
  args: { id: "card", w: 2 },
}`;
    expect(storySource.transform(csf)).toContain("boxOf(a)");
  });
});

describe("show code · the catalog's shell does not leak", () => {

  it("code.a-paint-option-is-part-of-the-program — the choice has to be visible", () => {
    // `scene`'s second argument is the catalog's own, and most of it belongs in no snippet — a
    // debug outline is a viewer's business. `bake` is not: it is a decision a reader makes in
    // their own code, and dropping it left two stories with identical snippets and different
    // pictures. That is worse than showing nothing; it says the choice is not in the code.
    const csf = `{
  render: () => scene(node("desk"), { bake: (n) => caps(n).has("Surfaced") }).el,
}`;
    const out = storySource.transform(csf);
    expect(out).toContain("const host = mount(");
    expect(out).toContain('attachPainter(host, painter, { bake: (n) => caps(n).has("Surfaced") })');
    expect(out).toContain("attachPainter");
  });

  it("code.a-scene-option-that-is-not-a-paint-option-stays-out", () => {
    // The debug outline is how the CATALOG opens a page, not part of any program.
    const out = storySource.transform(`{
  render: () => scene(node("desk"), { bounds: true }).el,
}`);
    expect(out).toContain('mount(document.querySelector("#app")!, node("desk"))');
    expect(out).not.toContain("bounds");
    expect(out).not.toContain("attachPainter");
  });
  it("code.a-multiline-render-still-reaches-mount", () => {
    // The rewrite used to be line-bound, so a render written across several lines kept
    // `return scene(…).el` — a name that exists only on this website, and a bare `return` at
    // the top level of a snippet, which does not even parse.
    const csf = `{
  render: () =>
    scene(
      node("card", Bounded()),
    ).el,
}`;
    const out = storySource.transform(csf);
    expect(out).toContain("mount(");
    expect(out).not.toContain("scene(");
    expect(out).not.toMatch(/^\s*return\b/m);
  });
});
