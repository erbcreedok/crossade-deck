// ТЯНУТЬ СТОПКУ ЗА ЯЗЫЧОК — один жест и для игры (худ), и для дизайн-страниц, где худа нет. Тянешь: стопка и язычок под пальцем, как несомая карта; отпустил — в руку, в другую стопку
// (они сливаются) или на сукно. Тап — подсказка стопки (решает худ), двойной тап — перевернуть. `lifted` — стопку подняли не тягой за язычок, а долгим удержанием: она уже в руке.
//
// Что худ хранит у себя (какая стопка сейчас в руке, какая подсказка открыта, перерисовка), приходит через `PileDragHooks`; всё остальное — ходы стола и сцена — здесь.

import type { TableStore } from "../../server/table-client/store.js";
import type { SceneApi } from "./scene.js";

/** Как часто продлевать замок несомой стопки (мс): не реже `LOCK_TTL_MS` стола. */
const HOLD_MS = 1500;
const DOUBLE_TAP_MS = 350;
const TAP_PX = 8;

export interface PileDragHooks {
  /** Взяли стопку в руку (потянули или подняли удержанием). */
  start?(pile: string): void;
  /** Эта стопка всё ещё в руке (худ мог отдать руку другому делу). Нет хука — всегда да. */
  current?(pile: string): boolean;
  /** Стопку отпустили. */
  end?(pile: string): void;
  /** Тап по язычку (не двойной). */
  tap?(pile: string): void;
  redraw?(): void;
}

export type PileDragStart = (pile: string, e: PointerEvent, opts?: { lifted?: boolean }) => void;

export function mountPileDrag(scene: SceneApi, store: TableStore, hooks: PileDragHooks, myAngle: () => number): PileDragStart {
  let lastGripTap = 0;
  const faceMe = (): number => ((-(myAngle() % 360) % 360) + 360) % 360;
  /** Взяли стопку — она сразу поворачивается лицом ко мне (как ляжет при отпускании): событием стола, поэтому у всех на экранах разом. Зону-круг не трогаем. */
  function turnPileToMe(pile: string): void {
    const pl = store.state.piles.find((x) => x.id === pile);
    if (!pl || pl.zone || pl.pin) return;
    store.send({ t: "deckMove", pile, x: pl.x, y: pl.y, angle: faceMe() });
  }
  function follow(e: PointerEvent, move: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void): void {
    const m = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) move(ev); };
    const u = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; removeEventListener("pointermove", m); removeEventListener("pointerup", u); removeEventListener("pointercancel", u); up(ev); };
    addEventListener("pointermove", m);
    addEventListener("pointerup", u);
    addEventListener("pointercancel", u);
  }
  return (pile, e, opts) => {
    e.preventDefault();
    scene.grabPile(pile, { x: e.clientX, y: e.clientY });
    const pinned = !!store.state.piles.find((x) => x.id === pile)?.pin;
    // ПРАВИЛА СТОПКИ: двигать нельзя — стопка остаётся на месте и «отказывает» один раз, когда её потянули.
    const barred: "grip" | "move" | null = scene.pileBarred(pile, "grip") ? "grip" : scene.pileBarred(pile, "move") ? "move" : null;
    const mine = (): boolean => hooks.current?.(pile) ?? true;
    let moved = false, hold = 0, refused = false;
    const begin = (): void => {
      moved = true;
      hooks.start?.(pile);
      store.send({ t: "grip", pile });
      turnPileToMe(pile);
      hold = window.setInterval(() => { if (mine()) store.send({ t: "hold", id: pile }); else clearInterval(hold); }, HOLD_MS);
    };
    if (opts?.lifted && !pinned && !barred) { begin(); scene.carryPile(pile, { x: e.clientX, y: e.clientY }); hooks.redraw?.(); }
    follow(e, (ev) => {
      if (pinned) return;
      if (barred) { if (!refused && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) >= TAP_PX) { refused = true; scene.denyPile(pile, barred); } return; }
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < TAP_PX) return;
      if (!moved) begin();
      if (moved && !mine()) return;
      scene.carryPile(pile, { x: ev.clientX, y: ev.clientY });
      hooks.redraw?.();
    }, (ev) => {
      clearInterval(hold);
      if (moved && !mine()) return;
      if (!moved) {
        const now = performance.now();
        if (now - lastGripTap < DOUBLE_TAP_MS) {
          lastGripTap = 0;
          const p = store.state.piles.find((x) => x.id === pile);
          if (p && !p.lock) { if (scene.pileBarred(pile, "flip")) scene.denyPile(pile, "flip"); else store.send({ t: "deckDo", pile, how: "flip" }); }
        } else { lastGripTap = now; hooks.tap?.(pile); }
        hooks.redraw?.();
        return;
      }
      hooks.end?.(pile);
      store.send({ t: "release", id: pile });
      const a = scene.aim(ev.clientX, ev.clientY, pile);
      if (a.in === "hand" || a.in === "deck") store.send({ t: "pileDrop", pile, to: a });
      else { const at = scene.pileAt(pile) ?? a; store.send({ t: "deckMove", pile, x: at.x, y: at.y, angle: faceMe() }); }
      scene.carryPile(pile, null);
      hooks.redraw?.();
    });
  };
}
