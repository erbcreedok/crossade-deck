import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";
import { dashedRectSegments } from "./dashedRectSegments";

const BOB_SPEED = 2.2; // тот же темп, что у парящих карт (Card.ts) — единый язык покачивания
const BOB_AMPLITUDE = 3; // px — скромно, зона невысокая (кнопка-полоса, не карта)

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DropZoneOptions {
  name: string; // подпись в ПОКОЕ (rest) — что это за зона
  verb: string; // обещание при НАВЕДЕНИИ (hot) — что произойдёт, если отпустить именно тут
  armed?: string; // подпись, пока где-то на канвасе идёт СПОСОБНЫЙ на это действие драг, но ещё не над зоной (см. DropZone.setArmed, freeDeskEngine.frame). Опционально — без неё armed ведёт себя как rest.
  rect: Rect;
}

// Дропзона — основной элемент управления, ТРИ состояния (см. DropZone.setHot/setArmed):
//  • rest  — ничего не тянут → название (что это за зона).
//  • armed — где-то тянут ГРУЗ, СПОСОБНЫЙ на действие зоны, но ещё не над ней → зазывающий текст
//            (опционален; без opts.armed зона просто остаётся на name, как раньше).
//  • hot   — груз навели именно на эту зону → обещание (что случится, если отпустить).
// Разнесена по ДВУМ планам слоёв: base (фон + название) — на поверхности стола, под картами;
// verb/armedText — ВЫШЕ лежащих на зоне карт, с тенью текста, без idle-анимации (см. freeDeskEngine).
export class DropZone {
  readonly base = new Container();
  readonly verb: Text;
  readonly armedText: Text | null;
  private readonly g = new Graphics();
  private readonly name: Text;
  private hot = false;
  private armed = false;
  private age = 0; // локальное время для покачивания (см. step)

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

    if (opts.armed !== undefined) {
      // Серый, как name (0x9aa89f) — НЕ золотой: цвет меняется только на hot (см. класс-комментарий).
      this.armedText = new Text({ text: opts.armed, style: { fontFamily: PIXEL_FONT, fontSize: 20, fill: 0x9aa89f, align: "center" } });
      this.armedText.anchor.set(0.5);
      this.armedText.position.set(cx, cy);
      this.armedText.visible = false;
    } else {
      this.armedText = null;
    }

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

  // text — опциональная ПОДМЕНА обещания под ТЕКУЩИЙ груз (напр. «нет.» вместо «Отпускай!», если
  // подглядывать нечему — см. freeDeskEngine.needsPeek). Применяется КАЖДЫЙ раз, когда передана —
  // даже если hot/armed не изменился, иначе застрянет текст от предыдущего груза этой же сессии.
  setHot(hot: boolean, text?: string): void {
    if (text !== undefined) this.verb.text = text;
    if (hot === this.hot) return;
    this.hot = hot;
    this.updateVisibility();
    this.draw();
  }

  /** Где-то на канвасе активен драг, способный на действие зоны, но не над ней. hot побеждает. */
  setArmed(armed: boolean, text?: string): void {
    if (text !== undefined && this.armedText) this.armedText.text = text;
    if (armed === this.armed) return;
    this.armed = armed;
    this.updateVisibility();
  }

  private updateVisibility(): void {
    const showArmed = this.armed && !this.hot && this.armedText !== null;
    this.name.visible = !this.hot && !showArmed;
    this.verb.visible = this.hot;
    if (this.armedText) this.armedText.visible = showArmed;
  }

  // Покачивание armed/hot-текста — тот же язык, что у парящих карт (Card.ts, state==="floating"),
  // применённый к Y текста, а не карты. reduceMotion — эффективный флаг движка (OS + юзер-оверрайд,
  // см. useReducedMotion, issue #7) — при true текст просто стоит на месте, без покачивания.
  step(dt: number, reduceMotion: boolean): void {
    const cy = this.opts.rect.y + this.opts.rect.h / 2;
    if (reduceMotion) {
      this.verb.y = cy;
      if (this.armedText) this.armedText.y = cy;
      return;
    }
    this.age += dt;
    const bob = Math.sin(this.age * BOB_SPEED) * BOB_AMPLITUDE;
    this.verb.y = this.hot ? cy + bob : cy;
    if (this.armedText) this.armedText.y = this.armed && !this.hot ? cy + bob : cy;
  }

  private draw(): void {
    const r = this.opts.rect;
    this.g.clear();
    this.g.roundRect(r.x, r.y, r.w, r.h, 12).fill({ color: this.hot ? 0x3a5142 : 0x000000, alpha: this.hot ? 0.35 : 0.12 });
    if (this.hot) {
      this.g.roundRect(r.x, r.y, r.w, r.h, 12).stroke({ width: 2, color: 0xf2c14e });
    } else {
      for (const s of dashedRectSegments(r.x, r.y, r.w, r.h, 6, 5)) this.g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2);
      this.g.stroke({ width: 2, color: 0x5f7a6d });
    }
  }
}
