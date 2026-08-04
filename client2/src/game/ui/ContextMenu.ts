import { Container, Graphics, Text } from "pixi.js";
import { Button } from "./Button";
import { PIXEL_FONT } from "../engine/constants";

// КОНТЕКСТНОЕ МЕНЮ на канвасе (long-press на таче / ПКМ на десктопе): тёмная плашка со строками-
// настройками «подпись · значение», тап по строке циклит значение. Живёт в ЭКРАННОМ слое (chrome),
// поэтому не ездит с паном и не растёт от зума. Своих pointer-событий не слушает — ввод ведёт
// движок через chromeButtons (как OverlayPanel/TopBar). Границы между строками — отступами.
//
// Кнопки-строки размещаются в АБСОЛЮТНЫХ экранных координатах (root не сдвигается): hitTest
// кнопки сверяет точку со своим place(x,y), и слой chrome в движке живёт в экране 1:1.

const PANEL_BG = 0x18211c;
const PANEL_BORDER = 0x5f7a6d;
const TITLE_FILL = 0x8fa396;

const MENU_W = 236;
const ROW_H = 40;
const PAD = 10;
const GAP = 6;
const TITLE_H = 24;

export interface MenuRow {
  key: string;
  label: string;
  /** Текущее значение справа. Нет значения — строка-действие. */
  value?: string;
  onSelect: () => void;
}

export interface ContextMenuOptions {
  title?: string;
  rows: readonly MenuRow[];
}

export class ContextMenu {
  readonly root = new Container();
  readonly buttons: Button[] = [];

  private readonly bg = new Graphics();
  private readonly title: Text | null;
  private at = { x: 0, y: 0 };
  readonly w = MENU_W;
  readonly h: number;

  constructor(opts: ContextMenuOptions) {
    this.root.addChild(this.bg);
    const top = opts.title ? PAD + TITLE_H : PAD;
    this.title = opts.title ? new Text({ text: opts.title, style: { fontFamily: PIXEL_FONT, fontSize: 14, fill: TITLE_FILL } }) : null;
    if (this.title) this.root.addChild(this.title);
    for (const row of opts.rows) {
      const label = row.value === undefined ? row.label : `${row.label} · ${row.value}`;
      const b = new Button({
        label,
        variant: "secondary",
        size: "sm",
        width: MENU_W - PAD * 2,
        height: ROW_H,
        textShrink: true,
        onClick: row.onSelect,
      });
      this.buttons.push(b);
      this.root.addChild(b.root);
    }
    this.h = top + opts.rows.length * (ROW_H + GAP) - GAP + PAD;
    this.bg.roundRect(0, 0, MENU_W, this.h, 12).fill({ color: PANEL_BG, alpha: 0.96 }).stroke({ width: 1.5, color: PANEL_BORDER, alpha: 0.9 });
  }

  /** Поставить меню у точки вызова, не вылезая за экран. Координаты — ЭКРАННЫЕ, абсолютные. */
  place(sx: number, sy: number, screenW: number, screenH: number): void {
    const x = Math.max(8, Math.min(sx, screenW - this.w - 8));
    const y = Math.max(8, Math.min(sy, screenH - this.h - 8));
    this.at = { x, y };
    this.bg.position.set(x, y);
    const top = this.title ? PAD + TITLE_H : PAD;
    this.title?.position.set(x + PAD + 4, y + PAD);
    this.buttons.forEach((b, i) => b.place(x + MENU_W / 2, y + top + i * (ROW_H + GAP) + ROW_H / 2));
  }

  /** Точка внутри плашки (экранные координаты)? Тап мимо — закрыть меню. */
  contains(sx: number, sy: number): boolean {
    return sx >= this.at.x && sx <= this.at.x + this.w && sy >= this.at.y && sy <= this.at.y + this.h;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
