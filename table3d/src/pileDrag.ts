// ТАП ПО ЯЗЫЧКУ СТОПКИ — подсказка стопки (решает худ). Само «взять стопку и нести» делает сцена тем же движком, что несёт карту (`startPileDrag` в `scene.ts`): сюда доходит
// только касание, после которого палец не сдвинулся. Переворот стопки — не тап: те же жесты, что у карты (в руке — F и второй палец, на столе — меню и правая кнопка).

import type { TableStore } from "../../server/table-client/store.js";
import type { SceneApi } from "./scene.js";

export interface PileTapHooks {
  /** Тап по язычку. */
  tap?(pile: string): void;
  redraw?(): void;
}

export function mountPileTap(_scene: SceneApi, _store: TableStore, hooks: PileTapHooks): (pile: string, e: PointerEvent) => void {
  return (pile) => {
    hooks.tap?.(pile);
    hooks.redraw?.();
  };
}
