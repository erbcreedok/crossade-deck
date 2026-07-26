import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT, TEX_H, TEX_W } from "./engine/constants";
import { FINGER_PATH, FINGER_VIEWBOX, symbolCanvasSvg } from "./symbols";

// Общий источник «лица скрытой карты» (без фона) — «?» в углах + крупный фак по центру. Используют и
// CPU-витрина (censorDemo), и GPU-варианты (engine/censorGpu). Держим в одном месте, чтобы не дублировать.

export const AMBER = 0xe8a200;

// Нарисовать фак-«масть» (SVG-силуэт, свой холст 124×171) в контейнер: центр (cx,cy), высота sizePx.
export function drawFinger(root: Container, cx: number, cy: number, sizePx: number, flip = false): void {
  const g = new Graphics();
  g.svg(symbolCanvasSvg(FINGER_PATH, AMBER));
  g.pivot.set(FINGER_VIEWBOX.w / 2, FINGER_VIEWBOX.h / 2);
  g.scale.set(sizePx / FINGER_VIEWBOX.h);
  g.position.set(cx, cy);
  if (flip) g.rotation = Math.PI;
  root.addChild(g);
}

// Контент лица (амбер на прозрачном): «?» в углах + крупный фак по центру. Координаты в TEX_W×TEX_H.
export function buildContent(): Container {
  const content = new Container();
  const makeCorner = (): Container => {
    const c = new Container();
    const r = new Text({ text: "?", style: { fontFamily: PIXEL_FONT, fontSize: 40, fill: AMBER } });
    r.anchor.set(0.5);
    r.position.set(0, -12);
    c.addChild(r);
    drawFinger(c, 0, 20, 22);
    return c;
  };
  const tl = makeCorner();
  tl.position.set(28, 42);
  content.addChild(tl);
  const br = makeCorner();
  br.position.set(TEX_W - 28, TEX_H - 42);
  br.rotation = Math.PI;
  content.addChild(br);
  drawFinger(content, TEX_W / 2, TEX_H / 2 + 6, 118);
  return content;
}
