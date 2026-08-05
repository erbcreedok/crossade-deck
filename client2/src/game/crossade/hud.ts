// HUD СТОЛА CROSSADE — коллаборатор: топбар со статусом комнаты и кнопки действий справа от него.
//
// Какие кнопки видны — не поле состояния, а ФУНКЦИЯ от места за столом (actionsFor): «готов» видит
// каждый, «ГОУ!»/«раздать всё» — только дилер в лобби, «перераздача» — только дилер в игре. Правило
// вынесено отдельно и чисто, потому что именно оно ошибается молча: лишняя кнопка у не-дилера
// читается как «мне можно», а сервер её всё равно отклонит.
//
// Кнопка колоды тут не при чём: HUD не знает ни про доску, ни про карты — только про снимок и порт.

import type { Container } from "pixi.js";
import { Button } from "../ui/Button";
import { TopBar, TOPBAR_H } from "../ui/TopBar";
import type { CrossadePort } from "./net";
import type { CrossadeSeat, CrossadeState } from "./state";

/** Ключи кнопок в порядке показа — слева направо в правом углу топбара. */
export type ActionKey = "ready" | "go" | "dealAll" | "collect";

/** Кто что видит. Дилер в лобби готовит раздачу, дилер в игре может собрать всё обратно;
 *  остальным доступна только собственная готовность. */
export function actionsFor(self: { isDealer: boolean } | null, phase: CrossadeState["phase"]): readonly ActionKey[] {
  if (!self?.isDealer) return ["ready"];
  return phase === "lobby" ? ["go", "dealAll"] : ["collect"];
}

export interface HudDeps {
  chromeAdd(c: Container): void;
  setChromeButtons(btns: readonly Button[]): void;
  width(): number;
  onBack?: () => void;
}

export class CrossadeHud {
  private readonly topbar: TopBar;
  private readonly buttons: Record<ActionKey, Button>;
  private visible: readonly ActionKey[] = [];

  constructor(private readonly deps: HudDeps, port: CrossadePort) {
    this.topbar = new TopBar([{ key: "back", label: "← меню", onClick: () => deps.onBack?.() }]);
    deps.chromeAdd(this.topbar.root);
    this.buttons = {
      ready: new Button({ label: "готов", size: "sm", variant: "secondary", onClick: () => port.ready() }),
      go: new Button({ label: "ГОУ!", size: "sm", variant: "primary", onClick: () => port.go() }),
      dealAll: new Button({ label: "раздать всё", size: "sm", variant: "secondary", onClick: () => port.startGame() }),
      collect: new Button({ label: "перераздача", size: "sm", variant: "secondary", onClick: () => port.collectHands() }),
    };
    for (const b of Object.values(this.buttons)) deps.chromeAdd(b.root);
  }

  get height(): number {
    return this.topbar.height;
  }

  /** Свести HUD со снимком. Зовётся на КАЖДЫЙ снимок, даже когда зоны не менялись: счётчик
   *  готовности и фаза — не про доску (см. diff.ts#sameZones). */
  sync(state: CrossadeState, self: CrossadeSeat | null): void {
    const readyCount = state.seats.filter((s) => s.isReady).length;
    const room = state.inviteCode ? `Комната ${state.inviteCode}` : "Комната —";
    this.topbar.setStatus(`${room} · за столом ${state.seats.length} · готовы ${readyCount}`);
    this.buttons.ready.setLabel(self?.isReady ? "не готов" : "готов");
    this.visible = actionsFor(self, state.phase);
    this.layout();
    this.deps.setChromeButtons([...this.topbar.buttons, ...this.visible.map((k) => this.buttons[k])]);
  }

  layoutChrome(w: number): void {
    this.topbar.layout(w);
    this.layout();
  }

  /** Кнопки прижаты к правому краю; топбару сообщается, сколько справа занято — иначе его статус
   *  уезжает ПОД кнопки действий. */
  private layout(): void {
    for (const [key, b] of Object.entries(this.buttons)) b.root.visible = this.visible.includes(key as ActionKey);
    const midY = this.topbar.midY ?? TOPBAR_H / 2;
    let x = this.deps.width() - 12;
    for (const key of [...this.visible].reverse()) {
      const b = this.buttons[key];
      x -= b.w / 2;
      b.place(x, midY);
      x -= b.w / 2 + 8;
    }
    this.topbar.setRightInset(this.deps.width() - (x + 8));
  }

  /** Дев-хук: прямоугольники топбара и кнопок (см. сцену — она отдаёт их наружу). */
  rects(): {
    topbar: Record<string, { x: number; y: number; w: number; h: number }>;
    actions: Record<string, { x: number; y: number; w: number; h: number; visible: boolean }>;
  } {
    const actions: Record<string, { x: number; y: number; w: number; h: number; visible: boolean }> = {};
    for (const [key, b] of Object.entries(this.buttons)) {
      actions[key] = { x: b.x, y: b.y, w: b.w, h: b.h, visible: b.root.visible };
    }
    return { topbar: this.topbar.rects(), actions };
  }
}
