// СБОРКА ВЛАДЕЛЬЦЕВ ВИТРИНЫ (фабрика частей): вся DI-проводка швов движка — здесь, сцена лишь
// получает готовый набор. Тот же рецепт, что у борды (boards/scene/parts.ts).
//
// Цикл «раздвиг ↔ драг» (спред обязан отпустить карты пачки, которую тащат целиком, а знает об этом
// драг) развязан ленивым замыканием: лямбда зовётся после полной сборки.

import type { SceneApi } from "./sceneContract";
import { KitDecor, KitPlaced } from "./kitPlaced";
import { KitSpread } from "./kitSpread";
import { KitDrag } from "./kitDrag";

export interface KitParts {
  placed: KitPlaced;
  decor: KitDecor;
  spread: KitSpread;
  drag: KitDrag;
}

export function buildKitParts(api: SceneApi): KitParts {
  const placed = new KitPlaced(api);
  const decor = new KitDecor();
  const drag = new KitDrag({
    element: (id) => api.byId.get(id),
    grabMode: () => api.grabMode(),
    dragCtx: () => api.dragCtx(),
    setDrag: (d) => api.setDrag(d),
    defaultCanDrag: (el) => api.defaultCanDrag(el),
    defaultBeginDrag: (el, cp, sp) => api.defaultBeginDrag(el, cp, sp),
  });
  const spread = new KitSpread({
    element: (id) => api.byId.get(id),
    wake: () => api.wake(),
    drag: () => api.drag(),
    stackDragIds: (leadId) => drag.stackDragIds(leadId),
    depthOf: (id) => placed.depthOf(id),
  });
  return { placed, decor, spread, drag };
}

/**
 * Снос СОДЕРЖИМОГО (не приложения): сначала свои узлы и реестры, потом слои сцены, потом общее
 * состояние ввода/драга/зон движка. Повторяет путь PlaygroundEngine.clearContent — второй путь сноса
 * тут заводить нельзя, разъедется с базовым и утечёт узлами.
 */
export function clearParts(api: SceneApi, parts: KitParts): void {
  parts.placed.clear();
  parts.decor.clear();
  parts.spread.clear();
  parts.drag.clear();
  api.clearMarkers();
  api.layers().surface.removeChildren().forEach((c) => c.destroy());
  api.layers().verb.removeChildren().forEach((c) => c.destroy());
  const cs = api.contentSize();
  api.layers().clearCards(cs.w, cs.h);
  api.resetSceneState();
}
