// ARCHITECTURAL GUARDS for the add-on — a law expressed as a scan of "no X outside Y", mirroring
// the engine's own `guards.test.ts`. A law without a guard lives until the first context rebuild.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("./", import.meta.url).pathname;
const SELF = "guards.test.ts";

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

const files = sources().map((path) => ({ rel: path.slice(SRC.length), raw: readFileSync(path, "utf8") }));

/** Hits with file and line, so a failure names the place, not just a count. Raw text (comments count). */
function hits(re: RegExp, skip: (rel: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (f.rel === SELF || skip(f.rel)) continue;
    f.raw.split("\n").forEach((line, i) => {
      if (re.test(line)) out.push(`${f.rel}:${i + 1}  ${line.trim()}`);
    });
  }
  return out;
}

describe("game-presets/solitaire guards", () => {
  it("solitaire.no-raw-colour — colour is a token or a spin param; hex/rgb lives only in texture data-URIs", () => {
    // The engine ships no images and holds every hex in `theme.ts`. An ADD-ON may ship textures
    // (SVG data-URIs), and those carry real colour — that is the one exemption, penned to
    // `textures/`. Everywhere else (suits, sets, skins, the builder) a colour is a theme token or
    // a `spin` param, so this package never re-opens the 261-hex swamp client2 died of.
    const skip = (rel: string): boolean => rel.endsWith(".test.ts") || rel.startsWith("textures/");
    expect(hits(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/, skip)).toEqual([]);
  });
});
