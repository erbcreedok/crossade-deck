// ПЛАН ДРОПА — чистое решение «что значит отпустить карту в этой точке» (без Pixi и сцены):
// реордер руки/зоны, переезд с правилом стороны, свободный дроп в бокс. Сцена лишь исполняет
// готовую команду порта. Все зависимости — функциями (переносимо на любой язык/платформу).

import { handOrderAfterDrop } from "../../crossade/handOrder";
import { faceAfterDrop, insideBox, nextLooseKey } from "./freeDrop";
import type { Rect, Vec } from "./freeBox";
import { baseZoneId, slotKey, slotOf, zoneOf, type BoardCommand, type ZoneSpec } from "../core/spec";

export interface DropWorld {
  zones: readonly ZoneSpec[];
  cellRects: Readonly<Record<string, Rect>>;
  members(slot: string): readonly string[];
  homeOf(id: string): Vec | null;
  /** Ключи непустых слотов поля (выдача ключа новой свободной стопке). */
  occupiedKeys(): readonly string[];
}

/** Мир дропа из спеки, дерева и снимка — единственный переходник «сцена → чистые планировщики».
 *  Собирать его руками в сцене незачем: набор всегда один и тот же, а разойдётся он молча. */
export function boardWorld(args: {
  zones: readonly ZoneSpec[];
  cellRects: Readonly<Record<string, Rect>>;
  slots: Readonly<Record<string, { members: readonly string[] } | undefined>>;
  homeOf(id: string): Vec | null;
}): DropWorld {
  return {
    zones: args.zones,
    cellRects: args.cellRects,
    members: (slot) => args.slots[slot]?.members ?? [],
    homeOf: args.homeOf,
    occupiedKeys: () => Object.keys(args.slots).filter((k) => (args.slots[k]?.members.length ?? 0) > 0),
  };
}

export interface DropArgs {
  el: string;
  from: string | null;
  /** Цель dropTarget: группа-слот и индекс вставки (null — мимо всех слотов). */
  target: { slot: string; index: number } | null;
  cp: Vec;
  myHand: string;
  handReorder: boolean;
  /** Какой стороной карту несли (null — не карта, сторона не пишется). */
  carriedFaceUp: boolean | null;
}

export type DropPlan = { kind: "none" } | { kind: "command"; cmd: BoardCommand };

const zoneSpec = (w: DropWorld, slot: string): ZoneSpec | undefined => w.zones.find((z) => z.id === baseZoneId(zoneOf(slot)));

const isFree = (w: DropWorld, slot: string): boolean => zoneSpec(w, slot)?.layout.kind === "free";

/** Слот-КОЛОДА free-зоны (слот 0); остальные слоты зоны — свободные стопки. */
export const isDeckSlot = (w: DropWorld, slot: string): boolean => slotOf(slot) === "0" && isFree(w, slot);

/** Режим внутризонного реордера: из спеки зоны; flow-грид реордерится по умолчанию. */
export function reorderModeOf(w: DropWorld, slot: string): "insert" | "swap" | null {
  const zone = zoneSpec(w, slot);
  if (!zone) return null;
  return zone.reorder ?? (zone.layout.kind === "flow" ? "insert" : null);
}

/** Free-зона, чей бокс (с учётом формы-круга) накрывает точку — фолбэк после dropTarget. */
export function freeZoneAt(w: DropWorld, cp: Vec): string | null {
  for (const zone of w.zones) {
    if (zone.layout.kind !== "free") continue;
    const box = w.cellRects[slotKey(zone.id, 0)];
    if (box && insideBox(box, zone.shape, cp)) return zone.id;
  }
  return null;
}

/** Обмен местами: перетащенный встаёт на позицию цели, вытесненный — на его прежнюю. */
export function swappedOrder(members: readonly string[], el: string, toIndex: number): string[] {
  const fromIndex = members.indexOf(el);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= members.length || fromIndex === toIndex) return [...members];
  const out = [...members];
  [out[fromIndex], out[toIndex]] = [out[toIndex]!, out[fromIndex]!];
  return out;
}

/** Ближайший к точке дропа житель контейнера (кроме самого груза) — цель обмена. */
export function nearestMemberIndex(w: DropWorld, members: readonly string[], dragged: string, cp: Vec): number {
  let best = -1;
  let bestD = Infinity;
  members.forEach((m, i) => {
    if (m === dragged) return;
    const h = w.homeOf(m);
    if (!h) return;
    const d = Math.hypot(h.x - cp.x, h.y - cp.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Сторона карты после переезда: undefined — оверрайд снимается, зона решает сама. */
function faceForMove(w: DropWorld, args: DropArgs, to: string): boolean | undefined {
  if (args.carriedFaceUp === null || !args.from) return undefined;
  const face = faceAfterDrop({
    fromFree: isFree(w, args.from),
    toFree: isFree(w, to),
    toDeck: isDeckSlot(w, to),
    carried: args.carriedFaceUp,
  });
  return face ?? undefined;
}

/** Дроп мимо всех слотов, но в бокс free-зоны: карта ложится ГДЕ и КАК положили. Одинокая
 *  свободная стопка просто переезжает (placeFree); иначе — move в новый слот с точкой. */
function planLoose(w: DropWorld, args: DropArgs, from: string): DropPlan {
  const zid = freeZoneAt(w, args.cp);
  if (!zid) return { kind: "none" }; // мимо и бокса — release вернёт домой
  const box = w.cellRects[slotKey(zid, 0)];
  if (!box) return { kind: "none" };
  const local = { x: args.cp.x - box.x, y: args.cp.y - box.y };
  if (zoneOf(from) === zid && slotOf(from) !== "0" && w.members(from).length === 1) {
    return { kind: "command", cmd: { t: "placeFree", key: from, at: local } };
  }
  const key = nextLooseKey(zid, w.occupiedKeys());
  return { kind: "command", cmd: { t: "move", el: args.el, from, to: key, at: local, face: faceForMove(w, args, key) } };
}

/** Главный вход: что значит отпустить `el` в `cp` (без фикс-зон экрана и блок-драга — они у сцены). */
export function planDrop(w: DropWorld, args: DropArgs): DropPlan {
  const { el, from, target, cp, myHand } = args;
  const to = target?.slot ?? null;
  if (from === myHand && to === myHand && args.handReorder) {
    // Реордер руки — та же дверь порта, что и любой ход (сервер получит эту же команду).
    const members = w.members(myHand);
    const order = handOrderAfterDrop(members, el, target?.index ?? members.length);
    return { kind: "command", cmd: { t: "reorderHand", seat: slotOf(myHand), order } };
  }
  if (from && to === from && reorderModeOf(w, from)) {
    // Дроп внутри реордер-зоны: вставка (индекс-ЩЕЛЬ из dropTarget) или обмен (КЛЕТКА — ближайший
    // житель; индекс вставки тут соврал бы на полклетки).
    const members = w.members(from);
    const order =
      reorderModeOf(w, from) === "swap"
        ? swappedOrder(members, el, nearestMemberIndex(w, members, el, cp))
        : handOrderAfterDrop(members, el, target?.index ?? members.length);
    return { kind: "command", cmd: { t: "reorderSlot", key: from, order } };
  }
  if (from && to && to !== from && zoneOf(to) !== "seat") {
    return { kind: "command", cmd: { t: "move", el, from, to, face: faceForMove(w, args, to) } };
  }
  if (from && !to) return planLoose(w, args, from);
  return { kind: "none" };
}
