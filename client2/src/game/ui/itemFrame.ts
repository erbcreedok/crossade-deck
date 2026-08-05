import { bobOffset, idleBobs, screenLift, zFromScale } from "./elevation";
import type { TableItem } from "./tableItem";

// ОБЩАЯ ЧАСТЬ КАДРА — одна на все виды предмета: дыхание (экранное покачивание), «стоп»-дрожь,
// ВЫСОТА (поза покоя + подъём полёта + заданный z) и постановка root в точку. Рендеры видов
// (cardKind/pieceKinds) добирают своё: спин флипа, текстуры, форму тени.

export interface ItemFrame {
  bob: number; // экранное дыхание; в `z` не идёт — иначе тень дышала бы размером
  shakeX: number; // «стоп»-покачивание при блоке драга
  z: number; // высота над столом — единственное, от чего зависит поведение тени
}

/** Посчитать кадр и поставить root (позиция/поворот). Масштаб ставит рендер вида (спин/срез). */
export function placeItem(it: TableItem, h: number, reach: number, shakeAmp: number): ItemFrame {
  let bob = 0;
  if (!it.idleFrozen && (idleBobs(it.state, it.idle) || it.peekBob)) {
    bob = bobOffset(Math.sin(it.life.age * it.life.preset.idle.speed + it.bobPhase), it.life.preset.idle.amp, h);
  }
  const shakeX = it.life.shakeX(reach, shakeAmp);
  // Высота — один источник: поза покоя (масштаб) плюс подъём полёта (пиксели → доли высоты, чтобы
  // `z` везде значил одно и то же) плюс zBase. Двигать предмет по экрану «чтобы выглядел выше» в
  // обход `z` нельзя: одно событие, описанное дважды, разойдётся.
  const z = zFromScale(it.body.scaleVal) + it.body.liftPx / Math.max(1, h) + it.zBase;
  it.root.position.set(it.body.px + shakeX, it.body.py + screenLift(z, h) + bob);
  it.root.rotation = it.body.rotation;
  return { bob, shakeX, z };
}
