// ДЕВ-ХУКИ КОСЫНКИ — ЭКРАННАЯ геометрия доски для e2e и ручной проверки. Канвас не отдаёт ни
// DOM-узлов, ни ролей, поэтому без них «проверено» означает «посмотрел на картинку» — а ровно так уже
// прошёл незамеченным неработающий драг (§6 хендоффа). Тот же приём, что `__fd` у песочницы.

import type { Card } from "../ui/Card";
import { CARD, CASCADE_STEP, type SolitaireTree } from "./tree";

export interface SolitaireHooks {
  slots: Record<string, { x: number; y: number; w: number; h: number }>;
  cards: Record<string, { x: number; y: number; faceUp: boolean; scale: number; rot: number; state: string }>;
  topbar: Record<string, { x: number; y: number; w: number; h: number }>;
  screen: { visible: boolean; buttons: Record<string, { x: number; y: number; w: number; h: number }> };
  /** ЭКРАННЫЙ размер нарисованной карты — считается от её baseScale, а не от ячейки доски: только так
   *  тест ловит baseScale=1, при котором карта втрое вылезала из слота. */
  cardSize: { w: number; h: number } | null;
  /** ЭКРАННЫЙ шаг каскада колонки: на столько выступает нижняя карта из-под верхней. Тесту он нужен,
   *  чтобы целиться в ВИДИМУЮ полоску карты — центр в каскаде перекрыт следующей. */
  cascadeStep: number;
  zoom: number;
}

export function solitaireHooks(
  tree: SolitaireTree,
  nodes: ReadonlyMap<string, Card>,
  chrome: Pick<SolitaireHooks, "topbar" | "screen">,
  zoom: number,
  toScreen: (x: number, y: number) => { x: number; y: number },
): SolitaireHooks {
  const slots: SolitaireHooks["slots"] = {};
  for (const [id, at] of Object.entries(tree.origins)) {
    const tl = toScreen(at.x, at.y);
    slots[id] = { x: tl.x, y: tl.y, w: CARD.w * zoom, h: CARD.h * zoom };
  }
  const cards: SolitaireHooks["cards"] = {};
  for (const [id, node] of nodes) {
    const p = toScreen(node.body.px, node.body.py);
    // scaleVal — «подъём» плана (покой 1, драг больше): по нему тест отличает живой драг с пружиной
    // от статичного перетаскивания, которым был первый заход.
    cards[id] = { x: p.x, y: p.y, faceUp: node.faceUp, scale: node.body.scaleVal, rot: node.body.rotation, state: node.state };
  }
  const sample = nodes.values().next().value as Card | undefined;
  return {
    slots,
    cards,
    cardSize: sample ? { w: sample.width * zoom, h: sample.height * zoom } : null,
    cascadeStep: CASCADE_STEP * zoom,
    ...chrome,
    zoom,
  };
}
