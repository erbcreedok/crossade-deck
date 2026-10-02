// СТЕНД ЖЕСТА — тот же стол, что на сервере (`Table`), только в этой вкладке и с ботами.
//
// Стенд не отдельная копия клиента: это клиент без сети. Правила, блокировки и дифы здесь те же
// самые, что у живой комнаты, — жест, настроенный на стенде, ведёт себя в игре так же.

import type { Body } from "../src/table/bodies.js";
import { DEAL_PRESETS, type DealRule, type Face, type Intent, type Op, type Person, type Refusal, type Suit } from "../src/table/contract.js";
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

/**
 * `freeChair` — четвёртый стул, свободный: за столом двое сидят, один стул брошен с картами, а ещё один пуст. Без него —
 * стенд, каким он был у стола на холсте.
 */
export interface LocalOpts {
  freeChair?: boolean;
}

/**
 * ОДИН СТОЛ, СКОЛЬКО УГОДНО ЭКРАНОВ. Стол (`Table`) на стенде один, а глаз у него несколько: `view(key)` — хранилище того, кто за
 * ним сидит; у каждого своё состояние, свои слушатели и своя нарезка операций, а стол общий: что сделал один, увидят остальные.
 * Так два стенда в одной вкладке — мой экран и экран Алии, — и каждый живёт сам, со своей камерой, окнами и рукой.
 */
export function localTable(opts: LocalOpts = {}): { view(key: string): TableStore } {
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
  if (opts.freeChair) table.addChair();

  /** Последнее тело каждого, кто за столом: кто бы ни смотрел, чужая голова и руки стоят там, где их оставили. */
  const bodyOf = new Map<string, Body>();

  interface View {
    state: ReturnType<Table["seenBy"]>;
    changed: (() => void)[];
    refused: ((intent: Intent, why: Refusal) => void)[];
    /** Кто слушает поток операций — журнал партии. */
    opsHeard: Array<(ops: readonly Op[]) => void>;
  }
  const views = new Map<string, View>();
  const person = (key: string): Person => [me, ...bots].find((one) => one.key === key)!;

  /** Операции — всем глазам; режутся под каждого ровно как в сети: стенд не должен показывать больше живого стола. */
  const spread = (ops: Op[]) => {
    if (ops.length === 0) return;
    for (const [key, v] of views) {
      const mine = ops.map((op) => table.seenOp(op, key));
      v.state = applyPatch(v.state, { v: table.version, ops: mine });
      for (const listener of v.changed) listener();
      for (const heard of v.opsHeard) heard(mine);
    }
  };

  return {
    view(key) {
      let v = views.get(key);
      if (!v) {
        v = { state: table.seenBy(key), changed: [], refused: [], opsHeard: [] };
        views.set(key, v);
      }
      const mine = v;
      return {
        me: person(key),
        crew: [],
        desk: "sandbox",
        deals: Object.keys(DEAL_PRESETS) as DealRule[],
        ice: [],
        title: "Стенд жеста",
        get state() {
          return mine.state;
        },
        send(intent) {
          const result = table.act(key, intent, Date.now());
          if ("refused" in result) {
            for (const listener of mine.refused) listener(intent, result.refused);
            if (result.ops?.length) spread(result.ops);
            return;
          }
          spread(result.ops);
        },
        carries: [],
        eyes: [],
        watch: () => {},
        get bodies() {
          return [...bodyOf.values()].filter((b) => b.by !== key);
        },
        body(out) {
          bodyOf.set(key, { ...out, by: key });
          // Тело сдвинулось — остальным экранам перерисовать его (в сети это сообщение о чужом теле).
          for (const [other, v] of views) if (other !== key) for (const listener of v.changed) listener();
        },
        command: (c) => {
          // Рассадка рукой — единственная команда, которую у стенда есть чем исполнить.
          if (c.t === "seat" && c.do === "place") for (const one of c.chairs) spread(table.turnChair(one.chair, one.angle));
        },
        log: () => {},
        rtc: () => {},
        onRtc: () => {},
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
        onChange: (listener) => void mine.changed.push(listener),
        onRefused: (listener) => void mine.refused.push(listener),
        onOps: (listener) => void mine.opsHeard.push(listener),
        onGone: () => {},
      };
    },
  };
}

/** Стенд для одного экрана — мой: стол на холсте берёт его. */
export function localStore(opts: LocalOpts = {}): TableStore {
  return localTable(opts).view("me");
}
