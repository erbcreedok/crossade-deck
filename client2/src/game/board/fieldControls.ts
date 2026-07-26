import type { Container } from "pixi.js";
import type { Button } from "../ui/Button";
import { Stepper } from "../ui/Stepper";
import { Toggle } from "../ui/Toggle";
import type { Field } from "./field";

// ПРОКЛАДКА: насаживает контроллеры (Stepper) на ЖИВЫЕ параметры грида Поля (minCols/maxRows) и после
// каждого изменения переразлагает грид. Отдельная сущность — связка «контроллер ↔ параметр поля»:
// Stepper ничего про Поле не знает, Field ничего про UI не знает, склейка живёт здесь.
// Движковые услуги (куда класть, чем регистрировать ввод, как переразложить) приходят через host.
export interface FieldControlsHost {
  layer: Container; // слой для root'ов контроллеров
  register(b: Button): void; // подключить кнопку к вводу движка
  relayout(field: Field): void; // переразложить карты + перерисовать после смены параметра
}

// Какие параметры Поля выводим наружу как контроллеры. Каждый — читатель/писатель живого поля.
interface ParamSpec {
  label: string;
  min: number;
  max: number;
  get(f: Field): number;
  set(f: Field, v: number): void;
}
const PARAMS: ParamSpec[] = [
  { label: "мин колонок", min: 1, max: 8, get: (f) => f.minCols, set: (f, v) => (f.minCols = v) },
  { label: "макс строк", min: 1, max: 8, get: (f) => f.maxRows ?? 6, set: (f, v) => (f.maxRows = v) },
];

/** Насадить контроллеры под гридом: ряд степперов (minCols/maxRows) + ниже тоглер реордера.
 *  Возвращает нижний край и сам тоглер (движку — для e2e-хука состояния/позиции). */
export function attachFieldControls(field: Field, host: FieldControlsHost, at: { x: number; y: number }): { bottom: number; reorder: Toggle } {
  let x = at.x;
  let rowH = 0;
  for (const p of PARAMS) {
    const s = new Stepper({
      label: p.label,
      value: p.get(field),
      min: p.min,
      max: p.max,
      onChange: (v) => {
        p.set(field, v);
        host.relayout(field);
      },
    });
    s.place(x, at.y);
    host.layer.addChild(s.root);
    for (const b of s.buttons()) host.register(b);
    x += s.w + 28;
    rowH = Math.max(rowH, s.h);
  }

  // Ниже — тоглер перестановки карт в гриде. Меняет живой флаг field.reorder; перелайаут не нужен.
  const reorder = new Toggle({
    label: "реордер в гриде",
    value: field.reorder,
    onChange: (v) => (field.reorder = v),
  });
  const toggleY = at.y + rowH + 10;
  reorder.place(at.x, toggleY);
  host.layer.addChild(reorder.root);
  for (const b of reorder.buttons()) host.register(b);

  return { bottom: toggleY + reorder.h, reorder };
}
