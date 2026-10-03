// ЛЕНТА ПАРТИИ НА ЭКРАНЕ — то, что игрок сам видел за последний час, чтобы отмотать назад в игре.
//
// Стол меняется дифами, поэтому записывать видео не нужно: лента хранит опорные снимки раз в полминуты, между ними — операции стола с
// временем и поток пальцев (карты и стопки в воздухе, тела). Любой момент собирается из ближайшего снимка и операций после него — теми же
// `applyPatch`, что рисуют живую игру.
//
// Лента хранит ТОЛЬКО то, что пришло этому экрану: операции уже прорезаны сервером под зрителя (`seenOp`), чужих лиц в них нет.
// Чистая логика: ни экрана, ни сети, время приходит снаружи (тестируется без браузера).

import type { Carry, Op, Snapshot, Where } from "../src/table/contract.js";
import type { Body } from "../src/table/bodies.js";
import { applyPatch } from "../src/table/patch.js";

/** Сколько ленты держим в памяти; дальше — с диска, по запросу сервера (отдельный шаг). */
export const TAPE_KEEP_MS = 60 * 60 * 1000;
/** Как часто ставится опорный снимок: по нему любой момент собирается за считанные операции. */
export const TAPE_KEY_MS = 30_000;
/** Раздача из колоды — десятки карт подряд — одно событие ленты, пока карты идут чаще, чем раз в столько. */
const DEAL_JOIN_MS = 1500;
/** Держал дольше этого, не переложив, — это жест, а не случайное касание. */
const CARRY_MIN_MS = 300;

/** Событие ленты, которое можно выбрать плиткой: ход, переворот, раздача, перемешивание. */
export interface Moment {
  /** Когда взяли (замок) — до этого игрок «думал». Если взятия не видно — совпадает с `t`. */
  t0: number;
  /** Когда случилось: карту положили, перевернули. */
  t: number;
  kind: "move" | "turn" | "deal" | "deck" | "carry";
  by: string | null;
  ids: string[];
  from?: Where;
  to?: Where;
  /** Сколько прошло от конца прошлого события до взятия этого, мс; у первого — `null`. */
  think: number | null;
}

/** Что было в воздухе и у тел в этот момент. */
export interface Flow {
  t: number;
  carries: readonly Carry[];
  stacks: readonly Carry[];
  bodies: readonly Body[];
}

interface Entry {
  t: number;
  ops: readonly Op[];
}
interface Key {
  t: number;
  /** Абсолютный номер первой операции после снимка. */
  at: number;
  state: Snapshot;
}

/** Просмотр встаёт чуть ДО того, как игрок взял карту: видно, как было, и жест играется целиком. */
export const LEAD_MS = 300;
export const anchor = (m: Moment, from: number): number => Math.max(from, m.t0 - LEAD_MS);

const sameList = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((one, i) => one === b[i]);

export class Tape {
  private entries: Entry[] = [];
  /** Абсолютный номер `entries[0]` — он растёт, когда старое срезается. */
  private base = 0;
  private keys: Key[] = [];
  private flows: Flow[] = [];
  private moms: Moment[] = [];
  private lockedAt = new Map<string, { t: number; by: string }>();
  private cache: { key: Key; t: number; state: Snapshot; next: number } | null = null;

  constructor(private readonly keep: number = TAPE_KEEP_MS, private readonly keyEvery: number = TAPE_KEY_MS) {}

  /** Начать ленту с этого снимка (приветствие стола). Старая лента пропадает. */
  begin(state: Snapshot, t: number): void {
    this.entries = [];
    this.base = 0;
    this.flows = [];
    this.moms = [];
    this.lockedAt.clear();
    this.cache = null;
    this.keys = [{ t, at: 0, state: structuredClone(state) }];
  }

  get started(): boolean {
    return this.keys.length > 0;
  }

  /** С какого времени лента держит стол. */
  get from(): number {
    return this.keys[0]?.t ?? 0;
  }

  /** Время последнего, что случилось. */
  get last(): number {
    const e = this.entries.at(-1)?.t ?? 0, f = this.flows.at(-1)?.t ?? 0;
    return Math.max(e, f, this.keys.at(-1)?.t ?? 0);
  }

  /** События ленты — ходы, перевороты, раздачи, по порядку. */
  get moments(): readonly Moment[] {
    return this.moms;
  }

  /** Операции пришли: `state` — стол ПОСЛЕ них. */
  push(t: number, ops: readonly Op[], state: Snapshot): void {
    if (this.keys.length === 0) return;
    this.entries.push({ t, ops });
    this.note(t, ops);
    const k = this.keys.at(-1)!;
    if (t - k.t >= this.keyEvery) this.keys.push({ t, at: this.base + this.entries.length, state: structuredClone(state) });
    this.trim(t);
  }

  /** Палец, стопка или тело сдвинулись: записать, если что-то изменилось. */
  flow(t: number, carries: readonly Carry[], stacks: readonly Carry[], bodies: readonly Body[]): void {
    if (this.keys.length === 0) return;
    const last = this.flows.at(-1);
    if (last && sameList(last.carries, carries) && sameList(last.stacks, stacks) && sameList(last.bodies, bodies)) return;
    this.flows.push({ t, carries: [...carries], stacks: [...stacks], bodies: [...bodies] });
  }

  /** Стол, каким его видел игрок в этот момент. Объект не менять. */
  stateAt(t: number): Snapshot {
    const keys = this.keys;
    let key = keys[0]!;
    for (const k of keys) if (k.t <= t) key = k;
    if (t < key.t) return key.state;
    let state = key.state, next = key.at;
    const c = this.cache;
    if (c && c.key === key && c.t <= t) {
      state = c.state;
      next = c.next;
    }
    while (next - this.base < this.entries.length && this.entries[next - this.base]!.t <= t) {
      state = applyPatch(state, { v: state.v + 1, ops: this.entries[next - this.base]!.ops as Op[] });
      next += 1;
    }
    this.cache = { key, t, state, next };
    return state;
  }

  /** Поток пальцев и тел в этот момент: последняя запись не позже `t`. */
  flowAt(t: number): Flow | null {
    let lo = 0, hi = this.flows.length - 1, at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.flows[mid]!.t <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return at >= 0 ? this.flows[at]! : null;
  }

  /** Ближайшее событие ленты до или после `t` — по месту, куда встаёт просмотр (`anchor`): прыжок «ход назад / вперёд». `null` — дальше нет. */
  jump(t: number, dir: 1 | -1): Moment | null {
    if (dir < 0) {
      for (let i = this.moms.length - 1; i >= 0; i--) if (anchor(this.moms[i]!, this.from) < t - 1) return this.moms[i]!;
      return null;
    }
    for (const m of this.moms) if (anchor(m, this.from) > t + 1) return m;
    return null;
  }

  private note(t: number, ops: readonly Op[]): void {
    for (const op of ops) {
      if (op.t === "lock") { this.lockedAt.set(op.id, { t, by: op.by }); continue; }
      // Взяли и отпустили, не переложив (стопку за язычок, карту обратно): жест всё равно был — событие «несёт».
      if (op.t === "unlock") {
        const l = this.lockedAt.get(op.id);
        this.lockedAt.delete(op.id);
        if (l && t - l.t >= CARRY_MIN_MS) this.add({ t0: l.t, t, kind: "carry", by: l.by, ids: [op.id], think: null });
        continue;
      }
      if (op.t === "deck" && op.shuffled) { this.add({ t0: t, t, kind: "deck", by: null, ids: [op.pile], think: null }); continue; }
      if (op.t !== "move" && op.t !== "turn") continue;
      const id = op.card.id, by = op.trail?.by ?? null, deal = op.t === "move" && op.trail?.deal === true;
      const last = this.moms.at(-1);
      if (deal && last?.kind === "deal" && t - last.t < DEAL_JOIN_MS) { last.t = t; last.ids.push(id); continue; }
      // Несколько карт одним патчем (сбор, лассо) — одно событие.
      if (!deal && last && last.t === t && last.by === by && last.kind === (op.t === "move" ? "move" : "turn")) { last.ids.push(id); continue; }
      const t0 = Math.min(t, this.lockedAt.get(id)?.t ?? t);
      this.lockedAt.delete(id);
      this.add({ t0, t, kind: deal ? "deal" : op.t, by, ids: [id], ...(op.t === "move" ? { from: op.from, to: op.to } : {}), think: null });
    }
  }

  private add(m: Moment): void {
    const prev = this.moms.at(-1);
    m.think = prev ? Math.max(0, m.t0 - prev.t) : null;
    this.moms.push(m);
  }

  private trim(now: number): void {
    const cut = now - this.keep;
    while (this.keys.length > 1 && this.keys[1]!.t <= cut) this.keys.shift();
    const first = this.keys[0]!;
    const drop = first.at - this.base;
    if (drop > 0) {
      this.entries.splice(0, drop);
      this.base += drop;
    }
    let f = 0;
    while (f < this.flows.length && this.flows[f]!.t < first.t) f++;
    if (f > 0) this.flows.splice(0, f);
    let m = 0;
    while (m < this.moms.length && this.moms[m]!.t < first.t) m++;
    if (m > 0) this.moms.splice(0, m);
    if (this.cache && !this.keys.includes(this.cache.key)) this.cache = null;
  }
}

/** Где лежит карта в этом снимке и какой она видна: чтобы собрать из моего пальца `Carry`, каким его видят другие. */
export function locate(state: Snapshot, id: string): { where: Where; card: import("../src/table/contract.js").SeenCard } | null {
  for (const chair of state.chairs) {
    const i = chair.hand.findIndex((c) => c.id === id);
    if (i >= 0) return { where: { in: "hand", chair: chair.id, i }, card: chair.hand[i]! };
  }
  for (const pile of state.piles) {
    const i = pile.cards.findIndex((c) => c.id === id);
    if (i >= 0) return { where: { in: "deck", pile: pile.id, i }, card: pile.cards[i]! };
  }
  const f = state.felt.find((c) => c.id === id);
  return f ? { where: { in: "felt", x: f.x, y: f.y, up: f.up, angle: f.angle }, card: f } : null;
}
