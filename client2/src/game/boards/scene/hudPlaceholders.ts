// ЗАГЛУШКИ HUD — краска placeholder-виджетов (лента + подпись): макеты будущих кнопок/реакций
// в областях. Вынос из SceneHud: там раздача рамок, здесь — Pixi-краска одного вида виджета.
// Стиль — общий painter лент (strip/bandPaint): заглушка выглядит как лента дока.

import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../../engine/constants";
import type { AreaFrame, HudSpan } from "../hud/hudLayout";
import { paintStripBand } from "../strip/bandPaint";

/** Глубина ленты-заглушки (макет будущего виджета) — участвует в глубине области и резерве. */
export const PLACEHOLDER_DEPTH = 56;
const SIDE = 16; // поле вертикальной ленты от края (в тон strip/dock SIDE)

interface Off {
  edge: number;
  chromeTop: number;
  chromeBottom: number;
}

export class ScenePlaceholders {
  private readonly decor = new Graphics();
  private readonly labels = new Map<string, Text>();
  private seen = new Set<string>();

  constructor(private readonly root: Container, private readonly accent: () => number) {
    root.addChild(this.decor);
  }

  /** Начало прохода раскладки: стереть краску, забыть виденное. */
  begin(): void {
    this.decor.clear();
    this.seen = new Set();
  }

  /** Лента-заглушка виджета области + подпись. Ключ — область и отрезок (стабилен в проходе). */
  paint(size: { w: number; h: number }, f: AreaFrame, span: HudSpan, off: Off, text: string): void {
    const b = this.rect(size, f, span, off);
    paintStripBand(this.decor, b, "rest", this.accent());
    const key = `${f.areaIndex}:${Math.round(span.from)}`;
    this.seen.add(key);
    let label = this.labels.get(key);
    if (!label) {
      label = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: 0x9aa79c } });
      this.root.addChild(label);
      this.labels.set(key, label);
    }
    label.text = text;
    label.position.set(b.x + b.w / 2 - label.width / 2, b.y + b.h / 2 - label.height / 2);
  }

  /** Конец прохода: снести подписи областей, ушедших из спеки. */
  sweep(): void {
    for (const [key, label] of this.labels) {
      if (this.seen.has(key)) continue;
      label.destroy();
      this.labels.delete(key);
    }
  }

  private rect(size: { w: number; h: number }, f: AreaFrame, span: HudSpan, off: Off): { x: number; y: number; w: number; h: number } {
    const d = PLACEHOLDER_DEPTH;
    if (f.side === "bottom") return { x: span.from, y: size.h - off.chromeBottom - off.edge - d, w: span.len, h: d };
    if (f.side === "top") return { x: span.from, y: off.chromeTop + off.edge + 8, w: span.len, h: d };
    const x = f.side === "left" ? SIDE + off.edge : size.w - SIDE - off.edge - d;
    return { x, y: span.from, w: d, h: span.len };
  }

  destroy(): void {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
    this.decor.destroy();
  }
}
