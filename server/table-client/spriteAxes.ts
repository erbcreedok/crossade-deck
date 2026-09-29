// ОСИ И РАЗМЕР СПРАЙТА — для страницы спрайта на странице хозяина.
//
// Оси: куда у ФИГУРЫ перед, верх и право — в осях картинки (x — вправо по картинке, y — вниз, z — к зрителю), по тому,
// какой стороной фигура нарисована. Договорённость — как у слоя тел (`skins.ts`, `VIEW_DIRS`): «лицо» — камера перед
// фигурой, «правый бок» — камера справа от неё; «верх» — сверху, верх картинки — затылок; «низ» — снизу, верх
// картинки — лицо. Без стороны — как «лицо».
//
// Размер: сколько картинка занимает за столом в единицах стола, если встанет своей деталью (`bodyView.ts`: голова 2.4,
// туловище 5.2 в ширину, ноги 3.4 × 3.8; кисть 1.3). Высота — по сторонам картинки.

export type V3 = readonly [number, number, number];
export interface Axes {
  front: V3;
  up: V3;
  right: V3;
}

const X: V3 = [1, 0, 0], NX: V3 = [-1, 0, 0], UP: V3 = [0, -1, 0], DOWN: V3 = [0, 1, 0], TO: V3 = [0, 0, 1], AWAY: V3 = [0, 0, -1];

const AXES: Record<string, Axes> = {
  front: { front: TO, up: UP, right: NX },
  back: { front: AWAY, up: UP, right: X },
  right: { front: X, up: UP, right: TO },
  left: { front: NX, up: UP, right: AWAY },
  top: { front: DOWN, up: TO, right: NX },
  bottom: { front: UP, up: AWAY, right: NX },
};

export const axesFor = (side: string | null): Axes => AXES[side ?? "front"] ?? AXES.front!;

/** Ширина в единицах стола по детали; `null` — у детали «другое» своего размера нет. */
export const UNIT_WIDTH: Record<string, number | null> = { head: 2.4, hair: 2.52, body: 5.2, legs: 3.4, hands: 1.3, other: null };

/** Размер картинки за столом: ширина по детали (× величина правки), высота — по её сторонам. */
export function unitSize(slot: string, aspect: number, scale = 1): { w: number; h: number } | null {
  const w = UNIT_WIDTH[slot];
  if (!w || !(aspect > 0)) return null;
  const width = w * scale;
  return { w: width, h: slot === "legs" ? 3.8 * scale : width * aspect };
}
