// Резолвер DropTarget при перекрытии (EC1 из GRID-DESIGN.md). ДЕФОЛТНАЯ иерархия; целиком
// заменяема хуком BoardPolicy.resolveDrop. Чистая функция — тестируется без Pixi.
//
// Правило: из целей, что накрыли точку И принимают груз (accepts=false = ПРОЗРАЧНОСТЬ, цель
// выпадает), берём первую по: priority (desc) → вложенность depth (глубже=специфичнее) → z (desc).

export interface DropCandidate<P> {
  id: string;
  contains: (x: number, y: number) => boolean; // накрыла ли точку (bounds)
  accepts: (payload: P) => boolean; // берёт ли этот груз (иначе прозрачна)
  depth: number; // вложенность: стопка(2) > слот(1) > борд(0)
  priority?: number; // явный override/тайбрейк (дефолт 0)
  z?: number; // z-index, тайбрейк при равных priority+depth (дефолт 0)
}

export function resolveDrop<P>(candidates: readonly DropCandidate<P>[], x: number, y: number, payload: P): DropCandidate<P> | null {
  const hit = candidates.filter((cnd) => cnd.contains(x, y) && cnd.accepts(payload));
  if (hit.length === 0) return null;
  return hit.reduce((best, cur) => (better(cur, best) ? cur : best));
}

// Лексикографическое сравнение: priority → depth → z (всё «больше = лучше»). Числами, не строками.
function better<P>(a: DropCandidate<P>, b: DropCandidate<P>): boolean {
  if ((a.priority ?? 0) !== (b.priority ?? 0)) return (a.priority ?? 0) > (b.priority ?? 0);
  if (a.depth !== b.depth) return a.depth > b.depth;
  return (a.z ?? 0) > (b.z ?? 0);
}
