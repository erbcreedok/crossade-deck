// ДИФ НА СТОРОНЕ КЛИЕНТА — как снимок стола становится следующим снимком.
//
// Сервер шлёт не стол, а то, что на нём изменилось; клиент у себя складывает. Этот файл — единственное
// место, где это сложение описано: клиент собирается прямо из него, а тест (`table.test.ts`) гоняет
// серверный `Table` и проверяет, что сложенное клиентом совпадает с тем, что сервер отдал бы целиком.
//
// Версия — страж: пришёл патч не следующей версии — значит что-то потерялось, и клиент просит стол
// целиком (`needsSync`), а не угадывает.

import type { Op, Patch, SeenCard, Snapshot, Where } from "./contract.js";

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
    case "move":
      lift(s, op.card.id, op.from);
      place(s, op.card, op.to);
      if (op.trail) (s.trails ??= {})[op.card.id] = op.trail;
      return;
    case "rules":
      s.rules = op.rules;
      return;
    case "admin":
      s.admin = op.key;
      return;
  }
}

function lift(s: Snapshot, id: string, from: Where): void {
  if (from.in === "deck") s.deck = s.deck.filter((one) => one.id !== id);
  else if (from.in === "felt") s.felt = s.felt.filter((one) => one.id !== id);
  else {
    const chair = s.chairs.find((one) => one.id === from.chair);
    if (chair) chair.hand = chair.hand.filter((one) => one.id !== id);
  }
}

function place(s: Snapshot, card: SeenCard, to: Where): void {
  if (to.in === "deck") s.deck.push(card);
  else if (to.in === "felt") s.felt.push({ ...card, x: to.x, y: to.y, up: to.up, angle: to.angle });
  else s.chairs.find((one) => one.id === to.chair)?.hand.splice(to.i, 0, card);
}
