// ЛИЦОМ ИЛИ РУБАШКОЙ лежит житель В ЭТОМ СЛОТЕ — чистое правило отображения, а не поле состояния.
//
// Оно структурное: рубашкой лежат колода (её номинал не виден никому, пока карта её не покинула),
// свободная стопка (карты, брошенные на борду, — та же колода, просто врассыпную) и чужие руки
// (приватность). Всё остальное — лицом.
//
// Не-карте вопрос не задаётся: у фишки и фигуры нет сторон, и «рубашка» для них — ничто.

import { baseZoneId, zoneOf, type ElementDef, type ZoneSpec } from "./spec";

export interface FaceUpQuery {
  def: ElementDef | undefined;
  zones: readonly ZoneSpec[];
  slot: string;
}

export function faceUpInSlot({ def, zones, slot }: FaceUpQuery): boolean {
  if (def?.kind !== "card") return true;
  const zone = zoneOf(slot);
  if (zone === "seat") return false; // чужая рука: приватность
  const zs = zones.find((z) => z.id === baseZoneId(zone));
  return !((zs?.layout.kind === "pile" && zs.id === "deck") || zs?.layout.kind === "free");
}
