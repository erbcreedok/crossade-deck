// THE GUARD: `tophud.colors-come-from-look`.
//
// The strip is markup, and markup is where a colour is cheapest to write by hand — which is exactly
// why this package may not hold one. Every colour comes from `@crossade/look`; a literal here is a
// second palette that nobody will remember to change.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("./", import.meta.url).pathname;

function files(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("tophud.colors-come-from-look", () => {
  it("ни одного цвета, написанного руками", () => {
    const found: string[] = [];
    for (const p of files()) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/g)) {
        found.push(`${p.slice(SRC.length)}: ${m[0]}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("цвета берутся именно из палитры", () => {
    const uses = files().filter((p) => readFileSync(p, "utf8").includes("PALETTE."));
    expect(uses.length).toBeGreaterThan(0);
  });
});
