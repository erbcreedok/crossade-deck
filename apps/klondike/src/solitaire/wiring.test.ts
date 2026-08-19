// THE LAW THIS FILE EXISTS FOR: a wiring the game imports and never calls is a dead control.
//
// It cannot be caught any other way. `wireButtons` sat in this game's import list unused — every
// control on the table lit nothing, sank nowhere and fired on the way DOWN — and nothing said so:
// tsc is happy with an unused import through a barrel, the kit's own tests pass because the kit is
// fine, and the table draws exactly as it should. Only a finger knows, and a finger is not in CI.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SCENE = readFileSync(new URL("./scene.ts", import.meta.url), "utf8");

/** What the game takes from the kit, by name — the import list, flattened. */
function importedFromKit(source: string): string[] {
  const names: string[] = [];
  for (const block of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"game-kit[^"]*"/g))
    for (const raw of block[1]!.split(","))
      names.push(raw.replace(/\s+as\s+.*$/, "").replace(/^\s*type\s+/, "").trim());
  return names.filter(Boolean);
}

describe("what the game takes from the kit", () => {
  it("wiring.every-wiring-imported-is-called — an unused one is a control that does not answer", () => {
    // `wire*` is the kit's name for "attach this to the host and it will listen". Importing one is
    // a statement that the game wants that behaviour; not calling it is the statement silently
    // withdrawn. Anything else imported may legitimately be a type or a token — this asks only
    // about the ones whose whole purpose is to be invoked.
    const wirings = importedFromKit(SCENE).filter((n) => /^wire[A-Z]/.test(n));
    expect(wirings.length, "the game wires nothing at all — did the imports move?").toBeGreaterThan(0);
    const dead = wirings.filter((n) => !new RegExp(`\\b${n}\\s*\\(`).test(SCENE));
    expect(dead, "imported from the kit and never called").toEqual([]);
  });

  it("wiring.the-press-is-let-go-of — a scene that is torn down stops listening", () => {
    // The teardown is the other half of every `wire*`: it hands back a stop, and a stop nobody
    // calls leaves a listener on a canvas the game has finished with. Two scenes in one page —
    // which is exactly what the hub does — and the second one is heard by both.
    expect(SCENE).toMatch(/const stopButtons = wireButtons\(/);
    expect(SCENE).toMatch(/\bstopButtons\(\);/);
  });
});
