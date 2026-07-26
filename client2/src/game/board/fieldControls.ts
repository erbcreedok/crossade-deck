import type { Container } from "pixi.js";
import type { Button } from "../ui/Button";
import { Stepper } from "../ui/Stepper";
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

/** Насадить контроллеры под гридом (в ряд от точки at). Возвращает нижний край. */
export function attachFieldControls(field: Field, host: FieldControlsHost, at: { x: number; y: number }): number {
  let x = at.x;
  let h = 0;
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
    h = Math.max(h, s.h);
  }
  return at.y + h;
}
