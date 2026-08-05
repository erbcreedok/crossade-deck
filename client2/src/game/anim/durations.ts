// ДЛИТЕЛЬНОСТИ АНИМАЦИЙ — чистая формула «сколько играет анимация по стилю пресета»:
// расписание стиля × множитель × скорость. Одна дверь на все виды — расходиться им незачем.

import { appearStyle } from "./appearStyles";
import { destroyStyle } from "./destroyStyles";
import { moveStyle } from "./moveStyles";
import type { AnimPreset } from "./presets";

export type AnimKind = "move" | "destroy" | "appear" | "flip";

export function animDurationOf(p: AnimPreset, kind: AnimKind): number {
  const speed = p.speed > 0 ? p.speed : 1;
  if (kind === "move") {
    const st = moveStyle(p.move.style);
    // У пружины расписания нет — время задаёт физика; берём оценку, иначе сценарий сработал бы
    // мгновенно и снял бы жертву до прихода.
    return st.frame ? st.dur / speed : 0.45;
  }
  if (kind === "destroy") return (destroyStyle(p.destroy.style).dur * p.destroy.scale) / speed;
  if (kind === "appear") return (appearStyle(p.appear.style).dur * p.appear.scale) / speed;
  // У переворота расписание живёт в ТАЙМИНГЕ пресета, а не в стиле: стиль решает форму движения.
  return p.flip.dur / speed;
}
