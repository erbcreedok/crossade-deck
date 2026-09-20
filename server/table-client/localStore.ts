// СТЕНД ЖЕСТА — тот же стол, что на сервере (`Table`), только в этой вкладке и с ботами.
//
// Стенд не отдельная копия клиента: это клиент без сети. Правила, блокировки и дифы здесь те же
// самые, что у живой комнаты, — жест, настроенный на стенде, ведёт себя в игре так же.

import type { Face, Intent, Op, Person, Refusal, Suit } from "../src/table/contract.js";
import { applyPatch } from "../src/table/patch.js";
import { Table } from "../src/table/table.js";
import type { TableStore } from "./store.js";

function deal(): { id: string; face: Face }[] {
  const ranks = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const suits: Suit[] = ["s", "h", "d", "c"];
  const cards = suits.flatMap((suit) => ranks.map((rank) => ({ id: crypto.randomUUID().slice(0, 8), face: { rank, suit } })));
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards;
}

export function localStore(): TableStore {
  const me: Person = { key: "me", name: "Ye", ink: "#f2c14e", door: "guest" };
  // На стенде админ — я: иначе флаги чужих стульев не проверить.
  const table = new Table(deal(), me.key);
  const bots: Person[] = [
    { key: "alia", name: "Алия", ink: "#7fd1b9", door: "guest" },
    { key: "timur", name: "Тимур", ink: "#e08b3f", door: "guest" },
  ];
  for (const who of [me, ...bots]) table.join(who);

  // РАЗДАЧА — ТЕМИ ЖЕ НАМЕРЕНИЯМИ, что шлёт палец: у стенда нет чёрного хода в стол.
  const seatOf = (who: string) => table.seenBy(who).people.find((p) => p.key === who)!.seat!;
  const hand = (who: string, n: number) => {
    for (let k = 0; k < n; k += 1) {
      const top = table.seenBy(who).piles[0]!.cards.at(-1)!.id;
      table.act(who, { t: "grab", id: top }, 0);
      table.act(who, { t: "drop", id: top, to: { in: "hand", chair: seatOf(who), i: k } }, 0);
    }
  };
  hand("me", 7);
  hand("alia", 5);
  hand("timur", 3);
  // АЛИЯ ЗАПЕРЛА СВОЮ РУКУ САМА: флаги стула — дело его хозяина, и на стенде это видно так же.
  table.act("alia", { t: "flag", chair: seatOf("alia"), flag: "lock", on: true }, 0);
  // ТИМУР ВСТАЛ ИЗ-ЗА СТОЛА — стенд показывает покинутый стул с картами: его открывают, на него садятся.
  table.leave("timur");

  let state = table.seenBy(me.key);
  const changed: (() => void)[] = [];
  const refused: ((intent: Intent, why: Refusal) => void)[] = [];

  const spread = (ops: Op[]) => {
    if (ops.length === 0) return;
    state = applyPatch(state, { v: table.version, ops: ops.map((op) => table.seenOp(op, me.key)) });
    for (const listener of changed) listener();
  };

  return {
    me,
    crew: [],
    desk: "sandbox",
    ice: [],
    title: "Стенд жеста",
    get state() {
      return state;
    },
    send(intent) {
      const result = table.act(me.key, intent, Date.now());
      if ("refused" in result) {
        for (const listener of refused) listener(intent, result.refused);
        return;
      }
      spread(result.ops);
    },
    carries: [],
    eyes: [],
    watch: () => {},
    command: () => {},
    log: () => {},
    live: () => {},
    rtc: () => {},
    onRtc: () => {},
    onLive: () => {},
    mic: () => {},
    onMic: () => {},
    carry: () => {},
    say: () => {},
    onSay: () => {},
    askStickers: () => {},
    shoot: () => {},
    onShot: () => {},
    onStickers: () => {},
    now: () => Date.now(),
    onChange: (listener) => void changed.push(listener),
    onRefused: (listener) => void refused.push(listener),
    onGone: () => {},
  };
}
