// ТАП ПО ЯЗЫЧКУ СТОПКИ — подсказка стопки (решает худ), двойной тап — перевернуть. Само «взять стопку и нести» делает сцена тем же движком, что несёт карту (`startPileDrag` в `scene.ts`):
// сюда доходит только касание, после которого палец не сдвинулся.

import type { TableStore } from "../../server/table-client/store.js";
import type { SceneApi } from "./scene.js";

const DOUBLE_TAP_MS = 350;

export interface PileTapHooks {
  /** Тап по язычку (не двойной). */
  tap?(pile: string): void;
  redraw?(): void;
}

export function mountPileTap(scene: SceneApi, store: TableStore, hooks: PileTapHooks): (pile: string, e: PointerEvent) => void {
  let lastTap = 0;
  return (pile) => {
    const now = performance.now();
    if (now - lastTap < DOUBLE_TAP_MS) {
      lastTap = 0;
      const p = store.state.piles.find((x) => x.id === pile);
      if (p && !p.lock) { if (scene.pileBarred(pile, "flip")) scene.denyPile(pile, "flip"); else store.send({ t: "deckDo", pile, how: "flip" }); }
    } else { lastTap = now; hooks.tap?.(pile); }
    hooks.redraw?.();
  };
}
