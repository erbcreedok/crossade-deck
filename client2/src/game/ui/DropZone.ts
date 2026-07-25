import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DropZoneOptions {
  name: string; // подпись в ПОКОЕ — что это за зона
  verb: string; // обещание при НАВЕДЕНИИ — что произойдёт
  rect: Rect;
}

// Дропзона — основной элемент управления. Разнесена по ДВУМ планам слоёв:
//  • base (фон + НАЗВАНИЕ) лежит на поверхности стола — под картами;
//  • verb (ГЛАГОЛ) рисуется ВЫШЕ лежащих на зоне карт, с тенью текста, без idle-анимации.
// Движок кладёт base и verb в разные слои (см. freeDeskEngine). Подпись следует за тем, что
// «в пальцах»: в покое видно название, под занесённой картой — глагол.
export class DropZone {
  readonly base = new Container();
  readonly verb: Text;
  private readonly g = new Graphics();
  private readonly name: Text;
  private hot = false;

  constructor(private readonly opts: DropZoneOptions) {
    const cx = opts.rect.x + opts.rect.w / 2;
    const cy = opts.rect.y + opts.rect.h / 2;

    this.base.addChild(this.g);
    this.name = new Text({ text: opts.name, style: { fontFamily: PIXEL_FONT, fontSize: 22, fill: 0x9aa89f, align: "center" } });
    this.name.anchor.set(0.5);
    this.name.position.set(cx, cy);
    this.base.addChild(this.name);

    this.verb = new Text({
      text: opts.verb,
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: 24,
        fill: 0xf2c14e,
        align: "center",
        dropShadow: { color: 0x000000, alpha: 0.7, blur: 2, distance: 2, angle: Math.PI / 4 },
      },
    });
    this.verb.anchor.set(0.5);
    this.verb.position.set(cx, cy);
    this.verb.visible = false;

    this.draw();
  }

  get rect(): Rect {
    return this.opts.rect;
  }

  get label(): string {
    return this.opts.name;
  }

  contains(x: number, y: number): boolean {
    const r = this.opts.rect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  setHot(hot: boolean): void {
    if (hot === this.hot) return;
    this.hot = hot;
    this.name.visible = !hot;
    this.verb.visible = hot;
    this.draw();
  }

  private draw(): void {
    const r = this.opts.rect;
    this.g.clear();
    this.g
      .roundRect(r.x, r.y, r.w, r.h, 12)
      .fill({ color: this.hot ? 0x3a5142 : 0x000000, alpha: this.hot ? 0.35 : 0.12 })
      .stroke({ width: 2, color: this.hot ? 0xf2c14e : 0x5f7a6d });
  }
}
