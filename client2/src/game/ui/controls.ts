import type { Container } from "pixi.js";
import type { Button } from "./Button";
import { Stepper } from "./Stepper";
import { Toggle } from "./Toggle";

// ГЕНЕРИК-КОНТРОЛЛЕРЫ: компонент ДЕКЛАРИРУЕТ свои настраиваемые параметры как данные (params()),
// адаптер рендерит по kind (number → Stepper, bool → Toggle) — без спец-кейсов на каждый параметр.
// Добавить параметр = добавить строчку в params(); добавить тип параметра = новый вариант Param.
// Любой Configurable (Поле, стопка, борд…) получает контроллеры даром.

export type Param =
  | { kind: "number"; label: string; min: number; max: number; get(): number; set(v: number): void }
  | { kind: "bool"; label: string; get(): boolean; set(v: boolean): void };

export interface Configurable {
  params(): Param[];
}

// Движковые услуги: куда класть root'ы, чем регистрировать ввод кнопок, что делать после изменения.
export interface ControlsHost {
  layer: Container;
  register(b: Button): void;
  onChange(): void; // переразложить/перерисовать после правки любого параметра
}

/** Насадить контроллеры из cfg.params(): числа — рядом в строку, булевы — строкой ниже.
 *  Возвращает нижний край и созданные тоглеры (движку — для e2e-хука состояния/позиции). */
export function attachControls(cfg: Configurable, host: ControlsHost, at: { x: number; y: number }): { bottom: number; toggles: Toggle[] } {
  const params = cfg.params();
  const toggles: Toggle[] = [];

  // Строка чисел.
  let x = at.x;
  let rowH = 0;
  for (const p of params) {
    if (p.kind !== "number") continue;
    const s = new Stepper({ label: p.label, value: p.get(), min: p.min, max: p.max, onChange: (v) => (p.set(v), host.onChange()) });
    s.place(x, at.y);
    host.layer.addChild(s.root);
    for (const b of s.buttons()) host.register(b);
    x += s.w + 28;
    rowH = Math.max(rowH, s.h);
  }
  let bottom = rowH ? at.y + rowH : at.y;

  // Строка булевых (ниже).
  const bx0 = at.x;
  let bx = bx0;
  let bh = 0;
  const by = bottom + (rowH ? 10 : 0);
  for (const p of params) {
    if (p.kind !== "bool") continue;
    const t = new Toggle({ label: p.label, value: p.get(), onChange: (v) => (p.set(v), host.onChange()) });
    t.place(bx, by);
    host.layer.addChild(t.root);
    for (const b of t.buttons()) host.register(b);
    toggles.push(t);
    bx += t.w + 28;
    bh = Math.max(bh, t.h);
  }
  if (bh) bottom = by + bh;

  return { bottom, toggles };
}
