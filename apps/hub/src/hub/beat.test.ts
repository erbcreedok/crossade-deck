// THE LAW THIS FILE EXISTS FOR: the hub has ONE frame loop, and it lives in `beat.ts`.
//
// The kit keeps the same rule for itself (`guard.one-clock` — "any continuous animation runs on one
// clock; a node does not start its own ticker"), but that scan reads `game-kit/src` and cannot see
// an app. The hub had two candidates on its first day — the tile's loading sweep and the felt's
// drift — and two loops do not merely cost twice: each redraws over the other's frame, so the gold
// flickers against the felt and neither file contains the reason.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [full] : [];
  });
}

/** Comments blanked: naming `requestAnimationFrame` in prose is how a file explains its clock. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

describe("the hub's clock", () => {
  it("hub.one-clock — the frame loop lives in exactly one file", () => {
    const users = sources(ROOT)
      .filter((file) => /\brequestAnimationFrame\b|\bsetInterval\b/.test(code(readFileSync(file, "utf8"))))
      .map((file) => file.slice(ROOT.length));
    expect(users).toEqual(["hub/beat.ts"]);
  });
});
