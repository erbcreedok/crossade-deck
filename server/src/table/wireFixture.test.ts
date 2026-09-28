// ПРОТОКОЛ ДЛЯ UNITY — эталонные кадры стола, которые Unity-клиент (`unity/`) обязан сложить так же.
//
// Unity говорит со столом тем же языком, но своим кодом на C#: `patch.ts` он не импортирует. Без общего
// эталона сервер однажды поменяет форму операции, веб-клиент соберётся вместе с ним, а Unity молча
// начнёт терять поля. Здесь сервер гоняет настоящий `Table` по сценарию и пишет для каждого зрителя
// начальный снимок, все патчи и конечный снимок. Тест Unity (`unity/Assets/Tests/Editor/WireTests.cs`)
// складывает патчи своим кодом и сверяет с конечным снимком.
//
// Этот тест падает, когда записанный эталон разошёлся с тем, что стол шлёт сейчас:
//   UPDATE_WIRE=1 npx vitest run src/table/wireFixture.test.ts   — переписать эталон,
// а потом прогнать тесты Unity — они покажут, что в C# надо поправить.

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it, vi } from "vitest";
import { PROTOCOL, type Intent, type Op, type Patch, type Person, type Snapshot } from "./contract.js";
import { applyPatch } from "./patch.js";
import { deskOf } from "./desks.js";
import { Table } from "./table.js";

const FIXTURE = fileURLToPath(new URL("../../../unity/Assets/Tests/Editor/Fixtures/wire.json", import.meta.url));

const person = (key: string): Person => ({ key, name: key.toUpperCase(), ink: "#e5b53a", door: "guest" });
const SUITS = ["s", "h", "d", "c"] as const;
const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const cards = SUITS.flatMap((suit, s) => RANKS.map((rank, r) => ({ id: `c${s * 9 + r}`, face: { rank, suit } })));

interface Reel {
  viewer: string;
  start: Snapshot;
  patches: Patch[];
  end: Snapshot;
}

/** Прогнать стол и записать, что видел каждый зритель. Попутно — та же сверка, что в `table.test.ts`. */
function film(t: Table, viewers: string[], script: (step: (by: string, intent: Intent) => void, run: (ops: Op[]) => void) => void): Reel[] {
  const reels: Reel[] = viewers.map((viewer) => ({ viewer, start: t.seenBy(viewer), patches: [], end: t.seenBy(viewer) }));
  const run = (ops: Op[]) => {
    if (ops.length === 0) return;
    for (const reel of reels) {
      const patch = { v: t.version, ops: ops.map((op) => t.seenOp(op, reel.viewer)) };
      reel.patches.push(structuredClone(patch));
      reel.end = applyPatch(reel.end, patch);
      expect(reel.end).toEqual(t.seenBy(reel.viewer));
    }
  };
  const step = (by: string, intent: Intent) => {
    const r = t.act(by, intent, 1000);
    if ("refused" in r) throw new Error(`${by} ${intent.t}: ${r.refused}`);
    run(r.ops);
  };
  script(step, run);
  for (const reel of reels) reel.end = t.seenBy(reel.viewer);
  return reels;
}

function sandbox(): Reel[] {
  const t = new Table(cards, "a");
  const viewers = ["a", "b", "c"];
  return film(t, viewers, (step, run) => {
    for (const v of viewers) run(t.join(person(v)));
    const seat = (k: string) => t.seenBy(k).people.find((p) => p.key === k)!.seat!;
    const [a, b] = [seat("a"), seat("b")];
    const top = (k = "a") => t.seenBy(k).piles.find((p) => p.id === "deck")!.cards.at(-1)!.id;
    const take = (by: string, chair: string) => {
      const id = top(by);
      step(by, { t: "grab", id });
      step(by, { t: "drop", id, to: { in: "hand", chair, i: 0 } });
      return id;
    };
    const x = take("a", a);
    take("a", a);
    take("b", b);
    take("b", b);
    step("b", { t: "flag", chair: b, flag: "hide", on: false });
    step("a", { t: "turn", id: x });
    step("a", { t: "flip" });
    step("a", { t: "arrange", how: "suit" });
    step("b", { t: "pose", chair: b, pose: { shrink: true } });
    step("a", { t: "pose", chair: a, pose: { tuck: true } });
    step("a", { t: "grab", id: x });
    step("a", { t: "drop", id: x, to: { in: "felt", x: 0.5, y: -1, up: true, angle: 35 }, throw: true });
    step("b", { t: "turn", id: x });
    step("c", { t: "deckMove", pile: "deck", x: 1, y: 2, angle: 30 });
    step("a", { t: "deckDo", pile: "deck", how: "flip" });
    step("b", { t: "deckDo", pile: "deck", how: "sort" });
    step("c", { t: "deckDo", pile: "deck", how: "shuffle" });
    step("a", { t: "deckGuard", pile: "deck", guard: "lock", on: true });
    step("a", { t: "deckGuard", pile: "deck", guard: "lock", on: false });
    step("b", { t: "deckPin", pile: "deck", on: true });
    step("a", { t: "deckPin", pile: "deck", on: false });
    const deck = () => t.seenBy("a").piles.find((p) => p.id === "deck")!.cards;
    step("a", { t: "gather", ids: [x, deck()[0]!.id], side: "up", to: { x: -2, y: 1, angle: 20 } });
    step("b", { t: "pick", ids: [deck()[1]!.id], on: true });
    step("b", { t: "unpick" });
    step("a", { t: "turnMany", ids: [deck()[2]!.id] });
    step("a", { t: "moveMany", moves: [{ id: deck().at(-1)!.id, to: { in: "felt", x: 2, y: -2, up: false, angle: 5 } }] });
    step("a", { t: "grab", id: deck().at(-1)!.id });
    step("a", { t: "rules", rules: { back: "argyle" } });
    const y = t.seenBy("a").chairs.find((c) => c.id === a)!.hand[0]!.id;
    step("a", { t: "grab", id: y });
    step("a", { t: "drop", id: y, to: { in: "felt", x: -3, y: 2.5, up: true, angle: -12 }, throw: true });
    step("b", { t: "stand" });
    step("b", { t: "sit", chair: b });
    run(t.leave("c"));
  });
}

function krest(): Reel[] {
  const t = new Table(cards, "a", deskOf("krest"));
  const viewers = ["a", "b"];
  return film(t, viewers, (step, run) => {
    for (const v of viewers) run(t.join(person(v)));
    const deck = () => t.seenBy("a").piles.find((p) => p.id === "deck")!.cards;
    for (const turn of [0, 0, 90]) {
      const id = deck().at(-1)!.id;
      step("a", { t: "grab", id });
      step("a", { t: "drop", id, to: { in: "deck", pile: "ring", turn } });
    }
  });
}

describe("эталон протокола для Unity", () => {
  it("записанные кадры — ровно то, что стол шлёт сейчас", () => {
    // Перемешивание и новые id карт берут случай — эталону нужен один и тот же.
    let seed = 7;
    vi.spyOn(Math, "random").mockImplementation(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
    let fresh = 0;
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => `${String((fresh += 1)).padStart(8, "0")}-0000-4000-8000-000000000000`);
    const written = JSON.stringify({ protocol: PROTOCOL, reels: { sandbox: sandbox(), krest: krest() } }, null, 1) + "\n";
    if (process.env.UPDATE_WIRE) writeFileSync(FIXTURE, written);
    expect(readFileSync(FIXTURE, "utf8"), "эталон устарел: UPDATE_WIRE=1 и тесты Unity").toBe(written);
  });
});
