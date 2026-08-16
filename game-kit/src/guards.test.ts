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
import "./core/atoms/flippable.js";
import "./core/atoms/coated.js";
import "./core/atoms/draggable.js";
import "./core/atoms/shadow.js";
import "./core/atoms/lit.js";
import "./core/atoms/inviting.js";
import { rect } from "./presets/shapes.js";

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

/**
 * A `name: { ... }` object literal out of source, as data. Brace-matched rather than regexed:
 * the value is nested, and a regex that thinks it can read nested braces is a regex that reads
 * half of one and reports success.
 */
function objectLiteral(source: string, name: string): Record<string, string[]> {
  const at = source.indexOf(`${name}:`);
  if (at < 0) return {};
  const open = source.indexOf("{", at);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const literal = source
    .slice(open, end)
    .replace(/\/\/[^\n]*/g, "")
    .replace(/(\w+)\s*:/g, '"$1":')
    .replace(/,(\s*[\]}])/g, "$1");
  return JSON.parse(literal) as Record<string, string[]>;
}

describe("guards", () => {
  it("guard.no-kind — behaviour never reads a sort", () => {
    // The rule is about NODES: nothing asks "what sort of element is this", it asks for the
    // atom it needs (hit-testing → Bounded, painting → Surfaced).
    //
    // It now holds with NO exemptions, and that is new. A `Shape` used to be a tagged union of
    // four, so the file that declared it had to be let off — and the catalog's builder after it,
    // and the rule was two files from meaningless. A shape is one thing now: a path. The tag
    // bought nothing, cost a branch in every consumer, and the exemption it needed was the
    // clearest sign of it.
    //
    // The catalog's `preset` is not a counter-example: it picks which HELPER to call, and the
    // helpers return the same one type. Nothing reads a sort off a value.
    expect(hits(/\.kind\s*===|switch\s*\(\s*\w+\.kind\s*\)/)).toEqual([]);
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

  it("guard.one-clock — the frame loop lives in exactly one file", () => {
    // Any continuous animation runs on ONE clock (docs/design/transaction.md): a node does not
    // start its own ticker. So the frame primitives appear in the motion runtime and nowhere else
    // in the kit — a second `requestAnimationFrame` is a second clock, and two clocks drift.
    // The catalog is a consumer and runs its own (its scene shell waits two frames to know it
    // painted), so the rule is about `src`, not `catalog/`.
    const users = files
      .filter((f) => !inCatalog(f.rel))
      .filter((f) => /\brequestAnimationFrame\b|\bsetInterval\b|\bsetTimeout\b/.test(f.code))
      .map((f) => f.rel);
    expect(users).toEqual(["render/animator.ts"]);
  });

  it("guard.english-only — code is English; the words live in bundles", () => {
    // Raw on purpose: the rule covers comments too. The one place allowed to hold another
    // alphabet is `locales/` — the bundles themselves and the test that asserts what they say.
    //
    // `testPlan.test.ts` is the second, and by the same reasoning rather than as an escape: it
    // PARSES a Russian document. The header it counts rows out of says «расписано», and a
    // scanner forbidden from naming the word it looks for cannot look for it. The alternative
    // was to make the plan's own headers English — the guard editing the owner's document to
    // suit itself.
    const readsAnotherLanguage = (r: string): boolean =>
      r.startsWith("catalog/locales/") || r === "testPlan.test.ts";
    expect(hits(/[\u0400-\u04FF]/, { raw: true, skip: readsAnotherLanguage })).toEqual([]);
  });

  it("guard.layering — imports point DOWN the ladder, never up", () => {
    // core (the model) knows nothing of pixels, the catalog or a document; render knows
    // pixels but not the catalog; presets are the ready-made and stand on both; devtools and
    // stories stand on top of everything and may look down. A flat folder cannot state this,
    // which is why the layers exist at all.
    const ALLOWED: Record<string, string[]> = {
      core: ["core"], // the bottom: the model, and it may reach nothing but itself
      render: ["render", "core"], // pixels stand on the model, never the other way round
      presets: ["presets", "render", "core"], // data about what people draw: it reaches down only
    };
    // EVERY relative import is resolved, not just the one-level ones. Matching `../<folder>/`
    // by eye let `../../render/x.js` through from inside `core/atoms` — the deeper a file sits,
    // the further up it could reach, which is exactly backwards.
    const bad: string[] = [];
    for (const f of files) {
      const layer = f.rel.split("/")[0]!;
      // A TEST IS A CONSUMER and stands above the lot: `core/atoms/container.test.ts` builds its
      // fixtures out of `rect`, and a fixture reaching for a preset is a reader doing the same.
      if (!(layer in ALLOWED) || inCatalog(f.rel) || f.rel.endsWith(".test.ts")) continue;
      for (const m of f.raw.matchAll(/from\s+"(\.[^"]*)"/g)) {
        const target = join(f.rel, "..", m[1]!);
        const to = target.split("/")[0]!;
        if (!ALLOWED[layer]!.includes(to)) bad.push(`${f.rel} → ${target}`);
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
      // `translate` only as a FREE function: the renderer's `Matrix.translate` is geometry and
      // has nothing to do with words. A guard that cannot tell a method call from an i18n
      // helper is a guard someone deletes the first time it is right about nothing.
      hits(/(?<![.\w])translate\s*\(|\bcountLabel\s*\(|\bLOCALES\b|\bTextSource\b|\bi18n\b|\blocale\b/i, {
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

  it("guard.coat-not-viewer — a coat is shared state, never read off the onlooker plane", () => {
    // A coat travels the wire and looks the same to every seat — a contested strip, terrain paint.
    // The viewer channel is neither shared nor on the wire: it holds theme and reduce-motion, and
    // privacy is a PROJECTED field the orchestrator omits from other viewers' trees, not a flag the
    // coat reads. So the effect that mixes coats must not touch `viewer` at all — if it did, a coat
    // could disagree between two onlookers, which is exactly what shared state may not do.
    const coats = files.find((f) => f.rel === "render/coats.ts")!.code;
    expect(coats).not.toMatch(/\bviewer\b/);
  });

  it("guard.one-accent — there is a single gold, and washes are derived from it", () => {
    const theme = files.find((f) => f.rel === "render/theme.ts")!.raw;
    for (const palette of theme.split(/const (?:DARK|LIGHT): Palette =/).slice(1)) {
      const body = palette.slice(0, palette.indexOf("};"));
      expect(body.match(/accent/g) ?? []).toHaveLength(1);
    }
  });

  it("guard.every-field-declares-a-class — there are five rules and no field without one", () => {
    // Not a scan: a scan cannot see an atom assembled at runtime. Importing the real atoms
    // and asking the registry is what actually covers them.
    for (const def of allAtoms()) {
      const declared = def.classes as Record<string, string>;
      for (const field of Object.keys(def.defaults)) {
        expect(declared[field], `${def.name}.${field} declares no inheritance class`).toBeTruthy();
        expect(["own", "fromOwner", "addsUp", "multiplies", "rootOnly"]).toContain(declared[field]);
      }
    }
  });

  it("guard.no-desk-called-table — the word means a data table and nothing else", () => {
    // Two meanings under one word is how `interface` and `canvas` went wrong before it, and
    // the ambiguity is worst exactly where it matters: a comment saying "on the table" reads
    // as furniture to one person and as a grid to the next. The desk is a Desk.
    // A blanket ban would be wrong: a controls table and a table of contents are tables, and
    // this file has to be able to tell them apart or it gets switched off. So it bans what is
    // never anything else — `tabletop`, and the furniture phrases — plus the word as an
    // IDENTIFIER, which is where the ambiguity actually costs something.
    //
    // Whole words, and `raw` for the prose ones: a substring scan flags `untestable` and
    // `stable`, and a guard that fails on the word "unstable" gets ignored within a day.
    expect(hits(/\btabletops?\b|\bon the tables?\b|\btable (surface|space)\b/i, { raw: true })).toEqual([]);
    // TWO exemptions, both named and both the same one: `argTypes[name].table` is Storybook's
    // own key for the controls TABLE, which is a table, and renaming someone else's API is not
    // on offer. The second file is the test that reads that key back. Every other file means
    // the rule has stopped holding.
    const storybooksOwnKey = new Set(["catalog/stories/surfaceControls.ts", "catalog/stories/controls.test.ts"]);
    expect(hits(/\btables?\b/, { skip: (r) => storybooksOwnKey.has(r) })).toEqual([]);

    // AND THE PROSE, which is where it actually mattered. The scan above reads `.ts` and `.tsx`
    // only, so the bundles — the words a reader sees — were never covered: the Introduction
    // page opened on "tabletop games: the physical mechanics of a table" for as long as it had
    // existed. A rule enforced everywhere except in front of the reader is not enforced.
    //
    // Russian too: `стол` is the desk and `таблица` is the table, and neither is ambiguous —
    // what is banned here is the English word leaking into either bundle.
    const bundles = readdirSync(join(CATALOG, "locales"), { recursive: true, encoding: "utf8" })
      .filter((rel) => rel.endsWith(".json"))
      .map((rel) => ({ rel, text: readFileSync(join(CATALOG, "locales", rel), "utf8") }));
    // Not vacuous: a scan that found no files would agree with itself forever, and this file
    // has been bitten by exactly that shape of nothing before.
    expect(bundles.length).toBeGreaterThan(0);
    const inProse = bundles.flatMap(({ rel, text }) =>
      text
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /\btabletops?\b|\bon the tables?\b|\btable (surface|space)\b|node\("table"/i.test(line))
        .map(({ line, i }) => `locales/${rel}:${i + 1}  ${line.trim()}`),
    );
    expect(inProse).toEqual([]);
  });

  it("guard.every-field-has-a-control — an atom's field a reader cannot touch is invisible", () => {
    // This is the rule the catalog broke: `Surfaced` declared three fields and its section
    // offered one control, so two of them could not be found by reading the catalog at all.
    // A story states which of its arguments serve which field, and the set of fields must be
    // the atom's OWN set — so a new field fails here, on the day it is added.
    for (const def of allAtoms()) {
      const story = files.find((f) => f.rel.startsWith("catalog/stories/") && f.raw.includes(`gkAtom: "${def.name}"`));
      expect(story, `no catalog section declares gkAtom: "${def.name}"`).toBeTruthy();

      const covered = objectLiteral(story!.raw, "gkFields");
      expect(Object.keys(covered).sort(), `${def.name}: gkFields does not match the atom's fields`).toEqual(
        Object.keys(def.defaults).sort(),
      );

      for (const [field, serves] of Object.entries(covered)) {
        expect(serves.length, `${def.name}.${field} is reachable from nowhere`).toBeGreaterThan(0);
        for (const name of serves) {
          // Either an argument of the catalog's sections, or a scene of its own: a field can be
          // taught by two pictures side by side as honestly as by a dropdown, and
          // `Container.layout` is, deliberately. What the guard will not accept is a field
          // served by neither.
          //
          // Searched across the whole stories directory, not one file: the shape and record
          // controls are declared once and shared, which is what stopped them drifting apart in
          // the first place. That makes this check say "the catalog declares this control"
          // rather than "this section does" — the stronger claim, that a control is actually
          // wired into THIS story, is beyond a scan, and `controls.test.ts` carries the part of
          // it that can be checked by running the code.
          const declared = new RegExp(`\\b${name}\\s*:`);
          const isArg = files.some((f) => f.rel.startsWith("catalog/stories/") && declared.test(f.code));
          const isScene = new RegExp(`export const ${name}\\b`).test(story!.code);
          expect(isArg || isScene, `${def.name}.${field}: nothing in the catalog is named ${name}`).toBe(true);
        }
      }
    }
  });

  it("guard.layout-writes-only-at — a layout may move a child, never lift it", () => {
    // `z` adds up along the chain, so a layout writing it would raise every child of a raised
    // container twice. A stack expresses its thickness as an `at` offset, and this is why.
    const children = [
      { id: "a", footprint: rect(1, 1 ) , at: undefined },
      { id: "b", footprint: rect(1, 1 ) , at: undefined },
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
  it("container.no-state-diffs — a mechanic is a layout reference, not a machine", () => {
    // client1's lesson, as a scan. "The deck becomes a fan" was a state machine there, with a
    // diff between two shapes and a registry of mechanics to look them up in. Here it is one
    // word changing on one field: the children never move, the sprites keep their identity, and
    // the springs actually play. A `stateDiff` reappearing is that whole apparatus coming back.
    expect(hits(/\bstateDiff\b|\bdiffState\b|\bmechanicRegistry\b|\bMECHANICS\b/i)).toEqual([]);
  });

  it("unit.the-desk-has-none — a screen fraction exists once, and it is the HUD's", () => {
    // Two measures and one place they meet. A desk size is a WORLD number: a card is 1 unit
    // wide wherever it is looked at, and fitting it on the glass is the camera's problem. The
    // HUD is the exception on purpose — it is measured against the SCREEN — and it owns the one
    // fraction in the kit. A second one would be a desk size that quietly follows the viewport.
    const fractions = files
      .filter((f) => !inCatalog(f.rel) && !f.rel.endsWith(".test.ts"))
      .flatMap((f) =>
        [...f.code.matchAll(/\b([A-Z_]*FRACTION[A-Z_]*)\b/g)].map((m) => `${f.rel}  ${m[1]}`),
      );
    expect([...new Set(fractions.map((r) => r.split("  ")[1]))]).toEqual(["HUD_UNIT_FRACTION"]);
  });
});
