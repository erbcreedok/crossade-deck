// СПРЕД СТОПОК ВИТРИНЫ — владелец механики «раздвинуть стопку жестом»: реестр стопок со спредом,
// приём жеста, шаг анимации и позиция покоя карты в раздвинутой стопке.
//
// Матчасть чистая и лежит отдельно (kit/stackInteraction.ts, kit/stackLayout.ts) — здесь только то,
// что связывает её со сценой: кто под пальцем, кого сейчас тащат руками и кого будить.
//
// Реестр СВОЙ, отдельный от расставленных элементов: спред — это ПОВЕРХ раскладки, а не свойство
// элемента, и одна стопка занимает несколько мест в реестре витрины. Драг карт — тоже отдельная
// механика (kitDrag.ts): у стопки может быть только спред, только драг, оба или ни одного.

import type { DragPayload } from "./drag";
import type { SceneElement, SpreadSource } from "./sceneEngine";
import type { Pt } from "../kit/context";
import type { StackLayout, StackOffset } from "../kit/stackLayout";
import {
  dribbleWobble,
  pivotFrom,
  recenterShift,
  spreadInput,
  spreadOffsetAt,
  spreadTick,
  wobbleOffset,
  DEFAULT_SPREAD_SENSITIVITY,
  SPREAD_STATE0,
  type SpreadConfig,
  type SpreadState,
} from "../kit/stackInteraction";

export interface SpreadEntry {
  ids: string[];
  at: Pt;
  layout: StackLayout;
  cell: { w: number; h: number };
  cfg: SpreadConfig;
  state: SpreadState;
}

export interface KitSpreadDeps {
  element(id: string): SceneElement | undefined;
  wake(): void;
  drag(): DragPayload | null;
  /** id всех карт пачки, если её лид тащат ЦЕЛИКОМ (kitDrag), иначе null. */
  stackDragIds(leadId: string): readonly string[] | null;
  /** Глубина карты в реестре витрины — спред её не хранит. */
  depthOf(id: string): number;
}

export class KitSpread {
  private readonly stacks: SpreadEntry[] = [];
  /**
   * Двигал ли ТЕКУЩИЙ жест спред. Нужно для ДЕТЕНТА на пределе: жест, который сам наполнил спред,
   * дойдя до края, ОСТАНАВЛИВАЕТСЯ (не отдаёт зум/пан камере) — чтобы палец «почувствовал» лимит.
   * Камеру активирует лишь СЛЕДУЮЩИЙ жест, начатый уже на пределе. Сбрасывается на onGestureBegin.
   */
  private movedThisGesture = false;

  constructor(private readonly deps: KitSpreadDeps) {}

  /** Записи реестра — наружу для дев-хуков и сторожей роутинга. */
  entries(): readonly SpreadEntry[] {
    return this.stacks;
  }

  clear(): void {
    this.stacks.length = 0;
  }

  /**
   * Включить спред у стопки.
   *
   * ЯКОРЬ берём из ФАКТИЧЕСКОЙ позиции первой карты (её уже положил stackState), а не из сырого `at`:
   * stackState сдвигает стопку на -minX/-minY (левый-верхний край в at — конвенция каталога), а
   * раскладка спреда этого сдвига не знает. Без выравнивания первое пробуждение петли (первый клик)
   * разом двигало бы весь стек вверх-влево. anchor такой, что at + layout(0) == позиция первой карты:
   * при amount=0 контроллер точно повторяет раскладку stackState (нулевой прыжок).
   */
  register(ids: string[], at: Pt, layout: StackLayout, cell: { w: number; h: number }, cfg: SpreadConfig): void {
    const first = this.deps.element(ids[0] ?? "");
    const b0 = layout(0, ids.length, cell);
    const anchor = first ? { x: first.body.px - b0.dx, y: first.body.py - b0.dy } : at;
    this.stacks.push({ ids, at: anchor, layout, cell, cfg, state: SPREAD_STATE0 });
  }

  /** Новый жест — забываем, двигал ли прошлый спред (детент на пределе, см. onGesture). */
  onGestureBegin(): void {
    this.movedThisGesture = false;
  }

  /**
   * Жест ПО стеку → спред. Вход один для всех устройств; чем пришёл жест — в `source`. Реагируем ли
   * на него, решает КОНФИГ стека (kit/stackInteraction.ts): `touch-zoom` — по `touchTrigger==="zoom"`;
   * `pointer-zoom` (десктоп Ctrl/тачпад) — по `pointerTrigger==="zoom"`; `pointer-pan` (обычное
   * колесо) — по `pointerTrigger==="pan"`. Не тот жест для этого стека → false, и он целиком уходит
   * камере (зум/пан вьюпорта — дефолтный фоллтру).
   *
   * СПРЕД — ВНУТРЕННИЙ слой, камера — ВНЕШНИЙ. Пока спреду есть куда двигаться, жест его и ведёт
   * (true — камеру не трогаем). Обратный жест сразу снова ведёт спред (правило «изменился ли target»).
   *
   * На ПРЕДЕЛЕ (target упёрся в 0/maxGap и жест давит дальше — `target` за кадр не изменился) есть
   * ДЕТЕНТ: если ЭТОТ жест сам двигал спред, он тут ОСТАНАВЛИВАЕТСЯ — глотаем (true), камеру не
   * трогаем, чтобы почувствовать лимит. Камеру активирует лишь СЛЕДУЮЩИЙ жест, начатый уже на
   * пределе. Так «дойти до края спреда» и «двигать камеру» — два раздельных жеста, а не один.
   */
  onGesture(cp: Pt, rawX: number, rawY: number, source: SpreadSource): boolean {
    const entry = this.stackAt(cp);
    if (!entry) return false;
    const inp = entry.cfg.input;
    const armed = source === "touch-zoom" ? inp.touchTrigger === "zoom" : source === "pointer-zoom" ? inp.pointerTrigger === "zoom" : inp.pointerTrigger === "pan";
    if (!armed) return false; // этот жест на этом стеке спред не трогает — уходит камере
    const next = spreadInput(entry.state, this.progressOf(rawX, rawY, source, entry.cfg));
    if (next.target !== entry.state.target) {
      entry.state = next;
      this.movedThisGesture = true;
      this.deps.wake();
      return true;
    }
    return this.movedThisGesture;
  }

  /** Шаг спред-стеков: анимация amount→target + close-поведение, раскладка карт поверх базовой. */
  step(dt: number): boolean {
    let moving = false;
    // Стопка тащится ЦЕЛИКОМ (GroupDrag): её лид — верхняя карта, но едут ВСЕ карты пачки. Спред
    // обязан отпустить их всех, а не только лида — иначе руки тянут группу за пальцем, а спред тем
    // же кадром тянет её карты обратно на раскладку, и группа рвётся.
    const lead = this.deps.drag()?.lead.id;
    const groupIds = lead ? this.deps.stackDragIds(lead) : null;
    const held = new Set<string>(groupIds ?? []);
    if (lead) held.add(lead);
    for (const entry of this.stacks) {
      entry.state = spreadTick(entry.state, dt, entry.cfg);
      const spreads = this.offsetsOf(entry); // форма по всем + рецентровка на origin
      entry.ids.forEach((id, i) => {
        if (held.has(id)) return; // тащат руками — спред такую карту не двигает
        const el = this.deps.element(id);
        if (!el) return;
        const o = spreads[i]!;
        const w = this.wobbleOf(entry, i);
        el.body.setTarget({ x: entry.at.x + o.dx, y: entry.at.y + o.dy + w.dy, rot: o.rot + w.rot });
      });
      if (entry.state.amount > 0.05 || entry.state.phase > 0) moving = true;
    }
    return moving;
  }

  /**
   * Дом карты в спред-стеке = якорь + текущий раздвиг (та же формула, что в step). null — карта не в
   * спред-стеке.
   *
   * Карта спред-стека живёт в СПРЕД-позиции, а не в статичном доме stackState: возврат после граба
   * или дропа обязан вести туда же — иначе клик по верхней карте дёргает её к нераздвинутой
   * раскладке (вверх-влево), и стопка «прыгает».
   */
  homeOf(id: string): { home: Pt; depth: number } | null {
    const entry = this.stacks.find((s) => s.ids.includes(id));
    if (!entry) return null;
    const i = entry.ids.indexOf(id);
    const off = this.offsetsOf(entry)[i]!;
    const w = this.wobbleOf(entry, i);
    return { home: { x: entry.at.x + off.dx, y: entry.at.y + off.dy + w.dy }, depth: this.deps.depthOf(id) };
  }

  /** Спред-стек под точкой контента (габарит живых карт + половина ячейки) или null: первая стопка,
   *  чей габарит содержит точку жеста, забирает его. */
  private stackAt(cp: Pt): SpreadEntry | null {
    for (const entry of this.stacks) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const id of entry.ids) {
        const el = this.deps.element(id);
        if (!el) continue;
        minX = Math.min(minX, el.body.px);
        maxX = Math.max(maxX, el.body.px);
        minY = Math.min(minY, el.body.py);
        maxY = Math.max(maxY, el.body.py);
      }
      if (!Number.isFinite(minX)) continue; // все карты стопки уже сгорели/пересобраны
      const hw = entry.cell.w / 2;
      const hh = entry.cell.h / 2;
      if (cp.x < minX - hw || cp.x > maxX + hw || cp.y < minY - hh || cp.y > maxY + hh) continue;
      return entry;
    }
    return null;
  }

  /**
   * Сырые device-дельты → «прогресс спреда» (0..1), где ПОЛОЖИТЕЛЬНОЕ = раздвигать. Конвенции знака:
   *  • touch-zoom: пинч-span растёт (пальцы врозь) → раздвигать (+rawX);
   *  • pointer-zoom: Ctrl-колесо к себе (deltaY<0) → раздвигать (−rawY);
   *  • pointer-pan: раздвиг горизонтальный, ось выбирается (auto=доминирующая, горизонталь при
   *    равенстве). По X: вправо (deltaX>0) раздвигает (+); по Y (fallback): к себе (deltaY<0) → (−).
   */
  private progressOf(rawX: number, rawY: number, source: SpreadSource, cfg: SpreadConfig): number {
    const inp = cfg.input;
    const sens = inp.sensitivity ?? DEFAULT_SPREAD_SENSITIVITY;
    let d: number;
    if (source === "pointer-pan") {
      const axis = inp.axis ?? "auto";
      const useX = axis === "x" || (axis === "auto" && Math.abs(rawX) >= Math.abs(rawY));
      const sel = useX ? rawX : rawY;
      d = (useX ? sel : -sel) * sens;
    } else if (source === "pointer-zoom") {
      d = -rawY * sens;
    } else {
      d = rawX * sens; // touch-zoom
    }
    return inp.invert ? -d : d;
  }

  /** Форма спреда по ВСЕМ фигурам стека при текущем amount + рецентровка на `origin` (точка отброса
   *  стоит на месте — веер/линия/кольцо расширяются вокруг неё). Без wobble — его накладывает вызов. */
  private offsetsOf(entry: SpreadEntry): StackOffset[] {
    const n = entry.ids.length;
    const origin = entry.cfg.origin ?? "bottom";
    const angleDeg = entry.cfg.angleDeg ?? 0;
    const rests = entry.ids.map((_, i) => entry.layout(i, n, entry.cell));
    const pivot = pivotFrom(origin, rests);
    const spreads = rests.map((base, i) => spreadOffsetAt(entry.cfg, { i, n, cell: entry.cell, gain: entry.cfg.gain, base, pivot, layout: entry.layout, angleDeg }, entry.state.amount));
    const shift = recenterShift(origin, rests, spreads);
    return spreads.map((o) => ({ dx: o.dx + shift.dx, dy: o.dy + shift.dy, rot: o.rot }));
  }

  private wobbleOf(entry: SpreadEntry, i: number): { dy: number; rot: number } {
    const wob = entry.cfg.close.kind === "dribble" ? dribbleWobble(i, entry.state.phase) : 0;
    return wobbleOffset(i, wob);
  }
}
