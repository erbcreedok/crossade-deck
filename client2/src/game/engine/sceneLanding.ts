// ПОСАДКА — коллаборатор SceneEngine: кто летит домой и на какую ГЛУБИНУ сядет по прилёту.
// Глубина возвращается НЕ сразу, а по факту приземления: иначе отпущенная карта весь полёт домой
// ехала бы ПОД соседями — ныряла под стопку и выныривала на месте. Физически это бессмыслица:
// карта в воздухе, а рисуется под теми, что лежат на столе.

import type { SceneElement } from "./sceneEngine";

export class LandingQueue {
  private landing: { el: SceneElement; z: number }[] = [];

  /** Элемент полетел домой: сядет на глубину z по прилёту (повторная заявка заменяет прежнюю). */
  book(el: SceneElement, z: number): void {
    this.landing = this.landing.filter((l) => l.el !== el);
    this.landing.push({ el, z });
  }

  /** Разбор в кадре: прилетевшим — их глубина. Кадров сама по себе не требует (двигают пружины). */
  step(): void {
    if (!this.landing.length) return;
    const still: { el: SceneElement; z: number }[] = [];
    for (const l of this.landing) {
      if (l.el.dead) continue;
      if (l.el.body.isResting()) l.el.root.zIndex = l.z;
      else still.push(l);
    }
    this.landing = still;
  }
}
