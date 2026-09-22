import { describe, expect, it } from "vitest";
import type { Op, Person, Snapshot, TableCommand } from "./contract.js";
import { applyPatch } from "./patch.js";
import { collectSteps, execute, plan, type Who } from "./script.js";
import { deal } from "./deal.js";
import { Table } from "./table.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest", username: `u${key}` });
const BOT = "bot";

/** Стол с сидящими `keys` (админ — первый) и ботом; `seen` — снимок зрителя, собранный патчами. */
function table(...keys: string[]) {
  const t = new Table(deal(), keys[0]);
  for (const k of keys) t.join(person(k));
  t.joinBot({ key: BOT, name: "CrossaderBot", ink: "#0ff", door: "guest" });
  let seen: Snapshot = t.seenBy(keys[0]!);
  const log: Op[][] = [];
  const who = (): Who[] => t.seenBy(keys[0]!).people.map((p) => ({ key: p.key, name: p.name, username: p.username, seat: p.seat }));
  const run = async (command: TableCommand, by = keys[0]!) => {
    const p = plan(t, command, who(), by);
    if ("error" in p) return p.error;
    await execute(t, p.steps, p.actor === "bot" ? BOT : p.actor, {
      spread: (ops) => {
        log.push(ops);
        seen = applyPatch(seen, { v: t.version, ops: ops.map((op) => t.seenOp(op, keys[0]!)) });
      },
      carry: () => {},
      sleep: async () => {},
      now: () => 0,
    });
    return "ok";
  };
  const hand = (k: string) => t.seenBy(k).chairs.find((c) => c.owner === k)!.hand;
  return { t, run, hand, seen: () => seen, log };
}

/** По часовой на экране — по убыванию угла (угол растёт от шести часов к трём). */
const clockwiseFrom = (t: Table, key: string, keys: string[]) => {
  const chairs = t.layout().chairs.filter((c) => keys.includes(c.owner!)).sort((a, b) => b.angle - a.angle);
  const i = chairs.findIndex((c) => c.owner === key);
  return [...chairs.slice(i + 1), ...chairs.slice(0, i + 1)].map((c) => c.owner!);
};

describe("команды стола: раздача", () => {
  it("по N каждому, по часовой со следующего после раздающего", async () => {
    const s = table("a", "b", "c");
    expect(await s.run({ t: "deal", rule: "each", n: 3 })).toBe("ok");
    for (const k of ["a", "b", "c"]) expect(s.hand(k)).toHaveLength(3);
    expect(s.t.layout().deck).toHaveLength(27);
    // Первая карта ушла следующему после админа.
    const first = s.log.flat().find((op) => op.t === "move");
    const next = clockwiseFrom(s.t, "a", ["a", "b", "c"])[0]!;
    expect(first).toMatchObject({ to: { in: "hand", chair: s.t.seenBy(next).people.find((p) => p.key === next)!.seat } });
    // Ходил бот — след у него.
    expect(s.t.seenBy("a").trails[s.hand("b")[0]!.id]).toMatchObject({ by: BOT, from: "deck" });
  });

  it("КРУПЬЕ ЗА СТОЛОМ — раздача идёт по часовой от него: пересадка меняет порядок", async () => {
    const s = table("a", "b", "c");
    s.t.seatCroupier({ key: "bot:table", name: "Крупье", ink: "#fff", door: "guest", bot: true });
    const chairOf = (k: string) => s.t.layout().chairs.find((c) => c.owner === k)!.id;
    const croupier = s.t.layout().chairs.find((c) => c.croupier)!;
    // Рассадка рукой: угол растёт против часовой, поэтому по часовой от крупье — b, a, c.
    s.t.turnChair(chairOf("c"), croupier.angle + 40);
    s.t.turnChair(chairOf("a"), croupier.angle + 150);
    s.t.turnChair(chairOf("b"), croupier.angle + 260);
    expect(await s.run({ t: "deal", rule: "each", n: 1 })).toBe("ok");
    const toHand = (op: Op) => (op.t === "move" && op.to.in === "hand" ? [op.to.chair] : []);
    const went = s.log.flat().flatMap(toHand);
    expect(went).toEqual([chairOf("b"), chairOf("a"), chairOf("c")]);
    // Против часовой — с другого конца.
    expect(await s.run({ t: "deal", rule: "each", n: 1, dir: "ccw", force: true })).toBe("ok");
    expect(s.log.flat().flatMap(toHand).slice(-3)).toEqual([chairOf("c"), chairOf("a"), chairOf("b")]);
    // Пересадили — порядок другой.
    s.t.turnChair(chairOf("b"), croupier.angle + 20);
    expect(await s.run({ t: "deal", rule: "each", n: 1, force: true })).toBe("ok");
    const again = s.log.flat().flatMap(toHand).slice(-3);
    expect(again).toEqual([chairOf("a"), chairOf("c"), chairOf("b")]);
  });

  it("крестовый: всё поровну, у раздающего не больше всех, у следующего — не меньше", async () => {
    const keys = ["a", "b", "c", "d", "e"];
    const s = table(...keys);
    expect(await s.run({ t: "deal", rule: "krest", dealer: "@uc" })).toBe("ok");
    const counts = Object.fromEntries(keys.map((k) => [k, s.hand(k).length]));
    const next = clockwiseFrom(s.t, "c", keys)[0]!;
    expect(Object.values(counts).reduce((x, y) => x + y)).toBe(36);
    expect(counts.c).toBe(Math.min(...Object.values(counts)));
    expect(counts[next]).toBe(Math.max(...Object.values(counts)));
    expect(counts.c).toBe(7);
  });

  it("НАЗВАЛИ НАЧАЛЬНЫЙ СТУЛ — первая карта ЕМУ САМОМУ, а не следующему за ним", async () => {
    const s = table("a", "b", "c");
    const seat = (k: string) => s.t.layout().chairs.find((c) => c.owner === k)!.id;
    expect(await s.run({ t: "deal", rule: "each", n: 1, from: seat("c") })).toBe("ok");
    const first = s.log.flat().find((op) => op.t === "move");
    expect(first).toMatchObject({ to: { in: "hand", chair: seat("c") } });
  });

  it("НАЗВАЛИ СТУЛЬЯ — раздают ровно им, прочие сидят пустыми", async () => {
    const s = table("a", "b", "c");
    const seat = (k: string) => s.t.layout().chairs.find((c) => c.owner === k)!.id;
    expect(await s.run({ t: "deal", rule: "krest", seats: [seat("a"), seat("c")] })).toBe("ok");
    expect(s.hand("b"), "кого не назвали — тому не раздали").toHaveLength(0);
    expect(s.hand("a").length + s.hand("c").length).toBe(36);
  });

  it("дурак: по 6 и козырь лицом под колоду", async () => {
    const s = table("a", "b");
    expect(await s.run({ t: "deal", rule: "durak" })).toBe("ok");
    expect(s.hand("a")).toHaveLength(6);
    expect(s.t.layout().deck).toHaveLength(23);
    const trump = s.t.seenBy("b").felt;
    expect(trump).toHaveLength(1);
    expect(trump[0]).toMatchObject({ up: true, angle: 90, under: true });
    expect(trump[0]!.face).toBeDefined();
  });

  it("карты не собраны — спрашивает; с force собирает, мешает и раздаёт", async () => {
    const s = table("a", "b");
    await s.run({ t: "deal", rule: "each", n: 2 });
    expect(await s.run({ t: "deal", rule: "each", n: 2 })).toBe("needs-collect");
    expect(await s.run({ t: "deal", rule: "each", n: 4, force: true })).toBe("ok");
    expect(s.hand("a")).toHaveLength(4);
    expect(s.t.layout().deck).toHaveLength(28);
  });

  it("не хватает карт — отказ без единого хода", async () => {
    const s = table("a", "b");
    expect(await s.run({ t: "deal", rule: "each", n: 19 })).toBe("not-enough-cards");
    expect(s.log).toHaveLength(0);
  });

  it("покинутым стульям раздаёт, а с skipEmpty — нет", async () => {
    const s = table("a", "b", "c");
    s.t.act("c", { t: "flag", chair: s.t.seenBy("c").people.find((p) => p.key === "c")!.seat!, flag: "forever", on: true }, 0);
    s.t.leave("c");
    await s.run({ t: "deal", rule: "each", n: 1 });
    expect(s.t.layout().chairs.every((c) => c.hand.length === 1)).toBe(true);
    await s.run({ t: "collect" });
    await s.run({ t: "deal", rule: "each", n: 1, skipEmpty: true });
    expect(s.t.layout().chairs.find((c) => c.owner === null)!.hand).toHaveLength(0);
  });

  it("от лица раздающего — ходит он: его след", async () => {
    const s = table("a", "b");
    await s.run({ t: "deal", rule: "each", n: 1, dealer: "b", asDealer: true });
    expect(s.t.seenBy("a").trails[s.hand("a")[0]!.id]).toMatchObject({ by: "b", byName: "b" });
  });

  it("пока команда идёт, рука человека стол не трогает", async () => {
    const s = table("a", "b");
    const p = plan(s.t, { t: "deal", rule: "each", n: 1 }, [{ key: "a", name: "a", seat: s.t.seenBy("a").people[0]!.seat }], "a");
    let checked = false;
    await execute(s.t, "error" in p ? [] : p.steps, BOT, {
      spread: () => {},
      carry: () => {},
      sleep: async () => {
        if (checked) return;
        checked = true;
        expect(s.t.act("b", { t: "grab", id: s.t.layout().deck.at(-1)! }, 0)).toEqual({ refused: "busy" });
      },
      now: () => 0,
    });
    expect(checked).toBe(true);
    expect("ops" in s.t.act("b", { t: "grab", id: s.t.layout().deck.at(-1)! }, 0)).toBe(true);
  });
});

describe("команды стола: колода и пресеты", () => {
  it("перемешать — новые id у всех карт колоды; с картами на руках — просит собрать", async () => {
    const s = table("a");
    const before = new Set(s.t.layout().deck);
    await s.run({ t: "shuffle" });
    expect(s.t.layout().deck.some((id) => before.has(id))).toBe(false);
    expect(s.t.seenBy("a").piles[0]!.shuffles).toBe(1);
    await s.run({ t: "deal", rule: "each", n: 1 });
    expect(await s.run({ t: "shuffle" })).toBe("needs-collect");
  });

  it("СМЕНА КОЛОДЫ НЕ СГРЕБАЕТ КАРТЫ: розданное остаётся в руках, приходит только недостающее", async () => {
    const s = table("a", "b");
    await s.run({ t: "deal", rule: "each", n: 5 });
    const was = [...s.hand("a")];
    expect(await s.run({ t: "preset", game: "krest", size: 52, jokers: true })).toBe("ok");
    expect(s.hand("a"), "рука не тронута").toEqual(was);
    const all = [...s.t.layout().deck, ...s.t.layout().chairs.flatMap((c) => c.hand)];
    expect(all, "на столе ровно новая колода").toHaveLength(54);
    expect(all.filter((id) => s.t.faceOf(id)!.rank === "JK"), "джокеры пришли").toHaveLength(2);
  });

  it("КОЛОДА СТАЛА МЕНЬШЕ: лишние карты уходят прямо из рук, а не собираются в кучу", async () => {
    const s = table("a", "b");
    await s.run({ t: "preset", game: "krest", size: 52 });
    await s.run({ t: "deal", rule: "each", n: 10 });
    const small = new Set(["6", "7", "8", "9", "10", "J", "Q", "K", "A"]);
    const had = s.hand("a").filter((c) => !small.has(s.t.faceOf(c.id)!.rank)).length;
    expect(had, "мелочь на руках была").toBeGreaterThan(0);
    expect(await s.run({ t: "preset", game: "krest", size: 36 })).toBe("ok");
    expect(s.hand("a").every((c) => small.has(s.t.faceOf(c.id)!.rank)), "мелочи в руке не осталось").toBe(true);
    const all = [...s.t.layout().deck, ...s.t.layout().chairs.flatMap((c) => c.hand)];
    expect(all).toHaveLength(36);
  });

  it("белка: четверо крестом, шестёрки на краю, по 8 первым четырём; шестёрки раздача не трогает", async () => {
    const keys = ["a", "b", "c", "d", "e"];
    const s = table(...keys);
    expect(await s.run({ t: "preset", game: "belka", size: 52, jokers: true })).toBe("ok");
    const at = s.t.layout();
    const home = at.chairs.find((c) => c.owner === "a")!.angle;
    const rel = at.chairs.map((c) => (((c.angle - home) % 360) + 360) % 360).sort((x, y) => x - y);
    // Четверо — крестом; пятый — между ними, не на их углах.
    expect(rel).toEqual(expect.arrayContaining([0, 90, 180, 270]));
    expect(rel).toHaveLength(5);
    expect(new Set(rel).size).toBe(5);
    expect(at.deck).toHaveLength(32);
    expect(at.felt.map((f) => s.t.faceOf(f.id)!.rank)).toEqual(["6", "6", "6", "6"]);
    expect(await s.run({ t: "deal", rule: "belka" })).toBe("ok");
    const counts = keys.map((k) => s.hand(k).length).sort();
    expect(counts).toEqual([0, 8, 8, 8, 8]);
    expect(s.t.layout().felt).toHaveLength(4);
    expect(s.t.layout().deck).toHaveLength(0);
    expect(await s.run({ t: "deal", rule: "belka", force: true })).toBe("ok");
    expect(s.t.layout().felt).toHaveLength(4);
  });

  it("белка без четырёх игроков — отказ", async () => {
    const s = table("a", "b");
    expect(await s.run({ t: "preset", game: "belka" })).toBe("not-enough-players");
    // НАЗВАЛИ СТУЛЬЯ — их должно быть ровно четыре: три или пять — отказ, а не «первые четыре».
    const four = s.t.layout().chairs.filter((c) => !c.croupier).map((c) => c.id);
    expect(await s.run({ t: "deal", rule: "belka", seats: four.slice(0, 3), force: true })).toBe("wrong-players");
  });

  it("вид колоды: белка — классика, дурак и крестовый — минимал; рубашку пресет не трогает", async () => {
    const s = table("a", "b", "c", "d");
    await s.run({ t: "look", back: "crest" });
    expect(s.t.seenBy("a").rules).toMatchObject({ faces: "classic", back: "crest" });
    await s.run({ t: "preset", game: "durak" });
    expect(s.t.seenBy("a").rules).toMatchObject({ faces: "minimal", back: "crest" });
    await s.run({ t: "preset", game: "belka" });
    expect(s.t.seenBy("a").rules).toMatchObject({ faces: "classic", back: "crest" });
    await s.run({ t: "look", faces: "minimal" });
    expect(s.seen().rules).toMatchObject({ faces: "minimal", back: "crest" });
  });

  it("патчи команды складываются у зрителя в тот же стол, что у сервера", async () => {
    const s = table("a", "b", "c", "d");
    await s.run({ t: "preset", game: "belka" });
    await s.run({ t: "deal", rule: "belka" });
    await s.run({ t: "preset", game: "durak", size: 52 });
    await s.run({ t: "deal", rule: "durak" });
    const { v: _v1, ...want } = s.t.seenBy("a");
    const { v: _v2, ...got } = s.seen();
    expect(got).toEqual(want);
  });
});

describe("СОБРАТЬ — В РУКИ КРУПЬЕ, а не в стопку рядом", () => {
  const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
  const withCroupier = () => {
    const t = new Table(deal(), "Аня");
    t.join(person("Аня"));
    t.seatCroupier({ ...person("Крупье"), ink: "#fff" });
    return t;
  };
  const run = async (t: Table, steps: ReturnType<typeof collectSteps>) =>
    execute(t, steps, "Аня", { spread: () => {}, carry: () => {}, sleep: async () => {}, now: () => 0 });

  it("вся колода уходит крупье в руку, и на столе пусто", async () => {
    const t = withCroupier();
    const seat = t.croupierSeat()!;
    const all = t.layout().deck.length;
    await run(t, collectSteps(t));
    expect(t.layout().chairs.find((c) => c.id === seat)!.hand).toHaveLength(all);
    expect(t.layout().deck, "в колоде не осталось ничего").toHaveLength(0);
  });

  it("крупье за столом нет — собирается в колоду, держать некому", async () => {
    const t = new Table(deal());
    t.join(person("Аня"));
    const chair = t.layout().chairs[0]!.id;
    const top = t.layout().deck.at(-1)!;
    t.act("Аня", { t: "grab", id: top }, 0);
    t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair, i: 0 } }, 0);
    await run(t, collectSteps(t));
    expect(t.layout().chairs[0]!.hand).toHaveLength(0);
    expect(t.layout().deck.length).toBeGreaterThan(0);
  });

  it("РАЗДАЧА БЕРЁТ КАРТЫ ИЗ РУК КРУПЬЕ: собранная колода у него, и это не «разбросано»", async () => {
    const t = withCroupier();
    t.join(person("Боря"));
    const seat = t.croupierSeat()!;
    await run(t, collectSteps(t));
    const people = [{ key: "Аня", name: "Аня", seat: t.layout().chairs.find((c) => c.owner === "Аня")!.id }];
    const out = plan(t, { t: "deal", rule: "durak" }, people, "Аня");
    expect("error" in out ? out.error : "ok", "стол считается собранным").toBe("ok");
    if ("error" in out) return;
    await run(t, out.steps);
    expect(t.layout().chairs.find((c) => c.owner === "Аня")!.hand.length, "карты розданы").toBeGreaterThan(0);
    expect(t.layout().chairs.find((c) => c.id === seat)!.hand.length, "и взяты из руки крупье").toBeLessThan(36);
  });
});

// КРУПЬЕ СОБИРАЕТ ОХАПКАМИ, А НЕ ПО ОДНОЙ КАРТЕ.
//
// Полсотни карт по одной едут почти минуту, и человек сидит и смотрит, как крупье возит карту за
// картой. За настоящим столом сгребают: сукно, потом руку соседа, потом следующую.
describe("сбор идёт охапками", () => {
  it("на весь стол уходит по одному движению на место, а не на карту", async () => {
    const s = table("a", "b", "c");
    await s.run({ t: "deal", rule: "each", n: 5 });
    const steps = collectSteps(s.t);
    expect(steps.length, "движений должно быть единицы, а не десятки").toBeLessThan(8);
    expect(steps.every((one) => one.t === "sweep" || one.t === "sweepPile"), "и каждое — охапка").toBe(true);
  });

  it("после сбора вся колода у крупье, а стол пуст", async () => {
    const s = table("a", "b", "c");
    await s.run({ t: "deal", rule: "each", n: 5 });
    expect(await s.run({ t: "collect" })).toBe("ok");
    const at = s.t.layout();
    const held = at.chairs.find((c) => c.croupier)?.hand.length ?? 0;
    expect(held + at.deck.length, "все карты собраны").toBe(36);
    expect(at.chairs.filter((c) => !c.croupier).every((c) => c.hand.length === 0), "руки игроков пусты").toBe(true);
    expect(at.felt, "и сукно пусто").toHaveLength(0);
  });

  it("собранное считается ПО КАРТАМ: раздача после сбора идёт", async () => {
    // Счёт по шагам однажды уже решил, что собранной колоды не хватает: шаг стал охапкой, а счёт
    // остался прежним, и раздача встала с «не хватает карт».
    const s = table("a", "b", "c");
    await s.run({ t: "deal", rule: "each", n: 5 });
    expect(await s.run({ t: "deal", rule: "each", n: 5, force: true })).toBe("ok");
  });
});

// ЗАМОК РУКИ — ОТ ЧУЖИХ ПАЛЬЦЕВ, А НЕ ОТ КРУПЬЕ.
//
// Жалоба из живой игры: раздали на троих, карты пришли одному. У двоих рука была заперта, крупье в
// неё не смог, и стол об этом промолчал — ни на экране, ни в записи.
describe("раздача не спотыкается о замок руки", () => {
  it("запертая рука получает карты наравне со всеми", async () => {
    const s = table("a", "b", "c");
    const chairOf = (k: string) => s.t.layout().chairs.find((one) => one.owner === k)!.id;
    // Двое заперли свои руки — «не лезь», а не «не раздавай мне».
    s.t.act("b", { t: "flag", chair: chairOf("b"), flag: "lock", on: true }, 0);
    s.t.act("c", { t: "flag", chair: chairOf("c"), flag: "lock", on: true }, 0);
    expect(s.t.seenBy("a").chairs.filter((one) => one.lock), "замки и правда стоят").toHaveLength(2);

    expect(await s.run({ t: "deal", rule: "each", n: 5 })).toBe("ok");
    const counts = ["a", "b", "c"].map((k) => s.hand(k).length);
    expect(counts, "карты пришли всем троим").toEqual([5, 5, 5]);
  });

  it("и своей рукой в запертую чужую по-прежнему не залезть", async () => {
    // Замок никуда не делся: он просто не про команду стола.
    const s = table("a", "b");
    const his = s.t.layout().chairs.find((one) => one.owner === "b")!.id;
    s.t.act("b", { t: "flag", chair: his, flag: "lock", on: true }, 0);
    await s.run({ t: "deal", rule: "each", n: 3 });
    const mine = s.hand("a")[0]!.id;
    s.t.act("a", { t: "grab", id: mine }, 0);
    const out = s.t.act("a", { t: "drop", id: mine, to: { in: "hand", chair: his, i: 0 } }, 0);
    expect("refused" in out ? out.refused : "ok").toBe("chair-locked");
  });
});

// ИГРОК БЕЗ ЧЕЛОВЕКА САДИТСЯ САМ.
//
// Стол не спрашивает, откуда пришёл игрок: телеграм, ссылка, переписка — это дело двери. Бот такая
// же дверь, просто за ней никого нет. Раньше тестовых игроков держали открытые окна браузера: стол
// о них ничего не знал, и стоило окну закрыться — стол пустел.
describe("за стол садятся игроки без человека", () => {
  const посадить = (t: ReturnType<typeof table>["t"], n: number) => {
    for (let i = 0; i < n; i += 1) t.seatBot({ key: `bot:игрок${i + 1}`, name: `Игрок ${i + 1}`, ink: "#fff", door: "guest" });
  };
  const сидят = (t: ReturnType<typeof table>["t"]) => t.layout().chairs.filter((c) => !c.croupier && c.owner !== null && c.owner !== "a");

  it("садятся со своим стулом, как все", () => {
    const s = table("a");
    посадить(s.t, 3);
    expect(сидят(s.t), "трое сели").toHaveLength(3);
    expect(сидят(s.t).every((c) => c.owner !== null), "и у каждого своё место").toBe(true);
  });

  it("им раздают наравне с людьми", async () => {
    const s = table("a");
    посадить(s.t, 2);
    expect(await s.run({ t: "deal", rule: "each", n: 4 })).toBe("ok");
    const руки = s.t.layout().chairs.filter((c) => !c.croupier).map((c) => c.hand.length);
    expect(руки, "карты пришли всем троим").toEqual([4, 4, 4]);
  });

  it("уходят все разом, а крупье остаётся: он служебный", () => {
    const s = table("a");
    посадить(s.t, 3);
    s.t.seatCroupier({ key: "bot:table", name: "Крупье", ink: "#0f0", door: "guest" });
    s.t.dropBots();
    expect(сидят(s.t), "ботов за столом нет").toHaveLength(0);
    expect(s.t.layout().chairs.some((c) => c.croupier), "а крупье на месте").toBe(true);
  });

  it("посаженный дважды не задваивается", () => {
    const s = table("a");
    посадить(s.t, 2);
    посадить(s.t, 2);
    expect(сидят(s.t).length, "их всё ещё двое").toBe(2);
  });

  it("служебный бот крупье стула не занимает, а игрок — занимает", () => {
    const s = table("a");
    s.t.joinBot({ key: "bot:служебный", name: "Служебный", ink: "#fff", door: "guest" });
    expect(сидят(s.t), "служебный сел без стула").toHaveLength(0);
    s.t.seatBot({ key: "bot:игрок", name: "Игрок", ink: "#fff", door: "guest" });
    expect(сидят(s.t), "а игрок — со стулом").toHaveLength(1);
  });
});
