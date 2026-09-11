// ARCHITECTURAL GUARDS for the desk runtime.
//
// THE ONE LAW THIS PACKAGE HAS: it does not know what game is being played on it. It was written by
// taking a file that DID know — 863 lines with ten `if (game === "chess")` in it — and moving every
// answer out into the spec. Without a scan, the first game with an awkward requirement puts one
// branch back, and the second one finds the door already open.
//
// A scan must read CODE, not prose: this file's own header says "chess", and so do the comments in
// `startDesk.ts` that explain what used to be there. Comments and string bodies are blanked first.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("./", import.meta.url).pathname;

interface Source {
  readonly rel: string;
  /** Comments and string bodies blanked out, so a mention is not read as a use. */
  readonly code: string;
}

function files(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

/** Line comments, block comments and the insides of every quote, replaced by spaces of equal length. */
function blank(raw: string): string {
  return raw.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
}

function sources(): Source[] {
  return files()
    .filter((p) => !p.endsWith(".test.ts"))
    .map((p) => ({ rel: p.slice(SRC.length), code: blank(readFileSync(p, "utf8")) }));
}

/**
 * EVERY NAME THE CODE USES, lowercased — identifiers and the module specifiers they are imported by.
 *
 * WORD BOUNDARIES ARE NOT ENOUGH, and this guard was born proving it: the first version scanned for
 * `\bchess\b` and let `chessMap` through untouched, so the deliberate break that was supposed to
 * turn it red stayed green. A leak arrives as `chessMap`, `cardOf`, `seatChair` — the banned word
 * is a PART of the name, never the whole of it.
 */
function namesIn(code: string): string[] {
  const names: string[] = [];
  for (const m of code.matchAll(/[A-Za-z_$][\w$]*/g)) names.push(m[0].toLowerCase());
  return names;
}

describe("desk.the-runtime-knows-no-game", () => {
  // EVERY GAME ON THE SHELF, AND THE FURNITURE THAT BELONGS TO ONE OF THEM. A word here is a word
  // this package must never have a use for: the moment it does, a game has leaked into the runtime
  // and the next game will have to be special-cased beside it.
  const GAMES = ["cards", "chess", "nardy", "klondike", "durak", "backgammon"];
  const THEIRS = ["card", "chair", "chess", "nardy", "checker", "square", "suit", "deck"];

  it("names no game", () => {
    const offenders: string[] = [];
    for (const { rel, code } of sources()) {
      for (const name of namesIn(code)) {
        for (const word of GAMES) if (name.includes(word)) offenders.push(`${rel}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("names no game's own furniture", () => {
    const offenders: string[] = [];
    for (const { rel, code } of sources()) {
      for (const name of namesIn(code)) {
        for (const word of THEIRS) if (name.includes(word)) offenders.push(`${rel}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reaches into no app", () => {
    // ...AND NEVER BACK INTO A HUB. A runtime that imported the page it is usually embedded in could
    // not be used by a game opened on its own URL, which is half of what it exists for.
    const offenders: string[] = [];
    for (const p of files()) {
      const raw = readFileSync(p, "utf8");
      for (const m of raw.matchAll(/from\s*["']([^"']+)["']/g)) {
        const spec = m[1] ?? "";
        if (spec.includes("@apps/") || spec.includes("apps/hub")) offenders.push(`${p.slice(SRC.length)}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
