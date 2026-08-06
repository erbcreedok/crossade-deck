// ЛИЦОМ ИЛИ РУБАШКОЙ лежит житель В ЭТОМ СЛОТЕ — чистое правило отображения, а не поле состояния.
//
// Оно структурное: рубашкой лежат колода (её номинал не виден никому, пока карта её не покинула),
// свободная стопка (карты, брошенные на борду, — та же колода, просто врассыпную) и ЧУЖИЕ ленты
// с hidden (приватность — фильтр порта, сцена лишь отражает). Всё остальное — лицом.
//
// Не-карте вопрос не задаётся: у фишки и фигуры нет сторон, и «рубашка» для них — ничто.

import { baseZoneId, slotOf, zoneOf, type ElementDef, type ZoneSpec } from "./spec";

export interface FaceUpQuery {
  def: ElementDef | undefined;
  zones: readonly ZoneSpec[];
  slot: string;
  /** Место зрителя: свой экземпляр ленты — всегда лицом владельцу. */
  selfSeat: string;
}

export function faceUpInSlot({ def, zones, slot, selfSeat }: FaceUpQuery): boolean {
  if (def?.kind !== "card") return true;
  const zs = zones.find((z) => z.id === baseZoneId(zoneOf(slot)));
  if (zs?.layout.kind === "strip") {
    // Чужая лента: приватность (hidden, дефолт true), если не открыта конфигом.
    return slotOf(slot) === selfSeat || (zs.hidden ?? true) === false;
  }
  return !((zs?.layout.kind === "pile" && zs.id === "deck") || zs?.layout.kind === "free");
}
