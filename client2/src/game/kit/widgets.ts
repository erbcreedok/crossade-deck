import { Graphics } from "pixi.js";
import { BLOCK_PAD } from "../engine/sandboxLayout";
import type { Configurable } from "../ui/controls";
import type { ControlsResult, Pt, SectionContext, SectionSize } from "./context";

// Витрина канвасных виджетов параметров: Toggle / Stepper / Segmented.
//
// Смысл секции — доказать, что это ПЕРЕИСПОЛЬЗУЕМЫЕ атомы UI-kit, а не «прикрутили только к Полю и
// бордам». Поэтому состояние тут нарочно тривиальное и своё: виджеты строятся из обычного
// Configurable, ровно как у настоящих объектов, но ни с каким объектом не связаны.
//
// Рамка рисуется в УЖЕ добавленный Graphics: её размер известен только после attachControls
// (Stepper/Toggle/Segmented сами решают свою ширину), а порядок в слое — до. Пустой узел, в который
// дорисовали позже, решает обе задачи разом и не требует вставки по индексу.

/** Тривиальное состояние витрины. Хозяин держит его между пересборками, если хочет. */
export interface WidgetDemoState {
  flag: boolean;
  level: number;
  mode: number;
}

export function makeWidgetDemoState(): WidgetDemoState {
  return { flag: false, level: 3, mode: 0 };
}

/** Configurable витрины — три параметра, по одному на каждый вид виджета. */
export function widgetDemoConfig(state: WidgetDemoState): Configurable {
  return {
    params: () => [
      { kind: "bool", id: "flag", label: "флаг", get: () => state.flag, set: (v) => (state.flag = v) },
      { kind: "number", id: "level", label: "уровень", min: 0, max: 10, get: () => state.level, set: (v) => (state.level = v) },
      { kind: "choice", id: "mode", label: "режим", options: ["a", "b", "c"], get: () => state.mode, set: (v) => (state.mode = v) },
    ],
  };
}

const CAPTION = "виджеты контролов (Toggle / Stepper / Segmented)";

export function widgetsSection(ctx: SectionContext, at: Pt, state: WidgetDemoState): SectionSize & { controls: ControlsResult } {
  const pad = BLOCK_PAD;
  const frame = new Graphics();
  ctx.decor(frame); // сперва в слой (чтобы лечь ПОД содержимым), рисуем — ниже, по факту размера
  const cap = ctx.label(CAPTION, at.x + pad, at.y + pad, 13, 0xcdb98f, undefined, 0);
  const contentTop = at.y + pad + cap.height + 12;
  const rc = ctx.controls(widgetDemoConfig(state), { x: at.x + pad, y: contentTop });
  const width = Math.max(cap.width, rc.steppers[0]?.w ?? 0, rc.toggles[0]?.w ?? 0, rc.segments[0]?.w ?? 0) + pad * 2;
  const height = rc.bottom - at.y + pad;
  frame.roundRect(at.x, at.y, width, height, 12).fill({ color: 0x000000, alpha: 0.1 }).stroke({ width: 1, color: 0x4a5b50 });
  return { bottom: at.y + height, width, controls: rc };
}
