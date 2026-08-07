import { describe, expect, it } from "vitest";
import { catalogText, LOCALES, missingKeys, unresolvedPlurals } from "./catalog.js";

describe("the catalog owns its words", () => {
  it("locales.complete — every locale carries every key of the reference bundle", () => {
    // The language switch is only honest if there is nothing left for it to fall back on.
    for (const locale of LOCALES) expect(missingKeys(locale), `locale ${locale}`).toEqual([]);
  });

  it("locales.plurals — every count resolves, in each language's own categories", () => {
    // English has two forms and Russian four, so "the same keys in both files" is the wrong
    // rule; what must hold is that no count falls through to a raw key.
    for (const locale of LOCALES) expect(unresolvedPlurals(locale), `locale ${locale}`).toEqual([]);
  });

  it("locales.russian-plurals — 1 узел, 2 узла, 5 узлов, and not one form for all three", () => {
    // The kit used to carry a two-form helper, and it printed "узлов: 2" everywhere. Plural
    // rules are the consumer's answer, which is why this test lives on the consumer's side.
    const ru = catalogText("ru");
    expect(ru.plural("inspector.nodes", 1)).toBe("1 узел");
    expect(ru.plural("inspector.nodes", 2)).toBe("2 узла");
    expect(ru.plural("inspector.nodes", 5)).toBe("5 узлов");
    expect(ru.plural("inspector.nodes", 21)).toBe("21 узел");
  });

  it("locales.stops-at-the-catalog — words are resolved here and never handed to the kit", () => {
    // The kit has no notion of a language, so nothing about this object crosses into it: the
    // scene draws a caption that is already written.
    expect(catalogText("en").text("inspector.title")).toBe("node tree");
  });

  it("locales.prose-is-a-bundle-key — a docs page is text like any caption", () => {
    // Prose written inline in `parameters.docs.description` is baked into the story index at
    // build time and can never follow the switch — which is how a toggle ends up half-working.
    for (const locale of LOCALES) {
      expect(catalogText(locale).text("docs.node.component").length).toBeGreaterThan(200);
    }
    expect(catalogText("ru").text("docs.node.component")).not.toBe(
      catalogText("en").text("docs.node.component"),
    );
  });

  it("locales.lines-join — an array is for the translator's eyes, not a different shape", () => {
    expect(catalogText("en").text("docs.root.alone")).toContain("\n");
  });
});
