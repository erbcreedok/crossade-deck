// THE LAW THIS FILE EXISTS FOR: one place holds the colours, or twenty places will.
//
// The kit keeps the same rule for itself (`guard.no-raw-colour`), but that scan reads `game-kit/src`
// and cannot see an app. So the product side keeps its own. client2 died of the opposite: 261 raw hex
// against about twenty theme reads, two golds under four names, three near-identical greys.
//
// THE SCAN READS EVERY PRODUCT PACKAGE, not just this one. It used to live inside the hub and scan
// the hub, and when the look moved out here it would have quietly become a guard over a single
// directory — the eleven files it was written to protect no longer in it. A law that narrows when
// code moves is not a law, it is a habit.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = new URL("../../", import.meta.url).pathname;

/**
 * WHERE THE RULE REACHES. Not `game-kit` (its own guard, and a stricter one), and not the kit's
 * generic add-ons — `cards`, `dice`, `desks` ship a look of their own to consumers who have no
 * palette at all. What is listed here is the Crossade Deck product: it wears one palette.
 */
const SCANNED = ["look/src", "wire/src", "game-presets/desk/src", "game-presets/hand/src", "apps/hub/src", "apps/cards/src", "apps/chess/src", "apps/nardy/src"];

/** The one file the colours are allowed to be in, relative to the repo. */
const HOLDER = "look/src/palette.ts";

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return name.endsWith(".ts") ? [full] : [];
  });
}

/**
 * Comments blanked before scanning: this is a law about USING a colour, and naming one in prose —
 * "client1's `rgba(0,0,0,.55)` drop", for instance — is how the code explains where a number came
 * from. A guard that forbade the explanation would be paid for in worse comments.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

describe("the product's look", () => {
  it("look.one-file-holds-the-colours — a second one is how a palette becomes four golds", () => {
    const offenders = SCANNED.flatMap((where) => sources(join(REPO, where)))
      // A TEST MAY NAME A COLOUR: it is checking that something was painted, and the literal is the
      // check. What ships is what this law is about.
      .filter((f) => !f.endsWith(".test.ts"))
      .map((f) => f.slice(REPO.length))
      .filter((rel) => rel !== HOLDER)
      .filter((rel) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(code(readFileSync(join(REPO, rel), "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("scans something — a list of directories that have all been renamed away is a green guard over nothing", () => {
    const found = SCANNED.flatMap((where) => sources(join(REPO, where)));
    expect(found.length, "the scanned tree is not empty").toBeGreaterThan(20);
    expect(found.some((f) => f.endsWith(HOLDER)), "and it does reach the file the colours live in").toBe(true);
  });
});
