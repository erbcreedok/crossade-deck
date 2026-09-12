// cards.stands-alone — THE GAME RUNS WITHOUT THE HUB, and that is a fact about its IMPORTS before
// it is a fact about its behaviour.
//
// A game can look standalone and not be: one `import … from "@apps/hub"` anywhere in its tree, and
// the address it is opened at pulls in a shelf, a route and a Telegram banner — or simply fails to
// build. The scan below is the cheap half of the guarantee; `spec.test.ts` is the other half, that
// what it declares is actually a playable table.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chairId } from "@game-presets/desks";
import { byId } from "game-kit";
import { CARD_SEATS, cardsSpec } from "./index.js";

const SRC = new URL("./", import.meta.url).pathname;
const APP = new URL("../", import.meta.url).pathname;

/**
 * What this game SHIPS — tests excluded, and this file above all: it names `@apps/hub` in the very
 * pattern it scans for, so a scan that read itself would report itself for ever.
 */
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("cards.stands-alone", () => {
  it("imports no hub, in any file", () => {
    const offenders: string[] = [];
    for (const file of sources()) {
      for (const m of readFileSync(file, "utf8").matchAll(/from\s*["']([^"']+)["']/g)) {
        const spec = m[1] ?? "";
        if (spec.includes("@apps/hub") || spec.includes("apps/hub")) offenders.push(`${file.slice(SRC.length)}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has an entry and a page of its own", () => {
    // WITHOUT THESE IT IS AN EMBEDDABLE MODULE, not a game at an address. The hub is welcome to
    // import `index.ts`; nobody but a browser opens `index.html`.
    expect(readdirSync(APP)).toContain("index.html");
    expect(readdirSync(SRC)).toContain("main.ts");
    const page = readFileSync(join(APP, "index.html"), "utf8");
    expect(page, "the page mounts the entry").toContain("/src/main.ts");
    expect(page, "and gives it something to mount into").toContain('id="app"');
  });

  it("the entry reaches for nothing but this game", () => {
    // A standalone entry that imported the hub's route or its account plumbing would be a hub page
    // wearing a different filename.
    const main = readFileSync(join(SRC, "main.ts"), "utf8");
    const imports = [...main.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["./index.js", "@crossade/wire"]);
  });
});

describe("the card table it declares", () => {
  it("is a table for two, named to the room, with the hand it is played with", () => {
    const spec = cardsSpec();
    expect(spec.id, "the room is created under this name").toBe("cards");
    expect(spec.seats).toBe(CARD_SEATS);
    expect(spec.places(spec.seats).length, "one slot per seat").toBe(CARD_SEATS);
    expect(spec.handsRadius, "a patch of felt per person — a board would declare none").toBeGreaterThan(0);
    expect(spec.layers?.length, "the hand on the glass is a layer, not a branch in the runtime").toBe(1);
  });

  // СТОРОЖ `cards.chairs-belong-to-the-table-not-to-the-game`.
  //
  // За карточным столом стульев столько, сколько их за него поставили: вдвоём и вдесятером играют в
  // одни и те же карты. Число, зашитое в игру, делало стол на четверых столом на двоих — двое
  // садились, а третий оказывался на месте, которого на сукне нет.
  it("стульев столько, сколько назвал стол, и места считаются по ним же", () => {
    const six = cardsSpec({ chairs: 6 });
    expect(six.seats).toBe(6);
    expect(six.places(six.seats).length, "одно место на стул").toBe(6);
    // Никто ничего не сказал — стол открывается на двоих, как и стоял.
    expect(cardsSpec().seats).toBe(CARD_SEATS);
    expect(cardsSpec({ chairs: 0 }).seats, "нисколько стульев — это не стол").toBe(CARD_SEATS);
  });

  it("opens with no rings — the roster is not known before the room answers", () => {
    // THE LAYER IS EMPTY, NOT ABSENT: the map does put the container the chairs go into up front
    // ("seat layer"), and what must not be there yet is a CHAIR. Asking whether any id merely
    // mentions a seat is the version of this check that passes on the wrong thing.
    const desk = cardsSpec().map();
    expect(byId(desk, chairId("p1")), "no chair is built until somebody is announced").toBeUndefined();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });

  it("is played with a throw, a flip and heaps — the three a board has none of", () => {
    const play = cardsSpec().play(undefined as never);
    expect(play.letGo, "a card flicked across the felt travels").toBe("throw");
    expect(play.flipping, "a tap turns what it landed on").toBe(true);
    expect(play.stacking, "what is touching what is a heap").toBe(true);
  });
});
