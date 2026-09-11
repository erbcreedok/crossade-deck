// apps.a-game-never-imports-the-hub — THE ARROWS POINT ONE WAY.
//
// Each game already guards itself (`cards.stands-alone` and friends), and that is the guard that
// fails first and most usefully. This one exists because those cannot: a game added tomorrow will
// arrive with its own tests or without them, and a rule that is only kept by files that do not exist
// yet is not kept at all. Here the whole `apps/` tree is read at once, so a new game is covered on
// the day it is created.
//
// It lives in the runtime's package rather than the hub's on purpose: the hub is the thing being
// guarded against, and a law kept by the party it constrains is the law that quietly gets an
// exception.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = new URL("../../../", import.meta.url).pathname;
const APPS = join(REPO, "apps");
const HUB = "hub";

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" || name === "dist" ? [] : sources(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

function importsOf(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
}

/** Every app but the hub itself — one directory per game. */
function games(): string[] {
  return readdirSync(APPS).filter((name) => name !== HUB && statSync(join(APPS, name)).isDirectory());
}

describe("apps.a-game-never-imports-the-hub", () => {
  it("finds the games at all", () => {
    // A SCAN OVER AN EMPTY LIST IS GREEN AND WORTHLESS. This is the check that the check is running.
    expect(games().length, "apps/ holds games beside the hub").toBeGreaterThan(2);
  });

  it("no game reaches into the hub, in any file it ships", () => {
    const offenders: string[] = [];
    for (const game of games()) {
      for (const file of sources(join(APPS, game, "src"))) {
        for (const spec of importsOf(file)) {
          if (spec.includes("@apps/hub") || spec.includes("apps/hub")) {
            offenders.push(`${game}/${file.slice(join(APPS, game).length + 1)}: ${spec}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every game declares a package, an entry and a page of its own", () => {
    // STANDALONE IS A PROMISE MADE IN THREE FILES. A game missing one of them is embeddable and not
    // openable, which is the half-migration this whole track exists to avoid leaving behind.
    const missing: string[] = [];
    for (const game of games()) {
      for (const needed of ["package.json", "index.html", "src/index.ts", "src/main.ts"]) {
        if (!existsSync(join(APPS, game, needed))) missing.push(`${game}/${needed}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
