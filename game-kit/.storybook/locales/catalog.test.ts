import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { catalogText, LOCALES, missingKeys, unresolvedPlurals } from "./catalog.js";
import { loadedPage, loadPage, missingPageKeys, PAGE_NAMES, pageOf, resetPages } from "./pages.js";

beforeEach(() => {
  resetPages();
});

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CATALOG = join(HERE, "..");

function filesUnder(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path, ext) : path.endsWith(ext) ? [path] : [];
  });
}

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

  it("locales.prose-is-a-bundle-key — a docs page is text like any caption", async () => {
    // Prose written inline in `parameters.docs.description` is baked into the story index at
    // build time and can never follow the switch — which is how a toggle ends up half-working.
    for (const locale of LOCALES) {
      const page = await loadPage("node", locale);
      expect(page.text("docs.node.component").length).toBeGreaterThan(200);
    }
    const [ru, en] = [await loadPage("node", "ru"), await loadPage("node", "en")];
    expect(ru.text("docs.node.component")).not.toBe(en.text("docs.node.component"));
  });

  it("locales.lines-join — an array is for the translator's eyes, not a different shape", async () => {
    expect((await loadPage("root", "en")).text("docs.root.component")).toContain("\n");
  });
});

describe("prose is loaded page by page", () => {
  it("locales.chrome-carries-no-prose — the fixed set stays fixed as the catalog grows", () => {
    // The whole point of the split: whatever is imported statically is downloaded by every
    // reader of every page, so nothing that belongs to ONE page may live there.
    const chrome = Object.keys(catalogText("en") as unknown as object);
    expect(chrome.filter((k) => k.startsWith("docs."))).toEqual([]);
    expect(catalogText("en").text("docs.node.component" as never)).toBe("docs.node.component");
  });

  it("locales.a-page-loads-its-own — and nobody else's", async () => {
    await loadPage("node", "en");
    expect(loadedPage("node", "en")).toBeTruthy();
    // `root` was never asked for, so it was never fetched. A page that arrives with its
    // neighbours is the bundle we just split, wearing a different shape.
    expect(loadedPage("root", "en")).toBeUndefined();
  });

  it("locales.a-page-falls-back-to-the-chrome — one object answers everything on screen", async () => {
    // A prose page still draws the tree and the toolbar beside it. Handing a block two text
    // objects is how one of them ends up a language behind.
    expect((await loadPage("node", "ru")).text("inspector.title")).toBe(catalogText("ru").text("inspector.title"));
  });

  it("locales.language-is-a-separate-load — bundles never mix mid-sentence", async () => {
    const [en, ru] = [await loadPage("bounded", "en"), await loadPage("bounded", "ru")];
    expect(en.text("docs.bounded.component")).not.toBe(ru.text("docs.bounded.component"));
    // Each is cached under its own language: switching back must not rebuild, and must not
    // return the other one's words.
    expect(loadedPage("bounded", "en")!.text("docs.bounded.component")).toBe(en.text("docs.bounded.component"));
  });

  it("locales.pages-are-complete — a split hides an untranslated page from the chrome's check", async () => {
    for (const locale of LOCALES) expect(await missingPageKeys(locale), `locale ${locale}`).toEqual([]);
  });

  it("locales.key-names-its-page — the second segment, and nothing is parsed twice", () => {
    expect(pageOf("docs.bounded.component")).toBe("bounded");
    expect(pageOf("inspector.title")).toBeUndefined();
    // Prose nobody wrote is prose missing, not a catalog that will not open.
    expect(pageOf("docs.nosuch.component")).toBeUndefined();
  });

  it("locales.an-unknown-page-is-the-chrome — a missing bundle is not a dead page", async () => {
    const text = await loadPage("nosuch", "en");
    expect(text.text("inspector.title")).toBe("node tree");
  });

  it("locales.every-page-has-both-languages — a loader list is only useful if it is honest", async () => {
    for (const page of PAGE_NAMES) {
      for (const locale of LOCALES) expect((await loadPage(page, locale)).locale, `${page}/${locale}`).toBe(locale);
    }
  });
});

// A split is not a state, it is a habit — and a habit that nothing checks lasts until the next
// page is added in a hurry. These read the directory rather than the code.
describe("the split cannot rot", () => {
  const PAGES_DIR = join(HERE, "pages");

  it("locales.every-bundle-has-a-loader — a file nobody can load is a page nobody can read", () => {
    const onDisk = readdirSync(PAGES_DIR).filter((name) => statSync(join(PAGES_DIR, name)).isDirectory());
    // Both directions: a bundle without a loader never reaches a reader, and a loader without
    // a bundle is a page that throws the first time somebody opens it.
    expect([...onDisk].sort()).toEqual([...PAGE_NAMES].sort());
  });

  it("locales.a-bundle-holds-only-its-page — a stray key is invisible to the reader who needs it", () => {
    // Keys are routed by their second segment, so a key filed under the wrong page resolves
    // only when some OTHER page happens to be open.
    const stray: string[] = [];
    for (const page of PAGE_NAMES) {
      for (const locale of LOCALES) {
        const bundle = JSON.parse(readFileSync(join(PAGES_DIR, page, `${locale}.json`), "utf8")) as object;
        stray.push(...Object.keys(bundle).filter((key) => pageOf(key) !== page).map((k) => `${page}/${locale}: ${k}`));
      }
    }
    expect(stray).toEqual([]);
  });

  it("locales.prose-is-never-imported-statically — one static import undoes the whole split", () => {
    // A value import of a page bundle puts it back into the chunk every reader downloads. Type
    // imports are erased and cost nothing, and `pages.ts` is where the dynamic ones live.
    const offenders: string[] = [];
    for (const path of [...filesUnder(CATALOG, ".ts"), ...filesUnder(CATALOG, ".tsx")]) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        const mentionsBundle = /locales\/pages\/|["'.]\/pages\/\w+\//.test(line);
        const isLazy = /import\s*\(/.test(line) || /^\s*import\s+type\b/.test(line);
        if (mentionsBundle && !isLazy) offenders.push(`${path.slice(CATALOG.length)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("locales.a-story-names-prose-that-exists — a missing page reads as a page with no text", () => {
    // `gkDoc` is a key, and a key that resolves to itself renders as `docs.foo.bar` on screen.
    // Catching it here means never shipping that.
    const missing: string[] = [];
    for (const path of filesUnder(join(CATALOG, "stories"), ".ts")) {
      const source = readFileSync(path, "utf8");
      for (const [, key] of source.matchAll(/gkDocS?t?o?r?y?:\s*"([^"]+)"/g)) {
        const full = `docs.${key}`;
        const page = pageOf(full);
        const bundle = page
          ? (JSON.parse(readFileSync(join(PAGES_DIR, page, "en.json"), "utf8")) as Record<string, unknown>)
          : {};
        if (!(full in bundle)) missing.push(`${path.slice(CATALOG.length)}: ${full}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
