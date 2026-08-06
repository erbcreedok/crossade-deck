// ПРЕЗЕНТАЦИЯ ЗОНЫ В ДОКЕ — какой видом зона ЛЮБОГО layout-kind швартуется в области HUD (чистая
// функция). Лента (strip) — ряд/сетка со вставкой (как была); pile — СТОПКА (колода в HUD: взять
// верхнюю, дроп сверху, без реордера). Остальные виды пока живут только на борде — validateHud
// не ругается (зона просто без виджета), а dockFor честно вернёт null через эту же функцию.
//
// Ключ контейнера: perSeat-лента — свой экземпляр («hand:p1»), общая зона — её единственный
// слот («deck:0»): дроп в док и взятие из него ходят ТОЙ ЖЕ дверью (move), что и на борде.

import { slotKey, type ZoneSpec } from "../core/spec";
import { STRIP_CELL, stripConfig, stripKey, type StripConfig } from "./config";

/** Конфиг дока зоны: всё от ленты + режим стопки. */
export interface DockConfig extends StripConfig {
  stack: boolean;
}

/** Как зона выглядит в доке; null — этот layout-kind в HUD пока не швартуется. */
export function zoneDockConfig(zone: ZoneSpec): DockConfig | null {
  if (zone.layout.kind === "strip") return { ...stripConfig(zone), stack: false };
  if (zone.layout.kind === "pile") {
    const cell = zone.cell ?? STRIP_CELL;
    return {
      reorder: null, // стопку не переставляют пальцем — только верхняя карта
      flow: null,
      size: zone.cell ? { cell } : { fit: 5 },
      cell,
      hidden: zone.hidden ?? true,
      access: zone.access ?? "open",
      atSeat: zone.atSeat ?? "below",
      preview: false, // гэпов у стопки нет
      stack: true,
    };
  }
  return null;
}

/** Ключ контейнера зоны в доке: лента — экземпляр зрителя, общая зона — её слот 0. */
export function dockSlotKey(zone: ZoneSpec, selfSeat: string): string {
  return zone.layout.kind === "strip" ? stripKey(zone.id, selfSeat) : slotKey(zone.id, 0);
}
