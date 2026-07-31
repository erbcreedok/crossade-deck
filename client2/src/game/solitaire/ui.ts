import { Application, Container } from "pixi.js";
import type { SolitaireGameState } from "../board/solitaireState";
import {
  calculateFanPositions,
  getSolitaireLayout,
  LAYOUT_PROFILES,
  selectProfile,
  type SlotGeometry,
} from "../board/solitaireLayout";
import { TEX_H } from "../engine/constants";
import { Card } from "../ui/Card";
import { CardTextureCache } from "../ui/CardTextureCache";

// Слой UI пасьянса: чистая раскладка карт внутри слота (issue #95) + монтирование/обновление
// Pixi-сцены поверх неё (issue #96). computeSlotCardLayout остаётся чистой функцией без побочных
// эффектов — юнит-тестируется в node (ui.test.ts); mountSolitaireBoard/updateBoardVisuals трогают
// Pixi и тестируются только tsc+build+ручным смоуком (Pixi не исполняется в vitest/node).

/** Позиция (относительно geom.x/geom.y) для каждой из `count` карт слота — по типу раскладки. */
export function computeSlotCardLayout(
  geom: SlotGeometry,
  count: number
): Array<{ x: number; y: number; rotation: number }> {
  if (count === 0) return [];

  switch (geom.layout) {
    case "stack": {
      const dx = geom.cardOffset?.x ?? 2;
      const dy = geom.cardOffset?.y ?? 2;
      return Array.from({ length: count }, (_, i) => ({ x: dx * i, y: dy * i, rotation: 0 }));
    }
    case "single":
      // Видна только верхняя карта — нижние прячутся ровно под ней, без смещения.
      return Array.from({ length: count }, () => ({ x: 0, y: 0, rotation: 0 }));
    case "fan":
      return calculateFanPositions(0, 0, count, geom);
  }
}

// ——— Pixi-слой (issue #96) ———

export interface SolitaireUIState {
  boardContainer: Container;
  slotContainers: Record<string, Container>;
  cardNodes: Map<string, Card>; // cardId -> визуальная карта
  slotGeometries: Record<string, SlotGeometry>;
  // Не входят в исходную спеку #96, но необходимы Card по его реальному конструктору
  // (Card(opts, tex: CardTextureCache, baseScale)) — держим их тут, а не воссоздаём на каждый
  // updateBoardVisuals, иначе текстуры карт перепекались бы на каждый апдейт.
  tex: CardTextureCache;
  baseScale: number;
}

/** Собрать корневой контейнер доски пасьянса и по контейнеру на каждый слот, по текущему viewport. */
export function mountSolitaireBoard(
  app: Application,
  state: SolitaireGameState,
  viewport: { width: number; height: number }
): SolitaireUIState {
  const profile = selectProfile(viewport.width, viewport.height);
  const slotGeometries = getSolitaireLayout(viewport.width, viewport.height, profile);

  const boardContainer = new Container();
  app.stage.addChild(boardContainer);

  const slotContainers: Record<string, Container> = {};
  for (const [slotId, geom] of Object.entries(slotGeometries)) {
    const slotContainer = new Container();
    slotContainer.position.set(geom.x, geom.y);
    boardContainer.addChild(slotContainer);
    slotContainers[slotId] = slotContainer;
  }

  const ui: SolitaireUIState = {
    boardContainer,
    slotContainers,
    cardNodes: new Map(),
    slotGeometries,
    tex: new CardTextureCache(app),
    // Карта печатается в текстуру фиксированного размера (TEX_W×TEX_H = 160×228), а слот меряется
    // в пикселях профиля (mobile 60×85). baseScale — переходник между этими двумя мерами, и он
    // ОБЯЗАН считаться от профиля: при baseScale=1 карта вылезала бы из слота почти втрое.
    baseScale: LAYOUT_PROFILES[profile].cardSize.h / TEX_H,
  };
  updateBoardVisuals(ui, state);
  return ui;
}

/** Синхронизировать визуал со state.board.slots: создать/переиспользовать карты, расставить их
 *  по computeSlotCardLayout, снять те, которых на доске больше нет. faceUp закрытых карт (сток,
 *  закопанные в tableau) идёт рубашкой — берём из state.faceUp через реальный опшн Card.faceUp. */
export function updateBoardVisuals(ui: SolitaireUIState, state: SolitaireGameState): void {
  const seen = new Set<string>();

  for (const [slotId, geom] of Object.entries(ui.slotGeometries)) {
    const slotContainer = ui.slotContainers[slotId];
    if (!slotContainer) continue; // слот из старой раскладки, которого больше нет — пропускаем
    const members = state.board.slots[slotId]?.members ?? [];
    const positions = computeSlotCardLayout(geom, members.length);

    members.forEach((cardId, i) => {
      seen.add(cardId);
      const pos = positions[i]!;
      const faceUp = state.faceUp[cardId] === true;
      let node = ui.cardNodes.get(cardId);
      if (!node) {
        node = new Card({ id: cardId, card: cardId, faceUp }, ui.tex, ui.baseScale);
        ui.cardNodes.set(cardId, node);
      } else if (node.faceUp !== faceUp) {
        // Карта уже открыта/закрыта на движке (флип домой/в столбец) — просто перерисовываем
        // без анимации переворота: анимировать флип — забота более высокого уровня (движка).
        node.faceUp = faceUp;
      }
      if (node.root.parent !== slotContainer) slotContainer.addChild(node.root);
      node.body.snapTo({ x: pos.x, y: pos.y, rot: pos.rotation, scale: node.restScale });
      node.sync(); // применить body.px/py/rotation к root.position без ожидания тика тикера
    });
  }

  // Убираем визуальные узлы карт, которых больше нет на доске (ушли в другой слот/состояние
  // сброшено) — reparent выше уже перенёс оставшиеся, эти просто снести.
  for (const [cardId, node] of ui.cardNodes) {
    if (!seen.has(cardId)) {
      node.destroy();
      ui.cardNodes.delete(cardId);
    }
  }
}
