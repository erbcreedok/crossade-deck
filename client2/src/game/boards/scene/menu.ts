// КОНТЕКСТНОЕ МЕНЮ СЦЕНЫ БОРДЫ (композиция BoardScene): владелец ContextMenu и его контекста.
// Свои меню сцены — колода (перемешать/раздать) и карта (поворот/флип, команда cardFx — оверрайд
// у ВСЕХ); меню борды/стола отдаёт ХОСТ через шов SceneMenus (DIP: сцена не знает, что
// настраивается). Сцена держит узкий MenuSceneHost и зовёт open*/close.

import { ContextMenu, type MenuRow } from "../../ui/ContextMenu";
import type { Button } from "../../ui/Button";
import type { Container } from "pixi.js";
import type { BoardCommand } from "../core/spec";
import type { MenuTargetKind } from "../geometry/sceneAreas";
import type { SceneMenus } from "./scene";

export type MenuCtx = { kind: MenuTargetKind } | { kind: "deck"; slot: string } | { kind: "card"; id: string };

export interface MenuSceneHost {
  menus?: SceneMenus;
  size(): { w: number; h: number };
  chromeAdd(child: Container): void;
  /** Кнопки меню добавились/исчезли: сцена пересобирает свой хит-тест хрома. */
  setMenuButtons(btns: readonly Button[]): void;
  /** Ховер мог указывать на строку меню — забыть ДО destroy (мёртвая Graphics). */
  forgetHovered(btns: readonly Button[]): void;
  wake(): void;
  slotOf(id: string): string | null;
  isDeckSlot(slot: string): boolean;
  fx(id: string): { rot?: number; face?: boolean } | undefined;
  faceUpIn(id: string, slot: string): boolean;
  hitElementId(cp: { x: number; y: number }): string | null;
  menuTarget(cp: { x: number; y: number }): MenuTargetKind | null;
  dispatch(cmd: BoardCommand): void;
  shuffle(slot: string): void;
  deal(slot: string): void;
}

export class SceneMenu {
  private menu: ContextMenu | null = null;
  private at = { x: 0, y: 0 };
  private ctx: MenuCtx = { kind: "table" };

  constructor(private readonly host: MenuSceneHost) {}

  isOpen(): boolean {
    return this.menu !== null;
  }

  contains(sx: number, sy: number): boolean {
    return this.menu?.contains(sx, sy) ?? false;
  }

  /** Меню по точке (long-press/ПКМ): сперва ЭЛЕМЕНТ (колода/карта), потом зона (борда/стол). */
  openAt(cp: { x: number; y: number }, sp: { x: number; y: number }): void {
    this.close();
    const id = this.host.hitElementId(cp);
    const slot = id ? this.host.slotOf(id) : null;
    if (id && slot) {
      this.ctx = this.host.isDeckSlot(slot) ? { kind: "deck", slot } : { kind: "card", id };
    } else {
      const target = this.host.menuTarget(cp);
      if (!target) return;
      this.ctx = { kind: target };
    }
    this.at = { x: sp.x, y: sp.y };
    this.show();
  }

  /** Меню с ГОТОВЫМ контекстом (фикс-зона «настройка» при драге). */
  openFor(ctx: MenuCtx, at: { x: number; y: number }): void {
    this.close();
    this.ctx = ctx;
    this.at = at;
    this.show();
  }

  close(): void {
    if (!this.menu) return;
    this.host.forgetHovered(this.menu.buttons);
    this.menu.destroy();
    this.menu = null;
    this.host.setMenuButtons([]);
    this.host.wake();
  }

  private rows(): { title: string; rows: readonly MenuRow[] } {
    const ctx = this.ctx;
    if (ctx.kind === "deck") {
      const rows: MenuRow[] = [
        { key: "shuffle", label: "перемешать", close: true, onSelect: () => this.host.shuffle(ctx.slot) },
        { key: "deal", label: "раздать по 2", close: true, onSelect: () => this.host.deal(ctx.slot) },
        ...(this.host.menus?.deckExtras?.() ?? []),
      ];
      return { title: "колода", rows };
    }
    if (ctx.kind === "card") {
      const fx = this.host.fx(ctx.id) ?? {};
      const turned = (fx.rot ?? 0) !== 0;
      const slot = this.host.slotOf(ctx.id);
      const faceUp = fx.face ?? (slot ? this.host.faceUpIn(ctx.id, slot) : true);
      return {
        title: "карта",
        rows: [
          { key: "turn", label: "поворот", value: turned ? "90°" : "0°", onSelect: () => this.toggleCardFx(ctx.id, "rot") },
          { key: "flip", label: "лицом", value: faceUp ? "вверх" : "вниз", onSelect: () => this.toggleCardFx(ctx.id, "face") },
        ],
      };
    }
    const hostMenu = this.host.menus?.menuFor(ctx.kind);
    return hostMenu ?? { title: ctx.kind === "board" ? "борда" : "стол", rows: [] };
  }

  private show(): void {
    const { title, rows } = this.rows();
    if (!rows.length) return;
    // После строки-настройки меню обновляется по месту (значение/состав строк сменились);
    // строка-действие (close) закрывает меню — действию мешать незачем.
    const wrapped = rows.map((row) => ({
      ...row,
      onSelect: () => {
        row.onSelect();
        if (row.close) this.close();
        else this.refresh();
      },
    }));
    const size = this.host.size();
    this.menu = new ContextMenu({ title, rows: wrapped });
    this.menu.place(this.at.x, this.at.y, size.w, size.h);
    this.host.chromeAdd(this.menu.root);
    this.host.setMenuButtons(this.menu.buttons);
    this.host.wake();
  }

  /** Обновить открытое меню по месту (после смены настройки состав/значения строк другие). */
  private refresh(): void {
    if (!this.menu) return;
    this.close();
    this.show();
  }

  /** Меню одиночной карты: поворот 90° / принудительный флип — команда порта (оверрайд у ВСЕХ). */
  private toggleCardFx(id: string, what: "rot" | "face"): void {
    const fx = { ...(this.host.fx(id) ?? {}) };
    if (what === "rot") {
      if ((fx.rot ?? 0) === 0) fx.rot = Math.PI / 2;
      else delete fx.rot;
    } else {
      const slot = this.host.slotOf(id);
      const cur = fx.face ?? (slot ? this.host.faceUpIn(id, slot) : true);
      fx.face = !cur;
    }
    this.host.dispatch({ t: "cardFx", el: id, fx });
  }

  destroy(): void {
    this.close();
  }
}
