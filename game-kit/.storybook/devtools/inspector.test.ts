// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { add, inspect, node } from "../../src/index.js";
import { catalogText } from "../locales/catalog.js";
import { clearInspect, liveReports, onInspect, publishInspect, setNextSceneId, takeSceneId } from "./inspectorBus.js";
import { inspectorMarkup } from "./inspectorPanel.js";
import { inspectorOpen, setInspectorOpen } from "./inspectorPrefs.js";
import { storySource, stripMember } from "./storySource.js";

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
    expect(inspectorOpen()).toBe(true); // the tree is all a scene has to show in this slice
    setInspectorOpen(false);
    expect(inspectorOpen()).toBe(false);
    setInspectorOpen(true);
    expect(inspectorOpen()).toBe(true);
  });
});

describe("show code", () => {
  it("source.is-the-story — the snippet is source, never the rendered DOM", () => {
    expect(storySource.type).toBe("code");
  });

  it("source.imports — a snippet says where its names come from, or it reads as magic", () => {
    const out = storySource.transform('const root = node("table"); add(root, node("hand"))');
    expect(out).toContain('import { node, add } from "game-kit"');
    // Only what the snippet actually uses: an import of names that are not there teaches
    // the wrong API surface.
    expect(out).not.toContain("localIds");
  });

  it("source.scene-is-not-the-kit — the catalog's shell is named as the catalog's", () => {
    const out = storySource.transform("scene(node(\"table\")).el");
    expect(out).toMatch(/CATALOG|catalog/);
    expect(out).not.toContain('import { scene }');
  });

  it("source.mount-line — the one line that touches the page is spelled out", () => {
    const out = storySource.transform('const root = node("table")');
    expect(out).toContain('const root = node("table")');
    expect(out).toContain("append(el)");
  });

  it("source.no-orphan-hint — an unextracted story shows nothing, not a mount line alone", () => {
    expect(storySource.transform("   ")).toBe("");
  });

  it("source.no-catalog-bookkeeping — doc keys are not part of building a scene", () => {
    const csf = [
      "{",
      "  render: () => {",
      '    const root = node("table");',
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
    expect(out).not.toContain("gkDocStory");
    expect(out).not.toContain("parameters");
    // The braces still balance — a snippet that does not parse is worse than a noisy one.
    expect(out.split("{").length).toBe(out.split("}").length);
  });

  it("source.keeps-a-story-without-parameters — nothing to strip is not a reason to change it", () => {
    expect(stripMember('{ render: () => scene(node("table")).el }', "parameters")).toBe(
      '{ render: () => scene(node("table")).el }',
    );
  });
});
