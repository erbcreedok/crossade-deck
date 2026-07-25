import type { ShadowShape } from "../ui/Card";

// Тень-ЭЛЛИПС у ОСНОВАНИЯ элемента (фишка лежит — тень под ней; фигура стоит — овал под ножкой),
// а не карточный прямоугольник. Правило высоты то же: подъём (elev) отодвигает тень вниз-влево и
// чуть растит; РАЗМЕР от полуосей ПОКОЯ (rx/ry). Чистая функция — тестируется без Pixi.
export interface PieceShadowInput {
  px: number;
  py: number;
  rx: number; // полуось эллипса тени по X в покое
  ry: number; // полуось по Y (у стоящей фигуры сильно меньше rx — плоский овал)
  baseDy: number; // насколько ниже центра лежит тень (у основания фигуры)
  elev: number; // «высота над столом»: scaleVal-1 (+добавки); 0 в покое
  shakeX?: number;
}

export function pieceSilhouette(i: PieceShadowInput): ShadowShape {
  const elev = Math.max(0, i.elev);
  const grow = 1 + elev * 0.28;
  const reach = i.ry * 2; // характерный масштаб смещения
  return {
    x: i.px + (i.shakeX ?? 0) - reach * elev * 0.25, // свет справа → тень левее с подъёмом
    y: i.py + i.baseDy + reach * elev * 0.9, // и ниже
    hw: i.rx * grow,
    hh: i.ry * grow,
    rot: 0,
    round: true,
  };
}
