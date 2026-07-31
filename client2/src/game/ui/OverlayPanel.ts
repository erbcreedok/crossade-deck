import { Container, Graphics, Text } from "pixi.js";
import { Button, type ButtonOptions } from "./Button";
import { PIXEL_FONT } from "../engine/constants";

// Экранная панель поверх сцены — заголовок, подпись и кнопки по центру, на затемнённом фоне.
// Это «экран фазы» (меню / победа / поражение / пауза) НА КАНВАСЕ: HTML в приложении быть не
// должно, всё рисует движок (переносимость на платформы без DOM) — та же причина, что у TopBar.
//
// Живёт в ЭКРАННЫХ координатах (слой chrome в SceneEngine — вне камеры): панель не ездит с паном
// и не растёт от зума. Своих pointer-событий не слушает — ввод ведёт движок, как у карт и кнопок.
//
// Общий модуль, а не «экраны Косынки»: экран фазы нужен любой игре, и второй такой писать было бы
// ровно тем копированием, из-за которого пасьянс переписывается.

const BACKDROP = 0x0e1512;
const TITLE_FILL = 0xf2c14e;
const TEXT_FILL = 0xcdb98f;

export interface OverlayAction extends ButtonOptions {
  /** Ключ для дев-хука и e2e: тест находит кнопку по нему, не завися от подписи. */
  key: string;
}

export class OverlayPanel {
  readonly root = new Container();
  readonly buttons: Button[] = [];

  private readonly backdrop = new Graphics();
  private readonly title: Text;
  private readonly subtitle: Text;
  private readonly keys: string[] = [];
  private w = 1;
  private h = 1;

  constructor(actions: readonly OverlayAction[]) {
    this.root.addChild(this.backdrop);
    this.title = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 48, fill: TITLE_FILL, align: "center" } });
    this.title.anchor.set(0.5);
    this.subtitle = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 22, fill: TEXT_FILL, align: "center" } });
    this.subtitle.anchor.set(0.5);
    this.root.addChild(this.title, this.subtitle);
    for (const a of actions) {
      const b = new Button({ ...a, size: a.size ?? "lg", variant: a.variant ?? "primary" });
      this.buttons.push(b);
      this.keys.push(a.key);
      this.root.addChild(b.root);
    }
    this.root.visible = false;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Показать/спрятать. Скрытая панель не должна ловить ввод — движок берёт кнопки через
   *  activeButtons(), а не напрямую из buttons: невидимая кнопка иначе перехватывала бы тапы. */
  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Кнопки, которые сейчас реально нажимаются (панель скрыта → ни одной). */
  activeButtons(): Button[] {
    return this.root.visible ? this.buttons : [];
  }

  setText(title: string, subtitle = ""): void {
    this.title.text = title;
    this.subtitle.text = subtitle;
    this.subtitle.visible = subtitle.length > 0;
    this.layout(this.w, this.h);
  }

  /** Разложить под размер экрана. Зовётся на старте и на каждом ресайзе. */
  layout(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.backdrop.clear();
    this.backdrop.rect(0, 0, width, height).fill({ color: BACKDROP, alpha: 0.82 });

    // Блок по центру: заголовок → подпись → кнопки в столбик. Считаем реальную высоту блока,
    // чтобы он стоял по центру и на телефоне, где кнопки занимают заметную долю экрана.
    const gap = 18;
    const rows: number[] = [this.title.height];
    if (this.subtitle.visible) rows.push(this.subtitle.height);
    for (const b of this.buttons) rows.push(b.h);
    const total = rows.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);

    let y = height / 2 - total / 2;
    const row = (h: number): number => {
      const center = y + h / 2;
      y += h + gap;
      return center;
    };
    this.title.position.set(width / 2, row(this.title.height));
    if (this.subtitle.visible) this.subtitle.position.set(width / 2, row(this.subtitle.height));
    for (const b of this.buttons) b.place(width / 2, row(b.h));
  }

  /** Экранные прямоугольники кнопок по ключу (дев-хук/e2e — канвас не отдаёт ни DOM, ни ролей). */
  rects(): Record<string, { x: number; y: number; w: number; h: number }> {
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    this.buttons.forEach((b, i) => {
      out[this.keys[i]!] = { x: b.x, y: b.y, w: b.w, h: b.h };
    });
    return out;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
