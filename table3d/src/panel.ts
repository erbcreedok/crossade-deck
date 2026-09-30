// ПАНЕЛЬ HUD — одно окно для всего, что его открывает (стопка, стул, дальше — карта, зона): содержимое своё у каждого, а
// как окно держится в пространстве — одно на всех. Три выбора, у каждого вида окна свои (помнит устройство):
//
//   привязка  к экрану — окно живёт в точках экрана: размер постоянный, камера его не двигает и не меняет;
//             к столу — окно — вещь на столе (слой CSS3D сцены): размер постоянный в единицах стола (зум меняет его
//             на экране), поворот камеры уносит его вместе со столом;
//   наклон    (у привязанного к столу) лицом к камере — всегда к тебе; лежит — в плоскости сукна, верхом от тебя;
//             стоит — вертикально над своим местом, лицом к твоему стулу;
//   место     двигается всегда — за заголовок (`data-panel-drag`): у экранного — по экрану, у столового — по столу;
//             открылось первый раз — у своей вещи, дальше — где его оставили (у каждого окна своё место);
//   масштаб   язычок в правом нижнем углу: тянешь от середины окна — крупнее, к ней — мельче; у каждого окна свой,
//             отдельно на экране и на столе (на столе по умолчанию меньше: там окно — вещь среди карт).
//
// Содержимое рисуется в точках панели (0, 0 — левый верх); перевод из экрана в точки панели — `local` (у столового —
// лучом в его плоскость). Внизу каждой панели — строка стенда: привязка и наклон кнопками.

export type Anchor = "screen" | "table";
export type Tilt = "camera" | "flat" | "stand";
export interface PanelConf { anchor: Anchor; tilt: Tilt }
/** Панель на столе: где (x, y — сукно), наклон и размер в точках. */
export interface WorldPlace { x: number; y: number; tilt: Tilt; w: number; h: number; scale: number }
/** Что панели нужно от сцены. */
export interface PanelWorld {
  /** Поставить элемент на стол (слой CSS3D) или снять оттуда (`null`). */
  place3d(el: HTMLElement, at: WorldPlace | null): void;
  /** Точка экрана → точка столовой панели (в её точках), или `null`, если луч мимо её плоскости. */
  local3d(el: HTMLElement, x: number, y: number): { x: number; y: number } | null;
  /** Точка сукна под пальцем. */
  feltAt(x: number, y: number): { x: number; y: number } | null;
  glass(): { w: number; h: number };
}

const CONF_ROW = 34;
/** Масштаб по умолчанию: на экране — как нарисовано, на столе — вдвое меньше. Пределы язычка. */
const SCALE = { screen: 1, table: 0.7, min: 0.25, max: 3 } as const;
const TONGUE = 22;
const ANCHOR_WORDS: Record<Anchor, string> = { screen: "экран", table: "стол" };
const TILT_WORDS: Record<Tilt, string> = { camera: "лицом", flat: "лежит", stand: "стоит" };

const read = <T,>(key: string, or: T): T => { try { const v = localStorage.getItem(key); return v === null ? or : (JSON.parse(v) as T); } catch { return or; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* нет хранилища — живёт, пока открыта вкладка */ } };

export interface Panels {
  /**
   * Показать панель `key` вида `kind` с содержимым `html` размером `w × h` точек. `near` — где её вещь (на экране и на
   * сукне): там панель встаёт, пока её не двигали.
   */
  show(key: string, kind: string, html: string, w: number, h: number, near: { screen: { x: number; y: number }; world: { x: number; y: number } }): void;
  hide(key: string): void;
  /** Закрыть все, кроме этих. */
  keep(keys: readonly string[]): void;
  /** Точка экрана → точка панели (внутри неё) или `null`. */
  local(key: string, x: number, y: number): { x: number; y: number } | null;
  conf(kind: string): PanelConf;
  /** Нажатие по панели — её ли это строка стенда или заголовок; отдаёт `true`, если забрала. */
  press(e: PointerEvent): boolean;
  click(e: MouseEvent): boolean;
}

export function mountPanels(overlay: HTMLElement, world: PanelWorld, redraw: () => void): Panels {
  const confs: Record<string, PanelConf> = read("table3d.panelConf", {});
  const ats: Record<string, { screen?: { left: number; top: number }; world?: { x: number; y: number }; scale?: Partial<Record<Anchor, number>> }> = read("table3d.panelAt", {});
  const scaleOf = (key: string, anchor: Anchor) => ats[key]?.scale?.[anchor] ?? SCALE[anchor];
  const open = new Map<string, { el: HTMLElement; kind: string; w: number; h: number; html: string; on3d: boolean }>();
  const conf = (kind: string): PanelConf => ({ anchor: confs[kind]?.anchor === "table" ? "table" : "screen", tilt: (["camera", "flat", "stand"] as Tilt[]).includes(confs[kind]?.tilt as Tilt) ? confs[kind]!.tilt : "camera" });
  const save = () => { write("table3d.panelConf", confs); write("table3d.panelAt", ats); };

  const chip = (data: string, on: boolean, label: string) => `<button ${data} aria-pressed="${on}" style="border:0;cursor:pointer;font:400 10px Tiny5,monospace;border-radius:7px;padding:4px 7px;${on ? "background:linear-gradient(#f8d885,#b08a26);color:#0b0704" : "background:transparent;color:#cdb98f;box-shadow:inset 0 0 0 2px #6b4d2c"}">${label}</button>`;
  function confRow(kind: string): string {
    const c = conf(kind);
    return `<div data-panel-conf style="position:absolute;left:12px;right:12px;bottom:8px;height:${CONF_ROW - 12}px;display:flex;align-items:center;gap:4px;font:400 10px Tiny5,monospace;color:#cdb98f;white-space:nowrap">`
      + `<span>привязка</span>${(["screen", "table"] as Anchor[]).map((a) => chip(`data-panel-anchor="${a}"`, c.anchor === a, ANCHOR_WORDS[a])).join("")}`
      + (c.anchor === "table" ? `<span style="margin-left:6px">наклон</span>${(["camera", "flat", "stand"] as Tilt[]).map((t) => chip(`data-panel-tilt="${t}"`, c.tilt === t, TILT_WORDS[t])).join("")}` : "")
      + `</div>`;
  }

  function show(key: string, kind: string, html: string, w: number, h: number, near: { screen: { x: number; y: number }; world: { x: number; y: number } }): void {
    let one = open.get(key);
    if (!one) {
      const el = document.createElement("div");
      el.dataset.panel = key;
      el.dataset.kind = kind;
      one = { el, kind, w, h, html: "", on3d: false };
      open.set(key, one);
    }
    const c = conf(kind), H = h + CONF_ROW;
    // Язычок масштаба — уголок в правом нижнем углу.
    const tongue = `<div data-panel-scale title="Масштаб окна: тяни от середины — крупнее, к ней — мельче" style="position:absolute;right:0;bottom:0;width:${TONGUE}px;height:${TONGUE}px;touch-action:none;cursor:nwse-resize;z-index:95">`
      + `<svg width="${TONGUE}" height="${TONGUE}" style="position:absolute;inset:0;pointer-events:none"><path d="M${TONGUE - 5} 7 L7 ${TONGUE - 5} M${TONGUE - 5} 13 L13 ${TONGUE - 5}" stroke="#0b0704" stroke-width="5" stroke-linecap="round"/><path d="M${TONGUE - 5} 7 L7 ${TONGUE - 5} M${TONGUE - 5} 13 L13 ${TONGUE - 5}" stroke="#f8d885" stroke-width="2.4" stroke-linecap="round"/></svg></div>`;
    const full = html + confRow(kind) + tongue;
    if (one.html !== full) { one.html = full; one.el.innerHTML = full; }
    one.w = w; one.h = H;
    Object.assign(one.el.style, { width: `${w}px`, height: `${H}px`, boxSizing: "border-box", pointerEvents: "auto" });
    one.el.dataset.anchor = c.anchor;
    one.el.dataset.tilt = c.tilt;
    const at = (ats[key] ??= {});
    if (c.anchor === "screen") {
      if (one.on3d) { world.place3d(one.el, null); one.on3d = false; }
      if (one.el.parentNode !== overlay) overlay.append(one.el);
      const g = world.glass();
      at.screen ??= { left: Math.round(Math.max(12, Math.min(g.w - w - 12, near.screen.x - w / 2))), top: Math.round(Math.max(56, Math.min(g.h - H - 8, near.screen.y + 36))) };
      Object.assign(one.el.style, { position: "absolute", left: `${at.screen.left}px`, top: `${at.screen.top}px`, transform: `scale(${scaleOf(key, "screen")})`, transformOrigin: "0 0" });
    } else {
      at.world ??= { x: near.world.x, y: near.world.y };
      // Экранное место на столе ни при чём: сцена ставит элемент сама, от его середины.
      Object.assign(one.el.style, { left: "", top: "", transformOrigin: "" });
      world.place3d(one.el, { x: at.world.x, y: at.world.y, tilt: c.tilt, w, h: H, scale: scaleOf(key, "table") });
      one.on3d = true;
    }
  }
  function hide(key: string): void {
    const one = open.get(key);
    if (!one) return;
    if (one.on3d) world.place3d(one.el, null);
    one.el.remove();
    open.delete(key);
  }

  function local(key: string, x: number, y: number): { x: number; y: number } | null {
    const one = open.get(key);
    if (!one) return null;
    let p: { x: number; y: number } | null;
    if (one.on3d) p = world.local3d(one.el, x, y);
    else { const r = one.el.getBoundingClientRect(), k = scaleOf(key, "screen"); p = { x: (x - r.left) / k, y: (y - r.top) / k }; }
    return p && p.x >= 0 && p.y >= 0 && p.x <= one.w && p.y <= one.h ? p : null;
  }

  /** Двигать за заголовок: экранную — по экрану, столовую — по сукну. */
  function press(e: PointerEvent): boolean {
    if (scalePress(e)) return true;
    const t = e.target as HTMLElement, handle = t.closest<HTMLElement>("[data-panel-drag]"), el = t.closest<HTMLElement>("[data-panel]");
    if (!handle || !el) return false;
    const key = el.dataset.panel!, one = open.get(key);
    if (!one) return false;
    e.preventDefault();
    const at = (ats[key] ??= {}), c = conf(one.kind);
    const from = c.anchor === "screen" ? { ...at.screen! } : { ...at.world! }, grab = c.anchor === "table" ? world.feltAt(e.clientX, e.clientY) : null;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (c.anchor === "screen") at.screen = { left: Math.round((from as { left: number }).left + ev.clientX - e.clientX), top: Math.round((from as { top: number }).top + ev.clientY - e.clientY) };
      else { const now = world.feltAt(ev.clientX, ev.clientY); if (now && grab) at.world = { x: (from as { x: number }).x + now.x - grab.x, y: (from as { y: number }).y + now.y - grab.y }; }
      redraw();
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); save(); redraw(); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return true;
  }
  /** Язычок: масштаб — во сколько раз палец дальше от середины окна на экране, чем был в начале. */
  function scalePress(e: PointerEvent): boolean {
    const t = e.target as HTMLElement, el = t.closest<HTMLElement>("[data-panel]");
    if (!t.closest("[data-panel-scale]") || !el) return false;
    const key = el.dataset.panel!, one = open.get(key);
    if (!one) return false;
    e.preventDefault();
    const anchor = conf(one.kind).anchor, r = el.getBoundingClientRect(), mid = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const d0 = Math.max(20, Math.hypot(e.clientX - mid.x, e.clientY - mid.y)), s0 = scaleOf(key, anchor);
    const at = (ats[key] ??= {});
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const k = Math.max(SCALE.min, Math.min(SCALE.max, (s0 * Math.hypot(ev.clientX - mid.x, ev.clientY - mid.y)) / d0));
      at.scale = { ...at.scale, [anchor]: Math.round(k * 100) / 100 };
      redraw();
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); save(); redraw(); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return true;
  }
  function click(e: MouseEvent): boolean {
    const t = e.target as HTMLElement, el = t.closest<HTMLElement>("[data-panel]"), b = t.closest<HTMLElement>("[data-panel-anchor], [data-panel-tilt]");
    if (!el || !b) return false;
    const kind = el.dataset.kind!, c = conf(kind);
    confs[kind] = b.dataset.panelAnchor ? { ...c, anchor: b.dataset.panelAnchor as Anchor } : { ...c, tilt: b.dataset.panelTilt as Tilt };
    save();
    redraw();
    return true;
  }

  return {
    show, hide, local, conf, press, click,
    keep(keys) { for (const key of [...open.keys()]) if (!keys.includes(key)) hide(key); },
  };
}
