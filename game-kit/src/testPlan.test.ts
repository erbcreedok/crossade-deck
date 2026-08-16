// THE PLAN AND THE SUITE, HELD AGAINST EACH OTHER.
//
// `docs/test-plan/` is where a law gets its guard (CANONS §0), and a document nobody checks
// drifts from the code the way every document does. It had drifted: 145 rows named a test that
// was never written, 51 tests ran under an id the plan had never heard of — and neither number
// was visible from either side. Reading the file told you it was covered; reading the suite told
// you nothing about what was missing.
//
// The plan is a DIRECTORY: one file per layer, plus `README.md` carrying the preamble and the
// summary. It is consulted a layer at a time and was never read end to end, so a single file only
// ever charged every reader for twenty-five layers to answer about one. The scan therefore reads
// all of them and reports `<file>:<line>`, which is also what makes a failure clickable.
//
// So the two are compared, both ways, and the difference has to be spelled out in the document
// rather than merely be true.
//
// A row whose OWN test does not exist yet is legitimate — the plan is also a design, and a
// per-atom-contract row can name a field whose dedicated case is not written (its real coverage
// living in another layer). That row carries `⏳`, and the
// glyph is the whole convention: it says "no test, and that is the answer", so a bare row with
// no test is a gap rather than a maybe. Writing the test and leaving the glyph fails too — a
// promise that has been kept must stop reading as a promise.
//
// This is a scan and it lives beside the other scans, for the reason `guards.test.ts` gives: a
// rule expressed as a scan over the real tree fails the build instead of being noticed by eye.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url).pathname;
const PLAN_DIR = join(ROOT, "docs/test-plan");
/** The preamble, the summary line and the ladder of layers. Holds no rows of its own. */
const INDEX = "README.md";

/** The mark on a row whose code is not written yet. One glyph, so a row is scannable by eye. */
const PENDING = "⏳";

interface PlanRow {
  readonly id: string;
  /** `⏳` — the plan describes it, nothing implements it, and no test is expected. */
  readonly pending: boolean;
  readonly section: string;
  /** Name inside `docs/test-plan/`, so a failure points at the layer that has to change. */
  readonly file: string;
  readonly line: number;
}

interface PlanSection {
  readonly title: string;
  /** What the header CLAIMS: total cases, and how many of them are spelled out as rows. */
  readonly claimed: number;
  readonly spelled: number;
  readonly rows: PlanRow[];
  readonly file: string;
  readonly line: number;
}

/** Every layer file, in ladder order — the numeric prefix is what makes sorting mean anything. */
function planFiles(): string[] {
  return readdirSync(PLAN_DIR)
    .filter((n) => n.endsWith(".md") && n !== INDEX)
    .sort();
}

function readPlan(): { sections: PlanSection[]; rows: PlanRow[] } {
  const sections: PlanSection[] = [];
  for (const file of planFiles()) {
    const lines = readFileSync(join(PLAN_DIR, file), "utf8").split("\n");
    let current: PlanSection | undefined;
    lines.forEach((line, i) => {
      const head = /^##\s+(.+)$/.exec(line);
      if (head) {
        current = { title: head[1]!.trim(), claimed: 0, spelled: 0, rows: [], file, line: i + 1 };
        sections.push(current);
        return;
      }
      // The runner line, which is also where the section's own arithmetic is stated.
      const counts = /·\s*(\d+)\s+кейсов,\s*расписано\s+(\d+)/.exec(line);
      if (counts && current) {
        sections[sections.length - 1] = {
          ...current,
          claimed: Number(counts[1]),
          spelled: Number(counts[2]),
        };
        current = sections[sections.length - 1];
        return;
      }
      // A row: the id is the first cell, in backticks, optionally marked.
      const row = /^\|\s*`([a-zA-Z0-9._-]+)`\s*(⏳)?\s*\|/.exec(line);
      if (row && current) {
        current.rows.push({
          id: row[1]!,
          pending: Boolean(row[2]),
          section: current.title,
          file,
          line: i + 1,
        });
      }
    });
  }
  return { sections, rows: sections.flatMap((s) => s.rows) };
}

/** Every file the suites live in — unit, catalog and browser alike. */
function suiteFiles(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return suiteFiles(p, match);
    return match.test(name) ? [p] : [];
  });
}

interface TestCase {
  readonly id: string;
  readonly file: string;
  readonly line: number;
}

/**
 * The id of every test that actually runs, taken from its NAME.
 *
 * The id is the first word of the title — `it("fit.contain-is-the-default — …")`. That is the
 * convention every suite already follows, and it is what makes a failure name the scenario
 * rather than a file. A title that does not start with one is reported as its own failure, or a
 * test could hide from this scan by being sloppily named.
 *
 * The gloss after the dash is OPTIONAL and always was: sixteen of the oldest tests are named by
 * their id alone. Demanding one here would have turned a naming preference into a build failure
 * on code that was already following the rule that matters.
 */
function readSuites(): { cases: TestCase[]; unnamed: string[] } {
  const files = [
    ...suiteFiles(join(ROOT, "src"), /\.test\.ts$/),
    ...suiteFiles(join(ROOT, ".storybook"), /\.test\.ts$/),
    ...suiteFiles(join(ROOT, "e2e"), /\.spec\.ts$/),
    // AND THE STORIES, because a story's `play` steps are tests that no `it(` names. Left out,
    // the whole interaction layer would be exactly the untracked coverage this file exists to
    // make impossible — and it is the layer with the fewest other witnesses, since a WebGL
    // canvas has no headless stand-in.
    ...suiteFiles(join(ROOT, ".storybook/stories"), /\.stories\.ts$/),
  ];
  const cases: TestCase[] = [];
  const unnamed: string[] = [];
  for (const path of files) {
    const rel = path.slice(ROOT.length);
    if (rel === "src/testPlan.test.ts") continue; // this file names ids it does not run
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, i) => {
        // Three shapes, one id: `it("…")`, `test("…")`, and a check step's `name: "…"`. The
        // step is matched by its id rather than by the key alone, so an ordinary `name:` field
        // somewhere in a story is not mistaken for a test.
        const call = /^\s*(?:it|test)\(\s*"([^"]+)"/.exec(line) ?? /^\s*name:\s*"(play\.[^"]+)"/.exec(line);
        if (!call) return;
        const title = call[1]!;
        const id = /^([a-zA-Z0-9._-]+)(?:\s+—|$)/.exec(title);
        if (id) cases.push({ id: id[1]!, file: rel, line: i + 1 });
        else unnamed.push(`${rel}:${i + 1}  ${title}`);
      });
  }
  return { cases, unnamed };
}

const plan = readPlan();
const suite = readSuites();
const planned = new Map(plan.rows.map((r) => [r.id, r]));
const implemented = new Map<string, TestCase>();
for (const c of suite.cases) if (!implemented.has(c.id)) implemented.set(c.id, c);

describe("test plan", () => {
  it("plan.every-test-has-a-row — a suite id the document never heard of", () => {
    // The direction that rots quietly: a test written today is real, and the plan simply stops
    // describing what is covered. Nobody notices, because the suite is green.
    const orphans = suite.cases
      .filter((c) => !planned.has(c.id))
      .map((c) => `${c.file}:${c.line}  ${c.id}`)
      .sort();
    expect(orphans).toEqual([]);
  });

  it("plan.every-row-has-a-test — unless it is marked as waiting for its code", () => {
    // The other direction, and the loud one: the document promises a guard that does not exist.
    // `⏳` is the only way out, and it says the CODE is missing rather than the test.
    const missing = plan.rows
      .filter((r) => !r.pending && !implemented.has(r.id))
      .map((r) => `${r.file}:${r.line}  ${r.id}  (${r.section})`)
      .sort();
    expect(missing).toEqual([]);
  });

  it("plan.a-kept-promise-stops-being-one — nothing waits for code it already has", () => {
    const stale = plan.rows
      .filter((r) => r.pending && implemented.has(r.id))
      .map((r) => `${r.file}:${r.line}  ${r.id} is marked ${PENDING} and is implemented in ${implemented.get(r.id)!.file}`)
      .sort();
    expect(stale).toEqual([]);
  });

  it("plan.ids-are-unique — one id, one scenario, in one place", () => {
    // Cutting the plan into files made this the check that earns its keep: within one document a
    // repeated id was at least visible by eye, and across twenty-five it is not visible at all.
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const r of plan.rows) {
      const at = `${r.file}:${r.line}`;
      if (seen.has(r.id)) dupes.push(`${r.id}: ${seen.get(r.id)} and ${at}`);
      else seen.set(r.id, at);
    }
    expect(dupes).toEqual([]);
  });

  it("plan.every-layer-is-in-the-index — a file nobody links is a file nobody opens", () => {
    // The ladder is read from `README.md`, so a layer missing from it is invisible while still
    // counting towards every total — the quietest way for the split to rot.
    const index = readFileSync(join(PLAN_DIR, INDEX), "utf8");
    const unlisted = planFiles().filter((f) => !index.includes(`(${f})`));
    expect(unlisted).toEqual([]);
  });

  it("plan.the-index-repeats-the-numbers-truthfully — two places, one arithmetic", () => {
    // Splitting the plan put every count in two places: the layer states its own, and the index
    // repeats it. A repeated number is a number that will disagree, and the index is the one
    // people read — so it is the one that would lie.
    const rows = new Map<string, [number, number]>();
    for (const line of readFileSync(join(PLAN_DIR, INDEX), "utf8").split("\n")) {
      const m = /^\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|[^|]*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/.exec(line);
      if (m) rows.set(m[1]!, [Number(m[2]), Number(m[3])]);
    }
    const wrong = plan.sections
      .filter((s) => {
        const stated = rows.get(s.file);
        return !stated || stated[0] !== s.claimed || stated[1] !== s.rows.length;
      })
      .map((s) => {
        const stated = rows.get(s.file);
        return `${INDEX}: ${s.file} listed as ${stated?.join("/") ?? "absent"}, the layer says ${s.claimed}/${s.rows.length}`;
      });
    expect(wrong).toEqual([]);
  });

  it("plan.a-test-title-starts-with-its-id — or a failure names nothing", () => {
    expect(suite.unnamed).toEqual([]);
  });

  it("plan.a-section-counts-its-own-rows — `расписано` is not typed by hand", () => {
    // The number in a header is the first thing to drift, and it drifts UPWARD: it is written
    // when the section is planned and never again. Then the document reports coverage that was
    // only ever intended.
    const wrong = plan.sections
      .filter((s) => s.rows.length > 0 || s.spelled > 0)
      .filter((s) => s.spelled !== s.rows.length)
      .map((s) => `${s.file}:${s.line}  ${s.title}: says расписано ${s.spelled}, has ${s.rows.length} rows`);
    expect(wrong).toEqual([]);
  });

  it("plan.a-section-cannot-spell-out-more-than-it-claims", () => {
    // `кейсов` counts the variants a row stands for — enumeration values, themes, viewports —
    // so it is at least the row count and usually more. Below it, the header is nonsense.
    const wrong = plan.sections
      .filter((s) => s.rows.length > 0)
      .filter((s) => s.claimed < s.spelled)
      .map((s) => `${s.file}:${s.line}  ${s.title}: claims ${s.claimed}, spells out ${s.spelled}`);
    expect(wrong).toEqual([]);
  });

  it("plan.the-summary-adds-up — the line at the top is the sum of the sections", () => {
    const header = readFileSync(join(PLAN_DIR, INDEX), "utf8");
    // `слоя` or `слоёв` — the count declines the noun, and the guard checks numbers, not grammar.
    const stated =
      /\*\*(\d+)\s+сло(?:я|ёв)\s*·\s*(\d+)\s+кейсов заявлено\s*·\s*(\d+)\s+расписано поимённо\.\*\*/.exec(header);
    expect(stated, "the summary line is missing or reworded").toBeTruthy();
    const withRows = plan.sections.filter((s) => s.rows.length > 0 || s.claimed > 0);
    expect(Number(stated![1]), "layers").toBe(withRows.length);
    expect(Number(stated![2]), "claimed cases").toBe(withRows.reduce((n, s) => n + s.claimed, 0));
    expect(Number(stated![3]), "rows").toBe(plan.rows.length);
  });
});
