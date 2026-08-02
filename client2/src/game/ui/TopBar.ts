import { Container, Graphics, Text } from "pixi.js";
import { Button, type ButtonOptions } from "./Button";
import { PIXEL_FONT } from "../engine/constants";

// Верхняя панель сцены — НА КАНВАСЕ, а не в HTML. Приложение целиком рисуется движком: так оно
// одинаково выглядит на любой платформе и переносится туда, где DOM'а нет вовсе, а вёрстка не
// разъезжается между экраном игры и экраном меню.
//
// Панель живёт в ЭКРАННЫХ координатах (слой chrome в SceneEngine — вне камеры), поэтому не ездит
// с паном и не масштабируется зумом: кнопка «назад» обязана быть на месте при любом виде стола.
// Свои pointer-события не слушает — ввод ведёт движок (тот же контракт, что у Button и карт), так
// что HUD, драг и пан не спорят за один палец.
//
// Раскладка: кнопки слева направо от левого края, статус — прижат к правому. Узкий экран панель
// НЕ переносит на вторую строку: она ужимает кнопки до размера sm, а статус прячет — полоса
// обязана оставаться одной строкой фиксированной высоты, иначе поле стола прыгало бы по высоте
// при каждой смене подписи.

export const TOPBAR_H = 52;
const PAD = 12;
const GAP = 8;
const BG = 0x1c2620;
const LINE = 0x3a4a40;
const STATUS_FILL = 0xcdb98f;

export interface TopBarItem extends ButtonOptions {
  /** Ключ для дев-хука и e2e: по нему тест находит кнопку, не завися от подписи. */
  key: string;
}

export class TopBar {
  readonly root = new Container();
  readonly buttons: Button[] = [];

  private readonly bg = new Graphics();
  private readonly status: Text;
  private readonly keys: string[] = [];
  private w = 1;
  private rightInset = 0;

  constructor(items: readonly TopBarItem[], statusText = "") {
    this.root.addChild(this.bg);
    for (const it of items) {
      // fit: "content" — кнопки панели меряются ПО СВОЕЙ подписи. На пресетной ширине самая
      // длинная («⟲ песочница») ужимала текст на 8%, и в одном ряду соседние подписи одного
      // уровня оказывались разного кегля — то самое разъезжание, против которого заведён #68.
      const b = new Button({ fit: "content", ...it, size: it.size ?? "sm", variant: it.variant ?? "secondary" });
      this.buttons.push(b);
      this.keys.push(it.key);
      this.root.addChild(b.root);
    }
    this.status = new Text({ text: statusText, style: { fontFamily: PIXEL_FONT, fontSize: 18, fill: STATUS_FILL } });
    this.status.anchor.set(1, 0.5);
    this.root.addChild(this.status);
  }

  /** Текст статуса справа (счётчик ходов и т.п.). Пустая строка — статуса нет. */
  setStatus(text: string): void {
    if (this.status.text === text) return;
    this.status.text = text;
    this.layout(this.w);
  }

  /**
   * Сколько места СПРАВА занято чужими кнопками.
   *
   * Панель знает только свои кнопки (слева), а сцена вправе положить свои действия в тот же ряд
   * справа — «ГОУ!», «перераздача». Без этой цифры статус прижимался к правому краю и уезжал ПОД
   * них: «Комната 1212 · за столом…» читалась как «Комна…». Гасить статус целиком было бы хуже —
   * чаще всего он влезает между левыми и правыми кнопками.
   */
  setRightInset(px: number): void {
    const v = Math.max(0, Math.round(px));
    if (v === this.rightInset) return;
    this.rightInset = v;
    this.layout(this.w);
  }

  /** Разложить под ширину экрана. Зовётся на старте и на каждом ресайзе. */
  layout(width: number): void {
    this.w = width;
    this.bg.clear();
    this.bg.rect(0, 0, width, TOPBAR_H).fill({ color: BG });
    this.bg.moveTo(0, TOPBAR_H).lineTo(width, TOPBAR_H).stroke({ width: 2, color: LINE });

    // Кнопки в ряд слева. Не влезли — вся панель уходит в размер sm (у Button ширина от size),
    // и статус гасим: важнее сохранить доступ к «назад»/«рестарт», чем показать счётчик.
    let x = PAD;
    for (const b of this.buttons) {
      b.place(x + b.w / 2, TOPBAR_H / 2);
      x += b.w + GAP;
    }
    const right = width - this.rightInset - PAD;
    const room = right - x;
    this.status.visible = this.status.text.length > 0 && room > this.status.width;
    this.status.position.set(right, TOPBAR_H / 2);
  }

  /** Экранная позиция кнопки по ключу (для дев-хука/e2e — канвас не отдаёт ни DOM, ни ролей). */
  rects(): Record<string, { x: number; y: number; w: number; h: number }> {
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    this.buttons.forEach((b, i) => {
      out[this.keys[i]!] = { x: b.x, y: b.y, w: b.w, h: b.h };
    });
    return out;
  }

  /** Попадает ли ЭКРАННАЯ точка в панель (её полосу) — чтобы сцена не считала это тапом по столу. */
  contains(sy: number): boolean {
    return sy <= TOPBAR_H;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
