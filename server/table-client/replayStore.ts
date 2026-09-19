// ЗАПИСЬ ПАРТИИ КАК СТОЛ. Тот же клиент, та же кисть, только вместо сети — журнал.
//
// Кино здесь не видео: видео с чужого телефона пришлось бы снимать, гнать по сети и хранить, и всё
// равно смотреть в мутном окошке. Стол устроен так, что этого не нужно: он МЕНЯЕТСЯ ДИФАМИ, и тот же
// разбор дифов, что рисует живую игру, соберёт и записанную. Поэтому запись весит как текст, а
// смотрится как настоящий стол — потому что это и есть настоящий стол.
//
// Отсюда и единственное, без чего кино не собрать: ПЕРВЫЙ КАДР. Дифы рассказывают, что изменилось, а
// с чего всё началось — не рассказывает никто, и колода роздана раньше первой записи.

import type { Intent, Op, Person, Refusal, Snapshot } from "../src/table/contract.js";
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
 * Собрать запись из ленты журнала.
 *
 * @param deeds лента комнаты по порядку
 * @param me    чьими глазами смотрим (на раскраску «своё/чужое»); запись хранится правдой, поэтому
 *              лица видны все, кем бы ни смотрели
 */
export function replayStore(deeds: readonly Told[], me: Person): Replay {
  const first = deeds.find((d) => d.kind === "table.first");
  if (!first) throw new Error("В записи нет первого кадра: эта партия началась раньше, чем журнал научился его писать.");
  const start = (first.what as { snapshot: Snapshot }).snapshot;

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
      const { v, ops } = d.what as { v: number; ops: Op[] };
      state = applyPatch(state, { v, ops });
    }
  };

  const store: TableStore = {
    me,
    crew: [],
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
