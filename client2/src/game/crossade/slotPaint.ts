import type { Graphics } from "pixi.js";
import type { Size, Vec } from "../slot/types";

// Контуры слотов доски Crossade — тот же язык, что у Косынки (solitaire/slotPaint.ts): покой
// (слот просто размечен), armed (эта зона примет текущий груз) и hot (груз прямо над ней).
// Рисуем колоду/сброс/play-кучки ВСЕГДА (свой контур в покое); места игроков — ТОЛЬКО armed/hot
// (в покое место — просто текст, см. syncSeats в scene.ts, контур появляется только пока дилер
// тащит верхнюю карту колоды, см. CROSSADE-DESIGN.md этап 5). Два прохода одним Graphics: у мест
// своя ячейка (SEAT), у остальных — своя (CARD), а paintSlots красит любой набор id/cell разом —
// clear:false у второго прохода, чтобы не стереть первый.

const REST = 0x6d8570;
const ARMED = 0x8fa39a;
const HOT = 0xf2c14e;

export interface SlotPaintState {
  origins: Readonly<Record<string, Vec>>;
  /** Какие слоты рисовать (deck/discard/play:N/play:new/seat:ID) — выбирает сцена по id. */
  ids: readonly string[];
  cell: Size;
  /** Зоны, готовые принять текущий груз (подсветка «куда можно»). */
  armed: ReadonlySet<string>;
  /** Зона прямо под грузом. */
  hot: string | null;
  /** false — не звать g.clear() (второй проход поверх уже нарисованного, см. заголовок файла). */
  clear?: boolean;
}

export function paintSlots(g: Graphics, s: SlotPaintState): void {
  if (s.clear !== false) g.clear();
  const radius = Math.min(10, s.cell.w * 0.12);
  for (const id of s.ids) {
    const at = s.origins[id];
    if (!at) continue;
    const isHot = id === s.hot;
    const isArmed = s.armed.has(id);
    if (isHot) g.roundRect(at.x, at.y, s.cell.w, s.cell.h, radius).fill({ color: HOT, alpha: 0.18 });
    g.roundRect(at.x, at.y, s.cell.w, s.cell.h, radius).stroke({
      width: isHot ? 3 : 2,
      color: isHot ? HOT : isArmed ? ARMED : REST,
      alpha: isHot ? 1 : isArmed ? 0.9 : 0.45,
    });
  }
}

/**
 * Статичные подписи зон — «что здесь» в покое. Только колода и сброс: это ИМЕНОВАННЫЕ места на
 * столе (форма перенесена из макета — client/…zoneLabels.ts, что зона «называется» в покое), а
 * play-кучки самоочевидны из своей сетки и нумерации, подписывать их поштучно незачем.
 */
export const ZONE_LABELS: Readonly<Record<string, string>> = {
  deck: "колода",
  discard: "сброс",
};
