// КАДР СЦЕНЫ — модуль движка: шаг всего живого (ввод/камера/элементы/кнопки/зоны/показы),
// рендер со слитыми тенями, возврат домой и переворот пачки. Функции над движком (данные — в
// SceneEngine), порядок шагов — контракт: посадка ПОСЛЕ шага элементов (см. комментарий ниже).

import { flipSchedule } from "../anim/flipSchedule";
import type { AnimPreset } from "../anim/presets";
import { shadowCasters } from "./sceneLayers";
import type { Pt, ZoneReg } from "./sceneContract";
import { itemRect, pickDropZone, type DropRect } from "./dropPick";
import type { SceneElement, SceneEngine } from "./sceneEngine";

/** Перевернуть, если элемент это умеет. Способность, а не тип: фишка не Flippable — не перевернётся. */
export function requestFlipOf(el: SceneElement): void {
  (el as unknown as { requestFlip?: () => boolean }).requestFlip?.();
}

/** Вернуть ЛЮБОЙ элемент домой — той же пружиной, что и обычный релиз. Глубина вернётся ПО
 *  ПРИЛЁТУ (sceneLanding): иначе карта весь полёт домой ныряла бы ПОД соседей. */
export function releaseElement(e: SceneEngine, el: SceneElement): void {
  const h = e.seams.homeOf(el);
  if (!h) return;
  el.setState(el.pose); // возврат в СВОЮ позу покоя (стол / поднят / держат)
  e.placeCard(el);
  el.body.setTarget({ x: h.home.x, y: h.home.y, rot: 0 });
  e.landing.book(el, h.depth);
}

/** Перевернуть ПАЧКУ: кто когда переворачивается и чей дом занимает — решает РАСПИСАНИЕ
 *  (anim/flipSchedule, чистая функция), здесь только исполнение. Дом переезжает СРАЗУ, флип может
 *  быть отложен — карта успевает доехать, пока дойдёт волна (иначе две анимации вместо одной). */
export function flipGroup(e: SceneEngine, els: readonly SceneElement[]): void {
  const homes = els.map((el) => e.seams.homeOf(el));
  if (homes.some((h) => !h)) return; // чужая пачка — лучше ничего, чем половина
  // Фил — у САМОЙ пачки, если он у неё свой: колода и сброс живут рядом, но ведут себя по-разному.
  const own = (els[0] as unknown as { animPreset?: AnimPreset }).animPreset;
  const plan = flipSchedule(els.map((el) => el.id), own ?? e.preset);
  plan.forEach((stepPlan, i) => {
    const dest = homes[stepPlan.toIndex]!;
    e.seams.setHome(els[i]!, dest.home, dest.depth);
    e.flipQueue.push(els[i]!, stepPlan.delay);
  });
  e.wake();
}

/** Прямоугольник ТАЩИМОЙ фигуры (представитель груза, видимый размер). null — драга нет. */
export function dragItemRect(e: SceneEngine): DropRect | null {
  const lead = e.drag?.lead;
  if (!lead) return null;
  const f = (lead as { footprint?: { hw: number; hh: number } }).footprint;
  const s = lead.body.scaleVal;
  return itemRect(lead.body.px, lead.body.py, (f?.hw ?? 0) * s, (f?.hh ?? 0) * s);
}

/** Зона-цель под грузом: попадание считает ФИГУРА (нахлёст), палец решает ничьи (dropPick).
 *  Кандидаты — только зоны, СПОСОБНЫЕ на действие груза. */
export function dropZoneUnder(e: SceneEngine, p: Pt): ZoneReg | null {
  if (!e.drag) return null;
  const cands = e.zones.filter((z) => z.accepts(e.drag!));
  const rect = dragItemRect(e) ?? itemRect(p.x, p.y, 0, 0);
  const i = pickDropZone(cands.map((z) => z.zone.rect), rect, p);
  return i >= 0 ? cands[i]! : null;
}

/** Подсветка hot-зоны под грузом: горит ОДНА — та, куда реально упадёт дроп прямо сейчас. */
export function refreshZoneHot(e: SceneEngine, p: Pt): void {
  const target = dropZoneUnder(e, p);
  for (const z of e.zones) {
    const eligible = e.drag !== null && z.accepts(e.drag);
    z.zone.setHot(z === target, eligible && z.textFor ? z.textFor(e.drag!).hot : undefined);
  }
}

/** Шаг кадра. Вернуть «что-то ещё движется» (иначе тикер уснёт). */
export function stepFrame(e: SceneEngine, dt: number): boolean {
  e.input.tick(dt); // «держи-чтобы-тащить»: копит heldFor, сама решает, когда повысить press → drag
  e.camera.edgeScroll(dt);
  const camMoving = e.camera.stepTween(dt); // наведение камеры на зону: не спим, пока не доедет
  if (e.viewport.flinging) {
    e.viewport.setScreen(e.width, e.height - e.seams.chromeInsetTop());
    e.viewport.stepFling(dt);
    e.content.position.set(e.viewport.x, e.viewport.y + e.seams.chromeInsetTop());
    e.content.scale.set(e.viewport.zoom);
    e.emitView();
  }
  let moving = e.input.gesture !== "none" || e.viewport.flinging || camMoving;
  if (e.flipQueue.step(dt)) moving = true;
  if (e.sceneTimers.step(dt)) moving = true;
  for (const el of e.seams.everyElement()) {
    el.step(dt);
    if (!el.resting) moving = true;
  }
  // Посадка ПОСЛЕ шага элементов: разбираясь первой, она читала ПРОШЛЫЙ кадр — в кадр прилёта
  // цикл видел «все успокоились» и засыпал, глубина оставалась драговой (1e6), карта лежала
  // поверх всей стопки.
  e.landing.step();
  e.seams.reapDead();
  for (const b of e.buttons) {
    b.step(dt);
    if (!b.resting) moving = true;
  }
  for (const b of e.chromeButtons) {
    b.step(dt);
    if (!b.resting) moving = true;
  }
  if (e.peeks.step(dt)) moving = true; // живые показы держат тикер: отсчёт не должен замирать
  if (e.seams.stepScene(dt)) moving = true;
  // armed: перечитываем каждый кадр из e.drag — не пропустит ни один выход из драга (early return).
  for (const z of e.zones) {
    const eligible = e.drag !== null && z.accepts(e.drag);
    z.zone.setArmed(eligible, eligible && z.textFor ? z.textFor(e.drag!).armed : undefined);
    z.zone.step(dt, e.reduceMotion || e.lowFx); // покачивание armed/hot-текста
  }
  renderAll(e);
  return moving;
}

/** Рендер: синк визуалов (элементы/кнопки/метки) + слитые тени по уровням (lowFx гасит пасс). */
export function renderAll(e: SceneEngine): void {
  const els = e.seams.everyElement();
  for (const el of els) el.sync();
  for (const b of e.buttons) b.sync();
  for (const b of e.chromeButtons) b.sync();
  for (const m of e.markerRig.list()) m.update();
  // Тень — только у карт КОНТЕНТНЫХ слоёв (под камерой). Карта экранной руки (её root на chrome-слое)
  // контентной тени не отбрасывает — иначе тень легла бы в чужом пространстве.
  const contentCards = new Set(Object.values(e.scene.cards));
  const shadows = e.lowFx
    ? []
    : shadowCasters(els.filter((c) => contentCards.has(c.root.parent!)).map((c) => ({ shadowRect: c.shadowRect, visible: c.root.visible, state: c.state })));
  e.scene.paintShadows(shadows, e.contentW, e.contentH);
}
