import type { Graphics } from "pixi.js";
import type { Size, Vec } from "../slot/types";

// Контуры слотов доски — «здесь может лежать карта» и «сюда сейчас можно положить». Отдельный
// модуль по той же причине, что fieldPaint у Поля: геометрия и правила живут в дереве слотов
// (tree.ts), а черчение — здесь; смешивать их в сцене значит снова растить движок-простыню.
//
// Три состояния — тот же язык, что у общей DropZone (ui/DropZone.ts): покой (слот просто
// размечен), armed (идёт драг, и ЭТА зона груз примет) и hot (груз прямо над ней). Без armed
// игрок не видит, куда вообще ходить, — на это владелец и жаловался в первом заходе.

const REST = 0x6d8570;
const ARMED = 0x8fa39a;
const HOT = 0xf2c14e;

export interface SlotPaintState {
  origins: Readonly<Record<string, Vec>>;
  cell: Size;
  /** Зоны, готовые принять текущий груз (подсветка «куда можно»). */
  armed: ReadonlySet<string>;
  /** Зона прямо под грузом. */
  hot: string | null;
}

export function paintSlots(g: Graphics, s: SlotPaintState): void {
  g.clear();
  const radius = Math.min(10, s.cell.w * 0.12);
  for (const [id, at] of Object.entries(s.origins)) {
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
