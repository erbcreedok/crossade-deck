// HUD СЦЕНЫ — владелец экранного слоя виджетов (мобильное удобство): доки по краям, в каждом —
// ряд виджетов (рука, а дальше дропзоны/кнопки/мешок/реакции). ОТРЕЗКИ виджетов вдоль дока считает
// чистый hud/hudLayout (flex-как-данные: порядок, px/доли, justify, gap) — здесь только раздача
// отрезков виджетам, заглушки-placeholder и резерв краёв для fitZoom. Generic-канон: SceneHud не
// знает, ЧТО такое рука, — виджет сам считает свою глубину (bandDepth) и рисует себя.

import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../../engine/constants";
import type { BoardSpec, HudSide } from "../core/spec";
import { hudDocks, hudSpans, type HudSpan } from "../hud/hudLayout";
import { paintHandBand } from "../hand/handBandPaint";
import type { SceneHandHud } from "./handHud";
import { ACTION_BAR_H } from "./chrome";

const PLACEHOLDER_DEPTH = 56; // глубина ленты-заглушки (макет будущего виджета)

export interface HudDeps {
  spec(): BoardSpec;
  accent(): number;
  wake(): void;
}

export class SceneHud {
  /** Слой HUD на chrome; слой руки-виджета — его ребёнок. */
  readonly root = new Container();
  private readonly decor = new Graphics(); // ленты заглушек
  private readonly labels = new Map<string, Text>();
  private size = { w: 0, h: 0 };

  constructor(
    private readonly deps: HudDeps,
    private readonly hand: SceneHandHud,
  ) {
    this.root.addChild(this.decor);
    this.root.addChild(hand.root);
  }

  /** Раздать виджетам отрезки доков и перерисовать заглушки. */
  layout(w: number, h: number): void {
    this.size = { w, h };
    this.hand.setDock(null, null);
    this.decor.clear();
    const seen = new Set<string>();
    for (const { side, dock } of hudDocks(this.deps.spec().hud)) {
      const spans = hudSpans(this.dockLength(side), dock);
      dock.widgets.forEach((widget, i) => {
        if (widget.kind === "hand") this.hand.setDock(side, spans[i]!);
        else this.paintPlaceholder(side, spans[i]!, widget.label ?? "", seen);
      });
    }
    for (const [key, label] of this.labels) {
      if (seen.has(key)) continue;
      label.destroy();
      this.labels.delete(key);
    }
    this.hand.layout(w, h);
  }

  /** Резерв краёв под доки — стол вписывается в остаток (fitZoom). Низ включает полосу действий. */
  reserved(w: number, h: number): { top: number; bottom: number; left: number; right: number } {
    this.layout(w, h);
    const r = { top: 0, bottom: 0, left: 0, right: 0 };
    for (const { side, dock } of hudDocks(this.deps.spec().hud)) {
      const depth = Math.max(...dock.widgets.map((wd) => (wd.kind === "hand" ? this.hand.bandDepth() : PLACEHOLDER_DEPTH)));
      r[side] = depth + (side === "bottom" ? ACTION_BAR_H : side === "top" ? 8 : 16);
    }
    return r;
  }

  /** Длина дока вдоль края: горизонтали — вся ширина, вертикали — высота между полосами хрома. */
  private dockLength(side: HudSide): number {
    return side === "left" || side === "right" ? Math.max(0, this.size.h - ACTION_BAR_H * 2) : this.size.w;
  }

  /** Лента-заглушка виджета: тот же стиль ленты руки + подпись (макет для сторибука). */
  private paintPlaceholder(side: HudSide, span: HudSpan, text: string, seen: Set<string>): void {
    const b = this.placeholderRect(side, span);
    paintHandBand(this.decor, b, "rest", this.deps.accent());
    const key = `${side}:${span.from}`;
    seen.add(key);
    let label = this.labels.get(key);
    if (!label) {
      label = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: 0x9aa79c } });
      this.root.addChild(label);
      this.labels.set(key, label);
    }
    label.text = text;
    label.position.set(b.x + b.w / 2 - label.width / 2, b.y + b.h / 2 - label.height / 2);
  }

  private placeholderRect(side: HudSide, span: HudSpan): { x: number; y: number; w: number; h: number } {
    const d = PLACEHOLDER_DEPTH;
    if (side === "bottom") return { x: span.from, y: this.size.h - ACTION_BAR_H - d, w: span.len, h: d };
    if (side === "top") return { x: span.from, y: ACTION_BAR_H + 8, w: span.len, h: d };
    const y = ACTION_BAR_H + span.from;
    return side === "left" ? { x: 16, y, w: d, h: span.len } : { x: this.size.w - 16 - d, y, w: d, h: span.len };
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
