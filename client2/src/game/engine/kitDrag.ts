// ДРАГ СТОПОК ВИТРИНЫ — владелец второй механики стопки: кто и каким жестом берёт карту, и берётся
// ли пачка ЦЕЛИКОМ. Реестр свой, отдельный от спреда (kitSpread.ts): у стопки может быть только
// спред, только драг, оба или ни одного.
//
// Правило, которое здесь легко сломать молча: `pieceDrag` и `stackDrag` — ДВА НЕЗАВИСИМЫХ интента, у
// каждого свой триггер (tap/hold). Роутер спрашивает, что доступно ЭТИМ жестом, и выбирает по жесту —
// поэтому стек больше не перебивает карту: разные триггеры → тап делает одно, hold другое; совпали →
// выигрывает стек. Матчасть предикатов — kit/stackInteraction.ts.

import type { Pt } from "../kit/context";
import type { SceneElement } from "./sceneEngine";
import type { DragContext, DragPayload } from "./drag";
import { GroupDrag } from "./drag";
import type { DragMode } from "./inputRouter";
import type { DragTrigger, PieceDrag, StackDrag } from "../kit/stackInteraction";

export interface DragEntry {
  ids: string[];
  pieceDrag: PieceDrag | null;
  stackDrag: StackDrag | null;
}

export interface KitDragDeps {
  element(id: string): SceneElement | undefined;
  /** Каким жестом драг вообще сработал (tap/hold) — его выбрал роутер. */
  grabMode(): DragMode;
  dragCtx(): DragContext;
  setDrag(d: DragPayload): void;
  /** Дефолтные ветки движка: обычный одиночный драг и его же разрешение. */
  defaultCanDrag(el: SceneElement): boolean;
  defaultBeginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean;
}

export class KitDrag {
  private readonly stacks: DragEntry[] = [];

  constructor(private readonly deps: KitDragDeps) {}

  entries(): readonly DragEntry[] {
    return this.stacks;
  }

  clear(): void {
    this.stacks.length = 0;
  }

  register(ids: readonly string[], pieceDrag: PieceDrag | null, stackDrag: StackDrag | null): void {
    this.stacks.push({ ids: [...ids], pieceDrag, stackDrag });
  }

  /** Запись стопки, в которой числится элемент, или undefined — элемент вне драг-реестра. */
  entryOf(id: string): DragEntry | undefined {
    return this.stacks.find((s) => s.ids.includes(id));
  }

  /** id живой пачки, если её тащат ЦЕЛИКОМ (нужно спреду, чтобы не тянуть её карты назад). */
  stackDragIds(leadId: string): readonly string[] | null {
    const entry = this.entryOf(leadId);
    return entry?.stackDrag ? entry.ids : null;
  }

  /**
   * Пик карты по конфигу стопки: `stackDrag != null` — ЛЮБАЯ карта хватается (ручка для всей пачки,
   * см. begin); иначе — по ПРЕДИКАТУ `pieceDrag.pick`, который зовём с позицией карты в стопке (0 —
   * низ, n-1 — верх). `pieceDrag == null` — карты не тащат вовсе. Готовые предикаты —
   * PICK_ANY/PICK_FIRST; клиент может дать свой. Элементы вне реестра решает база — рычаг на них не
   * распространяется.
   */
  canDrag(el: SceneElement): boolean {
    if (!this.deps.defaultCanDrag(el)) return false;
    const entry = this.entryOf(el.id);
    if (!entry) return true;
    if (entry.stackDrag) return true;
    return this.pickApplies(entry, el);
  }

  /** Есть ли у элемента драг-интент (карта или стек) с данным триггером. Вне реестра — обычный
   *  тап-драг базы (тап есть, hold нет). */
  hasIntent(el: SceneElement, trigger: DragTrigger): boolean {
    const entry = this.entryOf(el.id);
    if (!entry) return trigger === "tap";
    if (entry.stackDrag?.trigger === trigger) return true;
    return entry.pieceDrag?.trigger === trigger && this.pickApplies(entry, el);
  }

  /**
   * Начать драг ТЕМ интентом, чей триггер совпал с сработавшим жестом: `stackDrag` → едет вся живая
   * пачка группой (`GroupDrag`, форма сохраняется — тот же приём, что у блок-драга песочницы);
   * `pieceDrag` → одиночная карта (база). При совпадении триггеров выигрывает стек. Если жесту не
   * отвечает ни один интент (страховка — роутер и так не должен был захватывать), драг не заводится.
   */
  begin(el: SceneElement, cp: Pt, sp: Pt): boolean {
    const entry = this.entryOf(el.id);
    if (entry) {
      if (entry.stackDrag?.trigger === this.deps.grabMode()) {
        const nodes = entry.ids.map((id) => this.deps.element(id)).filter((e): e is SceneElement => !!e);
        if (nodes.length) {
          const offsets = nodes.map((n) => ({ dx: n.body.px - cp.x, dy: n.body.py - cp.y }));
          const g = new GroupDrag(nodes, offsets, this.deps.dragCtx());
          g.move(cp);
          this.deps.setDrag(g);
          return true;
        }
      }
      // Не стек этим жестом → карта, но лишь если карточный интент отвечает жесту и применим.
      if (!(entry.pieceDrag?.trigger === this.deps.grabMode() && this.pickApplies(entry, el))) return false;
    }
    return this.deps.defaultBeginDrag(el, cp, sp);
  }

  /** Хватается ли ИМЕННО эта карта по предикату pieceDrag.pick (0 — низ, n-1 — верх). */
  private pickApplies(entry: DragEntry, el: SceneElement): boolean {
    if (!entry.pieceDrag) return false;
    const i = entry.ids.indexOf(el.id);
    return i >= 0 && entry.pieceDrag.pick({ id: el.id, i, n: entry.ids.length });
  }
}
