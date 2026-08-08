// The sidebar's order is a RULE, and a rule without a guard lives until the next context
// rebuild. It is read out of `preview.ts` by scanning, never by importing, because the literal
// has to stay inline there: Storybook's index builder analyses that file statically, and given
// an identifier it warns, skips the index, and lets `storybook build` exit 0 — a catalog with
// no `index.json` and no error to show for it.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = new URL("./", import.meta.url).pathname;
const STORIES = join(HERE, "stories");

/** The `order:` array literal as data, taken from the source of `preview.ts`. */
function declaredOrder(): unknown[] {
  const src = readFileSync(join(HERE, "preview.ts"), "utf8");
  const start = src.indexOf("order: [", src.indexOf("storySort"));
  expect(start, "no storySort order literal in preview.ts").toBeGreaterThan(-1);

  let depth = 0;
  let end = start;
  for (let i = src.indexOf("[", start); i < src.length; i += 1) {
    if (src[i] === "[") depth += 1;
    if (src[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return JSON.parse(src.slice(src.indexOf("[", start), end).replace(/,(\s*[\]}])/g, "$1")) as unknown[];
}

function flatten(order: unknown[]): string[] {
  return order.flatMap((e) => (Array.isArray(e) ? flatten(e) : [String(e)]));
}

function declaredTitles(): string[] {
  return readdirSync(STORIES)
    .filter((f) => f.endsWith(".stories.ts"))
    .flatMap((f) => [...readFileSync(join(STORIES, f), "utf8").matchAll(/title:\s*"([^"]+)"/g)].map((m) => m[1]!));
}

describe("the sidebar is the ladder", () => {
  it("order.every-title-is-placed — an unplaced story does not fail, it SORTS", () => {
    // Which is the whole danger: a catalog teaching in the wrong order looks exactly like one
    // teaching in the right order, right up until somebody reads it.
    const placed = new Set(flatten(declaredOrder()));
    const unplaced = declaredTitles()
      .flatMap((t) => t.split("/"))
      .filter((segment) => !placed.has(segment));
    expect([...new Set(unplaced)]).toEqual([]);
  });

  it("order.basics-before-atoms — the questions come before the answers", () => {
    const names = flatten(declaredOrder());
    expect(names.indexOf("Basics")).toBeLessThan(names.indexOf("Atoms"));
  });

  it("order.atoms-follow-the-dependencies — not the alphabet", () => {
    // Alphabetically the rungs read Bounded · Container · Surfaced · Transformable.
    const names = flatten(declaredOrder());
    const rungs = ["Bounded", "Surfaced", "Transformable", "Container"].map((n) => names.indexOf(n));
    expect(rungs.every((i) => i >= 0)).toBe(true);
    expect(rungs).toEqual([...rungs].sort((a, b) => a - b));
  });

  it("order.no-stale-levels — the list names only levels that exist", () => {
    const groups = new Set(declaredTitles().flatMap((t) => t.split("/")));
    const ahead = new Set(["Elements", "Canvas", "HUD"]); // declared before their stories exist
    expect(flatten(declaredOrder()).filter((n) => !groups.has(n) && !ahead.has(n))).toEqual([]);
  });
});
