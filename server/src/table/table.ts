// СТОЛ НА СЕРВЕРЕ — единственная правда о том, где лежит каждая карта и кто её держит.
//
// Здесь нет ни Colyseus, ни сети, ни часов: намерение входит, выходят дифы (`Op[]`) в полном виде,
// а под каждого зрителя их режет `seenOp`. Так одно и то же можно проверить тестом без сокета и
// поставить в любую комнату.
//
// КТО ЧТО ВИДИТ — одно правило на всё (`visibleTo`): свою руку лицом, карту на сукне — если она
// лежит лицом вверх, остальное — рубашкой. Лицо чужой карты не уходит в сеть вовсе: спрятанное
// в клиенте — не спрятано.

import type { Face, FeltCard, Intent, Op, Person, Refusal, SeenCard, Snapshot, Where } from "./contract.js";
import { LOCK_TTL_MS } from "./contract.js";

interface Lock {
  by: string;
  until: number;
}

type Result = { ops: Op[] } | { refused: Refusal };

export class Table {
  private v = 0;
  private faces = new Map<string, Face>();
  private deck: string[] = [];
  private felt: { id: string; x: number; y: number; up: boolean }[] = [];
  private hands = new Map<string, string[]>();
  private people = new Map<string, Person>();
  private locks = new Map<string, Lock>();

  constructor(cards: { id: string; face: Face }[]) {
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

  /** Сесть за стол. Рука, оставленная при уходе, возвращается тому же человеку. */
  join(person: Person): Op[] {
    this.people.set(person.key, person);
    if (!this.hands.has(person.key)) this.hands.set(person.key, []);
    return this.commit([{ t: "join", person, hand: this.hands.get(person.key)!.map((id) => ({ id })) }]);
  }

  /** Уйти. Рука остаётся лежать — вернувшийся найдёт её, — а всё, что он держал, отпускается. */
  leave(key: string): Op[] {
    if (!this.people.delete(key)) return [];
    const ops: Op[] = [];
    for (const [id, lock] of this.locks) {
      if (lock.by !== key) continue;
      this.locks.delete(id);
      ops.push({ t: "unlock", id });
    }
    ops.push({ t: "leave", key });
    return this.commit(ops);
  }

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
        const hand = this.hands.get(by);
        if (!hand) return { refused: "bad" };
        hand.reverse();
        return { ops: this.commit([{ t: "order", who: by, ids: [...hand] }]) };
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

  private grab(by: string, id: string, now: number): Result {
    const at = this.whereIs(id);
    if (!at) return { refused: "gone" };
    const lock = this.locks.get(id);
    if (lock && lock.by !== by) return { refused: "locked" };
    // С КОЛОДЫ — ТОЛЬКО ВЕРХНЯЯ. Стопку целиком не поднимают, и карту из середины не выдёргивают.
    if (at.in === "deck" && this.deck[this.deck.length - 1] !== id) return { refused: "not-top" };
    this.locks.set(id, { by, until: now + LOCK_TTL_MS });
    return { ops: lock ? [] : this.commit([{ t: "lock", id, by }]) };
  }

  private drop(by: string, id: string, to: Where): Result {
    const lock = this.locks.get(id);
    if (!lock || lock.by !== by) return { refused: "not-held" };
    const target = this.clean(to);
    if (!target) return { refused: "bad" };
    const from = this.whereIs(id)!;
    this.take(id, from);
    const landed = this.put(id, target);
    this.locks.delete(id);
    return { ops: this.commit([{ t: "move", card: { id }, from, to: landed }, { t: "unlock", id }]) };
  }

  /** Куда класть можно: только в руку сидящего и только в пределах сукна. */
  private clean(to: Where): Where | null {
    if (to.in === "deck") return to;
    if (to.in === "hand") {
      if (!this.hands.has(to.who) || !Number.isInteger(to.i)) return null;
      return to;
    }
    if (![to.x, to.y].every(Number.isFinite)) return null;
    return { in: "felt", x: to.x, y: to.y, up: to.up === true };
  }

  private whereIs(id: string): Where | null {
    if (this.deck.includes(id)) return { in: "deck" };
    const onFelt = this.felt.find((one) => one.id === id);
    if (onFelt) return { in: "felt", x: onFelt.x, y: onFelt.y, up: onFelt.up };
    for (const [who, hand] of this.hands) {
      const i = hand.indexOf(id);
      if (i >= 0) return { in: "hand", who, i };
    }
    return null;
  }

  private take(id: string, from: Where): void {
    if (from.in === "deck") this.deck.splice(this.deck.indexOf(id), 1);
    else if (from.in === "felt") this.felt.splice(this.felt.findIndex((one) => one.id === id), 1);
    else this.hands.get(from.who)!.splice(from.i, 1);
  }

  /** Положить и вернуть, куда легло НА САМОМ ДЕЛЕ: индекс руки прижимается к её длине. */
  private put(id: string, to: Where): Where {
    if (to.in === "deck") {
      this.deck.push(id);
      return to;
    }
    if (to.in === "felt") {
      this.felt.push({ id, x: to.x, y: to.y, up: to.up });
      return to;
    }
    const hand = this.hands.get(to.who)!;
    const i = Math.max(0, Math.min(hand.length, to.i));
    hand.splice(i, 0, id);
    return { in: "hand", who: to.who, i };
  }

  private commit(ops: Op[]): Op[] {
    this.v += 1;
    return ops;
  }

  // ── ЗРИТЕЛЬ ────────────────────────────────────────────────────────────────────────────────

  private visibleTo(viewer: string, where: Where): boolean {
    if (where.in === "hand") return where.who === viewer;
    if (where.in === "felt") return where.up;
    return false;
  }

  private seen(id: string, viewer: string, where: Where): SeenCard {
    return this.visibleTo(viewer, where) ? { id, face: this.faces.get(id)! } : { id };
  }

  seenOp(op: Op, viewer: string): Op {
    if (op.t === "move") return { ...op, card: this.seen(op.card.id, viewer, op.to) };
    if (op.t === "join") {
      const hand = this.hands.get(op.person.key) ?? [];
      return { ...op, hand: hand.map((id, i) => this.seen(id, viewer, { in: "hand", who: op.person.key, i })) };
    }
    return op;
  }

  seenBy(viewer: string): Snapshot {
    const hands: Record<string, SeenCard[]> = {};
    for (const [who, hand] of this.hands) {
      hands[who] = hand.map((id, i) => this.seen(id, viewer, { in: "hand", who, i }));
    }
    const felt: FeltCard[] = this.felt.map((one) => ({
      ...this.seen(one.id, viewer, { in: "felt", ...one }),
      x: one.x,
      y: one.y,
      up: one.up,
    }));
    return {
      v: this.v,
      people: this.here,
      deck: this.deck.map((id) => ({ id })),
      felt,
      hands,
      locks: Object.fromEntries([...this.locks].map(([id, lock]) => [id, lock.by])),
    };
  }
}
