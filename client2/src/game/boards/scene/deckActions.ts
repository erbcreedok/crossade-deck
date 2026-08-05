// ДЕЙСТВИЯ КОЛОДЫ (композиция BoardScene): «шурух»-перемешивание с веером и автораздача по два.
// Оба — обычные команды порта; здесь только хореография (позы и тайминги — чистые core-модули).

import { autoDealPlan } from "../core/dealPlan";
import { SHUFFLE_FX_SECONDS, shufflePoses } from "../core/shuffleFx";
import { baseZoneId, zoneOf, type BoardCommand } from "../core/spec";
import { handKey, type BoardState } from "../core/state";
import type { BoardNode } from "./nodeFactory";

export interface DeckActionsHost {
  state(): BoardState;
  node(id: string): BoardNode | undefined;
  homeOf(id: string): { x: number; y: number } | null;
  dispatch(cmd: BoardCommand): void;
  after(sec: number, fn: () => void): void;
  wake(): void;
}

export class SceneDeckActions {
  constructor(private readonly host: DeckActionsHost) {}

  /** «Шурух»: верх стопки разлетается детерминированным веером и слетается уже перемешанным. */
  shuffle(slot: string): void {
    const members = this.host.state().field.slots[slot]?.members ?? [];
    const poses = shufflePoses(members.length);
    poses.forEach((pose, i) => {
      const id = members[members.length - 1 - i]!;
      const node = this.host.node(id);
      const home = this.host.homeOf(id);
      if (!node || !home) return;
      node.body.setTarget({ x: home.x + pose.dx, y: home.y + pose.dy, rot: pose.rot, scale: node.restScale });
    });
    this.host.after(SHUFFLE_FX_SECONDS, () => this.host.dispatch({ t: "shuffle", zone: baseZoneId(zoneOf(slot)) }));
    this.host.wake();
  }

  /** Автораздача: по две карты каждому занятому месту, пара «вшик-вшик», между игроками — пауза.
   *  Каждый вылет — обычный move через порт: живой мастер увидит ровно те же ходы. */
  deal(slot: string): void {
    const s = this.host.state();
    for (const step of autoDealPlan(s.seats, s.dealer)) {
      this.host.after(step.delay, () => {
        const members = this.host.state().field.slots[slot]?.members ?? [];
        const top = members[members.length - 1];
        // move без face снимает оверрайд лица — рука сама решает сторону (mock.moveVisuals).
        if (top) this.host.dispatch({ t: "move", el: top, from: slot, to: handKey(step.seat) });
      });
    }
    this.host.wake();
  }
}
