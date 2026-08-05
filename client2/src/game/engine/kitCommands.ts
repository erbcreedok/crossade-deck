// ПОРТ КОМАНД ВИТРИНЫ — единственное место, где команда управления доской (engine/command.ts)
// превращается в действие над элементом. Витрина обязана дёргать ИМЕННО его: иначе раздел
// «Управление» показывал бы обход двери, а не саму дверь.
//
// Логика тут вся про «что значит команда», поэтому она вынута из сцены и проверяется отдельно.

import type { SceneElement } from "./sceneEngine";
import type { Command } from "./command";
import type { AnimPreset } from "../anim/presets";

export interface CommandDeps {
  element(id: string): SceneElement | undefined;
  homeOf(el: SceneElement): { home: { x: number; y: number }; depth: number } | null;
  setHome(el: SceneElement, home: { x: number; y: number }, depth: number): void;
  preset(): AnimPreset;
  wake(): void;
}

/** Исполнить команду. false — адресата нет или он отказал (переворот запрещён), и будить нечего. */
export function applyCommand(cmd: Command, deps: CommandDeps): boolean {
  const el = deps.element(cmd.id);
  if (!el) return false;
  switch (cmd.t) {
    case "flip":
      if ("requestFlip" in el && !(el as unknown as { requestFlip(): boolean }).requestFlip()) return false;
      break;
    case "move": {
      // Дом переезжает ВМЕСТЕ с предметом: «переместить» на столе значит «теперь он живёт здесь».
      // Пока дом оставался прежним, любой дроп в слот доски отыгрывался назад — зона честно
      // раскладывала фигуры командой move, а `resolveDrop` следом звал `release()`, и тот тянул
      // фигуру на СТАРЫЙ дом. Со стороны это выглядело как «дроп не работает».
      const h = deps.homeOf(el);
      if (h) deps.setHome(el, { x: cmd.x, y: cmd.y }, h.depth);
      // Через СТИЛЬ, а не setTarget: «как элемент летит» — свойство фила, и решать это должен пресет,
      // а не место вызова. spring отдаёт движение пружинам, то есть прежнее поведение.
      const own = (el as unknown as { animPreset?: AnimPreset }).animPreset ?? deps.preset();
      el.body.travelTo({ x: cmd.x, y: cmd.y }, own.move.style, deps.preset().speed);
      break;
    }
    case "conceal":
      if ("setConcealed" in el) (el as unknown as { setConcealed(v: boolean): void }).setConcealed(cmd.v);
      break;
    case "setValue":
      if ("setValue" in el) (el as unknown as { setValue(v: string): void }).setValue(cmd.value);
      break;
  }
  deps.wake();
  return true;
}
