// ТРАЕКТОРИИ ПАЛЬЦЕВ ДЛЯ ИСТОРИИ. Пока человек несёт карту или стопку, он шлёт, над чем она (`CarryOut`), и сервер пересылает это остальным потоком, а на диск поток не попадает:
// версий и снимка у него нет. Чтобы историю можно было смотреть «как тащил», рекордер собирает поток одного жеста и по его концу отдаёт СЖАТЫЙ путь: в местах, где палец шёл
// ровно, лишние точки выбрасываются (Дуглас–Пекер по сукну), остаются начало, конец, изломы и смены цели (рука, стопка).
//
// Чистая логика: время приходит снаружи, ничего не знает ни про диск, ни про сеть.

import type { Where } from "./contract.js";

export interface PathPoint {
  /** Миллисекунды от начала жеста. */
  dt: number;
  over: Where;
}
export interface PathOut {
  by: string;
  id: string;
  /** Когда начался жест. */
  t0: number;
  pts: PathPoint[];
}

/** Допуск сжатия на сукне, единицы стола: короче — точку выбрасываем. */
export const PATH_EPS = 0.08;
/** Жест короче этого (мс) или без движения — не событие. */
export const PATH_MIN_MS = 250;
/** Сколько жест может молчать, прежде чем его считают оконченным (стопка бесхозного стула не отпускается операцией). */
export const PATH_IDLE_MS = 3000;
/** Жест не длиннее этого — дальше точки не копятся (защита памяти). */
export const PATH_MAX_POINTS = 4000;

const onFelt = (o: Where): o is Extract<Where, { in: "felt" }> => o.in === "felt";
const same = (a: Where, b: Where): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Дуглас–Пекер по (x, y) на куске подряд идущих точек сукна; индексы оставленных. */
function rdp(pts: readonly { x: number; y: number }[], eps: number): number[] {
  const keep = new Set<number>([0, pts.length - 1]);
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1, best = eps;
    const A = pts[a]!, B = pts[b]!, dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i]!.x - A.x) - dx * (pts[i]!.y - A.y)) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far >= 0) { keep.add(far); stack.push([a, far], [far, b]); }
  }
  return [...keep].sort((p, q) => p - q);
}

/** Сжать путь: куски по сукну — Дугласом–Пекером; смены цели вне сукна не трогаем. */
export function simplify(pts: readonly PathPoint[], eps: number = PATH_EPS): PathPoint[] {
  const out: PathPoint[] = [];
  let i = 0;
  while (i < pts.length) {
    const p = pts[i]!;
    if (!onFelt(p.over)) { out.push(p); i++; continue; }
    let j = i;
    while (j + 1 < pts.length && onFelt(pts[j + 1]!.over)) j++;
    const run = pts.slice(i, j + 1), xy = run.map((q) => ({ x: (q.over as { x: number }).x, y: (q.over as { y: number }).y }));
    for (const k of rdp(xy, eps)) out.push(run[k]!);
    i = j + 1;
  }
  return out;
}

interface Live {
  by: string;
  t0: number;
  last: number;
  pts: PathPoint[];
}

export class PathRecorder {
  private live = new Map<string, Live>();

  /** Палец сообщил, над чем `id` сейчас. */
  feed(by: string, id: string, over: Where, now: number): void {
    let g = this.live.get(id);
    if (g && g.by !== by) { g = undefined; this.live.delete(id); }
    if (!g) { g = { by, t0: now, last: now, pts: [] }; this.live.set(id, g); }
    g.last = now;
    const prev = g.pts.at(-1);
    if (prev && same(prev.over, over)) return;
    if (g.pts.length < PATH_MAX_POINTS) g.pts.push({ dt: now - g.t0, over });
  }

  /** Жест окончен (карту положили, стопку отпустили). `null` — это был не жест. */
  end(id: string): PathOut | null {
    const g = this.live.get(id);
    if (!g) return null;
    this.live.delete(id);
    const last = g.pts.at(-1);
    if (g.pts.length < 2 || !last || last.dt < PATH_MIN_MS) return null;
    return { by: g.by, id, t0: g.t0, pts: simplify(g.pts) };
  }

  /** Жесты, от которых давно ничего не приходило: считаем оконченными. */
  stale(now: number): PathOut[] {
    const out: PathOut[] = [];
    for (const [id, g] of [...this.live]) {
      if (now - g.last < PATH_IDLE_MS) continue;
      const one = this.end(id);
      if (one) out.push(one);
    }
    return out;
  }

  /** Всё, что ещё в воздухе, — окончить (комната закрывается). */
  all(): PathOut[] {
    return [...this.live.keys()].map((id) => this.end(id)).filter((one): one is PathOut => one !== null);
  }
}
