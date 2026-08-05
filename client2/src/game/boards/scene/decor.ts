// ДЕКОР СЦЕНЫ БОРДЫ (композиция BoardScene): фон-клетки, контуры зон, подписи зон и мест.
// Владеет своим слоем Graphics и Text-подписями; сцена отдаёт данные узким швом DecorSceneHost
// и зовёт sync() на каждой пересборке доски. Правила «где чья рамка» — здесь, рисование — тоже:
// это чисто презентационный модуль без игровой логики.

import { Graphics, Text, type Container } from "pixi.js";
import { PIXEL_FONT, COLORS } from "../../engine/constants";
import { dashedRectSegments } from "../../ui/dashedRectSegments";
import { dashedCircleArcs } from "../../ui/dashedCircleArcs";
import type { BoardTree } from "../geometry/boardTree";
import { baseZoneId, slotKey, zoneOf, type BoardSpec } from "../core/spec";
import { handKey } from "../core/state";
import { handOnBoard } from "../hud/hudLayout";
import { paintHandBand } from "../hand/handBandPaint";
import type { BoardState } from "../core/state";

export interface DecorSceneHost {
  surfaceAdd(child: Container): void;
  spec(): BoardSpec;
  tree(): BoardTree;
  state(): BoardState;
  selfSeat: string;
  accent(): number;
  /** Это место занимает Я (live-профиль — своим цветом)? */
  isMe(occupant: string | null): boolean;
}

export class SceneDecor {
  readonly layer = new Graphics();
  private readonly seatLabels = new Map<string, Text>();
  private readonly zoneLabels = new Map<string, Text>();
  private mounted = false;

  constructor(private readonly host: DecorSceneHost) {}

  sync(): void {
    this.syncSeats();
    this.paintZones();
    this.paintHandBand();
  }

  /** Лента руки-на-борде в покое (rest) — тем же стилем, что экранный док (handBandPaint).
   *  Armed/hot во время драга рисует жест поверх (hintLayer). */
  private paintHandBand(): void {
    if (!handOnBoard(this.host.spec())) return;
    const band = this.host.tree().cellRects[handKey(this.host.selfSeat)];
    if (band) paintHandBand(this.layer, band, "rest", this.host.accent());
  }

  /** Подписи мест: имя/«свободно», у чьего хода — золотая метка. Свой ход виден у руки. */
  private syncSeats(): void {
    const state = this.host.state();
    const tree = this.host.tree();
    // Соло-борда (одно место, песочница): подпись места была бы шумом — гасим все и выходим.
    if (state.seats.length <= 1) {
      for (const [id, label] of this.seatLabels) {
        label.destroy();
        this.seatLabels.delete(id);
      }
      return;
    }
    const seen = new Set<string>();
    for (const [i, seat] of state.seats.entries()) {
      const isTurn = state.turn.at === i;
      const key = seat.id === this.host.selfSeat ? `hand:${seat.id}` : `seat:${seat.id}`;
      // У борды без рук (шахматы) своему месту негде жить в дереве — подпись встаёт в левый низ.
      const origin = tree.origins[key] ?? (seat.id === this.host.selfSeat ? { x: 40, y: tree.size.h - 4 } : undefined);
      if (!origin) continue;
      seen.add(seat.id);
      let label = this.seatLabels.get(seat.id);
      if (!label) {
        label = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 13, align: "left" } });
        label.anchor.set(0, 1);
        this.host.surfaceAdd(label);
        this.seatLabels.set(seat.id, label);
      }
      const who = seat.occupant ?? "свободно";
      const dealer = seat.id === state.dealer ? " ♛" : "";
      label.text = `${isTurn ? "► " : ""}${who}${dealer}`;
      const isMe = this.host.isMe(seat.occupant);
      label.style.fill = isMe ? this.host.accent() : isTurn ? COLORS.gold : seat.occupant ? COLORS.seatName : COLORS.seatNameOff;
      label.position.set(origin.x, origin.y - 6);
    }
    for (const [id, label] of this.seatLabels) {
      if (seen.has(id)) continue;
      label.destroy();
      this.seatLabels.delete(id);
    }
  }

  /** Фон-клетки (шахматная раскраска), контуры зон, подписи. perSeat-экземпляры («gear@p2»)
   *  находят спеку через baseZoneId и получают КАЖДЫЙ свою подпись. */
  private paintZones(): void {
    const g = this.layer;
    const spec = this.host.spec();
    const tree = this.host.tree();
    g.clear();
    // Рантайм-зоны: экземпляр → первый слот (для подписи).
    const runtime = new Map<string, string>();
    for (const key of Object.keys(tree.origins)) {
      const z = zoneOf(key);
      if (!runtime.has(z)) runtime.set(z, key);
    }
    const seen = new Set<string>();
    for (const [zid, firstKey] of runtime) {
      const zone = spec.zones.find((z) => z.id === baseZoneId(zid));
      if (!zone) continue;
      const cell = zone.cell ?? { w: 100, h: 143 };
      // Ячейки зоны: слоты (origins) ∪ декор-ячейки без слота (пустые позиции радиального круга).
      const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
      for (const [key, at] of Object.entries(tree.origins)) {
        if (zoneOf(key) !== zid) continue;
        // Свободные стопки free-зоны — карты, а не разметка: рамку рисует только бокс (слот 0).
        if (zone.layout.kind === "free" && key !== slotKey(zid, 0)) continue;
        rects.set(key, tree.cellRects[key] ?? { x: at.x, y: at.y, w: cell.w, h: cell.h });
      }
      for (const [key, r] of Object.entries(tree.cellRects)) {
        if (zoneOf(key) === zid && !rects.has(key)) rects.set(key, r);
      }
      for (const [key, r] of rects) {
        if (zone.background === "chessboard") {
          const m = key.match(/r(\d+)c(\d+)$/);
          const dark = m ? (Number(m[1]) + Number(m[2])) % 2 === 1 : false;
          g.rect(r.x, r.y, r.w, r.h).fill({ color: dark ? 0x27352c : 0x3a4a3f });
          g.rect(r.x, r.y, r.w, r.h).stroke({ width: 1, color: 0x1e2a23 });
        } else if (zone.shape === "circle") {
          // РОВНЫЙ круг, вписанный в бокс зоны; пунктир — дугами чистой функции (Pixi dash не умеет).
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          const rad = Math.min(r.w, r.h) / 2;
          if (zone.frame === "dashed") {
            for (const a of dashedCircleArcs(rad, 12, 9)) {
              g.moveTo(cx + rad * Math.cos(a.start), cy + rad * Math.sin(a.start)).arc(cx, cy, rad, a.start, a.end);
            }
            g.stroke({ width: 1.5, color: 0x50604f, alpha: 0.85 });
          } else {
            g.circle(cx, cy, rad).stroke({ width: 1.5, color: 0x50604f, alpha: 0.8 });
          }
        } else if (zone.frame === "dashed") {
          // Стиль дроп-зоны: пунктирная рамка (сегменты чистой функцией).
          for (const s of dashedRectSegments(r.x, r.y, r.w, r.h, 12, 9)) g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2);
          g.stroke({ width: 1.5, color: 0x50604f, alpha: 0.85 });
        } else {
          g.roundRect(r.x, r.y, r.w, r.h, 6).stroke({ width: 1.5, color: 0x50604f, alpha: 0.8 });
        }
      }
      if (!zone.title) continue;
      seen.add(zid);
      let label = this.zoneLabels.get(zid);
      if (!label) {
        label = new Text({ text: zone.title, style: { fontFamily: PIXEL_FONT, fontSize: 13, fill: COLORS.gold } });
        label.anchor.set(0, 1);
        this.host.surfaceAdd(label);
        this.zoneLabels.set(zid, label);
      }
      const at = tree.origins[firstKey]!;
      label.position.set(at.x, at.y - 6);
    }
    // Экземпляры, исчезнувшие с пересборкой (ушёл игрок) — снести подписи.
    for (const [zid, label] of this.zoneLabels) {
      if (seen.has(zid)) continue;
      label.destroy();
      this.zoneLabels.delete(zid);
    }
  }

  destroy(): void {
    for (const l of this.seatLabels.values()) l.destroy();
    this.seatLabels.clear();
    for (const l of this.zoneLabels.values()) l.destroy();
    this.zoneLabels.clear();
  }
}
