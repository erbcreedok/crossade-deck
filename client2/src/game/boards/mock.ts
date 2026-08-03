// СМАРТ-МОК борды — драйвер порта команд БЕЗ валидации правил (BOARDS-DESIGN §3): исполняет
// честно всё, что не рушит структуру, — правила игры живут в головах игроков, а когда придут
// настоящие, они встанут МЕЖДУ портом и мутацией, не трогая ни команд, ни борды.
//
// Чистый редьюсер: applyCommand(spec, state, cmd, rng) → state'. Rng инжектится (тесты —
// детерминированные), сцена передаёт Math.random.

import { at, move, place } from "../slotfield/slotField";
import { topId } from "../slotfield/container";
import { handKey, initialState, OFFBOARD_KEY, type BoardState } from "./state";
import { slotKey, zoneOf, type BoardCommand, type BoardSpec, type SlotKey } from "./spec";

export type Rng = () => number;

function zoneSpec(spec: BoardSpec, zoneId: string) {
  return spec.zones.find((z) => z.id === zoneId);
}

/** Дроп в занятый слот — политика зоны (slotfield: merge/swap/capture/reject) над SlotField. */
function resolveMove(spec: BoardSpec, state: BoardState, el: string, from: SlotKey, to: SlotKey): BoardState {
  const zone = zoneSpec(spec, zoneOf(to));
  const target = at(state.field, to);
  const occupied = (target?.members.length ?? 0) > 0;
  const policy = zone?.policy;

  if (!occupied || !policy || policy.onOccupied === "merge") {
    if (policy?.maxSize !== undefined && (target?.members.length ?? 0) >= policy.maxSize) return state; // полный — отказ
    return { ...state, field: move(state.field, from, to, [el]) };
  }
  if (policy.onOccupied === "reject") return state;
  if (policy.onOccupied === "swap") {
    const other = topId(target!)!;
    let field = move(state.field, to, from, [other]);
    field = move(field, from, to, [el]);
    return { ...state, field };
  }
  // capture: вытесненный уезжает в displaceTo (или за борт), новичок занимает слот.
  const victim = topId(target!)!;
  const displaceTo = policy.displaceTo ? slotKey(policy.displaceTo, 0) : OFFBOARD_KEY;
  let field = move(state.field, to, displaceTo, [victim]);
  field = move(field, from, to, [el]);
  return { ...state, field };
}

/** Порядок раздачи «всю колоду поровну, дилеру ПОСЛЕДНИМ»: круг начинается со следующего за
 *  дилером; когда карт не хватает на полный круг, без карты остаются последние — то есть дилер
 *  (и, при разнице больше одной, его соседи справа). */
export function dealOrder(seatIds: readonly string[], dealer: string): string[] {
  const start = (seatIds.indexOf(dealer) + 1) % seatIds.length;
  return seatIds.map((_, i) => seatIds[(start + i) % seatIds.length]!);
}

function deal(spec: BoardSpec, state: BoardState, fromZone: string, each: number | "all-even-dealer-last"): BoardState {
  const fromKey = slotKey(fromZone, 0);
  const order = dealOrder(state.seats.map((s) => s.id), state.dealer);
  let field = state.field;
  const total = at(field, fromKey)?.members.length ?? 0;
  const rounds = each === "all-even-dealer-last" ? Math.ceil(total / order.length) : each;
  for (let r = 0; r < rounds; r++) {
    for (const seat of order) {
      const deck = at(field, fromKey);
      const top = deck && topId(deck);
      if (top === undefined) break;
      field = move(field, fromKey, handKey(seat), [top]);
    }
  }
  return { ...state, field };
}

function shuffle(state: BoardState, zoneId: string, rng: Rng): BoardState {
  const key = slotKey(zoneId, 0);
  const members = [...(at(state.field, key)?.members ?? [])];
  for (let i = members.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [members[i], members[j]] = [members[j]!, members[i]!];
  }
  return { ...state, field: place(state.field, key, { members }) };
}

export function applyCommand(spec: BoardSpec, state: BoardState, cmd: BoardCommand, rng: Rng): BoardState {
  switch (cmd.t) {
    case "move":
      return resolveMove(spec, state, cmd.el, cmd.from, cmd.to);
    case "deal":
      return deal(spec, state, cmd.from, cmd.each);
    case "shuffle":
      return shuffle(state, cmd.zone, rng);
    case "turn": {
      const n = state.seats.length;
      return { ...state, turn: { ...state.turn, at: (state.turn.at + state.turn.dir + n) % n } };
    }
    case "reverse":
      return { ...state, turn: { ...state.turn, dir: state.turn.dir === 1 ? -1 : 1 } };
    case "reset": {
      const fresh = initialState(spec, state.seats.length);
      const withDeal = spec.mock?.deal ? deal(spec, { ...fresh, seats: state.seats }, spec.mock.deal.from, spec.mock.deal.each) : { ...fresh, seats: state.seats };
      return withDeal;
    }
    case "roll": {
      const n = spec.mock?.dice ?? 0;
      return { ...state, dice: Array.from({ length: n }, () => 1 + Math.floor(rng() * 6)) };
    }
    case "sit": {
      const seats = state.seats.map((s) => (s.id === cmd.seat && s.occupant === null ? { ...s, occupant: cmd.who } : s));
      return { ...state, seats };
    }
    case "stand": {
      const seats = state.seats.map((s) => (s.occupant === cmd.who ? { ...s, occupant: null } : s));
      return { ...state, seats };
    }
  }
}

/** Стартовое состояние борды «как её открыли»: setup + мок-раздача. */
export function bootState(spec: BoardSpec, seatsWanted?: number): BoardState {
  const s = initialState(spec, seatsWanted);
  return spec.mock?.deal ? deal(spec, s, spec.mock.deal.from, spec.mock.deal.each) : s;
}
