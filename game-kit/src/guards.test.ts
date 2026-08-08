// ARCHITECTURAL GUARDS — a rule expressed as a scan of "no X outside Y".
//
// A law without a guard lives until the first context rebuild. These run over the real
// source tree, so a relapse fails the build rather than being noticed by eye.
//
// A scan must read CODE, not prose. The first version of this file failed on the very
// comments that explain the rules ("there is no `disabled`"), on a CSS keyword inside a
// string, and on its own Cyrillic character class — a guard that cannot tell a mention from
// a use is worse than none, because it trains you to ignore it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Imported for the runtime guards below: some rules cannot be scanned for, only asked about.
import { allAtoms } from "./core/atom.js";
import { freeLayout, rowLayout } from "./core/atoms/layouts.js";
import "./core/atoms/bounded.js";
import "./core/atoms/container.js";
import "./core/atoms/surfaced.js";
import "./core/atoms/transformable.js";

const SRC = new URL("./", import.meta.url).pathname;
// The catalog is real code — its page, panels, scenes, stories and words — so the rules reach
// it too, and a few of them ONLY make sense on one side of that line.
const CATALOG = new URL("../.storybook/", import.meta.url).pathname;
const SELF = "guards.test.ts";
const inCatalog = (rel: string): boolean => rel.startsWith("catalog/");

interface Source {
  readonly rel: string;
  /** Verbatim, including comments and strings. */
  readonly raw: string;
  /** Comments and string bodies blanked out, so a mention is not read as a use. */
  readonly code: string;
}

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

/** Blank out comments and string bodies, keeping line numbers intact. */
function stripProse(text: string): string {
  const blank = (m: string): string => m.replace(/[^\n]/g, " ");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank)
    .replace(/`(?:\\.|[^`\\])*`/g, blank)
    .replace(/"(?:\\.|[^"\\])*"/g, blank)
    .replace(/'(?:\\.|[^'\\])*'/g, blank);
}

const files: Source[] = [
  ...sources().map((path) => ({ path, rel: path.slice(SRC.length) })),
  ...sources(CATALOG).map((path) => ({ path, rel: `catalog/${path.slice(CATALOG.length)}` })),
].map(({ path, rel }) => {
  const raw = readFileSync(path, "utf8");
  return { rel, raw, code: stripProse(raw) };
});

/** Hits with file and line, so a failure names the place and not just the count. */
function hits(re: RegExp, opts: { raw?: boolean; skip?: (rel: string) => boolean } = {}): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (f.rel === SELF) continue; // this file necessarily names what it forbids
    if (opts.skip?.(f.rel)) continue;
    (opts.raw ? f.raw : f.code).split("\n").forEach((line, i) => {
      if (re.test(line)) out.push(`${f.rel}:${i + 1}  ${f.raw.split("\n")[i]!.trim()}`);
    });
  }
  return out;
}

describe("guards", () => {
  it("guard.no-kind — behaviour never reads a sort", () => {
    // The rule is about NODES: nothing asks "what sort of element is this", it asks for the
    // atom it needs (hit-testing → Bounded, painting → Surfaced). A `Shape` is not a node and
    // has no atoms to ask, and a circle's extent cannot be computed without telling it from a
    // rect — so the union is discriminated in exactly ONE file, the one that declares it.
    // Everywhere else the answer is `extentOf`, which is what keeps the branching from
    // spreading. Widening this exemption to a second file means the rule has stopped holding.
    expect(hits(/\.kind\s*===|switch\s*\(\s*\w+\.kind\s*\)/, { skip: (r) => r === "core/atoms/bounded.ts" })).toEqual(
      [],
    );
  });

  it("guard.no-negation — capability is by presence, restriction by absence", () => {
    // Negation flags do not exist in the model: no `disabled`, no `interactive`, no `transparent`.
    expect(hits(/\bdisabled\b|\binteractive\s*:|\btransparent\b/)).toEqual([]);
  });

  it("node.no-element-predicate — systems ask for an atom, never for a category", () => {
    expect(hits(/\bisElement\b/)).toEqual([]);
  });

  it("node.no-inheritance — composition only, no class hierarchy over nodes", () => {
    expect(hits(/\bclass\s+\w+\s+extends\b|\binstanceof\s+Node\b/)).toEqual([]);
  });

  it("host.single-pixi-import — pixi lives in exactly one file", () => {
    // The day the renderer is swapped, exactly one file is rewritten. It also keeps the rules
    // out of the one place no test can reach: jsdom has no WebGL, so whatever is decided
    // inside the renderer is decided where nothing can hold it down.
    // Against `raw`, not `code`: the scanner blanks string BODIES, so a module specifier is
    // invisible there. This guard was written against `code` and could never have fired —
    // it passed for months only because nothing imported pixi at all.
    const importers = files.filter((f) => /from\s+["']pixi\.js["']/.test(f.raw)).map((f) => f.rel);
    expect(importers).toEqual(["render/pixi.ts"]);
  });

  it("guard.view-not-canvas — the HTMLCanvasElement is never named canvas", () => {
    expect(hits(/(const|let|var)\s+canvas\b|canvas\s*:\s*HTMLCanvasElement/)).toEqual([]);
  });

  it("guard.english-only — code is English; the words live in bundles", () => {
    // Raw on purpose: the rule covers comments too. The one place allowed to hold another
    // alphabet is `locales/` — the bundles themselves and the test that asserts what they
    // say. Everywhere else, identifiers English and captions as keys.
    expect(hits(/[\u0400-\u04FF]/, { raw: true, skip: (r) => r.startsWith("catalog/locales/") })).toEqual([]);
  });

  it("guard.layering — imports point DOWN the ladder, never up", () => {
    // core (the model) knows nothing of pixels, the catalog or a document; render knows
    // pixels but not the catalog; devtools and stories stand on top and may look down.
    // A flat folder cannot state this, which is why the layers exist at all.
    const ALLOWED: Record<string, string[]> = {
      core: ["core"], // the bottom: the model, and it may reach nothing but itself
      render: ["render", "core"], // pixels stand on the model, never the other way round
    };
    const bad: string[] = [];
    for (const f of files) {
      const layer = f.rel.split("/")[0]!;
      if (!(layer in ALLOWED) || inCatalog(f.rel)) continue;
      for (const m of f.raw.matchAll(/from\s+"\.\.\/(\w+)\//g)) {
        if (!ALLOWED[layer]!.includes(m[1]!)) bad.push(`${f.rel} → ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("guard.public-api — everything a consumer needs is exported from one door", () => {
    // A standalone imports "game-kit", not a path into src: the layout stays ours to change.
    const index = files.find((f) => f.rel === "index.ts")!.code;
    for (const name of ["node", "add", "byId", "localIds", "inspect", "mount", "installTheme", "withViewer"]) {
      expect(index, `missing from the public API: ${name}`).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it("guard.id-is-opaque — nothing parses an id or compares it to a literal", () => {
    // client1 died of the opposite: `id === "deck"` scattered through the engine. A speaking
    // name is for a human reading the tree; the engine compares it whole or not at all.
    expect(hits(/\.id\s*===\s*["'`]|\bid\.(split|slice|startsWith|endsWith|match|indexOf)\b/)).toEqual([]);
  });

  it("guard.no-ambient-id-source — a node is named from outside, never by a hidden counter", () => {
    // A module-level counter is unique inside one tab and nowhere else, and the desync it
    // produces is silent: a move lands on a DIFFERENT existing node. `localIds()` is the one
    // allocator, and it is explicit so the call sites are greppable the day a room hands out
    // ids instead.
    const nodeSource = files.find((f) => f.rel === "core/node.ts")!.code;
    expect(nodeSource).not.toMatch(/^let counter/m);
    expect(hits(/\bresetIds\b/)).toEqual([]);
  });

  it("guard.no-font-shorthand — a shorthand assembled from tokens is dropped in silence", () => {
    // Set through a style OBJECT, `font: <family> <size> ...` built from custom properties is
    // not applied and reports no error: the element quietly inherits the page type. Every
    // such row towered over the controls next to it. Longhands, in JSX, always.
    expect(hits(/\bfont:\s*[`"'$]/, { raw: true, skip: (r) => !r.endsWith(".tsx") })).toEqual([]);
  });

  it("guard.kit-knows-no-localization — not the words, and not the notion either", () => {
    // Not "the kit ships no dictionary" — the kit has no concept of a language at all: no
    // locale, no key, no text source, no placeholder. A caption reaches it already written,
    // as an ordinary string on the node that carries it, and everything about HOW it was
    // written — library, bundles, plural rules, number and date formats — belongs to whoever
    // assembled the tree. The node tree is assembled per client anyway: ids must agree
    // between players, wording need not.
    const kit = files.filter((f) => !inCatalog(f.rel));
    // `raw` for the same reason as the pixi guard: a specifier lives inside a string.
    expect(kit.filter((f) => /from\s+["'][^"']*\.json["']/.test(f.raw)).map((f) => f.rel)).toEqual([]);
    expect(
      hits(/\btranslate\s*\(|\bcountLabel\s*\(|\bLOCALES\b|\bTextSource\b|\bi18n\b|\blocale\b/i, {
        skip: inCatalog,
      }),
    ).toEqual([]);
  });

  it("guard.no-language-list — the kit enumerates no languages, not even two", () => {
    // `type Locale = "en" | "ru"` was exactly that mistake: a game adding Kazakh would have
    // had to edit the kit. A locale is an opaque BCP-47 tag the kit carries and never reads.
    expect(
      hits(/["'](en|ru)["']/, { raw: true, skip: (r) => inCatalog(r) || r.endsWith(".test.ts") }),
    ).toEqual([]);
  });

  it("guard.catalog-through-the-door — the catalog imports the kit like a standalone would", () => {
    // TWO doors, and only two: the model (`index.ts`) and the renderer (`render/pixi.ts`).
    // The second exists because importing `pixi.js` reaches for a canvas context at module
    // load — so taking the renderer has to be a decision, not a side effect of touching the
    // kit. Dynamic imports are scanned too, or the rule would be one `import()` away from
    // meaningless.
    const DOORS = ["index.js", "render/pixi.js"];
    const bad = files
      .filter((f) => inCatalog(f.rel))
      .flatMap((f) =>
        [...f.raw.matchAll(/(?:from|import)\s*\(?\s*"(?:\.\.\/)+src\/([^"]+)"/g)].map((m) => ({
          rel: f.rel,
          target: m[1]!,
        })),
      )
      .filter(({ target }) => !DOORS.includes(target))
      .map(({ rel, target }) => `${rel} → src/${target}`);
    expect(bad).toEqual([]);
  });

  it("guard.docs-prose-is-translated — no story carries its description inline", () => {
    // Inline prose is baked into the story index at build time and can never follow the
    // locale. A key can; that is the whole reason the pages read from a dictionary.
    expect(hits(/description\s*:\s*\{/, { skip: (r) => !r.startsWith("stories/") })).toEqual([]);
  });

  it("guard.no-pixels-in-spec — sizes are in units; only the host and DOM chrome speak px", () => {
    expect(
      hits(/\b\d+px\b/, {
        skip: (r) => r === "render/host.ts" || r.endsWith(".test.ts") || inCatalog(r),
      }),
    ).toEqual([]);
  });

  it("guard.no-raw-colour — theme.ts is the only file that holds a colour", () => {
    // client2 died of the opposite: 261 raw hex against ~20 theme reads, two golds under
    // four names, three near-identical greys.
    expect(hits(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/, { raw: true, skip: (r) => r === "render/theme.ts" })).toEqual([]);
  });

  it("guard.one-accent — there is a single gold, and washes are derived from it", () => {
    const theme = files.find((f) => f.rel === "render/theme.ts")!.raw;
    for (const palette of theme.split(/const (?:DARK|LIGHT): Palette =/).slice(1)) {
      const body = palette.slice(0, palette.indexOf("};"));
      expect(body.match(/accent/g) ?? []).toHaveLength(1);
    }
  });

  it("guard.every-field-declares-a-class — there are four rules and no field without one", () => {
    // Not a scan: a scan cannot see an atom assembled at runtime. Importing the real atoms
    // and asking the registry is what actually covers them.
    for (const def of allAtoms()) {
      const declared = def.classes as Record<string, string>;
      for (const field of Object.keys(def.defaults)) {
        expect(declared[field], `${def.name}.${field} declares no inheritance class`).toBeTruthy();
        expect(["own", "fromOwner", "addsUp", "rootOnly"]).toContain(declared[field]);
      }
    }
  });

  it("guard.layout-writes-only-at — a layout may move a child, never lift it", () => {
    // `z` adds up along the chain, so a layout writing it would raise every child of a raised
    // container twice. A stack expresses its thickness as an `at` offset, and this is why.
    const children = [
      { id: "a", footprint: { kind: "rect", w: 1, h: 1 } as const, at: undefined },
      { id: "b", footprint: { kind: "rect", w: 1, h: 1 } as const, at: undefined },
    ];
    for (const record of [freeLayout, rowLayout({ gap: 0.2 })]) {
      for (const pose of record.place(children)) {
        if (pose) expect(Object.keys(pose).sort()).toEqual(["x", "y"]);
      }
    }
  });

  it("guard.spec-holds-no-functions — enforced at runtime too, not by scan alone", () => {
    // A scan cannot see a value built at runtime, so atom.ts checks it as well.
    expect(files.find((f) => f.rel === "core/atom.ts")!.code).toMatch(/assertSerializable/);
  });
});
