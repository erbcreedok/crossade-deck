// БЛОК-ДРАГ КОЛОДЫ (композиция BoardScene): hold по свободной стопке берёт ВЕСЬ слот блоком.
// Владеет своим состоянием (зона + точка захвата) и решает дроп: внутри бокса — команда
// offsetFree (сдвиг общий, стол одинаков у всех), мимо — сдвиг не меняется, release вернёт
// стопку к месту подъёма. Геометрия — чистые blockDropOffset (freeBox) и freeStackSize.

import { GroupDrag, type DragContext, type DragPayload } from "../../engine/drag";
import { CARD } from "../../crossade/tree";
import { blockDropOffset } from "../geometry/freeBox";
import { freeStackSize } from "../geometry/freeDrop";
import type { BoardCommand } from "../core/spec";
import type { BoardState } from "../core/state";
import type { BoardTree } from "../geometry/boardTree";
import type { BoardNode } from "./nodeFactory";

export interface BlockDragHost {
  state(): BoardState;
  tree(): BoardTree;
  node(id: string): BoardNode | undefined;
  dragCtx(): DragContext;
  /** Отдать движку живой драг (сцена хранит его в engine.drag). */
  setDrag(drag: DragPayload): void;
  dispatch(cmd: BoardCommand): void;
}

export class SceneBlockDrag {
  /** Зона идущего блок-драга (null — не идёт). */
  private zone: string | null = null;
  private grab = { x: 0, y: 0 };

  constructor(private readonly host: BlockDragHost) {}

  active(): boolean {
    return this.zone !== null;
  }

  /** Попробовать начать блок-драг слота `slot` (зона `zone`). false — стопка пуста. */
  begin(zone: string, slot: string, cp: { x: number; y: number }): boolean {
    const members = this.host.state().field.slots[slot]?.members ?? [];
    const nodes = members.map((id) => this.host.node(id)).filter((n): n is BoardNode => !!n);
    if (!nodes.length) return false;
    // GroupDrag ведёт все карты жёстко за пальцем со СВОИМИ сдвигами (форма стопки цела).
    const offsets = nodes.map((n) => ({ dx: n.body.px - cp.x, dy: n.body.py - cp.y }));
    this.zone = zone;
    this.grab = { x: cp.x, y: cp.y };
    const drag = new GroupDrag(nodes, offsets, this.host.dragCtx());
    drag.move(cp);
    this.host.setDrag(drag);
    return true;
  }

  /** Дроп блока: внутри бокса — offsetFree (стопку держим целиком в боксе), мимо — без изменений. */
  resolveAt(cp: { x: number; y: number }): void {
    if (!this.zone) return;
    const zone = this.zone;
    this.zone = null;
    const tree = this.host.tree();
    const state = this.host.state();
    const box = tree.cellRects[`${zone}:0`];
    const members = state.field.slots[`${zone}:0`]?.members ?? [];
    const home = members.length ? tree.homeOf(members[0]!) : null;
    if (!box || !home) return;
    const stack = freeStackSize(CARD, members.length);
    const half = { w: stack.w / 2, h: stack.h / 2 };
    const cur = state.free.offset[zone] ?? { x: 0, y: 0 };
    // Дерево уже включает текущий сдвиг — blockDropOffset ждёт дом БЕЗ него.
    const base = { x: home.x - cur.x, y: home.y - cur.y };
    const next = blockDropOffset(box, cur, this.grab, cp, base, half);
    if (next.x !== cur.x || next.y !== cur.y) this.host.dispatch({ t: "offsetFree", zone, offset: next });
  }

  /** Отменить/сбросить (фикс-зона экрана, конец жеста): сдвиг не меняется. */
  cancel(): void {
    this.zone = null;
  }
}
