import { Graphics } from "pixi.js";
import { COLORS, TEX_H, TEX_W } from "./constants";

// Контур-атом для mark=outline/both (SELECTION-DESIGN §4.A). Акцентная рамка вокруг ВЫБРАННОЙ карты.
// Рисуется в ЛОКАЛЬНЫХ координатах текстуры (центр 0,0, как baseSprite карты со скруглением 16),
// поэтому добавляется в root карты и едет/масштабируется/вращается ВМЕСТЕ с ней — без пер-кадровой
// синхронизации. Создаётся на выбор, уничтожается на снятие (refreshSel). hint — тусклее и тоньше.

export interface SelectOutlineOpts {
  w?: number; // локальная ширина рамки (по умолчанию TEX_W)
  h?: number; // локальная высота рамки (по умолчанию TEX_H)
  width?: number; // толщина обводки
  alpha?: number; // прозрачность (для подсказки — тусклее)
}

export function makeSelectOutline(opts: SelectOutlineOpts = {}): Graphics {
  const w = opts.w ?? TEX_W;
  const h = opts.h ?? TEX_H;
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, 16).stroke({ width: opts.width ?? 6, color: COLORS.dealerBorder, alpha: opts.alpha ?? 1 });
  return g;
}
