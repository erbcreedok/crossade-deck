// ARCHITECTURAL GUARDS for the wire — a rule expressed as a scan of "no X in here".
//
// A law without a guard lives until the first context rebuild, so the one law this package has is
// written down as a test that reads the real source tree.
//
// A scan must read CODE, not prose: this file's own header names `pixi` and `render`, and so does
// `index.ts`, which is exactly the kind of mention that makes a naive grep-guard cry wolf until
// everybody learns to ignore it. Import statements only.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("./", import.meta.url).pathname;

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

/** Every module a file pulls in, by the specifier as written. */
function importsOf(raw: string): string[] {
  const found: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const m of raw.matchAll(pattern)) found.push(m[1] ?? m[2] ?? "");
  return found;
}

describe("wire.the-wire-draws-nothing", () => {
  // THE WIRE CARRIES A TREE AND NEVER DRAWS ONE. `game-kit` itself is allowed and needed — the
  // room's payload IS the kit's tree (`toSpec`/`fromSpec`/`Node`), and a wire that spoke its own
  // second format would be the two-answers-that-disagree trap the desk already paid for once.
  //
  // What is banned is everything that puts a tree on a GLASS: the painter, the canvas, the camera.
  // The moment one of those is imported here, a game can no longer use the wire without also
  // taking the hub's idea of what a desk looks like — which is the whole reason this package exists.
  const BANNED = ["pixi.js", "game-kit/pixi"];
  const BANNED_DEEP = ["game-kit/src/render", "/render/"];

  it("pulls in no painter and no canvas", () => {
    const offenders: string[] = [];
    for (const file of sources()) {
      const rel = file.slice(SRC.length);
      if (rel.endsWith(".test.ts")) continue;
      for (const spec of importsOf(readFileSync(file, "utf8"))) {
        if (BANNED.includes(spec) || BANNED_DEEP.some((bad) => spec.includes(bad))) {
          offenders.push(`${rel}: ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("knows the hub not at all", () => {
    // ...AND NOT THE HUB EITHER, in any direction: the wire is what a standalone game reaches for
    // INSTEAD of reaching into `apps/hub`.
    const offenders: string[] = [];
    for (const file of sources()) {
      const rel = file.slice(SRC.length);
      for (const spec of importsOf(readFileSync(file, "utf8"))) {
        if (spec.includes("apps/hub") || spec.includes("@apps/")) offenders.push(`${rel}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
