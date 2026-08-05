import { Container } from "pixi.js";
import { ShadowLayer } from "../ui/ShadowLayer";
import type { CardState, ShadowShape } from "../ui/Card";

// Слои сцены по «плану» (высоте над столом) + слитые тени под каждым уровнем. Инкапсулирует
// z-порядок и теневой пасс. Чистые части (levelOf, bucketByLevel) тестируются без Pixi; сам
// класс — тонкая обёртка над контейнерами.

export type Level = "rest" | "lifted" | "fan" | "drag";
export const LEVELS: readonly Level[] = ["rest", "lifted", "fan", "drag"];

/** План элемента → уровень слоя. Удержание живёт в слоях драга (сверху). */
export function levelOf(s: CardState): Level {
  if (s === "held" || s === "drag") return "drag";
  if (s === "lifted") return "lifted";
  if (s === "fan") return "fan";
  return "rest";
}

/** Кто отбрасывает тень: элемент с силуэтом И ВИДИМЫЙ. Невидимый (напр. карта, ушедшая в экранную
 *  руку, — её контентный двойник спрятан) тени не даёт: иначе от него остаётся осиротевшая тень на
 *  старом месте, а сдвиг колоды её не забирает. Чистая — сторожится без Pixi. */
export function shadowCasters(els: Iterable<{ shadowRect: ShadowShape | null; visible: boolean; state: CardState }>): { level: Level; rect: ShadowShape }[] {
  const out: { level: Level; rect: ShadowShape }[] = [];
  for (const c of els) if (c.shadowRect && c.visible) out.push({ level: levelOf(c.state), rect: c.shadowRect });
  return out;
}

/** Сгруппировать силуэты теней по уровню (для слитого пасса). Чистая. */
export function bucketByLevel(items: readonly { level: Level; rect: ShadowShape }[]): Record<Level, ShadowShape[]> {
  const out: Record<Level, ShadowShape[]> = { rest: [], lifted: [], fan: [], drag: [] };
  for (const it of items) out[it.level].push(it.rect);
  return out;
}

export class SceneLayers {
  readonly surface = new Container(); // стол: тексты, фоны зон, кнопки
  readonly verb = new Container(); // глаголы зон (над лежащими картами)
  readonly cards: Record<Level, Container> = {
    rest: new Container(),
    lifted: new Container(),
    fan: new Container(),
    drag: new Container(),
  };
  private readonly shadows: Record<Level, ShadowLayer> = {
    rest: new ShadowLayer(),
    lifted: new ShadowLayer(),
    fan: new ShadowLayer(),
    drag: new ShadowLayer(),
  };

  constructor(content: Container) {
    // Карты слоя сортируются по zIndex (глубине) — после драга карта встаёт на свою глубину.
    for (const lvl of LEVELS) this.cards[lvl].sortableChildren = true;
    // z-порядок снизу вверх: под каждым уровнем карт — его слитая тень; глаголы — над лежащими.
    content.addChild(
      this.surface,
      this.shadows.rest.root,
      this.cards.rest,
      this.shadows.lifted.root,
      this.cards.lifted,
      this.shadows.fan.root,
      this.verb,
      this.cards.fan,
      this.shadows.drag.root,
      this.cards.drag,
    );
  }

  /** Положить визуал элемента в слой его уровня. */
  place(root: Container, level: Level): void {
    this.cards[level].addChild(root);
  }

  /** Пересобрать тени всех уровней из силуэтов. */
  paintShadows(items: readonly { level: Level; rect: ShadowShape }[], w: number, h: number): void {
    const byLevel = bucketByLevel(items);
    for (const lvl of LEVELS) this.shadows[lvl].update(byLevel[lvl], w, h);
  }

  /** Снять все карты со слоёв и погасить тени (для рестарта контента). */
  clearCards(w: number, h: number): void {
    for (const lvl of LEVELS) {
      this.cards[lvl].removeChildren();
      this.shadows[lvl].update([], w, h);
    }
  }
}
