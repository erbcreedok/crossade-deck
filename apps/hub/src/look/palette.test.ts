// THE LAW THIS FILE EXISTS FOR: one place holds the colours, or twenty places will.
//
// The kit keeps the same rule for itself (`guard.no-raw-colour`), but that scan reads `game-kit/src`
// and cannot see an app. So the hub keeps its own. client2 died of the opposite: 261 raw hex against
// about twenty theme reads, two golds under four names, three near-identical greys.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url).pathname;

function sources(dir: string): string[] {
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

describe("the hub's look", () => {
  it("hub.one-file-holds-the-colours — a second one is how a palette becomes four golds", () => {
    const offenders = sources(ROOT)
      .filter((f) => !f.endsWith("look/palette.ts"))
      .filter((f) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(code(readFileSync(f, "utf8"))))
      .map((f) => f.slice(ROOT.length));
    expect(offenders).toEqual([]);
  });
});
