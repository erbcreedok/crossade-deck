// БОТ ИГРАЕТ ПАРТИЮ ЦЕЛИКОМ — без комнаты, без сети, без часов.
//
// Комната отвечает за «когда» (`nudge.ts`), а здесь проверяется «что»: бот, которому дали стол и
// мозг, доигрывает партию до конца, ни разу не сходив нелегально и ни разу не встав. Партия,
// которая не кончается, — худший исход: за столом это выглядит как зависший бот, и что именно
// сломалось, по экрану не понять.

import { describe, expect, it } from "vitest";
import type { Face } from "../contract.js";
import type { Seats } from "../referee.js";
import { RING } from "../games/krest.js";
import { krestReferee } from "../games/krestReferee.js";
import { best } from "./greedy.js";
import { PROFILES } from "./profiles.js";
import type { Move } from "./brain.js";

const id = (f: Face, n: number) => `${f.rank}${f.suit}#${n}`;

/** Колода без джокеров: 36 карт, как в этой игре. */
function колода(): { one: string; face: Face }[] {
  const out: { one: string; face: Face }[] = [];
  let n = 0;
  for (const suit of ["s", "h", "d", "c"] as const) {
    for (const rank of ["6", "7", "8", "9", "10", "J", "Q", "K", "A"]) {
      n += 1;
      out.push({ one: id({ rank, suit }, n), face: { rank, suit } });
    }
  }
  return out;
}

/** Стол, который умеет то же, что настоящий: взять карту из руки в круг и из круга в руку. */
function стол(players: string[], perHand: number) {
  const deck = колода();
  const faces = new Map(deck.map((c) => [c.one, c.face]));
  const hands: Record<string, string[]> = {};
  let at = 0;
  for (const who of players) hands[who] = deck.slice(at, (at += perHand)).map((c) => c.one);
  const circle: string[] = [];
  const seats: Seats = {
    get chairs() {
      return players.map((chair) => ({ id: chair, owner: `кто:${chair}`, hand: [...(hands[chair] ?? [])], angle: 0 }));
    },
    faceOf: (one) => faces.get(one),
    pile: (p) => (p === RING ? [...circle] : []),
  };
  return {
    seats,
    hands,
    circle,
    /** Тот же жест, что делает комната за бота: карта уходит из руки в круг или из круга в руку. */
    do(who: string, move: Move): { one: string; how: "laid" | "taken" } | null {
      if (move.t === "lay") {
        const hand = hands[who] ?? [];
        const at2 = hand.indexOf(move.id);
        if (at2 === -1) return null;
        hand.splice(at2, 1);
        circle.push(move.id);
        return { one: move.id, how: "laid" };
      }
      const low = circle.shift();
      if (low === undefined) return null;
      (hands[who] ??= []).push(low);
      return { one: low, how: "taken" };
    },
  };
}

describe("bots.a-bot-finishes-the-game", () => {
  it("трое ботов доигрывают партию до проигравшего и ни разу не ходят нелегально", () => {
    const players = ["a", "b", "v"];
    const t = стол(players, 6);
    const ref = krestReferee();
    ref.start(t.seats, "a");

    const профили = [PROFILES["копитель"]!, PROFILES["агрессор"]!, PROFILES["закрывала"]!];
    /** Сколько раз ходил каждый: партия, где ходит один и тот же, — это не партия. */
    const сходил: Record<string, number> = { a: 0, b: 0, v: 0 };
    let ходов = 0;
    for (; ходов < 400; ходов += 1) {
      const turn = ref.view(t.seats)?.turn;
      if (turn === null || turn === undefined) break;
      const chair = players.find((one) => `кто:${one}` === turn)!;
      const brief = ref.bot!(t.seats, chair);
      expect(brief, `${chair}: ход его, а ходить нечем`).not.toBe(null);
      const move = best(brief!.legal, brief!.view, профили[players.indexOf(chair)]!);
      // ХОД ОБЯЗАН БЫТЬ ИЗ СПИСКА — иначе за столом окажется бот, играющий не по правилам.
      expect(brief!.legal).toContainEqual(move);
      const done = t.do(chair, move);
      expect(done, "стол принял ход").not.toBe(null);
      // ХОД НАЗЫВАЕТ ОБА КОНЦА: положил — из руки в круг, взял — из круга в свою руку. По одному
      // «куда» взятие неотличимо от поправки карт в собственной руке.
      const to = move.t === "lay" ? { in: "deck" as const, pile: RING } : { in: "hand" as const, chair, i: 0 };
      const from = move.t === "lay" ? { in: "hand" as const, chair, i: 0 } : { in: "deck" as const, pile: RING };
      expect(ref.follow(t.seats, turn, { t: "drop", id: done!.one, to }, from), "судья засчитал ход").toBe(true);
      сходил[chair] = (сходил[chair] ?? 0) + 1;
    }
    expect(ходов, "партия кончилась, а не зациклилась").toBeLessThan(400);
    // ОЧЕРЕДЬ ОБОШЛА СТОЛ. Без этого «партия кончилась» проходит и тогда, когда ходит один и тот же
    // игрок, пока не опустеет рука, — а это уже не игра, и по экрану такое не отличить от зависания.
    for (const who of players) expect(сходил[who], `${who} за всю партию так и не сходил`).toBeGreaterThan(0);
    expect(ref.view(t.seats)?.turn, "ходов больше нет").toBe(null);
    expect(ref.play(t.seats, "кто:a")?.loser, "проигравший назван").not.toBe(null);
  });

  it("бот помнит партию после перезапуска: слепок несёт и тень, и историю ходов", () => {
    const t = стол(["a", "b"], 4);
    const ref = krestReferee();
    ref.start(t.seats, "a");
    const turn = ref.view(t.seats)!.turn!;
    const chair = turn === "кто:a" ? "a" : "b";
    const one = t.hands[chair]![0]!;
    t.do(chair, { t: "lay", id: one, card: t.seats.faceOf(one)!, to: { in: "deck", pile: RING } });
    ref.follow(t.seats, turn, { t: "drop", id: one, to: { in: "deck", pile: RING } });

    const снова = krestReferee();
    снова.load(ref.dump());
    expect(снова.view(t.seats)?.turn, "очередь та же").toBe(ref.view(t.seats)?.turn);
    const был = ref.bot!(t.seats, chair === "a" ? "b" : "a");
    const стал = снова.bot!(t.seats, chair === "a" ? "b" : "a");
    expect(стал?.view.facts, "и память стола та же").toEqual(был?.view.facts);
  });

  it("не его очередь — судья не даёт боту ничего", () => {
    const t = стол(["a", "b"], 3);
    const ref = krestReferee();
    ref.start(t.seats, "a");
    const turn = ref.view(t.seats)!.turn!;
    const чужой = turn === "кто:a" ? "b" : "a";
    expect(ref.bot!(t.seats, чужой)).toBe(null);
  });
});
