import { cardColor, rankOf } from "../slotfield/cardFace";

// Правила пасьянса (Клондайк) как ЧИСТЫЕ ДАННЫЕ/функции — rules as data. Дисплей/движок их лишь
// зовут. Туз здесь НИЗКИЙ (A=1): и фундамент (A→K вверх), и «стол» (K→A вниз) идут от туза.
export function suitOf(face: string): string {
  return face.slice(-1);
}

// Ранг для пасьянса: A=1 (в отличие от rankOf, где A=14 для сорта «по номиналу»).
export function srank(face: string): number {
  const r = rankOf(face);
  return r === 14 ? 1 : r;
}

/** «Стол» (tableau): на пусто — только король; иначе на 1 НИЖЕ рангом и ДРУГОГО цвета. */
export function tableauAccepts(fig: string, top: string | null): boolean {
  if (top === null) return srank(fig) === 13; // пусто — только K
  return srank(fig) === srank(top) - 1 && cardColor(fig) !== cardColor(top);
}

/** Фундамент (foundation): на пусто — только туз; иначе та же масть и на 1 ВЫШЕ рангом. */
export function foundationAccepts(fig: string, top: string | null): boolean {
  if (top === null) return srank(fig) === 1; // пусто — только A
  return suitOf(fig) === suitOf(top) && srank(fig) === srank(top) + 1;
}
