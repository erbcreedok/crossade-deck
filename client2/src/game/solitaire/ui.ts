import { Application, Container, Graphics } from "pixi.js";
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
  /** Полразмера карты. Карта позиционируется ЦЕНТРОМ, а слот задан прямоугольником от левого
   *  верхнего угла — без этого перевода все карты стояли ровно на полкарты выше и левее своей
   *  зоны, и дроп попадал не в тот слот. */
  half: { w: number; h: number };
  /** Габарит всей доски в координатах сцены — по нему камера считает вписывание и границы пана. */
  content: { w: number; h: number };
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
    // Контур пустого слота кладём ПЕРВЫМ ребёнком, чтобы карты ложились поверх него. Без него
    // доска читалась как «карты в пустоте»: четыре пустых фундамента и разобранная колонка
    // просто исчезали с глаз, и было не видно, куда вообще можно ходить.
    slotContainer.addChild(slotPlaceholder(geom.w, cardH(profile)));
    boardContainer.addChild(slotContainer);
    slotContainers[slotId] = slotContainer;
  }

  const ui: SolitaireUIState = {
    boardContainer,
    slotContainers,
    cardNodes: new Map(),
    slotGeometries,
    tex: new CardTextureCache(app),
    half: { w: LAYOUT_PROFILES[profile].cardSize.w / 2, h: cardH(profile) / 2 },
    content: contentSize(slotGeometries),
    // Карта печатается в текстуру фиксированного размера (TEX_W×TEX_H = 160×228), а слот меряется
    // в пикселях профиля (mobile 60×85). baseScale — переходник между этими двумя мерами, и он
    // ОБЯЗАН считаться от профиля: при baseScale=1 карта вылезала бы из слота почти втрое.
    baseScale: LAYOUT_PROFILES[profile].cardSize.h / TEX_H,
  };
  updateBoardVisuals(ui, state, true); // монтирование — карты сразу на местах, без прилёта
  return ui;
}

const cardH = (profile: "mobile" | "tablet" | "desktop"): number => LAYOUT_PROFILES[profile].cardSize.h;

/** Габарит доски = самый правый и самый нижний край среди слотов (плюс поле справа/снизу). */
function contentSize(geoms: Record<string, SlotGeometry>): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const g of Object.values(geoms)) {
    w = Math.max(w, g.x + g.w);
    h = Math.max(h, g.y + g.h);
  }
  return { w, h };
}

/** Контур пустого слота — «здесь может лежать карта». Рисуем скруглённой рамкой в тон стола. */
function slotPlaceholder(w: number, h: number): Graphics {
  return new Graphics().roundRect(0, 0, w, h, Math.min(10, w * 0.12)).stroke({ width: 2, color: 0x6d8570, alpha: 0.45 });
}

/** Синхронизировать визуал со state.board.slots: создать/переиспользовать карты, расставить их
 *  по computeSlotCardLayout, снять те, которых на доске больше нет. faceUp закрытых карт (сток,
 *  закопанные в tableau) идёт рубашкой — берём из state.faceUp через реальный опшн Card.faceUp.
 *
 *  `snap` — телепортировать вместо пружины. true нужен на монтировании и ресайзе (карты обязаны
 *  сразу оказаться на местах), false — на ходах: карта должна ДОЛЕТАТЬ до цели пружиной CardBody,
 *  как всё остальное в проекте. Раньше здесь всегда стоял snapTo, и ходы выглядели телепортом. */
export function updateBoardVisuals(ui: SolitaireUIState, state: SolitaireGameState, snap = false): void {
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
      let fresh = false;
      if (!node) {
        node = new Card({ id: cardId, card: cardId, faceUp, flippable: true }, ui.tex, ui.baseScale);
        ui.cardNodes.set(cardId, node);
        fresh = true;
      } else if (node.faceUp !== faceUp) {
        // Переворот — через requestFlip(), а НЕ присваиванием node.faceUp. Присваивание меняло
        // только поле: текстуру кладёт приватный paint(), который зовётся из шага анимации, и
        // карта продолжала лежать рубашкой при faceUp===true. Так «не открывалась» карта под
        // снятой верхней в колонке и карта, ушедшая в сброс. Заодно получаем нормальный переворот
        // вместо мгновенной подмены картинки.
        node.requestFlip();
      }
      if (node.root.parent !== slotContainer) {
        // Перенос между слотами меняет систему координат: чтобы карта полетела пружиной ОТТУДА,
        // где она сейчас видна, а не прыгнула, переводим её текущую позицию в координаты нового
        // родителя до смены цели.
        if (!fresh && !snap) {
          const global = node.root.getGlobalPosition();
          const local = slotContainer.toLocal(global);
          node.body.snapTo({ x: local.x, y: local.y });
        }
        slotContainer.addChild(node.root);
      }
      // pos — смещение от угла слота, а карта позиционируется ЦЕНТРОМ: добавляем полкарты.
      const targets = { x: pos.x + ui.half.w, y: pos.y + ui.half.h, rot: pos.rotation, scale: node.restScale };
      if (snap || fresh) node.body.snapTo(targets);
      else node.body.setTarget(targets);
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
