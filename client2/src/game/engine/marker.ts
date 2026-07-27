import { Container, Graphics } from "pixi.js";
import { shouldShow, type MarkerState, type ShowPolicy } from "./markerPolicy";
import type { DragPayload } from "./drag";

// Метки слота контейнера — «драггер» (ручка захвата) и «якорь» (где дом стопки). Обе — ОДНА
// абстракция Marker, навешиваемая на что угодно через withDragger/withAnchor: соло-карту,
// стопку карт, стопку фигур. Marker НЕ знает про Card — только про MarkerHost (слот, состояние,
// как схватить цель) + иконку. Видимость — ДАННЫЕ (ShowPolicy) + чистая shouldShow (markerPolicy).

export type { MarkerState, ShowPolicy } from "./markerPolicy";

// Минимум, что метке нужно от таргета. Реализует и соло-элемент, и контейнер — метка generic.
export interface MarkerHost {
  slotPos(): { x: number; y: number }; // дом-слот (координаты контента)
  state(): MarkerState;
  makePayload?(cp: { x: number; y: number }): DragPayload | null; // как схватить цель (только у драггера)
}

export interface MarkerConfig {
  draw: (g: Graphics) => void; // как нарисовать иконку в ЛОКАЛЬНЫХ координатах (центр 0,0) — VIEW, не портируется
  show: ShowPolicy; // когда метка видна — ДАННЫЕ (см. markerPolicy)
  offset?: { x: number; y: number }; // сдвиг метки от слота (драггер — ниже, якорь — по центру)
  hit?: { w: number; h: number }; // хит-зона (для interactive = у кого есть makePayload)
  restAlpha?: number; // прозрачность в покое (еле видно)
  activeAlpha?: number; // при драге (ярче)
  follow?: boolean; // едет за пальцем при драге (иначе прячется естественно через showWhen)
  followOffset?: { x: number; y: number };
}

// Компонент-метка. Живёт в слое restLayer; на драге (follow) переезжает в dragLayer поверх пачки.
export class Marker {
  readonly gfx = new Graphics();
  private following = false;

  constructor(
    readonly host: MarkerHost,
    private readonly restLayer: Container,
    private readonly dragLayer: Container,
    readonly cfg: MarkerConfig,
  ) {
    cfg.draw(this.gfx);
    this.gfx.alpha = cfg.restAlpha ?? 0.55;
    restLayer.addChild(this.gfx);
    this.reposition();
  }

  get interactive(): boolean {
    return !!this.host.makePayload && !!this.cfg.hit;
  }

  /** Видна ли метка сейчас по политике (чистое решение; тесты/e2e читают его без render-цикла). */
  shown(): boolean {
    return shouldShow(this.cfg.show, this.host.state());
  }

  /** Кадр: видимость по политике (свап драггер↔якорь) + позиция дома, если не в follow. */
  update(): void {
    this.gfx.visible = this.shown();
    if (!this.following) this.reposition();
  }

  hitTest(cx: number, cy: number): boolean {
    if (!this.interactive || !this.gfx.visible) return false;
    const p = this.pos();
    const h = this.cfg.hit!;
    return Math.abs(cx - p.x) <= h.w / 2 && Math.abs(cy - p.y) <= h.h / 2;
  }

  beginFollow(): void {
    if (!this.cfg.follow) return; // нет follow → метка сама спрячется через update (atHome=0)
    this.following = true;
    this.dragLayer.addChild(this.gfx); // поверх пачки
    this.gfx.zIndex = 2e6;
    this.gfx.alpha = this.cfg.activeAlpha ?? 0.9;
  }

  followTo(cp: { x: number; y: number }): void {
    if (!this.following) return;
    const o = this.cfg.followOffset ?? { x: 0, y: 0 };
    this.gfx.position.set(cp.x + o.x, cp.y + o.y);
  }

  endFollow(): void {
    if (!this.following) return;
    this.following = false;
    this.restLayer.addChild(this.gfx);
    this.gfx.zIndex = 0;
    this.gfx.alpha = this.cfg.restAlpha ?? 0.55;
    this.reposition();
  }

  destroy(): void {
    this.gfx.destroy();
  }

  private pos(): { x: number; y: number } {
    const p = this.host.slotPos();
    const o = this.cfg.offset ?? { x: 0, y: 0 };
    return { x: p.x + o.x, y: p.y + o.y };
  }

  private reposition(): void {
    const p = this.pos();
    this.gfx.position.set(p.x, p.y);
  }
}

// «Приклеить» метку к таргету — как HOC, только императивно (attach компонента). Драггер
// интерактивен (нужен makePayload у host); якорь — просто метка. Оба generic по MarkerHost.
export function withDragger(host: MarkerHost, restLayer: Container, dragLayer: Container, cfg: Omit<MarkerConfig, "show"> & { show?: ShowPolicy }): Marker {
  return new Marker(host, restLayer, dragLayer, { show: "atHome", ...cfg });
}

export function withAnchor(host: MarkerHost, restLayer: Container, cfg: Omit<MarkerConfig, "show" | "follow" | "hit"> & { show?: ShowPolicy }): Marker {
  return new Marker(host, restLayer, restLayer, { show: "gone", ...cfg });
}
