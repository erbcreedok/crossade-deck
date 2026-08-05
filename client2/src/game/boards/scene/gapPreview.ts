// SMART REORDER КОНТЕЙНЕРОВ БОРДЫ (гэп-превью) — владелец «груз навис над реордер-зоной». Общий
// паттерн со всеми контейнерами проекта: примитив — group.gap движка слотов (slot/slot.ts,
// placeGapped: «работает для ЛЮБОЙ раскладки»; та же идиома в slotfield/stack и field). Здесь его
// подключение к сцене борд: рука-на-борде, flow-грид, любой insert-реордер с preview:true.
//
// Каноны:
//   • индекс вставки — из dropTarget по БАЗОВОЙ раскладке (layout.indexAt над размерами, дыра его
//     не двигает): подсказка не шатает цель под неподвижным пальцем (урок playHover);
//   • перецел жителей только на СМЕНЕ цели/индекса (не на каждую точку);
//   • дроп обязан лечь В ПОКАЗАННЫЙ ГЭП: из своей зоны это делает planDrop (reorder по index), из
//     ЧУЖОЙ — afterCrossDrop доотправляет reorder на индекс превью (иначе move аппендит в конец).

import type { Group } from "../../slot/types";
import { measure } from "../../slot/slot";
import { CARD } from "../../crossade/tree";
import { handKey } from "../core/state";
import { slotOf, type BoardCommand } from "../core/spec";
import { insertPreviewOn, type DropWorld } from "../geometry/dropPlan";
import { handOrderAfterDrop } from "../../crossade/handOrder";
import type { HandConfig } from "../hand/handConfig";

export interface GapPreviewDeps {
  world(): DropWorld;
  hand(): HandConfig | null;
  selfSeat: string;
  /** Перецелить жителей слота на свежие дома (дыра открылась/закрылась/переехала) — nodeStore. */
  retargetSlot(slot: string): void;
  dispatch(cmd: BoardCommand): void;
  wake(): void;
}

export class SceneGapPreview {
  private group: Group | null = null;
  private index: number | null = null;

  constructor(private readonly deps: GapPreviewDeps) {}

  /** Гэп-превью включено для этого контейнера? Рука — из конфига (дефолт true), зоны — opt-in. */
  enabled(slot: string): boolean {
    if (slot === handKey(this.deps.selfSeat)) return this.deps.hand()?.preview ?? true;
    return insertPreviewOn(this.deps.world(), slot);
  }

  /** Груз ведут над бордой: раздвинуть жителей цели (или закрыть дыру, если цель не превьюится).
   *  Идемпотентно — работает только на смене контейнера или индекса. */
  hover(elId: string, target: { group: Group; index: number } | null): void {
    const g = target && this.enabled(target.group.id) ? target.group : null;
    if (g === this.group && (g === null || target!.index === this.index)) return;
    if (this.group && this.group !== g) this.close(this.group);
    if (g) {
      const cell = g.children.length ? measure(g.children[0]!) : CARD; // дыра — по ячейке контейнера
      g.gap = { index: target!.index, size: cell, skip: elId };
      this.deps.retargetSlot(g.id);
    }
    this.group = g;
    this.index = g ? target!.index : null;
    this.deps.wake();
  }

  /** Дроп ИЗ ЧУЖОЙ зоны в превьюируемый контейнер: move аппендит — доотправить reorder на индекс
   *  превью, чтобы груз лёг ровно в показанный гэп. Зовётся ПОСЛЕ диспатча move (состав уже новый). */
  afterCrossDrop(elId: string, to: string, index: number): void {
    if (!this.enabled(to)) return;
    const order = handOrderAfterDrop(this.deps.world().members(to), elId, index);
    const seat = handKey(this.deps.selfSeat) === to ? slotOf(to) : null;
    this.deps.dispatch(seat ? { t: "reorderHand", seat, order } : { t: "reorderSlot", key: to, order });
  }

  /** Конец жеста/дропа: закрыть дыру и вернуть жителей по местам. */
  clear(): void {
    if (this.group) this.close(this.group);
    this.group = null;
    this.index = null;
  }

  private close(g: Group): void {
    g.gap = undefined;
    this.deps.retargetSlot(g.id);
    this.deps.wake();
  }
}
