// THE FELT CARRIES PIECES AND NOTHING ELSE — the guard on what a desk builder is allowed to put on
// the map.
//
// It was written after a strip of eighty tiny sprites appeared on the hub's felt, just off the
// right of the round table: every registered picture, one node each, put there so that a PLAN would
// mention them and the renderer would load them (the old `warmingNodes`). Warming a texture cache
// is a question for the RENDERER (`Painter.warm`, asked at the binding by `warmPictures`), and an
// asset registry is not a thing that goes on a table. A scan and not a check of one desk: the same
// mistake made on the next map is the same picture on the next table.

import { describe, expect, it } from "vitest";
import { walk, type Node, type ValuedFields, fieldsOf } from "game-kit";
import { chessMap } from "./chessMap.js";
import { liveMap } from "./liveMap.js";
import { nardyMap } from "./nardyMap.js";
import { roundMap } from "./roundMap.js";

const DESKS: readonly [string, () => Node][] = [
  ["round", () => roundMap([])],
  ["live", () => liveMap()],
  ["chess", () => chessMap()],
  ["nardy", () => nardyMap()],
];

describe("felt", () => {
  it.each(DESKS)("desk.no-atlas-on-the-felt — %s carries no picture-warming sprite", (_name, build) => {
    const stray: string[] = [];
    walk(build(), (n) => {
      if (fieldsOf<ValuedFields>(n, "Valued")?.values?.["warm"] !== undefined) stray.push(n.id);
    });
    expect(stray, "a texture cache is warmed through the painter, never by nodes on the desk").toEqual([]);
  });
});
