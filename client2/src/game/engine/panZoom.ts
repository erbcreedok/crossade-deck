import { Application, Container } from "pixi.js";
import { InputRouter, type InputHandlers } from "./inputRouter";
import { Viewport } from "./viewport";

// АТОМАРНЫЙ приклеиваемый пан/зум: одна функция вешает на канвас те же жесты, что в песочнице
// (драг-пан 1 пальцем, пинч 2 пальцами, колесо=пан / ctrl+колесо=зум, инерция), применяя их к
// контейнеру `content`. Переиспользует Viewport (чистая математика) + InputRouter (стейт-машина),
// НЕ дублируя их. Драг элементов не поддерживает намеренно — только вид; клики кнопок роутятся
// через opts.buttons, чтобы не спорить за pointer с паном (как в движке песочницы).

const ZOOM_SENS = 0.0015;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Кнопки на канвасе (Button/Toggle/Stepper) сами ввод не слушают — отдаём их сюда для арбитража.
export interface PanZoomButtons<B> {
  pick(cx: number, cy: number): B | null;
  contains(b: B, cx: number, cy: number): boolean;
  down(b: B): void;
  move(b: B, inside: boolean): void;
  up(b: B, inside: boolean): void; // inside → клик
  hover(b: B | null): void;
}

export interface PanZoomOptions<B> {
  minZoom: number;
  maxZoom: number;
  topInset?: number;
  contentSize(): { w: number; h: number }; // размер контента в его координатах (для clamp/скролла)
  buttons?: PanZoomButtons<B>;
  onChange?(): void; // разбудить рендер-цикл после изменения вида
}

export interface PanZoomHandle {
  readonly viewport: Viewport;
  refresh(): void; // пересчитать экран/контент + кламп + применить (после ресайза/смены контента)
  apply(): void; // применить x/y/zoom к контейнеру
  fitWidth(pad?: number): void; // вписать по ширине (как стартовый вид песочницы)
  step(dtMs: number): boolean; // прокрутить инерцию — звать из тикера; true пока едет
  detach(): void;
}

export function attachPanZoom<B>(app: Application, content: Container, opts: PanZoomOptions<B>): PanZoomHandle {
  const vp = new Viewport(opts.minZoom, opts.maxZoom, opts.topInset ?? 24);
  const canvas = app.canvas;
  canvas.style.touchAction = "none";

  let pinch = { dist: 1, zoom: 1, cx: 0, cy: 0 };
  let vel = { x: 0, y: 0 };
  let lastPanT = 0;
  const wake = (): void => opts.onChange?.();

  const apply = (): void => {
    content.position.set(vp.x, vp.y);
    content.scale.set(vp.zoom);
  };
  const sync = (): void => {
    vp.setScreen(app.screen.width, app.screen.height);
    const s = opts.contentSize();
    vp.setContent(s.w, s.h);
  };

  const h: InputHandlers<never, B> = {
    screenToContent: (sx, sy) => vp.screenToContent(sx, sy),
    pickCard: () => null,
    cardDraggable: () => false,
    pickButton: (cx, cy) => opts.buttons?.pick(cx, cy) ?? null,
    buttonContains: (b, cx, cy) => opts.buttons!.contains(b, cx, cy),
    onCardGrab: () => {},
    onCardMove: () => {},
    onCardDrop: () => {},
    onCardCancel: () => {},
    onCardBlocked: () => {},
    onButtonDown: (b) => {
      opts.buttons?.down(b);
      wake();
    },
    onButtonMove: (b, inside) => opts.buttons?.move(b, inside),
    onButtonUp: (b, inside) => {
      opts.buttons?.up(b, inside);
      wake();
    },
    onPanStart: () => {
      vp.stopFling();
      vel = { x: 0, y: 0 };
      lastPanT = 0;
    },
    onPan: (dx, dy) => {
      const t = performance.now();
      if (lastPanT) {
        const dtp = Math.min(0.1, (t - lastPanT) / 1000);
        if (dtp > 0) vel = { x: 0.5 * vel.x + 0.5 * (dx / dtp), y: 0.5 * vel.y + 0.5 * (dy / dtp) };
      }
      lastPanT = t;
      sync();
      vp.panBy(dx, dy);
      apply();
      wake();
    },
    onPanEnd: () => {
      vp.startFling(vel.x, vel.y);
      wake();
    },
    onPinchStart: (mx, my, dist) => {
      const c = vp.screenToContent(mx, my);
      pinch = { dist, zoom: vp.zoom, cx: c.x, cy: c.y };
    },
    onPinch: (mx, my, dist) => {
      sync();
      vp.zoom = clamp((pinch.zoom * dist) / pinch.dist, opts.minZoom, opts.maxZoom);
      vp.x = mx - pinch.cx * vp.zoom;
      vp.y = my - pinch.cy * vp.zoom;
      vp.clamp();
      apply();
      wake();
    },
    onHover: (b) => {
      opts.buttons?.hover(b);
      wake();
    },
    afterAny: () => wake(),
  };

  const router = new InputRouter<never, B>(h);
  const rect = (): DOMRect => canvas.getBoundingClientRect();
  const at = (e: PointerEvent): { x: number; y: number } => {
    const r = rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent): void => {
    const p = at(e);
    router.down(e.pointerId, p.x, p.y);
  };
  const onMove = (e: PointerEvent): void => {
    const p = at(e);
    router.move(e.pointerId, p.x, p.y);
  };
  const onUp = (e: PointerEvent): void => {
    const p = at(e);
    router.up(e.pointerId, p.x, p.y);
  };
  // Колесо: ctrl/⌘ = зум вокруг курсора; иначе пан (тачпад двумя пальцами). deltaMode → в пиксели.
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * app.screen.height : e.deltaY;
    sync();
    if (e.ctrlKey || e.metaKey) {
      const r = rect();
      vp.zoomAround(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * ZOOM_SENS));
    } else {
      vp.panBy(-e.deltaX, -dy);
    }
    apply();
    wake();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  sync();
  apply();

  return {
    viewport: vp,
    apply,
    refresh: () => {
      sync();
      vp.clamp();
      apply();
      wake();
    },
    fitWidth: (pad = 14) => {
      sync();
      vp.zoom = clamp((app.screen.width - pad) / opts.contentSize().w, opts.minZoom, opts.maxZoom);
      vp.clamp();
      apply();
      wake();
    },
    step: (dtMs) => {
      const moving = vp.stepFling(dtMs / 1000);
      if (moving) apply();
      return moving;
    },
    detach: () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      router.reset();
    },
  };
}
