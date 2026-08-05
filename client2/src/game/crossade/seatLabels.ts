// ПОДПИСИ МЕСТ ЗА СТОЛОМ — коллаборатор: держит по одному Text на место, создаёт и сносит их за
// составом стола. Что НА подписи написано и каким цветом, коллаборатор не решает: и то и другое
// приходит функциями (caption/fill), потому что это разные столы, а не разные состояния одного —
// Crossade помечает дилера короной и гасит отключённых, live-стол красит место в цвет игрока.
//
// Чужие карты подписью не рисуются вовсе: «другим не видно» здесь не правило отображения, а
// отсутствие данных в снимке (см. state.ts#snapshotFrom).

import { Text } from "pixi.js";
import type { Container } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";
import type { Vec } from "../slot/types";
import type { CrossadeSeat } from "./state";

/** Как стол подписывает места — один объект вместо россыпи швов у сцены. */
export interface SeatStyle {
  /** Какие места подписывать: live-стол прячет своё («рука и есть индикатор себя»). */
  seats: readonly CrossadeSeat[];
  caption(seat: CrossadeSeat): string;
  fill(seat: CrossadeSeat): number;
  /** Ячейка места: подпись центрируется по её ширине (у live-стола ячейка шире — ряд рубашек). */
  cell: { w: number; h: number };
  /** Сдвиг подписи от origin по вертикали: у live-стола origin указывает на ряд рубашек. */
  offsetY?: number;
}

export interface SeatLabelDeps {
  surfaceAdd(c: Container): void;
  /** Origin слота места на доске (`seat:<sessionId>`) — undefined: места в дереве нет. */
  origin(slotId: string): Vec | undefined;
  style(): SeatStyle;
}

export class SceneSeatLabels {
  private readonly labels = new Map<string, Text>();

  constructor(private readonly deps: SeatLabelDeps) {}

  /** Свести подписи с составом стола: чьего места в стиле нет — сносится (место освободилось). */
  sync(): void {
    const style = this.deps.style();
    const seen = new Set<string>();
    for (const seat of style.seats) {
      seen.add(seat.sessionId);
      let label = this.labels.get(seat.sessionId);
      if (!label) {
        label = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 13, align: "center" } });
        label.anchor.set(0.5, 0);
        this.deps.surfaceAdd(label);
        this.labels.set(seat.sessionId, label);
      }
      label.text = style.caption(seat);
      label.style.fill = style.fill(seat);
      const at = this.deps.origin(`seat:${seat.sessionId}`);
      if (at) label.position.set(at.x + style.cell.w / 2, at.y + (style.offsetY ?? 0));
    }
    for (const [id, label] of this.labels) {
      if (seen.has(id)) continue;
      label.destroy();
      this.labels.delete(id);
    }
  }

  /** Живые подписи — для дев-хуков (экранную геометрию считает сцена, она знает камеру). */
  entries(): readonly [string, Text][] {
    return [...this.labels];
  }

  destroy(): void {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
  }
}
