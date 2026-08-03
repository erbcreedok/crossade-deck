import { Application, Container, Rectangle, Text } from "pixi.js";
import type { Room } from "colyseus.js";
import { Button } from "../ui/Button";
import { createPixiApp, ensureFonts } from "../engine/canvasHost";
import { PIXEL_FONT } from "../engine/constants";
import { joinCardRoom, joinTestRoom, type JoinOptions } from "../../net/connect";
import { browserAccountStorage, createAccount, loadAccount, saveAccount } from "../../net/account";

// Лобби Crossade — МИНИМАЛЬНОЕ канвасное меню входа в стол, по образцу MenuEngine (главное меню),
// но проще: три кнопки и надпись ошибки, без крика и прочих украшений. Ввод кода приглашения НЕ
// делаем: канвасного ввода текста в client2 нет (см. CROSSADE-DESIGN.md §6) — заводить его ради
// одного поля не MVP; вход только «создать стол» (пустой card_room) и «тестовый стол» (test_room
// с ботами, для разработки без второго живого игрока).

const TITLE = 0xf2c14e;
const ERROR = 0xe0483f;

export class CrossadeLobbyScene {
  private app: Application | null = null;
  private destroyed = false;
  private W = 1;
  private H = 1;
  private root!: Container;
  private title!: Text;
  private errorText!: Text;
  private buttons: Button[] = [];
  private pressed: Button | null = null;
  private hovered: Button | null = null;
  private joining = false;

  private onJoined: ((room: Room) => void) | null = null;
  private onBack: (() => void) | null = null;

  setOnJoined(cb: (room: Room) => void): void {
    this.onJoined = cb;
  }

  setOnBack(cb: () => void): void {
    this.onBack = cb;
  }

  async mount(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
    await ensureFonts();
    if (this.destroyed) return;

    const app = await createPixiApp(this.W, this.H);
    if (!app) return;
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true, texture: true });
      return;
    }
    container.appendChild(app.canvas);
    this.app = app;

    this.root = new Container();
    app.stage.addChild(this.root);
    this.build();

    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.W, this.H);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);

    app.ticker.add(this.tick);
    this.render();
    this.wake();
  }

  private build(): void {
    const cx = this.W / 2;
    const cy = this.H / 2;

    this.title = new Text({ text: "crossade", style: { fontFamily: PIXEL_FONT, fontSize: 44, fill: TITLE, align: "center" } });
    this.title.anchor.set(0.5);
    this.title.position.set(cx, cy - 150);
    this.root.addChild(this.title);

    const create = new Button({ label: "создать стол", variant: "primary", size: "lg", onClick: () => void this.join(joinCardRoom) });
    create.place(cx, cy - 40);
    const test = new Button({ label: "тестовый стол (боты)", variant: "secondary", size: "lg", onClick: () => void this.join(joinTestRoom) });
    test.place(cx, cy + 32);
    const back = new Button({ label: "← в меню", variant: "ghost", size: "md", onClick: () => this.onBack?.() });
    back.place(cx, cy + 104);
    this.buttons = [create, test, back];
    for (const b of this.buttons) this.root.addChild(b.root);

    this.errorText = new Text({
      text: "",
      style: { fontFamily: PIXEL_FONT, fontSize: 16, fill: ERROR, align: "center", wordWrap: true, wordWrapWidth: Math.min(320, this.W - 32) },
    });
    this.errorText.anchor.set(0.5, 0);
    this.errorText.position.set(cx, cy + 156);
    this.root.addChild(this.errorText);
  }

  private setBusy(v: boolean): void {
    this.joining = v;
    for (const b of this.buttons) b.setDisabled(v);
  }

  private setError(msg: string): void {
    this.errorText.text = msg;
  }

  private async ensureAccount(): Promise<{ accountId: string; name: string }> {
    const storage = browserAccountStorage();
    const existing = loadAccount(storage);
    if (existing) return { accountId: existing.id, name: existing.name };
    const created = await createAccount("Игрок");
    saveAccount(storage, created);
    return { accountId: created.id, name: created.name };
  }

  private async join(joiner: (opts: JoinOptions) => Promise<Room>): Promise<void> {
    if (this.joining) return;
    this.setBusy(true);
    this.setError("");
    try {
      const account = await this.ensureAccount();
      const room = await joiner({ accountId: account.accountId, name: account.name });
      if (this.destroyed) {
        room.leave();
        return;
      }
      this.onJoined?.(room);
    } catch {
      if (this.destroyed) return;
      this.setError("Не получилось подключиться — сервер спит или сеть барахлит, попробуйте ещё раз");
      this.setBusy(false);
    }
  }

  /** Дев-хук/e2e: канвас не отдаёт ни DOM-узлов, ни ролей (тот же приём, что у MenuEngine). */
  testHooks(): { buttons: { label: string; x: number; y: number }[]; error: string } {
    return { buttons: this.buttons.map((b) => ({ label: b.labelText, x: b.x, y: b.y })), error: this.errorText.text };
  }

  private hit(x: number, y: number): Button | null {
    for (const b of this.buttons) if (b.hitTest(x, y)) return b;
    return null;
  }

  private onDown = (e: { global: { x: number; y: number } }): void => {
    const b = this.hit(e.global.x, e.global.y);
    if (b) {
      this.pressed = b;
      b.setPressed(true);
    }
    this.wake();
  };

  private onMove = (e: { global: { x: number; y: number } }): void => {
    if (this.pressed) {
      this.pressed.setPressed(this.pressed.hitTest(e.global.x, e.global.y));
    } else {
      const b = this.hit(e.global.x, e.global.y);
      if (b !== this.hovered) {
        this.hovered = b;
        for (const x of this.buttons) x.hover(x === b);
        this.wake();
      }
    }
  };

  private onUp = (e: { global: { x: number; y: number } }): void => {
    if (this.pressed) {
      if (this.pressed.hitTest(e.global.x, e.global.y)) this.pressed.click();
      this.pressed.setPressed(false);
      this.pressed = null;
    }
    this.wake();
  };

  private wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  private tick = (): void => {
    if (!this.app) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    let moving = false;
    for (const b of this.buttons) {
      b.step(dt);
      if (!b.resting) moving = true;
    }
    this.render();
    if (!moving) this.app.ticker.stop();
  };

  private render(): void {
    for (const b of this.buttons) b.sync();
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.app) return;
    this.app.ticker.remove(this.tick);
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.app = null;
  }
}
