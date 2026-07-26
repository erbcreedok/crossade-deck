// Value-хелперы карты по её лицу (ранг/масть/цвет). Общий низкоуровневый модуль — им пользуются и
// пресеты, и правила игр, без циклов импорта.

export const cardColor = (face: string): "red" | "black" => (face.endsWith("♥") || face.endsWith("♦") ? "red" : "black");

// Ранг по лицу (для сорта «по номиналу»): 6..10 / J=11 / Q=12 / K=13 / A=14.
export function rankOf(face: string): number {
  const r = face.slice(0, -1); // без масти
  const named = ({ J: 11, Q: 12, K: 13, A: 14 } as Record<string, number>)[r];
  if (named !== undefined) return named;
  const n = Number(r);
  return Number.isNaN(n) ? 0 : n;
}
