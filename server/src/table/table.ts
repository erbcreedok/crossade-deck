// СТОЛ НА СЕРВЕРЕ — единственная правда о том, где лежит каждая карта, кто где сидит и кто что держит.
//
// Здесь нет ни Colyseus, ни сети, ни часов: намерение входит, выходят дифы (`Op[]`) в полном виде, а
// под каждого зрителя их режет `seenOp`. Так одно и то же проверяется тестом без сокета и ставится в
// любую комнату.
//
// РУКА ПРИНАДЛЕЖИТ СТУЛУ. Человек садится на стул и уходит с него; карты остаются лежать там, где их
// оставили, и тот, кто сядет следом, получает их вместе со стулом.
//
// КТО ЧТО ВИДИТ — одно правило (`visibleTo`): карту в руке — хозяин стула всегда, остальные — только если
// у стула снят «скрыть»; карту на сукне — если лежит лицом вверх; колоду — никто. Лицо чужой карты не
// уходит в сеть вовсе: спрятанное в клиенте — не спрятано.
//
// КТО ЧТО МОЖЕТ СО СТУЛОМ (`mayFlag`): флаги своего стула — хозяин; покинутого — любой; любого — админ.
// Флаг, пока стоит, действует на всех, кроме хозяина, — и на админа тоже: снять может, обойти — нет.

import {
  DEFAULT_RULES,
  LOCK_TTL_MS,
  type Carry,
  type CarryOut,
  type Chair,
  type ChairFlag,
  type Face,
  type FeltCard,
  type Intent,
  type Op,
  type Person,
  type Refusal,
  type SeenCard,
  type Snapshot,
  type TableRules,
  type Where,
} from "./contract.js";
import { freeAngle, seatPoint } from "./ring.js";

/** Докуда на сукне может лежать середина карты: радиус стола минус полкарты по диагонали. */
export const FELT_REACH = 8 - 0.86;

interface Lock {
  by: string;
  until: number;
}

/** Стул на сервере: рука — id карт, лица не здесь (`faces`). */
interface ChairRow {
  id: string;
  angle: number;
  owner: string | null;
  /** Кто сидел последним — вернувшийся садится обратно. */
  last: string | null;
  pin: boolean;
  lock: boolean;
  hide: boolean;
  forever: boolean;
  hand: string[];
}

type Result = { ops: Op[] } | { refused: Refusal };

export class Table {
  private v = 0;
  private seq = 0;
  private faces = new Map<string, Face>();
  private deck: string[] = [];
  private felt: { id: string; x: number; y: number; up: boolean; angle: number }[] = [];
  private chairs = new Map<string, ChairRow>();
  private people = new Map<string, Person>();
  private locks = new Map<string, Lock>();
  /** Последнее «над чем карта», пока её держат. Живёт не дольше блокировки (`carriesSeenBy`). */
  private carries = new Map<string, { by: string; over: Where }>();
  private rules: TableRules = { ...DEFAULT_RULES };

  /** `creator` — ключ создателя комнаты: он админ, пока сидит за столом. */
  constructor(
    cards: { id: string; face: Face }[],
    private readonly creator: string | null = null,
  ) {
    for (const card of cards) {
      this.faces.set(card.id, card.face);
      this.deck.push(card.id);
    }
  }

  get version(): number {
    return this.v;
  }

  get here(): Person[] {
    return [...this.people.values()];
  }

  private get admin(): string | null {
    return this.creator !== null && this.people.has(this.creator) ? this.creator : null;
  }

  // ── ЛЮДИ ───────────────────────────────────────────────────────────────────────────────────

  /** Сесть за стол: на свой прежний стул, если он ещё стоит и свободен, иначе — на новый. */
  join(person: Person): Op[] {
    const ops: Op[] = [];
    const wasAdmin = this.admin;
    const chair =
      [...this.chairs.values()].find((c) => c.owner === person.key) ??
      [...this.chairs.values()].find((c) => c.owner === null && c.last === person.key) ??
      this.newChair();
    chair.owner = person.key;
    chair.last = person.key;
    const seated = { ...person, seat: chair.id };
    this.people.set(person.key, seated);
    ops.push({ t: "join", person: seated }, { t: "chair", chair: this.chairOut(chair) });
    if (this.admin !== wasAdmin) ops.push({ t: "admin", key: this.admin });
    return this.commit(ops);
  }

  /** Уйти. Всё, что держал, отпускается; стул остаётся покинутым — или уходит по правилу стола. */
  leave(key: string): Op[] {
    const person = this.people.get(key);
    if (!person) return [];
    const wasAdmin = this.admin;
    this.people.delete(key);
    const ops: Op[] = [];
    for (const [id, lock] of this.locks) {
      if (lock.by !== key) continue;
      this.locks.delete(id);
      ops.push({ t: "unlock", id });
    }
    ops.push({ t: "leave", key });
    const chair = person.seat ? this.chairs.get(person.seat) : undefined;
    if (chair) ops.push(...this.vacate(chair, "left"));
    if (this.admin !== wasAdmin) ops.push({ t: "admin", key: this.admin });
    return this.commit(ops);
  }

  // ── НАМЕРЕНИЯ ──────────────────────────────────────────────────────────────────────────────

  act(by: string, intent: Intent, now: number): Result {
    switch (intent.t) {
      case "grab":
        return this.grab(by, intent.id, now);
      case "hold": {
        const lock = this.locks.get(intent.id);
        if (!lock || lock.by !== by) return { refused: "not-held" };
        lock.until = now + LOCK_TTL_MS;
        return { ops: [] };
      }
      case "release": {
        const lock = this.locks.get(intent.id);
        if (!lock || lock.by !== by) return { refused: "not-held" };
        this.locks.delete(intent.id);
        return { ops: this.commit([{ t: "unlock", id: intent.id }]) };
      }
      case "drop":
        return this.drop(by, intent.id, intent.to);
      case "flip": {
        const chair = this.seatOf(by);
        if (!chair) return { refused: "bad" };
        chair.hand.reverse();
        return { ops: this.commit([{ t: "order", chair: chair.id, ids: [...chair.hand] }]) };
      }
      case "sit":
        return this.sit(by, intent.chair);
      case "flag":
        return this.flag(by, intent.chair, intent.flag, intent.on);
      case "rules": {
        if (by !== this.admin) return { refused: "not-yours" };
        this.rules = { ...this.rules, ...pickRules(intent.rules) };
        const ops: Op[] = [{ t: "rules", rules: { ...this.rules } }];
        for (const chair of [...this.chairs.values()]) ops.push(...this.sweepChair(chair));
        return { ops: this.commit(ops) };
      }
      case "sync":
        return { ops: [] };
    }
  }

  /** Блокировки, которые никто не продлил. Комната спрашивает это по таймеру. */
  sweep(now: number): Op[] {
    const ops: Op[] = [];
    for (const [id, lock] of this.locks) {
      if (lock.until > now) continue;
      this.locks.delete(id);
      ops.push({ t: "unlock", id });
    }
    return ops.length ? this.commit(ops) : [];
  }

  /**
   * ПАЛЕЦ В ВОЗДУХЕ СООБЩИЛ, НАД ЧЕМ ОН. Только держащий; место чистится тем же `clean`, что и дроп, —
   * иначе чужая рука, которой нет, пришла бы остальным. Версия не растёт. Блокировку продлевает.
   */
  carry(by: string, out: CarryOut, now: number): { refused: Refusal } | { ok: true } {
    const lock = this.locks.get(out?.id);
    if (!lock || lock.by !== by) return { refused: "not-held" };
    const over = this.clean(out.over);
    if (!over) return { refused: "bad" };
    lock.until = now + LOCK_TTL_MS;
    this.carries.set(out.id, { by, over });
    return { ok: true };
  }

  /** Что в воздухе у других, глазами зрителя. Своё не отдаётся: свой палец у зрителя и так под рукой. */
  carriesSeenBy(viewer: string, only?: string): Carry[] {
    const out: Carry[] = [];
    for (const [id, c] of this.carries) {
      const lock = this.locks.get(id);
      const from = this.whereIs(id);
      if (!lock || lock.by !== c.by || !from) {
        this.carries.delete(id);
        continue;
      }
      if (c.by === viewer || (only !== undefined && only !== id)) continue;
      out.push({ id, by: c.by, over: c.over, from, card: this.seen(id, viewer, from) });
    }
    return out;
  }

  private grab(by: string, id: string, now: number): Result {
    const at = this.whereIs(id);
    if (!at) return { refused: "gone" };
    const lock = this.locks.get(id);
    if (lock && lock.by !== by) return { refused: "locked" };
    // С КОЛОДЫ — ТОЛЬКО ВЕРХНЯЯ. Стопку целиком не поднимают, и карту из середины не выдёргивают.
    if (at.in === "deck" && this.deck[this.deck.length - 1] !== id) return { refused: "not-top" };
    if (at.in === "hand" && this.closedTo(by, at.chair)) return { refused: "chair-locked" };
    this.locks.set(id, { by, until: now + LOCK_TTL_MS });
    return { ops: lock ? [] : this.commit([{ t: "lock", id, by }]) };
  }

  private drop(by: string, id: string, to: Where): Result {
    const lock = this.locks.get(id);
    if (!lock || lock.by !== by) return { refused: "not-held" };
    const target = this.clean(to);
    if (!target) return { refused: "bad" };
    if (target.in === "hand" && this.closedTo(by, target.chair)) return { refused: "chair-locked" };
    const from = this.whereIs(id)!;
    this.take(id, from);
    const landed = this.put(id, target);
    this.locks.delete(id);
    const ops: Op[] = [{ t: "move", card: { id }, from, to: landed }, { t: "unlock", id }];
    // РУКА ПОКИНУТОГО СТУЛА ОПУСТЕЛА — правило стола решает, стоять ли ему дальше.
    if (from.in === "hand") ops.push(...this.sweepChair(this.chairs.get(from.chair)!));
    return { ops: this.commit(ops) };
  }

  /** Пересесть. Старый стул: с картами — остаётся и становится вечным; без карт — исчезает сразу. */
  private sit(by: string, id: string): Result {
    const chair = this.chairs.get(id);
    const person = this.people.get(by);
    if (!chair || !person) return { refused: "gone" };
    if (chair.owner !== null) return { refused: chair.owner === by ? "bad" : "taken" };
    const ops: Op[] = [];
    const old = person.seat ? this.chairs.get(person.seat) : undefined;
    if (old) ops.push(...this.vacate(old, "moved"));
    chair.owner = by;
    chair.last = by;
    const seated = { ...person, seat: chair.id };
    this.people.set(by, seated);
    ops.push({ t: "join", person: seated }, { t: "chair", chair: this.chairOut(chair) });
    return { ops: this.commit(ops) };
  }

  private flag(by: string, id: string, flag: ChairFlag, on: boolean): Result {
    const chair = this.chairs.get(id);
    if (!chair) return { refused: "gone" };
    if (!this.mayFlag(by, chair)) return { refused: "not-yours" };
    if (typeof on !== "boolean" || !["pin", "lock", "hide", "forever"].includes(flag)) return { refused: "bad" };
    chair[flag] = on;
    const ops: Op[] = [{ t: "chair", chair: this.chairOut(chair) }];
    if (flag === "forever" && !on) ops.push(...this.sweepChair(chair));
    return { ops: this.commit(ops) };
  }

  /** Флаги стула меняет его хозяин, любой — у покинутого, админ — у любого. */
  mayFlag(by: string, chair: { owner: string | null }): boolean {
    return chair.owner === null || chair.owner === by || by === this.admin;
  }

  /** Замок стула закрыт для всех, кроме того, кто на нём сидит. */
  private closedTo(by: string, chairId: string): boolean {
    const chair = this.chairs.get(chairId);
    return chair !== undefined && chair.lock && chair.owner !== by;
  }

  // ── СТУЛЬЯ ─────────────────────────────────────────────────────────────────────────────────

  private newChair(): ChairRow {
    this.seq += 1;
    const chair: ChairRow = {
      id: `c${this.seq}`,
      angle: freeAngle([...this.chairs.values()].map((c) => c.angle)),
      owner: null,
      last: null,
      pin: false,
      lock: false,
      hide: true,
      forever: false,
      hand: [],
    };
    this.chairs.set(chair.id, chair);
    return chair;
  }

  private seatOf(key: string): ChairRow | undefined {
    const seat = this.people.get(key)?.seat;
    return seat ? this.chairs.get(seat) : undefined;
  }

  /**
   * СТУЛ ПОКИНУТ. Замок и булавка спадают — их ставил тот, кто сидел, и охранять больше некого;
   * «скрыть» остаётся: карты, что лежали рубашкой к соседям, не раскрываются от того, что хозяин встал.
   *
   * Ушёл (`left`) — дальше решает правило стола. Пересел (`moved`) — стул с картами становится вечным,
   * чтобы оставленное не пропало, а без карт исчезает сразу, какое бы правило ни стояло.
   */
  private vacate(chair: ChairRow, how: "left" | "moved"): Op[] {
    chair.owner = null;
    chair.pin = false;
    chair.lock = false;
    if (how === "moved") {
      if (chair.hand.length > 0) chair.forever = true;
      else if (!chair.forever) return this.removeChair(chair);
      return [{ t: "chair", chair: this.chairOut(chair) }];
    }
    return [{ t: "chair", chair: this.chairOut(chair) }, ...this.sweepChair(chair)];
  }

  /** Правило стола на одном стуле: покинутый, пустой и не вечный — уходит. */
  private sweepChair(chair: ChairRow): Op[] {
    if (!this.chairs.has(chair.id)) return [];
    if (chair.owner !== null || chair.forever || !this.rules.dropEmptyChairs || chair.hand.length > 0) return [];
    return this.removeChair(chair);
  }

  /**
   * УБРАТЬ СТУЛ. Правила не убирают стул с картами, но если это всё же случится, карты не пропадают:
   * ложатся закрытой стопкой туда, где стоял стул.
   */
  private removeChair(chair: ChairRow): Op[] {
    this.chairs.delete(chair.id);
    const at = seatPoint(chair.angle);
    const felt: FeltCard[] = chair.hand.map((id, i) => {
      const card = { id, x: at.x + i * 0.03, y: at.y - i * 0.03, up: false, angle: 0 };
      this.felt.push(card);
      return card;
    });
    chair.hand = [];
    return [{ t: "unchair", id: chair.id, felt }];
  }

  // ── КАРТЫ ──────────────────────────────────────────────────────────────────────────────────

  /** Куда класть можно: только в руку стоящего стула и только в пределах сукна. */
  private clean(to: Where): Where | null {
    if (to.in === "deck") return to;
    if (to.in === "hand") {
      if (!this.chairs.has(to.chair) || !Number.isInteger(to.i)) return null;
      return { in: "hand", chair: to.chair, i: to.i };
    }
    if (![to.x, to.y].every(Number.isFinite)) return null;
    // МИМО СТОЛА НЕ ПОЛОЖИТЬ: карта, брошенная за кромку, ложится на её край, а не пропадает в темноте.
    const far = Math.hypot(to.x, to.y);
    const k = far > FELT_REACH ? FELT_REACH / far : 1;
    return { in: "felt", x: to.x * k, y: to.y * k, up: to.up === true, angle: turnOf(Number.isFinite(to.angle) ? to.angle : 0) };
  }

  private whereIs(id: string): Where | null {
    if (this.deck.includes(id)) return { in: "deck" };
    const onFelt = this.felt.find((one) => one.id === id);
    if (onFelt) return { in: "felt", x: onFelt.x, y: onFelt.y, up: onFelt.up, angle: onFelt.angle };
    for (const chair of this.chairs.values()) {
      const i = chair.hand.indexOf(id);
      if (i >= 0) return { in: "hand", chair: chair.id, i };
    }
    return null;
  }

  private take(id: string, from: Where): void {
    if (from.in === "deck") this.deck.splice(this.deck.indexOf(id), 1);
    else if (from.in === "felt") this.felt.splice(this.felt.findIndex((one) => one.id === id), 1);
    else this.chairs.get(from.chair)!.hand.splice(from.i, 1);
  }

  /** Положить и вернуть, куда легло НА САМОМ ДЕЛЕ: индекс руки прижимается к её длине. */
  private put(id: string, to: Where): Where {
    if (to.in === "deck") {
      this.deck.push(id);
      return to;
    }
    if (to.in === "felt") {
      this.felt.push({ id, x: to.x, y: to.y, up: to.up, angle: to.angle });
      return to;
    }
    const hand = this.chairs.get(to.chair)!.hand;
    const i = Math.max(0, Math.min(hand.length, to.i));
    hand.splice(i, 0, id);
    return { in: "hand", chair: to.chair, i };
  }

  private commit(ops: Op[]): Op[] {
    this.v += 1;
    return ops;
  }

  // ── ЗРИТЕЛЬ ────────────────────────────────────────────────────────────────────────────────

  private visibleTo(viewer: string, where: Where): boolean {
    if (where.in === "hand") {
      const chair = this.chairs.get(where.chair);
      return chair !== undefined && (chair.owner === viewer || !chair.hide);
    }
    if (where.in === "felt") return where.up;
    return false;
  }

  private seen(id: string, viewer: string, where: Where): SeenCard {
    return this.visibleTo(viewer, where) ? { id, face: this.faces.get(id)! } : { id };
  }

  /** Стул в полном виде — лица в руке режет `seenOp`. */
  private chairOut(chair: ChairRow): Chair {
    const { last: _last, hand, ...rest } = chair;
    return { ...rest, hand: hand.map((id) => ({ id })) };
  }

  /**
   * Стул глазами зрителя. Спрашивает ТЕКУЩИЙ стул, а не тот, что лежит в дифе: диф рассылается после
   * того, как намерение целиком применено, и в нём должен ехать итог — иначе в одном патче стул,
   * отданный пересевшему, уехал бы к соседям с лицами, открытыми старым хозяином.
   */
  private chairSeen(chair: Chair, viewer: string): Chair {
    return { ...chair, hand: chair.hand.map((c, i) => this.seen(c.id, viewer, { in: "hand", chair: chair.id, i })) };
  }

  seenOp(op: Op, viewer: string): Op {
    if (op.t === "move") return { ...op, card: this.seen(op.card.id, viewer, op.to) };
    if (op.t === "chair") return { ...op, chair: this.chairSeen(op.chair, viewer) };
    return op;
  }

  seenBy(viewer: string): Snapshot {
    const chairs = [...this.chairs.values()].map((c) => this.chairSeen(this.chairOut(c), viewer));
    const felt: FeltCard[] = this.felt.map((one) => ({
      ...this.seen(one.id, viewer, { in: "felt", ...one }),
      x: one.x,
      y: one.y,
      up: one.up,
      angle: one.angle,
    }));
    return {
      v: this.v,
      people: this.here,
      chairs,
      deck: this.deck.map((id) => ({ id })),
      felt,
      locks: Object.fromEntries([...this.locks].map(([id, lock]) => [id, lock.by])),
      rules: { ...this.rules },
      admin: this.admin,
    };
  }
}

/** Угол в (-180, 180] — один и тот же поворот не должен приходить двумя разными числами. */
function turnOf(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
}

function pickRules(raw: Partial<TableRules>): Partial<TableRules> {
  return typeof raw?.dropEmptyChairs === "boolean" ? { dropEmptyChairs: raw.dropEmptyChairs } : {};
}
