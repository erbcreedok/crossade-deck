// ПЕРЕСТАНОВКА РУКИ — одно правило для сервера и клиента: клиент считает новый порядок у себя и сразу его
// показывает, сервер считает тем же кодом, и ответ совпадает с тем, что уже нарисовано.

import type { Arrange, Face } from "./contract.js";

/** Порядок мастей и номиналов: как в колоде, джокеры — в конце. */
const SUIT_ORDER = ["s", "h", "d", "c", "r", "b"];
const RANK_ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "JK"];

/**
 * Новый порядок руки для «по масти», «по номиналу» и «реверс». По масти — внутри масти по номиналу, по
 * номиналу — внутри номинала по масти. Шафл здесь не считается: его порядок присылает тот, кто мешает.
 * `null` — лица какой-то карты не знаем, посчитать нечем.
 */
export function arranged(ids: readonly string[], how: Exclude<Arrange, "shuffle">, faceOf: (id: string) => Face | undefined): string[] | null {
  if (how === "reverse") return [...ids].reverse();
  const faces = ids.map(faceOf);
  if (faces.some((f) => !f)) return null;
  const suit = (i: number) => SUIT_ORDER.indexOf(faces[i]!.suit);
  const rank = (i: number) => RANK_ORDER.indexOf(faces[i]!.rank);
  const key = how === "suit" ? (i: number) => [suit(i), rank(i)] : (i: number) => [rank(i), suit(i)];
  return ids
    .map((id, i) => ({ id, k: key(i), i }))
    .sort((a, b) => a.k[0]! - b.k[0]! || a.k[1]! - b.k[1]! || a.i - b.i)
    .map((one) => one.id);
}

/** Перемешать — у того, кто мешает. */
export function shuffled(ids: readonly string[], random: () => number = Math.random): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Те же карты, в другом порядке. */
export function samePack(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");
}
