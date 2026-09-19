// ДИФ НА СТОРОНЕ КЛИЕНТА — как снимок стола становится следующим снимком.
//
// Сервер шлёт не стол, а то, что на нём изменилось; клиент у себя складывает. Этот файл — единственное
// место, где это сложение описано: клиент собирается прямо из него, а тест (`table.test.ts`) гоняет
// серверный `Table` и проверяет, что сложенное клиентом совпадает с тем, что сервер отдал бы целиком.
//
// Версия — страж: пришёл патч не следующей версии — значит что-то потерялось, и клиент просит стол
// целиком (`needsSync`), а не угадывает.

import type { Op, Patch, SeenCard, Snapshot, Where } from "./contract.js";
import { ringSlotTurn } from "./ring.js";


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
      // КАРТА В `move` ПРИХОДИТ НОВЫМ СНИМКОМ, и своего места в зоне она может не нести — так его
      // строит оптимистичная догадка. Место при этом никуда не делось: оно лежит там, откуда карту
      // сейчас поднимут. Без этой строки зона считала бы вернувшуюся карту новой и перекладывалась.
      const held = op.card.slot ?? held0(s, op.card.id);
      const card = held === undefined ? op.card : { ...op.card, slot: held };
      // ЯКОРЬ КРУГА ЖИВЁТ ПО ТОМУ ЖЕ ЗАКОНУ, ЧТО И НА СТОЛЕ. Иначе догадка разложит круг от другого
      // угла, чем стол, и карты дёрнутся, когда придёт ответ.
      const from = op.from;
      const was = from.in === "deck" ? s.piles.find((one) => one.id === from.pile) : undefined;
      const head = was?.pose === "ring" && was.cards[0]?.id === op.card.id;
      lift(s, op.card.id, op.from);
      const to = op.to;
      const target = to.in === "deck" ? s.piles.find((one) => one.id === to.pile) : undefined;
      if (target?.pose === "ring" && target.cards.length === 0) {
        target.turn = whenceOf(s, op.from);
        target.slots = 0;
      }
      else if (was && head && target !== was) stepArrow(was);
      place(s, card, op.to);
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

/** Стрелка шагает на новую голову: круг от этого не шевелится, двигается только якорь. */
function stepArrow(pile: { cards: SeenCard[]; turn?: number; slots?: number }): void {
  const head = pile.cards[0]?.slot;
  if (head !== undefined) pile.turn = ringSlotTurn(pile.slots ?? pile.cards.length, pile.turn ?? 0, head);
}

/** Номер места, на котором карта лежит в зоне прямо сейчас, — до того, как её подняли. */
function held0(s: Snapshot, id: string): number | undefined {
  for (const pile of s.piles) {
    const one = pile.cards.find((card) => card.id === id);
    if (one) return one.slot;
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

/** Порядок круга — это порядок его мест: карта, севшая на свободный номер, встаёт по нему. */
function bySlot(pile: { cards: SeenCard[] }): void {
  pile.cards.sort((a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity));
}

function place(s: Snapshot, card: SeenCard, to: Where): void {
  if (to.in === "deck") {
    const pile = s.piles.find((one) => one.id === to.pile);
    if (!pile) return;
    if (to.i === undefined) pile.cards.push(card);
    else pile.cards.splice(Math.max(0, Math.min(pile.cards.length, to.i)), 0, card);
    // ЗОНА РАСКЛАДЫВАЕТ ТУТ ЖЕ — той же раскладкой, что и стол. Иначе карта, положенная своей рукой,
    // на миг оказывалась бы в середине зоны (места у неё ещё нет) и летела бы оттуда на место: два
    // прыжка вместо одного полёта. Названо точное место — раскладка не нужна, карта уже знает своё.
    if (pile.pose === "ring") {
      // ТРИ СЛУЧАЯ, И ВСЕ ТРИ — ПРО НОМЕР МЕСТА, а не про координаты.
      //
      //   назван свободный номер — карта села на него, круг не тронут (это посадка в дыру);
      //   свой номер и не спрашивали — осталась на нём (вернулась туда, откуда её взяли);
      //   иначе — СМЕНА ПОРЯДКА: номера раздаются заново, от нуля и подряд, дыры закрываются.
      if (to.slot !== undefined) {
        card.slot = to.slot;
        bySlot(pile);
      } else if (card.slot !== undefined && to.i === undefined && card.slot < (pile.slots ?? 0)) {
        bySlot(pile);
      } else {
        pile.cards.forEach((one, i) => (one.slot = i));
        pile.slots = pile.cards.length;
      }
    }
  }
  else if (to.in === "felt") { card.slot = undefined; s.felt.push({ ...card, x: to.x, y: to.y, up: to.up, angle: to.angle, ...(to.under ? { under: true } : {}) }); }
  else {
    card.slot = undefined;
    s.chairs.find((one) => one.id === to.chair)?.hand.splice(to.i, 0, card);
  }
}
