import type { ShadowShape } from "../ui/Card";

// Силуэт тени ПРОИЗВОЛЬНОГО элемента (фишка, фигура) — обобщение shadowSilhouette карты на любой
// футпринт (полуразмеры покоя), без привязки к размеру карточной текстуры. Правило то же: свет
// сверху справа → тень уходит вниз-влево; РАЗМЕР тени от размера ПОКОЯ (halfW/halfH), а высота
// (elev) лишь отодвигает и чуть растит её. Чистая функция — тестируется без Pixi.
export interface PieceShadowInput {
  px: number;
  py: number;
  halfW: number; // полуширина ПОКОЯ (без раздувания драгом)
  halfH: number; // полувысота покоя
  elev: number; // «высота над столом»: scaleVal-1 (+добавки); 0 в покое
  rotation: number;
}

export function pieceSilhouette(i: PieceShadowInput): ShadowShape {
  const elev = Math.max(0, i.elev);
  const drop = i.halfH * 2; // характерный размер — высота элемента
  const grow = 1.04 + elev * 0.35;
  return {
    x: i.px - drop * (0.03 + elev * 0.32),
    y: i.py + drop * (0.04 + elev * 0.85),
    hw: i.halfW * grow,
    hh: i.halfH * grow,
    rot: i.rotation,
  };
}
