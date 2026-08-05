// ХРОМ КОСЫНКИ — владелец экранного HUD: полоса управления, экран фазы (меню до раздачи, итог после)
// и кнопка «переработать сброс» у пустого стока.
//
// Всё канвасом, а не React поверх канваса: приложение целиком рисует движок, и вёрстка не разъезжается
// между экраном игры и экраном итога.
//
// Два правила, которые здесь ломались:
//   • панель фазы лежит НИЖЕ полосы управления: затемнение гасит стол, но «в меню» обязано работать
//     одинаково на любом экране, а притушенная кликабельная кнопка врёт;
//   • невидимая кнопка не должна ловить тапы — список кнопок хрома пересобирается вместе с видимостью.

import { Button } from "../ui/Button";
import { TopBar, TOPBAR_H } from "../ui/TopBar";
import { OverlayPanel } from "../ui/OverlayPanel";
import { CARD, type SolitaireTree } from "./tree";
import type { SolitaireGameState } from "./solitaireState";

export interface SolitaireChromeDeps {
  chromeAdd(node: TopBar["root"]): void;
  surfaceAdd(node: Button["root"]): void;
  setChromeButtons(btns: readonly Button[]): void;
  /** Кнопки В КООРДИНАТАХ СТОЛА (кнопка стока стоит на доске, а не в хроме). */
  setTableButtons(btns: readonly Button[]): void;
  onBack(): void;
  newGame(): void;
  dealStock(): void;
}

export class SolitaireChrome {
  private topbar: TopBar | null = null;
  private overlay: OverlayPanel | null = null;
  private recycle: Button | null = null;

  constructor(private readonly deps: SolitaireChromeDeps) {}

  build(): void {
    this.topbar = new TopBar([
      { key: "back", label: "← в меню", onClick: () => this.deps.onBack() },
      { key: "new-game", label: "⟲ новая", onClick: () => this.deps.newGame() },
    ]);
    this.overlay = new OverlayPanel([{ key: "start", label: "Новая игра", onClick: () => this.deps.newGame() }]);
    this.deps.chromeAdd(this.overlay.root);
    this.deps.chromeAdd(this.topbar.root);
    this.recycle = new Button({ label: "⟲", variant: "ghost", size: "sm", onClick: () => this.deps.dealStock() });
    this.deps.surfaceAdd(this.recycle.root);
  }

  layout(w: number, h: number): void {
    this.topbar?.layout(w);
    this.overlay?.layout(w, h);
  }

  /** Стол начинается ПОД полосой: иначе верх доски навсегда уезжает под непрозрачный HUD и
   *  доскроллить до него нечем (кламп упирается в 0). */
  insetTop(): number {
    return this.topbar?.height ?? TOPBAR_H;
  }

  /** Пока поверх стола висит экран фазы, карты не хватаются — тап сквозь него был бы ходом по доске,
   *  которой игрок сейчас не видит. */
  get overlayVisible(): boolean {
    return this.overlay?.visible ?? false;
  }

  /** Свести HUD с партией: экран фазы, счётчик ходов и кнопка переработки. */
  sync(state: SolitaireGameState, tree: SolitaireTree): void {
    this.syncScreen(state);
    this.syncRecycle(state, tree);
  }

  rects(): { topbar: Record<string, { x: number; y: number; w: number; h: number }>; screen: { visible: boolean; buttons: Record<string, { x: number; y: number; w: number; h: number }> } } {
    return {
      topbar: this.topbar?.rects() ?? {},
      screen: { visible: this.overlayVisible, buttons: this.overlay?.rects() ?? {} },
    };
  }

  destroy(): void {
    this.topbar = null;
    this.overlay = null;
    this.recycle = null;
  }

  /** Экран фазы: меню до первой раздачи, итог — после победы/поражения. В «playing» панели нет. */
  private syncScreen(state: SolitaireGameState): void {
    const panel = this.overlay;
    if (!panel || !this.topbar) return;
    // Без эмодзи: в client2 их убрали — цветной глиф ломает пиксельный шрифт (см. HANDOFF §1).
    if (state.phase === "won") panel.setText("Вы выиграли!", `Ходов: ${state.movesCount}`);
    else if (state.phase === "lost") panel.setText("Нет ходов", `Ходов: ${state.movesCount}`);
    else panel.setText("Косынка");
    panel.setVisible(state.phase !== "playing");
    // Счётчик — только в игре: до раздачи и после итога он показывал бы «Ходов: 0» ни о чём.
    this.topbar.setStatus(state.phase === "playing" ? `Ходов: ${state.movesCount}` : "");
    this.deps.setChromeButtons([...this.topbar.buttons, ...panel.activeButtons()]);
  }

  /** Пустой сток = кнопка «переработать сброс»: карты под пальцем там уже нет, а ход есть. */
  private syncRecycle(state: SolitaireGameState, tree: SolitaireTree): void {
    const b = this.recycle;
    if (!b) return;
    const show = (state.board.slots.stock?.members.length ?? 0) === 0 && (state.board.slots.waste?.members.length ?? 0) > 0;
    const at = tree.origins.stock!;
    b.place(at.x + CARD.w / 2, at.y + CARD.h / 2);
    b.root.visible = show;
    this.deps.setTableButtons(show ? [b] : []);
  }
}
