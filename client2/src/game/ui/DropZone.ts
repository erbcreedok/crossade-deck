import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DropZoneOptions {
  name: string; // подпись в ПОКОЕ — что это за зона ("СБРОС", "СТОЛ")
  verb: string; // обещание при НАВЕДЕНИИ карты — что произойдёт ("сбросить", "взять")
  rect: Rect;
}

// Дропзона — основной элемент управления UI-kit. Единый вид на все: рамка + подпись. В покое
// показывает НАЗВАНИЕ, под занесённой картой подсвечивается и показывает ГЛАГОЛ (что сделает).
// Подпись следует за тем, что «в пальцах», а не просто именует зону — как в боевом столе.
export class DropZone {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly label: Text;
  private hot = false;

  constructor(private readonly opts: DropZoneOptions) {
    this.root.addChild(this.g);
    this.label = new Text({
      text: opts.name,
      style: { fontFamily: PIXEL_FONT, fontSize: 22, fill: 0x9aa89f, align: "center" },
    });
    this.label.anchor.set(0.5);
    this.label.position.set(opts.rect.x + opts.rect.w / 2, opts.rect.y + opts.rect.h / 2);
    this.root.addChild(this.label);
    this.draw();
  }

  get rect(): Rect {
    return this.opts.rect;
  }

  contains(x: number, y: number): boolean {
    const r = this.opts.rect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** Занесли карту (hot) — глагол + подсветка; убрали — обратно к названию. */
  setHot(hot: boolean): void {
    if (hot === this.hot) return;
    this.hot = hot;
    this.draw();
  }

  private draw(): void {
    const r = this.opts.rect;
    this.g.clear();
    this.g
      .roundRect(r.x, r.y, r.w, r.h, 12)
      .fill({ color: this.hot ? 0x3a5142 : 0x000000, alpha: this.hot ? 0.35 : 0.12 })
      .stroke({ width: 2, color: this.hot ? 0xf2c14e : 0x5f7a6d });
    this.label.text = this.hot ? this.opts.verb : this.opts.name;
    this.label.style.fill = this.hot ? 0xf2c14e : 0x9aa89f;
  }
}
