// ДИФ НА СТОРОНЕ КЛИЕНТА — как снимок стола становится следующим снимком.
//
// Сервер шлёт не стол, а то, что на нём изменилось; клиент у себя складывает. Этот файл — единственное
// место, где это сложение описано: клиент собирается прямо из него, а тест (`table.test.ts`) гоняет
// серверный `Table` и проверяет, что сложенное клиентом совпадает с тем, что сервер отдал бы целиком.
//
// Версия — страж: пришёл патч не следующей версии — значит что-то потерялось, и клиент просит стол
// целиком (`needsSync`), а не угадывает.

import type { Op, Patch, SeenCard, Snapshot, Where } from "./contract.js";
import { ringLanding } from "./ring.js";


export const needsSync = (state: Snapshot, patch: Patch): boolean => patch.v !== state.v + 1;

/** Сложить один патч. Снимок не мутируется: вернётся новый. */
export function applyPatch(state: Snapshot, patch: Patch): Snapshot {
  const next: Snapshot = structuredClone(state);
  for (const op of patch.ops) applyOp(next, op);
  next.v = patch.v;
  return next;
}

function applyOp(s: Snapshot, op: Op): void {
  switch (op.t) {
    case "join": {
      const i = s.people.findIndex((one) => one.key === op.person.key);
      if (i >= 0) s.people[i] = op.person;
      else s.people.push(op.person);
      return;
    }
    case "leave":
      s.people = s.people.filter((one) => one.key !== op.key);
      return;
    case "chair": {
      const i = s.chairs.findIndex((one) => one.id === op.chair.id);
      if (i >= 0) s.chairs[i] = op.chair;
      else s.chairs.push(op.chair);
      return;
    }
    case "unchair":
      s.chairs = s.chairs.filter((one) => one.id !== op.id);
      s.felt.push(...op.felt);
      return;
    case "unmake": {
      const gone = new Set(op.ids);
      s.felt = s.felt.filter((one) => !gone.has(one.id));
      for (const pile of s.piles) pile.cards = pile.cards.filter((one) => !gone.has(one.id));
      for (const chair of s.chairs) chair.hand = chair.hand.filter((one) => !gone.has(one.id));
      for (const id of op.ids) {
        delete s.locks[id];
        delete s.picks[id];
        if (s.trails) delete s.trails[id];
      }
      return;
    }
    case "lock":
      s.locks[op.id] = op.by;
      return;
    case "unlock":
      delete s.locks[op.id];
      return;
    case "order": {
      const chair = s.chairs.find((one) => one.id === op.chair);
      if (!chair) return;
      const byId = new Map(chair.hand.map((card) => [card.id, card]));
      chair.hand = op.ids.map((id) => byId.get(id) ?? { id });
      return;
    }
    case "move": {
      // КАРТА В `move` ПРИХОДИТ НОВЫМ СНИМКОМ, и своего угла в зоне она может не нести — так его
      // строит оптимистичная догадка. Угол при этом никуда не делся: он лежит там, откуда карту
      // сейчас поднимут. Без этой строки зона считала бы вернувшуюся карту новой.
      const held = op.card.turn ?? held0(s, op.card.id);
      const card = held === undefined ? op.card : { ...op.card, turn: held };
      lift(s, op.card.id, op.from);
      place(s, card, op.to, whenceOf(s, op.from));
      if (op.trail) (s.trails ??= {})[op.card.id] = op.trail;
      return;
    }
    case "turn": {
      const felt = s.felt.find((one) => one.id === op.card.id);
      const pile = s.piles.find((one) => one.cards.some((card) => card.id === op.card.id));
      const chair = s.chairs.find((one) => one.hand.some((card) => card.id === op.card.id));
      if (felt) {
        felt.up = op.up;
        if (op.card.face) felt.face = op.card.face;
        else delete felt.face;
      } else if (pile) pile.cards = pile.cards.map((card) => (card.id === op.card.id ? op.card : card));
      else if (chair) chair.hand = chair.hand.map((card) => (card.id === op.card.id ? op.card : card));
      (s.trails ??= {})[op.card.id] = op.trail;
      return;
    }
    case "deck": {
      const pile = s.piles.find((one) => one.id === op.pile);
      if (!pile) return;
      pile.cards = op.cards;
      if (op.shuffled) pile.shuffles += 1;
      for (const id of Object.keys(s.trails ?? {})) if (!s.piles.some((p) => p.cards.some((c) => c.id === id)) && !s.felt.some((c) => c.id === id) && !s.chairs.some((c) => c.hand.some((h) => h.id === id))) delete s.trails[id];
      return;
    }
    case "spot": {
      const i = s.piles.findIndex((one) => one.id === op.pile);
      const was = s.piles[i];
      if (i >= 0) s.piles.splice(i, 1);
      if (!op.spot) return;
      const pile = { ...op.spot, id: op.pile, cards: was?.cards ?? [], shuffles: was?.shuffles ?? 0 };
      if (op.top || i < 0) s.piles.push(pile);
      else s.piles.splice(i, 0, pile);
      return;
    }
    case "pick":
      s.picks ??= {};
      for (const id of op.ids) {
        if (op.by === null) delete s.picks[id];
        else s.picks[id] = op.by;
      }
      return;
    case "rules":
      s.rules = op.rules;
      return;
    case "admin":
      s.admin = op.key;
      s.rights = op.rights;
      return;
    case "dealer":
      s.dealer = op.key;
      s.rights = op.rights;
      return;
    case "play":
      s.play = op.play;
      return;
  }
}

/** С КАКОЙ СТОРОНЫ КАРТУ НЕСУТ — угол, под которым пустой круг примет свою первую карту. */
function whenceOf(s: Snapshot, from: Where): number {
  if (from.in === "hand") return s.chairs.find((one) => one.id === from.chair)?.angle ?? 0;
  const at = from.in === "felt" ? from : s.piles.find((one) => one.id === from.pile);
  return at ? turnOfPlace({ x: 0, y: 0 }, at) : 0;
}

/** Угол, на котором карта лежит в зоне прямо сейчас, — до того, как её подняли. */
function held0(s: Snapshot, id: string): number | undefined {
  for (const pile of s.piles) {
    const one = pile.cards.find((card) => card.id === id);
    if (one) return one.turn;
  }
  return undefined;
}

function lift(s: Snapshot, id: string, from: Where): void {
  if (from.in === "felt") for (const pile of s.piles) if (pile.below.includes(id)) pile.below = pile.below.filter((one) => one !== id);
  if (from.in === "deck") {
    const pile = s.piles.find((one) => one.id === from.pile);
    if (pile) pile.cards = pile.cards.filter((one) => one.id !== id);
  }
  else if (from.in === "felt") s.felt = s.felt.filter((one) => one.id !== id);
  else {
    const chair = s.chairs.find((one) => one.id === from.chair);
    if (chair) chair.hand = chair.hand.filter((one) => one.id !== id);
  }
}

/** Под каким углом от середины стола лежит эта точка — по нему пустой круг выбирает себе якорь. */
function turnOfPlace(middle: { x: number; y: number }, at: { x: number; y: number }): number {
  const deg = (Math.atan2(at.x - middle.x, middle.y - at.y) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function place(s: Snapshot, card: SeenCard, to: Where, whence = 0): void {
  if (to.in === "deck") {
    const pile = s.piles.find((one) => one.id === to.pile);
    if (!pile) return;
    // КРУГ КЛАДЁТ ПО УГЛУ, тем же законом, что и стол: целились сюда — сюда и ляжет, занято —
    // встанет рядом, не прячась под соседку. Порядок в стопке — порядок ВХОДА: по нему круг помнит,
    // какая карта зашла первой.
    if (pile.pose === "ring") {
      const busy = pile.cards.map((one) => one.turn).filter((one): one is number => one !== undefined);
      card.turn = ringLanding(to.turn ?? card.turn ?? whence, busy);
      pile.cards.push(card);
      return;
    }
    if (to.i === undefined) pile.cards.push(card);
    else pile.cards.splice(Math.max(0, Math.min(pile.cards.length, to.i)), 0, card);
  }
  else if (to.in === "felt") { card.turn = undefined; s.felt.push({ ...card, x: to.x, y: to.y, up: to.up, angle: to.angle, ...(to.under ? { under: true } : {}) }); }
  else {
    card.turn = undefined;
    s.chairs.find((one) => one.id === to.chair)?.hand.splice(to.i, 0, card);
  }
}
