// Реордер своей руки — ЧИСТАЯ функция, вынесена из scene.ts#reorderHand ровно затем, чтобы
// покрыть юнитом без Pixi (см. CROSSADE-DESIGN.md этап 5). Индекс вставки уже даёт дерево слотов
// (dropTarget → group.layout.indexAt, см. slot/layouts.ts#linear — та же раскладка, что рисует
// ряд руки, значит индекс ВСЕГДА согласован с тем, что игрок видит под пальцем): здесь только сама
// перестановка массива по этому индексу, никакой геометрии заново не считаем.
export function handOrderAfterDrop(hand: readonly string[], draggedId: string, toIndex: number): string[] {
  const from = hand.indexOf(draggedId);
  if (from < 0) return [...hand]; // тащили не карту этой руки — состав не трогаем
  const next = [...hand];
  const [card] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, card!);
  return next;
}
