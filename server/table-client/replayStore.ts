// ЗАПИСЬ ПАРТИИ КАК СТОЛ. Тот же клиент, та же кисть, только вместо сети — журнал.
//
// Кино здесь не видео: видео с чужого телефона пришлось бы снимать, гнать по сети и хранить, и всё
// равно смотреть в мутном окошке. Стол устроен так, что этого не нужно: он МЕНЯЕТСЯ ДИФАМИ, и тот же
// разбор дифов, что рисует живую игру, соберёт и записанную. Поэтому запись весит как текст, а
// смотрится как настоящий стол — потому что это и есть настоящий стол.
//
// Отсюда и единственное, без чего кино не собрать: ПЕРВЫЙ КАДР. Дифы рассказывают, что изменилось, а
// с чего всё началось — не рассказывает никто, и колода роздана раньше первой записи.

import type { Chair, Intent, Op, Person, Pile, Refusal, SeenCard, Snapshot, TableRules } from "../src/table/contract.js";
import { applyPatch } from "../src/table/patch.js";
import type { TableStore } from "./store.js";

/** Строка журнала, как её отдаёт `/table/journal`. */
export interface Told {
  id: number;
  at: number;
  room?: string;
  who?: string;
  side: "table" | "screen";
  kind: string;
  what?: unknown;
}

/** Мгновение записи: кадр стола и то, что в этот момент случилось. */
export interface Moment {
  at: number;
  deed: Told;
  /** Номер шага, на котором этот кадр стоит. */
  step: number;
}

export interface Replay {
  store: TableStore;
  /** Кадр записан столом или восстановлен из ходов — зрителю это надо знать. */
  readonly guessed: boolean;
  /** Сколько ходов в записи обрезано и потому не применяется. */
  readonly lost: number;
  /** Сколько прошлых посиделок этой комнаты осталось за кадром. */
  readonly older: number;
  /** Мгновения, по которым можно встать: первый кадр, каждый диф и каждое событие экрана. */
  moments: Moment[];
  /** Встать на мгновение с этим номером. */
  seek(step: number): void;
  /** Где стоим сейчас. */
  readonly at: number;
  onSeek(listener: () => void): void;
}

const isPatch = (d: Told): boolean => d.side === "table" && d.kind === "patch";

/**
 * Изменения из строки журнала. Пусто — строка ОБРЕЗАНА: слишком длинные подробности журнал режет, и
 * у записей, сделанных до того, как предел подняли, самые большие ходы сохранились огрызком. Такой
 * ход не применить, и делать вид, что его не было, тоже нельзя — он считается потерянным.
 */
const opsOf = (d: Told): Op[] => {
  const ops = (d.what as { ops?: unknown }).ops;
  return Array.isArray(ops) ? (ops as Op[]) : [];
};

const isCut = (d: Told): boolean => isPatch(d) && opsOf(d).length === 0;

/**
 * КАДР, ВОССТАНОВЛЕННЫЙ ИЗ САМИХ ХОДОВ — для партий, записанных до того, как стол научился писать
 * первый кадр.
 *
 * Держится на одном допущении: стол был В ДЕФОЛТЕ, пока к нему не притронулись, — колода собрана,
 * сукно пусто, стульев нет. Тогда всё остальное рассказывают сами ходы: каждый перенос несёт карту
 * вместе с лицом и местом, откуда она уехала, а стулья и люди приезжают первыми же дифами.
 *
 * Чего восстановить НЕЛЬЗЯ: карты, которых за всю партию ни разу не трогали. Их в ходах нет, и они
 * ложатся рубашкой — счёт колоды верный, лица неизвестны. Врать про них нельзя: показанная не та
 * карта хуже честной рубашки.
 */
function guessFirst(deeds: readonly Told[]): Snapshot {
  // Карты, уехавшие из колоды, — в порядке, в котором их брали. Берут сверху, значит первая взятая
  // лежала последней: колода собирается в обратном порядке.
  const fromDeck: SeenCard[] = [];
  const met = new Set<string>();
  let size = 0;
  let spot: Pile | undefined;
  let rules: TableRules | undefined;
  // Стол — это не только карты: места, люди и очерченные зоны рода. Если о них где-то дальше
  // зашла речь, берём их оттуда — так стол хотя бы похож на себя, а не на голую колоду посреди сукна.
  const people = new Map<string, Person>();
  const chairs = new Map<string, Chair>();
  const zones = new Map<string, Pile>();

  for (const d of deeds) {
    if (!isPatch(d)) continue;
    for (const op of opsOf(d)) {
      if (op.t === "rules") rules = op.rules;
      if (op.t === "join" && !people.has(op.person.key)) people.set(op.person.key, op.person);
      if (op.t === "chair" && !chairs.has(op.chair.id)) chairs.set(op.chair.id, { ...op.chair, hand: [] });
      // Зона рода — очерченное место (круг хода и прочее): берём её такой, какой она впервые
      // попалась. Это не самое начало, но без неё стол вообще не похож на стол этого рода.
      if (op.t === "spot" && op.pile !== "deck" && op.spot && !zones.has(op.pile)) zones.set(op.pile, { ...op.spot, id: op.pile, cards: [], shuffles: 0 });
      if (op.t === "deck" && op.pile === "deck") size = Math.max(size, op.cards.length);
      if (op.t === "spot" && op.pile === "deck" && op.spot) spot = { ...op.spot, id: "deck", cards: [], shuffles: 0 };
      if (op.t === "move" && op.from.in === "deck" && op.from.pile === "deck" && !met.has(op.card.id)) {
        met.add(op.card.id);
        fromDeck.push({ id: op.card.id, ...(op.card.face === undefined ? {} : { face: op.card.face }) });
      }
    }
  }

  // Сколько карт было всего: сказанное дифом, иначе обычная колода. Недостающие — безликие: их не
  // трогали, и что это за карты, запись не знает.
  const total = Math.max(size, 36, fromDeck.length);
  const unknown: SeenCard[] = Array.from({ length: total - fromDeck.length }, (_, i) => ({ id: `не-видели-${i}` }));
  const deck: Pile = spot ?? { id: "deck", cards: [], shuffles: 0, x: 0, y: 0, angle: 0, below: [], forever: false, pin: false, lock: false, shut: false, seal: false };

  return {
    // Ноль: первый записанный диф несёт первую версию, и она ляжет поверх этой.
    v: 0,
    people: [...people.values()],
    chairs: [...chairs.values()],
    piles: [{ ...deck, cards: [...unknown, ...fromDeck.reverse()] }, ...zones.values()],
    felt: [],
    trails: {},
    locks: {},
    picks: {},
    rules: rules ?? ({} as TableRules),
    admin: null,
    dealer: null,
    rights: [],
    play: null,
  };
}

/**
 * Собрать запись из ленты журнала.
 *
 * @param deeds лента комнаты по порядку
 * @param me    чьими глазами смотрим (на раскраску «своё/чужое»); запись хранится правдой, поэтому
 *              лица видны все, кем бы ни смотрели
 */
export function replayStore(all: readonly Told[], me: Person): Replay {
  // ТОЛЬКО ПОСЛЕДНЯЯ ПОСИДЕЛКА. Комната живёт в памяти и умирает с перезапуском, а ссылка на неё
  // остаётся: по той же ссылке открывается НОВЫЙ стол с тем же именем, и его записи ложатся в ту же
  // ленту, следом за старыми. Взять ленту целиком значит применить к свежему столу ходы вчерашнего.
  //
  // Граница — открытие комнаты: с него начинается жизнь стола, и всё, что до, относится к прошлой.
  const opened = all.map((d, i) => (d.kind === "room.open" ? i : -1)).filter((i) => i >= 0);
  const deeds = opened.length > 1 ? all.slice(opened[opened.length - 1]!) : all;

  const first = deeds.find((d) => d.kind === "table.first");
  const start = first ? (first.what as { snapshot: Snapshot }).snapshot : guessFirst(deeds);

  // Мгновения — всё, что вообще случилось: дифы двигают стол, события экрана его не трогают, но
  // именно ради них кино и смотрят («вот тут он ткнул, и ничего»).
  const moments: Moment[] = deeds.map((deed, i) => ({ at: deed.at, deed, step: i }));

  let step = 0;
  let state: Snapshot = start;
  const changed: (() => void)[] = [];
  const seeked: (() => void)[] = [];
  const refused: ((intent: Intent, why: Refusal) => void)[] = [];

  /** Кадр на шаге — пересчётом с начала. Патчей за партию сотни, это дешевле, чем хранить все кадры. */
  const rebuild = (upto: number): void => {
    state = start;
    for (let i = 0; i <= upto && i < deeds.length; i += 1) {
      const d = deeds[i]!;
      if (!isPatch(d)) continue;
      const ops = opsOf(d);
      if (ops.length === 0) continue;
      state = applyPatch(state, { v: (d.what as { v: number }).v, ops });
    }
  };

  const store: TableStore = {
    me,
    crew: [],
    // Род стола в записи берётся из первого кадра — тем же, чем его знал живой стол.
    desk: (first?.what as { desk?: string } | undefined)?.desk ?? "sandbox",
    ice: [],
    title: "Запись партии",
    get state() {
      return state;
    },
    // ЗАПИСЬ НЕ ИГРАЕТСЯ. Всё, чем стол меняют, здесь пусто: прошлое не переигрывают, а смотрят.
    send: () => {},
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
    now: () => (moments[step]?.at ?? Date.now()),
    onChange: (listener) => void changed.push(listener),
    onRefused: (listener) => void refused.push(listener),
    onGone: () => {},
  };

  return {
    store,
    guessed: first === undefined,
    lost: deeds.filter(isCut).length,
    older: Math.max(0, opened.length - 1),
    moments,
    get at() {
      return step;
    },
    seek(to) {
      step = Math.max(0, Math.min(moments.length - 1, to));
      rebuild(step);
      for (const listener of changed) listener();
      for (const listener of seeked) listener();
    },
    onSeek: (listener) => void seeked.push(listener),
  };
}
