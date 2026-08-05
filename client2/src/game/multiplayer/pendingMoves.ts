// ОЖИДАНИЕ ОТВЕТА СЕРВЕРА — коллаборатор сцены: карта, которой дропнули ход, висит В ТОЧКЕ ДРОПА
// поднятой, пока эхо снимка не положит её в целевую зону (или отказ/таймаут не вернёт домой).
// Правила «когда одобрено / что показывать» — чистый pending.ts, здесь только Pixi и таймеры.
//
// Индикатор (спиннер под пальцем + оверлей-притемнение) живёт ДЕТЬМИ node.root: наследует все
// трансформы карты (дыхание, полёт, масштаб позы) и потому не нуждается в своей синхронизации.
//
// token — страховка таймеров after(): отменять их нечем, поэтому сработавший таймер сам проверяет,
// что ждёт всё ЕЩЁ ТОТ ЖЕ ход, а не следующий той же картой.

import { Graphics } from "pixi.js";
import { TEX_H, TEX_W, COLORS } from "../engine/constants";
import type { Card } from "../ui/Card";
import {
  approvedIn,
  pendingIndicatorVisible,
  rejectedCards,
  PENDING_SPINNER_SPEED,
  PENDING_TIMEOUT_S,
  type PendingKind,
  type PendingZones,
} from "./pending";

/** Пульс ожидания: чаще незачем (порог индикатора — десятые доли секунды), реже — индикатор
 *  запаздывал бы относительно порога. */
const TICK_S = 0.15;

export interface PendingDeps {
  node(cardId: string): Card | undefined;
  after(sec: number, fn: () => void): void;
  wake(): void;
  /** Отпустить карту домой той же пружиной, что обычный релиз драга. */
  release(node: Card): void;
  /** Короткая надпись на столе (молчание сервера человеку надо объяснить). */
  notify(text: string): void;
}

interface Waiting {
  kind: PendingKind;
  token: number;
  age: number;
  /** Точка касания на карте в её ЛОКАЛЬНЫХ (текстурных) координатах: спиннер встаёт под палец. */
  touchLocal: { x: number; y: number };
  spinner: Graphics | null;
  overlay: Graphics | null;
}

export class ScenePendingMoves {
  private readonly waiting = new Map<string, Waiting>();
  private token = 0;

  constructor(private readonly deps: PendingDeps) {}

  has(cardId: string): boolean {
    return this.waiting.has(cardId);
  }

  cards(): string[] {
    return [...this.waiting.keys()];
  }

  /**
   * Повесить карту в точке дропа до ответа сервера: поза lifted (дыхание и тень подъёма — её
   * собственные), драговый z остаётся.
   *
   * Точка покоя — по ПАЛЬЦУ (cp + смещение захвата), не по телу: тело едет пружиной и на быстром
   * жесте отстаёт — замороженное по телу, ожидание выглядело бы «застрял на полпути» (то же
   * правило, что у разрешения дропа, см. catalog-rules.md).
   */
  begin(cardId: string, kind: PendingKind, cp: { x: number; y: number }, grabOffset: { x: number; y: number }): void {
    const node = this.deps.node(cardId);
    if (!node) return;
    const token = ++this.token;
    // Смещение захвата снято на pointerdown в МИРОВЫХ единицах — обратно в локальные через мировой
    // масштаб карты в покое.
    const worldScale = node.width / TEX_W;
    this.waiting.set(cardId, {
      kind,
      token,
      age: 0,
      touchLocal: { x: -grabOffset.x / worldScale, y: -grabOffset.y / worldScale },
      spinner: null,
      overlay: null,
    });
    node.setState("lifted");
    node.body.setTarget({ x: cp.x + grabOffset.x, y: cp.y + grabOffset.y, rot: 0 });
    this.tick(cardId, token);
    this.deps.after(PENDING_TIMEOUT_S, () => {
      if (this.waiting.get(cardId)?.token !== token) return;
      this.fail(cardId);
      this.deps.notify("нет ответа");
    });
  }

  /** Одобренные снимком ходы — снять с ожидания. Зовётся ДО пересборки доски: снятая карта должна
   *  лечь тем же rebuildBoard, иначе висела бы до следующего чужого хода. */
  clearApproved(zones: PendingZones): void {
    for (const [card, p] of this.waiting) {
      if (approvedIn(p.kind, card, zones)) this.clear(card);
    }
  }

  /** Отказ сервера: вернуть домой те ожидающие карты, которых он касается. */
  applyRejected(signalCards: readonly string[]): void {
    for (const card of rejectedCards(signalCards, this.waiting.keys())) this.fail(card);
  }

  /** Снять ожидание (одобрено) — карту дальше ведёт вызывающий. */
  clear(cardId: string): void {
    const p = this.waiting.get(cardId);
    if (!p) return;
    p.spinner?.destroy();
    p.overlay?.destroy();
    this.waiting.delete(cardId);
  }

  /** Отказ или молчание: «стоп»-покачивание и домой. */
  fail(cardId: string): void {
    this.clear(cardId);
    const node = this.deps.node(cardId);
    if (!node) return;
    node.blockNudge();
    this.deps.release(node);
    this.deps.wake();
  }

  /** Вращение спиннеров — покадрово; true не даёт циклу уснуть под видимым индикатором. */
  step(dt: number): boolean {
    let spinning = false;
    for (const p of this.waiting.values()) {
      if (!p.spinner) continue;
      p.spinner.rotation += dt * PENDING_SPINNER_SPEED;
      spinning = true;
    }
    return spinning;
  }

  destroy(): void {
    for (const p of this.waiting.values()) {
      p.spinner?.destroy();
      p.overlay?.destroy();
    }
    this.waiting.clear();
  }

  /** Растит возраст ожидания и после порога один раз собирает индикатор. Тикает цепочкой after() —
   *  общего cancel у таймеров сцены нет, поэтому каждый тик сам проверяет свой token. */
  private tick(cardId: string, token: number): void {
    const p = this.waiting.get(cardId);
    if (!p || p.token !== token) return;
    p.age += TICK_S;
    const node = this.deps.node(cardId);
    if (node && !p.overlay && pendingIndicatorVisible(p.age)) {
      // Оверлей — по контуру карты (та же геометрия, что маска пыли в Card.ts): «карта занята,
      // сервер думает». Лёгкий: сквозь него читается и номинал, и дыхание.
      p.overlay = new Graphics()
        .roundRect(-TEX_W / 2 + 2, -TEX_H / 2 + 2, TEX_W - 4, TEX_H - 4, 16)
        .fill({ color: 0x000000, alpha: 0.22 });
      // Спиннер — незамкнутая дуга под пальцем (точка касания), классика «идёт запрос».
      p.spinner = new Graphics()
        .arc(0, 0, 26, 0, Math.PI * 1.5)
        .stroke({ width: 7, color: COLORS.gold, cap: "round" });
      p.spinner.position.set(p.touchLocal.x, p.touchLocal.y);
      node.root.addChild(p.overlay, p.spinner);
      this.deps.wake();
    }
    this.deps.after(TICK_S, () => this.tick(cardId, token));
  }
}
