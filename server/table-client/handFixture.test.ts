/// <reference types="node" />
// РУКА ДЛЯ UNITY — эталон раскладки своей руки (`table-client/handGeom.ts`), который Unity-клиент повторяет на C#
// (`unity/Assets/Crossade/Table/HandGeom.cs`) и сверяет в `HandGeomTests`. Тот же порядок, что у эталона
// протокола (`src/table/wireFixture.test.ts`):
//   UPDATE_WIRE=1 npx vitest run table-client/handFixture.test.ts   — переписать эталон.
//
// Пишет файл, а типов Node у клиента мини-аппа нет (`types: []`): они подключены этому файлу и только ему.

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { blendOf, handBoxOf, mineGeomOf, snapPose, type PoseBlend } from "./handGeom.js";

const FIXTURE = fileURLToPath(new URL("../../unity/Assets/Tests/Editor/Fixtures/hand.json", import.meta.url));

const POSES = [
  { fan: true, shrink: false, tuck: false },
  { fan: false, shrink: false, tuck: false },
  { fan: true, shrink: true, tuck: false },
  { fan: true, shrink: false, tuck: true },
  { fan: false, shrink: true, tuck: true },
];
const GLASSES = [{ w: 390, h: 844 }, { w: 375, h: 667 }, { w: 1280, h: 800 }];
const BLENDS: PoseBlend[] = [{ wide: 1, lift: 0.5 }, { wide: 0.3, lift: 0.8 }, { wide: 0.7, lift: 0.1 }, { wide: 1, lift: 0.9 }];
const round = (v: number) => Math.round(v * 1e6) / 1e6;

describe("эталон руки для Unity", () => {
  it("записанные места карт — ровно то, что считает веб", () => {
    const cases = [];
    for (const g of GLASSES)
      for (const pose of POSES)
        for (const n of [0, 1, 2, 5, 9, 18]) {
          const geom = mineGeomOf(g, pose, n, "me");
          const box = handBoxOf(g, pose, n);
          cases.push({ g, pose, n, w: round(geom.w), h: round(geom.h), barTop: round(geom.barTop ?? 0), shown: round(box.shown), u: box.u, slots: geom.slots.map((s) => ({ x: round(s.x), y: round(s.y), angle: round(s.angle) })) });
        }
    const blends = [];
    for (const b of BLENDS)
      for (const n of [3, 8]) {
        const geom = mineGeomOf(GLASSES[0]!, POSES[0]!, n, "me", b);
        blends.push({ b, n, slots: geom.slots.map((s) => ({ x: round(s.x), y: round(s.y), angle: round(s.angle) })) });
      }
    const snaps = [];
    for (const pose of POSES) {
      snaps.push({ pose, blend: blendOf(pose) });
      for (const b of BLENDS) snaps.push({ pose, b, snap: snapPose(b, pose) });
    }
    const written = JSON.stringify({ cases, blends, snaps }, null, 1) + "\n";
    if (process.env.UPDATE_WIRE) writeFileSync(FIXTURE, written);
    expect(readFileSync(FIXTURE, "utf8"), "эталон руки устарел: UPDATE_WIRE=1 и тесты Unity").toBe(written);
  });
});
