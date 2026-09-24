// СТУЛЬЯ ЗА СТОЛОМ: поставить ещё один и убрать пустой.
//
// Главное здесь — что станет с КАРТАМИ. Убранный стул не должен уносить руку с собой: карты чужие,
// и пропасть они не имеют права, куда бы их потом ни положили.

import { describe, expect, it } from "vitest";
import { MAIN_PILE, type Person } from "./contract.js";
import { Table } from "./table.js";
import { deskOf } from "./desks.js";
import { deal } from "./deal.js";
import { execute, plan } from "./script.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const cards = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, face: { rank: String(i + 6), suit: "s" as const } }));
const ok = (r: ReturnType<Table["act"]>) => {
  if ("refused" in r) throw new Error(`отказ: ${r.refused}`);
  return r;
};

/** Стол с Аней; `addChair` ставит второй, пустой. */
function стол() {
  const t = new Table(cards, "Аня");
  t.join(person("Аня"));
  return t;
}

const стулья = (t: Table) => t.layout().chairs.filter((c) => !c.croupier).map((c) => c.id);

describe("chairs.an-admin-adds-and-drops-empty-chairs", () => {
  it("стул добавляется и встаёт пустым", () => {
    const t = стол();
    const было = стулья(t).length;
    t.addChair();
    const стало = стулья(t);
    expect(стало.length).toBe(было + 1);
    const новый = t.layout().chairs.find((c) => !стулья(t).slice(0, было).includes(c.id) && c.owner === null);
    expect(новый, "новый стул ничей").toBeDefined();
  });

  it("ПУСТОЙ СТУЛ УБИРАЕТСЯ", () => {
    const t = стол();
    t.addChair();
    const пустой = t.layout().chairs.find((c) => c.owner === null && !c.croupier)!;
    t.dropChair(пустой.id);
    expect(стулья(t).includes(пустой.id)).toBe(false);
  });

  it("СТУЛ С ЧЕЛОВЕКОМ НЕ УБИРАЕТСЯ — за столом никого не сгоняют молча", () => {
    const t = стол();
    const мой = t.layout().chairs.find((c) => c.owner === "Аня")!;
    t.dropChair(мой.id);
    expect(стулья(t).includes(мой.id), "стул на месте").toBe(true);
  });

  it("КАРТЫ УБРАННОГО СТУЛА НЕ ПРОПАДАЮТ", () => {
    // Комната перед уборкой уносит руку крупье; но даже если этого не случилось, карты обязаны
    // остаться на столе — счёт колоды не должен сойтись с недостачей.
    const t = стол();
    t.addChair();
    const пустой = t.layout().chairs.find((c) => c.owner === null && !c.croupier)!;
    const top = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    ok(t.act("Аня", { t: "grab", id: top }, 0));
    ok(t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair: пустой.id, i: 0 } }, 0));

    const всего = (): number => {
      const s = t.seenBy("Аня", true);
      return s.felt.length + s.piles.reduce((n, p) => n + p.cards.length, 0) + s.chairs.reduce((n, c) => n + c.hand.length, 0);
    };
    const было = всего();
    t.dropChair(пустой.id);
    expect(всего(), "ни одна карта не исчезла со стола").toBe(было);
    expect(t.seenBy("Аня", true).felt.some((f) => f.id === top), "карта легла на место стула").toBe(true);
  });

  it("стула нет — убирать нечего, и это не падение", () => {
    expect(стол().dropChair("такого-нет")).toEqual([]);
  });
});

describe("chairs.a-bot-sits-where-it-is-put", () => {
  it("МАШИНА САДИТСЯ НА НАЗВАННЫЙ СТУЛ, а не заводит себе новый рядом", () => {
    // `join` без имени стула никогда не занимает свободный — он ставит ещё один. Для человека это
    // верно (его стул — его), а для посадки машины было бы бедой: приготовленный стул остаётся
    // пустым, а рядом вырастает лишний.
    const t = стол();
    t.addChair();
    const пустой = t.layout().chairs.find((c) => c.owner === null && !c.croupier)!;
    const было = стулья(t).length;
    t.seatBot(person("bot:игрок1"), пустой.id);
    const сел = t.layout().chairs.find((c) => c.owner === "bot:игрок1")!;
    expect(сел.id, "сел ровно туда, куда просили").toBe(пустой.id);
    expect(стулья(t).length, "лишнего стула не появилось").toBe(было);
  });

  it("на занятый стул не сажают — за столом никого не сгоняют", () => {
    const t = стол();
    const мой = t.layout().chairs.find((c) => c.owner === "Аня")!;
    t.seatBot(person("bot:игрок1"), мой.id);
    expect(t.layout().chairs.find((c) => c.owner === "Аня")!.id, "Аня на месте").toBe(мой.id);
    expect(t.layout().chairs.find((c) => c.owner === "bot:игрок1")!.id, "машина села на другой стул").not.toBe(мой.id);
  });
});

// РАЗДАЧА НЕ ОСТАВЛЯЕТ КАРТ НА СТОЛЕ.
//
// Жалоба владельца: «почему при раздаче остаётся одна карта на столе». Правило «невечная стопка из
// одной карты — не стопка» писано для рук: человек разобрал стопку, и остаток незачем держать
// стопкой. Но раздача берёт карты одну за одной, и на предпоследней колода обрушивалась — последняя
// ложилась на сукно ровно там, где стояла колода, и взять её раздача уже не могла.
// РАЗДАЧА НЕ ОСТАВЛЯЕТ КАРТ НА СТОЛЕ.
//
// Жалоба владельца: «почему при раздаче остаётся одна карта на столе». Правило «невечная стопка из
// одной карты — не стопка» писано для рук: человек разобрал стопку, и остаток незачем держать
// стопкой. Но раздача берёт карты одну за одной, и на ПРЕДпоследней колода обрушивалась — последняя
// ложилась на сукно, а шаг «взять верхнюю» уходил в пустоту: роздано 35 из 36.
describe("deal.a-deal-leaves-nothing-on-the-felt", () => {
  it("вся колода уходит в руки, на сукне пусто", async () => {
    const t = new Table(deal(), "Аня", deskOf("krest"));
    for (const k of ["Аня", "Боря", "Вика"]) t.join(person(k));
    t.seatCroupier({ key: "bot:стол", name: "CrossaderBot", ink: "#0ff", door: "guest" });
    const люди = t.seenBy("Аня").people.map((p) => ({ key: p.key, name: p.name, seat: p.seat }));
    const план = plan(t, { t: "deal", rule: "krest", force: true }, люди, "Аня");
    expect("error" in план ? план.error : "ok", "план раздачи собрался").toBe("ok");
    if ("error" in план) return;
    await execute(t, план.steps, "bot:стол", { spread: () => {}, carry: () => {}, sleep: async () => {}, now: () => 0 });

    const снимок = t.seenBy("Аня", true);
    const вРуках = снимок.chairs.reduce((n, c) => n + c.hand.length, 0);
    const вСтопках = снимок.piles.reduce((n, p) => n + p.cards.length, 0);
    expect(снимок.felt.length, "на сукне не осталось ни одной карты").toBe(0);
    expect(вРуках + вСтопках, "все карты колоды на месте").toBe(deal().length);
    expect(вСтопках, "и все они в руках, а не в стопках").toBe(0);
  });
});
