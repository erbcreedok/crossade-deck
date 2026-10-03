// РЕПЛЕЙ ВО ВРЕМЯ ИГРЫ — стол, который можно отмотать. Обёртка над любым хранилищем (`netStore`, `localStore`): пишет ленту (`tape.ts`) и, когда игрок
// нажал «Реплей», подменяет то, что отдаёт экрану: стол и поток пальцев берутся из ленты на ЕГО момент, а всё, что что-то меняет за столом, молчит.
//
// Экран про это почти ничего не знает: он читает `store.state`, `store.carries`, `store.bodies` — и они вдруг из прошлого. Единственное, что он обязан
// сделать сам, — не принимать жесты, пока `store.replay?.on` (карту не взять, не сесть, стул не двинуть).
//
// ЧТО ЗДЕСЬ НЕ ДЕЛАЕТСЯ: чужие закрытые карты не подменяются и не показываются «как были» — лента хранит ровно то, что видел игрок. Подставные лица («факи»)
// для карт, которые теперь скрыты, — отдельный шаг поверх этой обёртки.

import type { Carry, Snapshot } from "../src/table/contract.js";
import type { Body } from "../src/table/bodies.js";
import { anchor, locate, Tape, type Moment } from "./tape.js";
import type { TableStore } from "./store.js";
import { STACK_FRESH_MS } from "../src/table/contract.js";

export const SPEEDS = [0.5, 1, 2, 4, 8] as const;
/** Сколько мс ленты проходит за один шаг проигрывателя при скорости 1×; шаг — раз в `FRAME_MS` часов. */
const FRAME_MS = 33;

/** Что экран знает о просмотре. Всё, что меняет просмотр, идёт через этот объект. */
export interface ReplayControl {
  /** Идёт просмотр прошлого: стол и пальцы из ленты, жесты за столом выключены. */
  readonly on: boolean;
  /** Момент, который сейчас на экране, мс (часы экрана). */
  readonly cursor: number;
  /** С какого времени лента держит стол; раньше — только по запросу к серверу (шаг 3). */
  readonly from: number;
  /** «Сейчас» — живой край. */
  readonly now: number;
  /** −1 назад, 0 стоит, 1 вперёд. */
  readonly dir: -1 | 0 | 1;
  readonly speed: number;
  /** События ленты: ходы, перевороты, раздачи. */
  readonly moments: readonly Moment[];
  /** Пока смотрели прошлое, за столом что-то случилось — «К живому» мигает. */
  readonly news: boolean;
  enter(): void;
  exit(): void;
  seek(t: number): void;
  play(dir: -1 | 1): void;
  pause(): void;
  setSpeed(k: number): void;
  /** К прошлому/следующему событию. */
  jump(dir: -1 | 1): void;
  /** Стол на любое время (плитки ленты) — не двигая просмотр. */
  stateAt(t: number): Snapshot;
  /** Просмотр что-то поменял: включился, выключился, сдвинулся. */
  onChange(listener: () => void): void;
}

export interface ReplayClock {
  now(): number;
  /** Позвать `run` каждые `ms`; вернуть, как это остановить. */
  every(run: () => void, ms: number): () => void;
}
const realClock: ReplayClock = { now: () => Date.now(), every: (run, ms) => { const id = setInterval(run, ms); return () => clearInterval(id); } };

type Listener = () => void;

/** Обернуть хранилище лентой. Возвращает то же хранилище, у которого есть `replay`. */
export function replayable(store: TableStore, clock: ReplayClock = realClock, tape: Tape = new Tape()): TableStore {
  tape.begin(store.state, clock.now());
  let lastV = store.state.v;
  /** Мои пальцы в воздухе: хранилище их себе не возвращает, а в просмотре я вижу и свои жесты. */
  const own = new Map<string, { c: Carry; at: number }>();
  const sceneListeners: Listener[] = [];
  const controlListeners: Listener[] = [];

  let on = false, cursor = 0, dir: -1 | 0 | 1 = 0, speed = 1, news = false, stop: (() => void) | null = null;
  let view: { t: number; state: Snapshot; flow: ReturnType<Tape["flowAt"]> } | null = null;

  const mine = (): string => store.me.key;
  const ownLive = (state: Snapshot): { carries: Carry[]; stacks: Carry[] } => {
    const now = clock.now(), carries: Carry[] = [], stacks: Carry[] = [];
    for (const [id, one] of [...own]) {
      const whole = one.c.whole === true, held = state.locks[id] === mine();
      if (whole ? (id.startsWith("chair:") ? now - one.at > STACK_FRESH_MS : !held) : !held) { own.delete(id); continue; }
      (whole ? stacks : carries).push(one.c);
    }
    return { carries, stacks };
  };
  const snap = (): void => {
    if (on) return;
    const mineNow = ownLive(store.state);
    tape.flow(clock.now(), [...store.carries, ...mineNow.carries], [...store.stacks, ...mineNow.stacks], store.bodies);
  };

  // ЛЕНТА ПИШЕТСЯ с живого стола: снимок меняется (раньше операций) — смотрим, не потерялась ли версия; операции — в ленту.
  store.onChange(() => {
    if (!on) {
      const v = store.state.v;
      if (v > lastV + 1 || v < lastV) { tape.begin(store.state, clock.now()); lastV = v; }
      snap();
    } else news = true;
  });
  store.onOps?.((ops) => {
    lastV = store.state.v;
    tape.push(clock.now(), ops, store.state);
    if (on) news = true;
  });

  const nowEdge = (): number => clock.now();
  const clamp = (t: number): number => Math.max(tape.from, Math.min(nowEdge(), t));
  const notify = (): void => {
    view = null;
    for (const l of sceneListeners) l();
    for (const l of controlListeners) l();
  };
  const seeing = (): { t: number; state: Snapshot; flow: ReturnType<Tape["flowAt"]> } => {
    if (!view || view.t !== cursor) view = { t: cursor, state: tape.stateAt(cursor), flow: tape.flowAt(cursor) };
    return view;
  };
  const halt = (): void => {
    stop?.();
    stop = null;
    dir = 0;
  };
  let lastAt = 0;
  const tick = (): void => {
    const at = clock.now(), dt = at - lastAt;
    lastAt = at;
    const next = cursor + dir * speed * dt;
    if (next <= tape.from || next >= nowEdge()) {
      cursor = clamp(next);
      halt();
    } else cursor = next;
    notify();
  };

  const control: ReplayControl = {
    get on() { return on; },
    get cursor() { return cursor; },
    get from() { return tape.from; },
    get now() { return nowEdge(); },
    get dir() { return dir; },
    get speed() { return speed; },
    get moments() { return tape.moments; },
    get news() { return news; },
    enter() {
      if (on || !tape.started) return;
      on = true;
      news = false;
      cursor = nowEdge();
      notify();
    },
    exit() {
      if (!on) return;
      halt();
      on = false;
      news = false;
      notify();
    },
    seek(t) {
      if (!on) return;
      cursor = clamp(t);
      notify();
    },
    play(d) {
      if (!on) return;
      halt();
      if ((d > 0 && cursor >= nowEdge() - 1) || (d < 0 && cursor <= tape.from + 1)) return notify();
      dir = d;
      lastAt = clock.now();
      stop = clock.every(tick, FRAME_MS);
      notify();
    },
    pause() {
      if (dir === 0) return;
      halt();
      notify();
    },
    setSpeed(k) {
      speed = k;
      notify();
    },
    jump(d) {
      if (!on) return;
      halt();
      const m = tape.jump(cursor, d);
      if (m) cursor = clamp(anchor(m, tape.from));
      else if (d > 0) cursor = nowEdge();
      notify();
    },
    stateAt: (t) => tape.stateAt(t),
    onChange: (l) => void controlListeners.push(l),
  };

  /** Что экран шлёт за стол: в просмотре — молчит. */
  const mute = new Set(["send", "command", "watch", "body", "say", "shoot", "mic", "log", "rtc", "askStickers"]);

  return new Proxy(store, {
    get(target, key, receiver) {
      if (key === "replay") return control;
      if (key === "onChange") {
        return (listener: Listener) => {
          sceneListeners.push(listener);
          target.onChange(() => { if (!on) listener(); });
        };
      }
      if (key === "carry") {
        return (out: Parameters<TableStore["carry"]>[0]) => {
          if (on) return;
          const st = target.state, loc = locate(st, out.id);
          if (loc) own.set(out.id, { at: clock.now(), c: { id: out.id, by: mine(), over: out.over, from: loc.where, card: loc.card } });
          else {
            const pile = st.piles.find((p) => p.id === out.id);
            const chair = out.id.startsWith("chair:") ? st.chairs.find((c) => c.id === out.id.slice(6)) : undefined;
            const cards = pile ? pile.cards : chair ? chair.hand : null;
            if (cards && cards.length > 0) {
              const where = (i: number) => (pile ? ({ in: "deck", pile: pile.id, i } as const) : ({ in: "hand", chair: chair!.id, i } as const));
              own.set(out.id, { at: clock.now(), c: { id: out.id, by: mine(), over: out.over, from: where(cards.length - 1), card: cards.at(-1)!, whole: true, with: cards.slice(0, -1).map((card, i) => ({ card, from: where(i) })) } });
            }
          }
          target.carry(out);
          snap();
        };
      }
      if (!on) return Reflect.get(target, key, receiver);
      if (mute.has(key as string)) return () => {};
      switch (key) {
        case "state": return seeing().state;
        case "carries": {
          const { state, flow } = seeing();
          return (flow?.carries ?? []).filter((c) => state.locks[c.id] === c.by);
        }
        case "stacks": {
          const { state, flow } = seeing();
          // Стопка бесхозного стула живёт, пока от несущего приходило (`STACK_FRESH_MS`); со стола — пока её держат.
          return flow ? flow.stacks.filter((c) => (c.id.startsWith("chair:") ? cursor - flow.t <= STACK_FRESH_MS : state.locks[c.id] === c.by)) : [];
        }
        case "bodies": return (seeing().flow?.bodies ?? []) as readonly Body[];
        case "eyes": return [];
        default: return Reflect.get(target, key, receiver);
      }
    },
  });
}
