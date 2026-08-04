import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";

// ФИКСИРОВАННЫЕ ДРОП-ЗОНЫ У НИЗА ЭКРАНА — мобильный заменитель ПКМ: пока тащишь элемент с
// контекстным меню, снизу прилипает полоса зон («настройка», «перемешать»); отпустил над зоной —
// действие. Живёт в chrome-слое: НЕ зумится, не ездит с паном, БЕЗ тени (это интерфейс, не предмет
// на столе), и кладётся НИЖНИМ ребёнком слоя — HUD-кнопки и меню рисуются поверх. Показана только
// во время драга; своих pointer-событий не слушает — попадание спрашивает сцена по dragScreen.

const BG = 0x18211c;
const BORDER = 0x5f7a6d;
const DEFAULT_HOT = 0xf2c14e;

const BAR_H = 58;
const BAR_BOTTOM = 64; // над ActionBar
const GAP = 10;
const MAX_ZONE_W = 220;

export interface DropBarZone {
  key: string;
  label: string;
}

interface Cell {
  key: string;
  g: Graphics;
  t: Text;
  rect: { x: number; y: number; w: number; h: number };
  hot: boolean;
}

export class DropBar {
  readonly root = new Container();
  private cells: Cell[] = [];
  private hotColor = DEFAULT_HOT;

  constructor() {
    this.root.visible = false;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Показать зоны на время драга. Раскладка — от ширины экрана, ровно по центру.
   *  accent — цвет hot-подсветки: в live это ЦВЕТ игрока, не общее золото. */
  show(zones: readonly DropBarZone[], screenW: number, screenH: number, accent = DEFAULT_HOT): void {
    this.clear();
    this.hotColor = accent;
    const zw = Math.min(MAX_ZONE_W, (screenW - GAP * (zones.length + 1)) / Math.max(1, zones.length));
    const total = zw * zones.length + GAP * (zones.length - 1);
    const x0 = (screenW - total) / 2;
    const y = screenH - BAR_BOTTOM - BAR_H;
    zones.forEach((z, i) => {
      const rect = { x: x0 + i * (zw + GAP), y, w: zw, h: BAR_H };
      const g = new Graphics();
      const t = new Text({ text: z.label, style: { fontFamily: PIXEL_FONT, fontSize: 17, fill: 0xcdb98f } });
      t.anchor.set(0.5);
      t.position.set(rect.x + rect.w / 2, rect.y + rect.h / 2);
      this.root.addChild(g, t);
      this.cells.push({ key: z.key, g, t, rect, hot: false });
    });
    this.paint();
    this.root.visible = true;
  }

  hide(): void {
    this.clear();
    this.root.visible = false;
  }

  /** Обновить подсветку по экранной точке пальца; вернуть ключ зоны под ним (или null). */
  hotAt(sx: number, sy: number): string | null {
    let hit: string | null = null;
    let changed = false;
    for (const c of this.cells) {
      const inside = sx >= c.rect.x && sx <= c.rect.x + c.rect.w && sy >= c.rect.y && sy <= c.rect.y + c.rect.h;
      if (inside) hit = c.key;
      if (inside !== c.hot) {
        c.hot = inside;
        changed = true;
      }
    }
    if (changed) this.paint();
    return hit;
  }

  private paint(): void {
    for (const c of this.cells) {
      c.g.clear();
      c.g.roundRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h, 10)
        .fill({ color: BG, alpha: 0.92 })
        .stroke({ width: c.hot ? 3 : 1.5, color: c.hot ? this.hotColor : BORDER, alpha: 0.95 });
      c.t.style.fill = c.hot ? this.hotColor : 0xcdb98f;
    }
  }

  private clear(): void {
    for (const c of this.cells) {
      c.g.destroy();
      c.t.destroy();
    }
    this.cells = [];
  }

  destroy(): void {
    this.clear();
    this.root.destroy();
  }
}
