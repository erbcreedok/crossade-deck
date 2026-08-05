// ХРОМ СЦЕНЫ БОРДЫ — экранный HUD (композиция BoardScene): кнопки ActionBar, инструменты хоста
// (правый верхний угол), бейдж статуса и кубики. Владеет своими Pixi-объектами; сцена отдаёт
// контейнер и порт команд узким швом ChromeHost и спрашивает buttons() для хит-теста.

import { Text, type Container } from "pixi.js";
import { PIXEL_FONT, COLORS } from "../../engine/constants";
import { Button } from "../../ui/Button";
import type { ActionSpec, BoardCommand } from "../core/spec";
import type { SceneTool } from "./scene";

/** Высота нижней полосы действий: кнопки стоят по центру на 26 от низа, значит полоса занимает 52.
 *  Доска вписывается в остаток экрана над ней (см. scene.ts#fitBoard) — иначе полоса накрывает
 *  нижний ряд слотов. */
export const ACTION_BAR_H = 52;

export interface ChromeHost {
  add(child: Container): void;
  dispatch(cmd: BoardCommand): void;
  accent(): number;
  wake(): void;
}

export class SceneChrome {
  private actionButtons: Button[] = [];
  private toolButtons: Button[] = [];
  private badgeText: Text | null = null;
  private diceText: Text | null = null;
  private size = { w: 0, h: 0 };

  constructor(private readonly host: ChromeHost) {}

  build(actions: readonly ActionSpec[], tools: readonly SceneTool[]): void {
    for (const action of actions) {
      const b = new Button({ label: action.label, size: "sm", variant: "secondary", onClick: () => this.host.dispatch(action.command) });
      this.host.add(b.root);
      this.actionButtons.push(b);
    }
    // Инструменты хоста (live и т.п.) — канвасом: HTML в игровом экране запрещён доктриной.
    for (const tool of tools) {
      const b = new Button({ label: tool.label, size: "sm", variant: "secondary", onClick: tool.onClick });
      this.host.add(b.root);
      this.toolButtons.push(b);
    }
    this.badgeText = new Text({ text: "", style: { fontFamily: PIXEL_FONT, fontSize: 14, fill: COLORS.gold } });
    this.badgeText.anchor.set(1, 0.5);
    this.host.add(this.badgeText);
    this.diceText = new Text({ text: "", style: { fontFamily: PIXEL_FONT, fontSize: 20, fill: COLORS.gold } });
    this.diceText.anchor.set(1, 0.5);
    this.host.add(this.diceText);
  }

  /** Все кнопки хрома (хит-тест сцены; меню добавляет свои поверх). */
  buttons(): Button[] {
    return [...this.actionButtons, ...this.toolButtons];
  }

  /** Строка статуса хоста у инструментов (live: «ник · комната 1234»). Пустая строка — спрятать. */
  setBadge(text: string): void {
    if (!this.badgeText) return;
    this.badgeText.text = text;
    this.badgeText.style.fill = this.host.accent(); // профиль — цветом игрока
    this.layout(this.size.w, this.size.h);
    this.host.wake();
  }

  syncDice(dice: readonly number[]): void {
    if (!this.diceText) return;
    this.diceText.text = dice.length ? `🎲 ${dice.join(" + ")}` : "";
  }

  layout(w: number, h: number): void {
    this.size = { w, h };
    let x = 12;
    const y = h - ACTION_BAR_H / 2;
    for (const b of this.actionButtons) {
      b.place(x + b.w / 2, y);
      x += b.w + 8;
    }
    // Инструменты — от правого края, бейдж — слева от них.
    let rx = w - 12;
    for (const b of [...this.toolButtons].reverse()) {
      b.place(rx - b.w / 2, 30);
      rx -= b.w + 8;
    }
    this.badgeText?.position.set(rx, 30);
    this.diceText?.position.set(w - 12, y);
  }
}
