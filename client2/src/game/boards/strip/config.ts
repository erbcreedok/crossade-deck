// ЛЕНТА (strip) как ДАННЫЕ — нормализатор ZoneSpec ленты: одно место, где живут дефолты
// (приватность, адаптив-размер, вдоль края), чтобы все потребители (дерево борды, доки HUD,
// live-сцены) читали ОДИН разобранный конфиг, а не повторяли `?? true` вразнобой. Чистая функция.
//
// Лента — perSeat-зона с ОДНИМ контейнером на место (`id:seat` — hand:p1, pouch:p2): рука, мешок
// фишек, личная дропзона — одна и та же механика с разными свойствами. Никакого спецпонятия
// «рука» в словаре нет: «hand» — просто id зоны, к которому по умолчанию едет deal.

import { slotKey, slotOf, zoneOf, type BoardSpec, type HandFlow, type HudSide, type ZoneSpec } from "../core/spec";
import { zoneOnBoard } from "../hud/hudLayout";

export interface StripConfig {
  reorder: "insert" | "swap" | null;
  /** Направление раскладки в доке; null — вдоль края ТОГО дока, куда лента пришвартована. */
  flow: HandFlow | null;
  /** Размер ячеек в доке: {fit} — адаптив «влезает N вдоль оси», {cell} — фикс дизайнера. */
  size: { fit: number } | { cell: { w: number; h: number } };
  /** Эталонный габарит жителя (аспект адаптива и ячейка ряда на борде). */
  cell: { w: number; h: number };
  /** Значения чужих экземпляров не видны (рубашки). Дефолт true — лента личная. */
  hidden: boolean;
  /** Доступ чужих: open (дефолт — дроп/взятие включены) | request (пока как locked) | locked. */
  access: "open" | "request" | "locked";
  /** Где у аватара владельца живёт мини-лента для других, когда зона в HUD. Дефолт below. */
  atSeat: "above" | "below" | "left" | "right";
  /** Smart reorder (гэп-превью вставки). Дефолт true — лента живая. */
  preview: boolean;
}

const CARD = { w: 100, h: 143 };

/** Все ленты спеки (strip-зоны) в порядке объявления. */
export function stripZones(spec: Pick<BoardSpec, "zones">): ZoneSpec[] {
  return spec.zones.filter((z) => z.layout.kind === "strip");
}

/** Контейнер ленты у места: слот = id места («hand:p1»). */
export function stripKey(zoneId: string, seatId: string): string {
  return slotKey(zoneId, seatId);
}

/** Спека ленты по ключу её контейнера («hand:p1» → зона «hand»), не-лента — null. */
export function stripOf(spec: Pick<BoardSpec, "zones">, slot: string): ZoneSpec | null {
  const zone = spec.zones.find((z) => z.id === zoneOf(slot));
  return zone?.layout.kind === "strip" ? zone : null;
}

/** БЛОКИРУЕТ ли лента интеракцию с этим слотом: ЧУЖОЙ экземпляр при access ≠ open. Дефолт open —
 *  дроп и взятие у чужих лент ВКЛЮЧЕНЫ (владелец сам запирает или ставит request). request до
 *  прихода флоу подтверждения ведёт себя как locked. Своего экземпляра не касается. */
export function stripBlocked(spec: Pick<BoardSpec, "zones">, slot: string, selfSeat: string): boolean {
  const zone = stripOf(spec, slot);
  return !!zone && slotOf(slot) !== selfSeat && (zone.access ?? "open") !== "open";
}

/** Чужая лента-на-борде: та же полноценная полоса, УЖАТАЯ (стол не раздувается от игроков). */
export const STRIP_FOREIGN_SCALE = 0.7;
/** Мини-визави у аватара (владелец держит зону в HUD): мелко, но детально. */
export const STRIP_MINI_SCALE = 0.42;

/** Масштаб ЖИТЕЛЯ в слоте относительно своего номинала: чужая лента ужимает (на борде) или
 *  минимизирует (мини-визави при HUD владельца); свои и не-ленты — 1. ЕДИНЫЙ источник масштаба
 *  лент: геометрия band (stripBand) и рендер нод (nodesStore) обязаны совпадать. */
export function stripScale(spec: Pick<BoardSpec, "zones" | "hud">, slot: string, selfSeat: string): number {
  const zone = stripOf(spec, slot);
  if (!zone || slotOf(slot) === selfSeat) return 1;
  return zoneOnBoard(spec, zone.id) ? STRIP_FOREIGN_SCALE : STRIP_MINI_SCALE;
}

/** Направление вдоль края: док лежит ВДОЛЬ своего края экрана, а не поперёк. */
export function flowAlong(side: HudSide): HandFlow {
  return side === "left" || side === "right" ? "vertical" : "horizontal";
}

/** Разобрать ZoneSpec ленты в конфиг с дефолтами приватности и адаптива. */
export function stripConfig(zone: ZoneSpec): StripConfig {
  const cell = zone.cell ?? CARD;
  return {
    reorder: zone.reorder === "none" ? null : zone.reorder ?? "insert",
    flow: zone.flow ?? null,
    size: zone.cell ? { cell: zone.cell } : { fit: zone.fit ?? 5 },
    cell,
    hidden: zone.hidden ?? true,
    access: zone.access ?? "open",
    atSeat: zone.atSeat ?? "below",
    preview: zone.preview ?? true,
  };
}
