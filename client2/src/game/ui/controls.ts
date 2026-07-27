import type { Container } from "pixi.js";
import type { Button } from "./Button";
import { Stepper } from "./Stepper";
import { Toggle } from "./Toggle";
import { Segmented } from "./Segmented";

// ГЕНЕРИК-КОНТРОЛЛЕРЫ: компонент ДЕКЛАРИРУЕТ свои настраиваемые параметры как данные (params()),
// адаптер рендерит по kind (number → Stepper, bool → Toggle, choice → Segmented) — без спец-кейсов
// на каждый параметр. Добавить параметр = добавить строчку в params(); добавить тип параметра =
// новый вариант Param. Любой Configurable (Поле, стопка, борд…) получает контроллеры даром.

export type Param =
  | { kind: "number"; label: string; min: number; max: number; format?: (v: number) => string; get(): number; set(v: number): void }
  | { kind: "bool"; label: string; get(): boolean; set(v: boolean): void }
  | { kind: "choice"; label: string; options: string[]; get(): number; set(v: number): void };

export interface Configurable {
  params(): Param[];
}

type NumberParam = Extract<Param, { kind: "number" }>;
type BoolParam = Extract<Param, { kind: "bool" }>;
type ChoiceParam = Extract<Param, { kind: "choice" }>;

/** Чистый диспетч params() по kind (без Pixi) — attachControls вызывает это, а не решает сама,
 *  какой виджет куда класть. Тестируется изолированно (environment: node — этот файл создаёт
 *  Pixi-объекты только НИЖЕ, в attachControls, где юнит-тестов по конвенции проекта нет). */
export function groupParams(params: Param[]): { numbers: NumberParam[]; bools: BoolParam[]; choices: ChoiceParam[] } {
  return {
    numbers: params.filter((p): p is NumberParam => p.kind === "number"),
    bools: params.filter((p): p is BoolParam => p.kind === "bool"),
    choices: params.filter((p): p is ChoiceParam => p.kind === "choice"),
  };
}

// Движковые услуги: куда класть root'ы, чем регистрировать ввод кнопок, что делать после изменения.
export interface ControlsHost {
  layer: Container;
  register(b: Button): void;
  onChange(): void; // переразложить/перерисовать после правки любого параметра
}

/** Насадить контроллеры из cfg.params(): числа — рядом в строку, булевы — строкой ниже, выбор
 *  из вариантов (choice) — ещё строкой ниже. Возвращает нижний край и созданные тоглеры/сегменты
 *  (движку — для e2e-хука состояния/позиции). */
export function attachControls(cfg: Configurable, host: ControlsHost, at: { x: number; y: number }): { bottom: number; toggles: Toggle[]; segments: Segmented[]; steppers: Stepper[] } {
  const { numbers, bools, choices } = groupParams(cfg.params());
  const toggles: Toggle[] = [];
  const segments: Segmented[] = [];
  const steppers: Stepper[] = [];

  // Строка чисел.
  let x = at.x;
  let rowH = 0;
  for (const p of numbers) {
    const s = new Stepper({ label: p.label, value: p.get(), min: p.min, max: p.max, format: p.format, onChange: (v) => (p.set(v), host.onChange()) });
    s.place(x, at.y);
    host.layer.addChild(s.root);
    for (const b of s.buttons()) host.register(b);
    steppers.push(s);
    x += s.w + 28;
    rowH = Math.max(rowH, s.h);
  }
  let bottom = rowH ? at.y + rowH : at.y;

  // Строка булевых (ниже).
  let bx = at.x;
  let bh = 0;
  const by = bottom + (rowH ? 10 : 0);
  for (const p of bools) {
    const t = new Toggle({ label: p.label, value: p.get(), onChange: (v) => (p.set(v), host.onChange()) });
    t.place(bx, by);
    host.layer.addChild(t.root);
    for (const b of t.buttons()) host.register(b);
    toggles.push(t);
    bx += t.w + 28;
    bh = Math.max(bh, t.h);
  }
  if (bh) bottom = by + bh;

  // Строка выбора из вариантов (ещё ниже) — Segmented, по одному параметру на строку (варианты
  // сами по себе широкие, в отличие от чисел/булевых их не жмём в общий ряд).
  let cy = bottom + (bh || rowH ? 10 : 0);
  for (const p of choices) {
    const seg = new Segmented({ label: p.label, options: p.options, value: p.get(), onChange: (v) => (p.set(v), host.onChange()) });
    seg.place(at.x, cy);
    host.layer.addChild(seg.root);
    for (const b of seg.buttons()) host.register(b);
    segments.push(seg);
    cy += seg.h + 10;
  }
  if (segments.length) bottom = cy - 10;

  return { bottom, toggles, segments, steppers };
}
