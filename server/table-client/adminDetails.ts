// ПАНЕЛЬ «ДЕТАЛИ» НА СТРАНИЦЕ ХОЗЯИНА — как библиотека спрайтов, только единица здесь — деталь (`details.ts`): вещь из
// картинок, без вида — шар годится и в головы, и в ком снеговика, кем встанет — решает фигура. Галерея деталей
// (поиск по имени и тегам) → страница детали:
//
//   сцена     — деталь одна, крутишь пальцем; видно то, что видно за столом с этого угла: «всегда» — все, «по углу» —
//               ближайшие; оси детали и клетка в единицу стола — слоями;
//   заготовки — показа (коробка / всегда лицом / бумажный / плоскость: «когда» и «как стоит» всем слоям) и углов
//               (шесть сторон / N по кругу);
//   круг углов — вид сверху: где какая картинка, чей сектор к тебе; точку можно перетащить — новый угол;
//   у стола   — деталь рядом со столом: тянешь — стол, Ctrl — двигать деталь, Shift — крутить; С и Ю, дно, клетка;
//   картинки  — список слоёв по порядку (ниже — поверх, перетаскивается за ☰): у каждой угол, место, величина,
//               отражение, когда показывать и как стоять. «+ Картинка» — новый слой с угла, откуда смотришь;
//   встроенные детали каталога (`skins.ts`) — первая же правка делает твою копию, и дальше правишь её.
//
// Всё выбранное (деталь, слой, поворот, слои сцен, несохранённая правка) — в адресе (`adminRoute.ts`).

import { PALETTES } from "../src/table/dolls.js";
import { partOf, PARTS } from "../src/table/skins.js";
import { partName } from "../src/table/tunes.js";
import {
  DETAIL_LIMITS, DETAIL_WIDTH, dirOf, layerId, layersFromViews, NEW_DETAIL, outOf, PRESETS, presetOf, RING_LIMITS, ringAngles,
  sideAngles, placeAngles, viewAngle, viewDir, visibleLayers, wrapYaw, type Detail, type Layer, type Preset, type Show, type Stand,
} from "../src/table/details.js";
import { paintPart, partSprite } from "./dollSprites.js";
import { UNIT_WIDTH, type V3 } from "./spriteAxes.js";
import { HOST } from "./host.js";
import { R, RIM, TABLE_THICK } from "./felt.js";
import { SHOULDERS, SHOULDER_H } from "../src/table/bodies.js";
import { go, onRoute, put, route, routeNum } from "./adminRoute.js";

interface LibSprite { id: string; name: string; ext: "svg" | "png"; slot: string; side: string | null; tags: string[] }
/** Деталь на панели: своя (из базы) или встроенная (из каталога, `b:<деталь>`). */
interface Shown { key: string; own: boolean; detail: Detail }
/** Картинка для выбора: своя из библиотеки или сторона встроенной детали. */
interface Pic { ref: string; name: string; slot: string; side: string | null; tags: string[] }
type Draft = Omit<Detail, "id" | "at">;

/** Кем встроенная деталь служит в каталоге — её тег, не вид: своя копия годится куда угодно. */
const SLOT_TAG: Record<string, string> = { head: "голова", hair: "причёска", body: "тело", legs: "ноги", hands: "руки", other: "другое" };
const VIEW_NAMES: Record<string, string> = { front: "лицо", right: "бок", back: "спина", left: "левый бок", top: "верх", bottom: "низ" };
/** Имя ракурса каталога: сторона — словом, по кругу — углом. */
const viewName = (v: string): string => VIEW_NAMES[v] ?? `${viewAngle(v).yaw}°`;
/** Имя угла слоя: сторона — словом, прочее — градусами. */
const angleName = (l: Pick<Layer, "yaw" | "pitch">): string => {
  if (l.pitch > 80) return "верх";
  if (l.pitch < -80) return "низ";
  const side = Object.entries({ front: 0, right: 90, back: 180, left: 270 }).find(([, y]) => Math.abs(y - l.yaw) < 0.5 && Math.abs(l.pitch) < 0.5);
  return side ? VIEW_NAMES[side[0]]! : `${Math.round(l.yaw)}°${l.pitch ? ` ↕${Math.round(l.pitch)}°` : ""}`;
};
const signed = (yaw: number) => (yaw > 180 ? yaw - 360 : yaw);
/** Как повернуть плоскость слоя, чтобы она смотрела наружу своим углом (право детали — влево сцены), и обратно. */
const faceOf = (l: Pick<Layer, "yaw" | "pitch">) => `rotateY(${-signed(l.yaw)}deg) rotateX(${l.pitch}deg)`;
const unfaceOf = (l: Pick<Layer, "yaw" | "pitch">) => `rotateX(${-l.pitch}deg) rotateY(${signed(l.yaw)}deg)`;
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const PRESET_WORDS: Record<Preset, [string, string]> = {
  box: ["коробка", "все картинки всегда, каждая в своей плоскости на своём месте — как кубик"],
  camera: ["всегда лицом", "к тебе — картинка с ближайшего угла, всегда лицом; по углу меняется только рисунок — шар, бочка"],
  tilt: ["бумажный", "к тебе — картинка с ближайшего угла, лицом, но по ширине сужается по углу — карты, звери"],
  view: ["плоскость", "к тебе — картинка с ближайшего угла, в своей плоскости"],
};
const SHOW_WORDS: Record<Show, string> = { always: "всегда", nearest: "по углу" };
const STAND_WORDS: Record<Stand, string> = { plane: "в своей плоскости", camera: "лицом к камере", tilt: "бумажная" };

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fits = (hay: string, q: string) => hay.toLowerCase().replaceAll("ё", "е").includes(q.toLowerCase().replaceAll("ё", "е").trim());

const CSS = `
.dt { max-width: 980px; margin: 0 auto; padding: 12px 16px 40px; }
.dt .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.dt .chip { font: inherit; font-size: 13px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 999px; padding: 5px 11px; cursor: pointer; }
.dt .chip.on { background: var(--gold); color: #0b0704; border-color: var(--gold); font-weight: 600; }
.dt .add { font: inherit; font-size: 14px; font-weight: 600; color: #0b0704; background: var(--gold); border: 1px solid var(--gold); border-radius: 10px; padding: 8px 14px; cursor: pointer; }
.dt .said { font-size: 13px; color: var(--dim); min-height: 1.3em; margin-bottom: 6px; }
.dt .said.bad { color: var(--hurt); }
.dt .said.warn { color: var(--gold); }
.dt .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.dt .cell { font: inherit; color: var(--ink); background: #0f1f18; border: 1px solid var(--line); border-radius: 10px; padding: 6px 4px 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
.dt .cell img, .dt .cell .wait { width: 80px; height: 80px; object-fit: contain; }
.dt .cell .wait { display: grid; place-items: center; color: var(--dim); font-size: 11px; }
.dt .cell b { font-size: 11.5px; font-weight: 500; text-align: center; line-height: 1.25; overflow-wrap: anywhere; }
.dt .cell i { font-size: 10.5px; color: var(--dim); font-style: normal; text-align: center; }
.dt .cell.own { border-color: #3c4a3c; }
.dt .add:disabled { opacity: .45; cursor: default; }
.dt .dt-world { position: relative; width: 260px; height: 260px; transform-style: preserve-3d; }
.dt .dt-cells { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.28) 1px, transparent 1px); pointer-events: none; }
.dt .dt-mid { position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border: 1.5px solid rgba(242,193,78,.9); border-radius: 50%; pointer-events: none; transform: translateZ(3px); }
.dt .dt-body { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transform-style: preserve-3d; pointer-events: none; }
.dt .tb-world { position: relative; width: 0; height: 0; transform-style: preserve-3d; }
.dt .tb-world > * { position: absolute; left: 0; top: 0; transform-style: preserve-3d; }
.dt .tb-table { border-radius: 50%; background: radial-gradient(#1b5a3f, #0c2c1f 70%); box-shadow: inset 0 0 0 var(--rim) #6b4d2c, inset 0 0 0 calc(var(--rim) + 2px) #0b0704; }
.dt .tb-under { border-radius: 50%; background: radial-gradient(#1a130c, #070503 75%); box-shadow: inset 0 0 0 2px #0b0704; }
.dt .tb-table, .dt .tb-under { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.dt .tb-cells { border-radius: 50%; pointer-events: none; background-image: linear-gradient(rgba(255,255,255,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.22) 1px, transparent 1px); backface-visibility: hidden; }
.dt [data-tcompass] > * { position: absolute; left: 0; top: 0; }
.dt .tb-north { height: 4px; margin-top: -2px; background: #f2c14e; border-radius: 2px; transform-origin: 0 50%; }
.dt .tb-north::after { content: ""; position: absolute; right: -10px; top: -5px; border-left: 12px solid #f2c14e; border-top: 7px solid transparent; border-bottom: 7px solid transparent; }
.dt .tb-cardinal { font: 700 15px/1 system-ui, sans-serif; color: #f2c14e; background: rgba(11,7,4,.8); border: 1.5px solid #f2c14e; border-radius: 8px; padding: 3px 6px; white-space: nowrap; }
.dt .tb-foot { width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: rgba(0,0,0,.45); border: 1.5px solid rgba(242,193,78,.9); }
.dt .tb-pole { width: 2px; margin-left: -1px; background: repeating-linear-gradient(rgba(242,193,78,.9) 0 4px, transparent 4px 8px); transform-origin: 50% 0; }
.dt .tb-anchor { width: 0; height: 0; transform-style: preserve-3d; }
.dt .tb-anchor > div { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-style: preserve-3d; }
.dt .dt-plane { position: absolute; pointer-events: none; user-select: none; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.dt .dt-plane img { display: block; width: 100%; height: 100%; }
.dt .dt-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--dim); font-size: 13px; text-align: center; padding: 20px; }
.dt .dt-axes { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transform-style: preserve-3d; pointer-events: none; }
.dt .dt-axes .ax { position: absolute; left: 0; top: -2px; width: 80px; height: 4px; transform-origin: 0 50%; border-radius: 2px; }
.dt .dt-axes .ax::after { content: ""; position: absolute; right: -10px; top: -5px; border-left: 12px solid currentColor; border-top: 7px solid transparent; border-bottom: 7px solid transparent; }
.dt .dt-axes .axl { position: absolute; left: 0; top: 0; font: 600 12px/1 system-ui, sans-serif; padding: 2px 5px; border-radius: 6px; background: rgba(11,7,4,.75); white-space: nowrap; }
.dt .ax-front { background: #f2c14e; color: #f2c14e; } .dt .axl.ax-front { background: rgba(11,7,4,.75); }
.dt .ax-up { background: #6fd0ff; color: #6fd0ff; } .dt .axl.ax-up { background: rgba(11,7,4,.75); }
.dt .ax-right { background: #ff7ab8; color: #ff7ab8; } .dt .axl.ax-right { background: rgba(11,7,4,.75); }
.dt .ring { display: block; width: 220px; max-width: 100%; margin: 0 auto 6px; touch-action: none; user-select: none; }
.dt .ring .dot { cursor: grab; }
.dt .rows { display: grid; gap: 6px; margin-bottom: 8px; }
.dt .row { display: flex; align-items: center; gap: 8px; background: #0f1f18; border: 1px solid var(--line); border-radius: 10px; padding: 5px 8px; cursor: pointer; min-width: 0; }
.dt .row.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.dt .row.seen .rname::after { content: " 👁"; }
.dt .row.lift { opacity: .6; }
.dt .row .grip { cursor: grab; touch-action: none; color: var(--dim); font-size: 18px; padding: 4px 2px; user-select: none; }
.dt .row img, .dt .row .none { width: 44px; height: 44px; object-fit: contain; flex: none; }
.dt .row .none { display: grid; place-items: center; color: var(--dim); font-size: 11px; border: 1px dashed var(--line); border-radius: 6px; }
.dt .row img.flip { transform: scaleX(-1); }
.dt .row .rtext { min-width: 0; display: flex; flex-direction: column; }
.dt .row .rname { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt .row .rsub { font-size: 11.5px; color: var(--dim); }
.dt .ed { border: 1px solid var(--line); border-radius: 12px; padding: 10px; margin-bottom: 8px; }
.dt label.num { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--dim); }
.dt input[type=number] { width: 76px; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 5px 6px; }
.dt .dt-name { flex: 1; min-width: 0; font: inherit; font-size: 17px; font-weight: 600; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.dt .pick-over { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.6); display: flex; align-items: flex-end; justify-content: center; }
.dt .pick-sheet { width: 100%; max-width: 980px; max-height: 86vh; overflow: auto; background: #111816; border: 1px solid var(--line); border-radius: 14px 14px 0 0; padding: 12px 16px 24px; }
.dt .pick-sheet input[type=search] { flex: 1 1 180px; min-width: 0; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
`;

/** Краски: одна из шестнадцати расцветок — или свои три цвета вместо красной, синей и золота рисунка. */
interface Paint { pal: number; own3: readonly [string, string, string] | null }
const PLAIN: Paint = { pal: 0, own3: null };
/** Свои цвета применяются, когда выбор цвета затих столько: тянешь мышью по палитре — печётся один раз, в конце. */
const OWN3_WAIT_MS = 200;
/** Камера у стола — близко, как глаз игрока над столом: ближний край стола заметно шире дальнего. */
const TABLE_PERSPECTIVE = 280;
const TABLE_PPU = 300 / (2 * (R + 3.5));

/** `orderAgy` — заказать у agy для этой детали: нарисованное встанет в её пустые места (форма — в «Спрайтах»). */
export function mountDetails(root: HTMLElement, auth: Record<string, string>, orderAgy: (d: { id: string; name: string }) => void): { refresh(): Promise<void> } {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  root.classList.add("dt");
  root.innerHTML = `<div data-dlist></div><div data-dpage hidden></div>`;
  const listBox = root.querySelector<HTMLElement>("[data-dlist]")!, pageBox = root.querySelector<HTMLElement>("[data-dpage]")!;
  const json = { ...auth, "content-type": "application/json" };

  let mine: Detail[] = [];
  let lib: LibSprite[] = [];
  let said = "";

  // ——— картинки ———
  const picOf = new Map<string, LibSprite>();
  const svgText = new Map<string, string | null>(), painted = new Map<string, string | null>();
  /** Адрес картинки в красках: встроенная — пекарь стола (свои три — `paintPart`), своя SVG — краски в самом рисунке, PNG — как есть. */
  const srcOf = (ref: string | undefined, ready: () => void, paint: Paint = PLAIN): string | null => {
    if (!ref) return null;
    const ink = PALETTES[paint.pal]!.ink;
    if (ref.startsWith("b:")) {
      const m = /^b:(.+):([a-z0-9]+)$/.exec(ref);
      if (!m) return null;
      if (!paint.own3) return partSprite(m[1]!, paint.pal, m[2]!, ink, HOST, ready)?.src ?? null;
      const key = `${ref}|${paint.own3.join()}|${ink}`;
      if (painted.has(key)) return painted.get(key) ?? null;
      painted.set(key, null);
      void paintPart(m[1]!, m[2]!, paint.own3, ink, HOST).then((src) => { painted.set(key, src); ready(); });
      return null;
    }
    const one = picOf.get(ref);
    if (!one) return null;
    if (one.ext === "png") return `${HOST}/table/lib/${one.id}.png`;
    const text = svgText.get(one.id);
    if (text === undefined) {
      svgText.set(one.id, null);
      void fetch(`${HOST}/table/lib/${one.id}.svg`).then((r) => (r.ok ? r.text() : null)).catch(() => null).then((t) => { svgText.set(one.id, t); ready(); });
      return null;
    }
    if (!text) return null;
    const p = PALETTES[paint.pal]!, c = paint.own3 ?? [p.red, p.blue, p.gold];
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text.replace(/#b3221f/gi, c[0]).replace(/#1d4f80/gi, c[1]).replace(/#f2c14e/gi, c[2]))}`;
  };
  /** Меняет ли картинку расцветка: PNG — нет, встроенная — как в каталоге. */
  const paints = (ref: string | undefined): boolean => {
    if (!ref) return true;
    if (ref.startsWith("b:")) { const m = /^b:(.+):[a-z0-9]+$/.exec(ref); return !!m && !!partOf(m[1]!)?.recolor; }
    return picOf.get(ref)?.ext === "svg";
  };
  const stiff = (d: Draft): Layer[] => d.layers.filter((l) => l.sprite && !paints(l.sprite));
  const picName = (ref: string | undefined): string => {
    if (!ref) return "";
    if (ref.startsWith("b:")) { const m = /^b:(.+):([a-z0-9]+)$/.exec(ref); return m ? `${partName(m[1]!)} · ${viewName(m[2]!)}` : ref; }
    return picOf.get(ref)?.name ?? "нет в библиотеке";
  };
  const pics = (): Pic[] => [
    ...lib.map((o) => ({ ref: o.id, name: o.name, slot: o.slot, side: o.side, tags: o.tags })),
    ...PARTS.filter((p) => p.art.kind !== "none").flatMap((p) => p.views.map((v) => ({ ref: `b:${p.id}:${v}`, name: `${partName(p.id)} · ${viewName(v)}`, slot: p.slot, side: v, tags: [partName(p.id)] }))),
  ];

  // ——— детали ———
  /** Встроенная деталь каталога — как деталь: слои из её нарисованных ракурсов и отражений, показ — как в каталоге. */
  const builtIn = (): Shown[] => PARTS.filter((p) => p.art.kind !== "none").map((p) => {
    const views: Record<string, { sprite?: string; mirror?: string }> = {};
    for (const v of p.views) views[v] = { sprite: `b:${p.id}:${v}` };
    for (const [v, from] of Object.entries(p.mirror ?? {})) if (p.views.includes(from) && !views[v]) views[v] = { mirror: from };
    return { key: `b:${p.id}`, own: false, detail: { id: p.id, name: `${partName(p.id)} · ${SLOT_TAG[p.slot] ?? p.slot}`, tags: [SLOT_TAG[p.slot] ?? p.slot], width: UNIT_WIDTH[p.slot] ?? DETAIL_WIDTH, layers: layersFromViews(views, p.facing), at: 0 } };
  });
  const all = (): Shown[] => [...mine.map((d) => ({ key: d.id, own: true, detail: d })), ...builtIn()];
  // ИМЯ — ОДНО НА ДЕТАЛЬ, среди своих и встроенных: иначе в фигурах не разобрать, какая «Дама бубен» где.
  const norm = (t: string) => t.trim().toLowerCase().replaceAll("ё", "е");
  const taken = (name: string, except: string | null = null) => all().some((x) => x.key !== except && norm(x.detail.name) === norm(name));
  /** Свободное имя: как есть, а занято — с номером («… 2», «… 3»). */
  const freeName = (base: string): string => { const b = base.trim().slice(0, 36); if (!taken(b)) return b; let k = 2; while (taken(`${b} ${k}`)) k += 1; return `${b} ${k}`; };
  /** Обложка в галерее — что видно с лица. */
  const cover = (d: Draft): Layer | undefined => visibleLayers(d.layers, [0, 0, 1])[0] ?? d.layers.find((l) => l.sprite);

  async function refresh(): Promise<void> {
    const [a, b] = await Promise.all([
      fetch(`${HOST}/table/admin/details`, { headers: auth }).then((r) => (r.ok ? r.json() : { details: [] })).catch(() => ({ details: [] })),
      fetch(`${HOST}/table/admin/lib`, { headers: auth }).then((r) => (r.ok ? r.json() : { sprites: [] })).catch(() => ({ sprites: [] })),
    ]);
    mine = (a as { details: Detail[] }).details;
    lib = (b as { sprites: LibSprite[] }).sprites;
    picOf.clear();
    for (const o of lib) picOf.set(o.id, o);
    follow();
  }

  // ——— галерея ———
  let frame = 0;
  const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (!listBox.hidden) drawCells(); }); };
  const create = async (body: Draft): Promise<Detail | null> => {
    const res = await fetch(`${HOST}/table/admin/details`, { method: "POST", headers: json, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) return null;
    const made = (await res.json()) as Detail;
    mine = [made, ...mine];
    return made;
  };
  const blank = (): Draft => ({ name: freeName(NEW_DETAIL), tags: [], width: DETAIL_WIDTH, layers: [] });
  function drawList(): void {
    listBox.innerHTML = `<div class="bar"><input type="search" data-dq placeholder="Имя или тег" value="${esc(route("dq") ?? "")}" style="flex:1 1 180px;min-width:0;font:inherit;font-size:15px;color:var(--ink);background:#0f1213;border:1px solid var(--line);border-radius:8px;padding:6px 8px"><button class="add" data-new>+ Новая деталь</button><button class="chip" data-dagynew>+ Заказать у agy</button></div>
      <div class="said" data-dsaid>${esc(said)}</div>
      <div class="grid" data-dgrid></div>`;
    const q = listBox.querySelector<HTMLInputElement>("[data-dq]")!;
    q.oninput = () => { put({ dq: q.value || null }); drawCells(); };
    listBox.querySelector<HTMLElement>("[data-new]")!.onclick = async () => {
      const made = await create(blank());
      if (!made) { said = "Не создалась."; drawList(); return; }
      go({ detail: made.id, dl: null, drx: null, dry: null, dd: null });
      follow();
    };
    // Сразу у agy: пустая деталь, заказ для неё; принятое встанет в неё, а деталь возьмёт имя заказа.
    listBox.querySelector<HTMLElement>("[data-dagynew]")!.onclick = async () => {
      const made = await create(blank());
      if (made) orderAgy({ id: made.id, name: "" });
    };
    drawCells();
  }
  function drawCells(): void {
    const q = route("dq") ?? "";
    const shown = all().filter((s) => !q || q.split(/\s+/).every((w) => fits(`${s.detail.name} ${s.detail.tags.join(" ")} ${s.own ? "своя" : "встроенная"}`, w)));
    const grid = listBox.querySelector<HTMLElement>("[data-dgrid]");
    if (!grid) return;
    grid.innerHTML = shown.map((s) => {
      const c = cover(s.detail), src = srcOf(c?.sprite, later), n = s.detail.layers.filter((l) => l.sprite).length;
      return `<button class="cell${s.own ? " own" : ""}" data-detail="${esc(s.key)}">${src ? `<img src="${esc(src)}" alt=""${c?.flip ? ' style="transform:scaleX(-1)"' : ""}>` : `<div class="wait">${c ? "…" : "пусто"}</div>`}<b>${esc(s.detail.name)}</b><i>${esc(s.detail.tags.join(", ") || "без тегов")} · ${n} ${n === 1 ? "картинка" : n > 1 && n < 5 ? "картинки" : "картинок"}</i><i>${s.own ? "своя" : "встроенная"}${stiff(s.detail).length ? " · не красится" : ""}</i></button>`;
    }).join("") || `<div class="said" style="grid-column:1/-1">Ничего не найдено.</div>`;
    for (const b of grid.querySelectorAll<HTMLElement>("[data-detail]")) b.onclick = () => { go({ detail: b.dataset.detail, dl: null, drx: null, dry: null, dd: null }); follow(); };
  }

  // ——— страница детали ———
  let openKey = "";
  /** Сказать на открывшейся странице (после копии встроенной). */
  let pageSaid = "";
  function follow(): void {
    const key = route("detail");
    const s = key ? all().find((x) => x.key === key) : undefined;
    listBox.hidden = !!s;
    pageBox.hidden = !s;
    if (!s) { openKey = ""; drawList(); return; }
    openPage(s);
  }
  onRoute(() => { if (route("tab") === "details") follow(); });

  function openPage(s: Shown): void {
    openKey = s.key;
    const saved = s.detail;
    const fields = (d: Draft): Draft => ({ name: d.name, tags: d.tags, width: d.width, layers: d.layers });
    let draft: Draft;
    try { draft = s.own && route("dd") ? structuredClone({ ...fields(saved), ...(JSON.parse(route("dd")!) as object) }) : structuredClone(fields(saved)); }
    catch { draft = structuredClone(fields(saved)); }
    let sel = draft.layers.find((l) => l.id === route("dl"))?.id ?? draft.layers[0]?.id ?? "";
    let rx = routeNum("drx", 0), ry = routeNum("dry", 0);
    const layers = { axes: route("dax") !== "0", grid: route("dgr") !== "0" };
    const c3 = (route("dc") ?? "").split(",").filter((c) => /^[0-9a-f]{6}$/i.test(c)).map((c) => `#${c}`);
    const paint: { pal: number; own3: [string, string, string] | null } = { pal: Math.max(0, Math.min(PALETTES.length - 1, Math.round(routeNum("dp", 0)))), own3: c3.length === 3 ? (c3 as [string, string, string]) : null };
    const dirty = () => JSON.stringify(fields(draft)) !== JSON.stringify(fields(saved));
    const keep = () => put({ dl: sel || null, drx: Math.round(rx) || null, dry: Math.round(ry) || null, dax: layers.axes ? null : "0", dgr: layers.grid ? null : "0", dp: paint.pal || null, dc: paint.own3 ? paint.own3.map((c) => c.slice(1)).join(",") : null, dd: s.own && dirty() ? JSON.stringify(draft) : null });
    const cur = (): Layer | undefined => draft.layers.find((l) => l.id === sel);

    // ——— у стола: где деталь и откуда камера ———
    const at = { x: routeNum("tx", 0), y: routeNum("ty", SHOULDERS), h: routeNum("th", SHOULDER_H.sit + 1.5), yaw: routeNum("tyw", 0), tilt: routeNum("tpt", 0) };
    const cam = { yaw: routeNum("tcy", 25), pitch: routeNum("tcp", -28) };
    /** Слои у стола: стороны света (С и Ю, стрелка на север по сукну) и клетка по сукну в единицу стола. */
    const tlayers = { compass: route("tlc") !== "0", grid: route("tlg") === "1" };
    const keepTable = () => put({ tx: at.x || null, ty: at.y === SHOULDERS ? null : at.y, th: at.h === SHOULDER_H.sit + 1.5 ? null : at.h, tyw: at.yaw || null, tpt: at.tilt || null, tcy: cam.yaw === 25 ? null : cam.yaw, tcp: cam.pitch === -28 ? null : cam.pitch, tlc: tlayers.compass ? null : "0", tlg: tlayers.grid ? "1" : null });
    const r1 = (n: number) => Math.round(n * 100) / 100;

    const draw = () => {
      const preset = presetOf(draft.layers);
      pageBox.innerHTML = `<div class="sp-page" data-detail-page="${esc(s.key)}">
        <div class="sp-top"><button class="chip" data-dback>← Все детали</button><input class="dt-name" data-dname maxlength="40" value="${esc(draft.name)}" aria-label="Имя"></div>
        <div class="bar">${s.own
          ? `<button class="add" data-dsave ${dirty() ? "" : "disabled"}>Сохранить</button><button class="chip" data-dcopy>Сохранить как новую</button><button class="chip" data-dagy>Заказать у agy</button><button class="chip drop" data-ddrop>Удалить</button>`
          : `<button class="add" data-dcopy>Сделать своей копией</button>`}</div>
        <div class="said${pageSaid ? " warn" : ""}" data-dact>${esc(pageSaid || (s.own ? (dirty() ? "Есть несохранённое." : "") : "Встроенная: первая же правка сделает твою копию, дальше правишь её."))}</div>
        <div class="sp-stage bg-felt" data-dstage><div class="dt-world" data-world><div class="dt-cells" data-dcells></div><div class="dt-body" data-dbody></div><div class="dt-empty" data-dempty hidden>Картинок нет — «+ Картинка» ниже или заготовка углов.</div><div class="dt-mid"></div><div class="dt-axes" data-daxes></div></div></div>
        <div class="bar">${(["axes", "grid"] as const).map((k) => `<button class="chip${layers[k] ? " on" : ""}" data-dlayer="${k}">${{ axes: "Оси", grid: "Клетка" }[k]}</button>`).join("")}<span class="said" data-dseen></span></div>
        <h3>Как показывать</h3>
        <div class="bar" data-dpresets>${(Object.keys(PRESETS) as Preset[]).map((k) => `<button class="chip${preset === k ? " on" : ""}" data-preset="${k}">${PRESET_WORDS[k][0]}</button>`).join("")}<span class="chip${preset ? "" : " on"}" data-preset-own style="cursor:default">своё</span></div>
        <div class="said" data-dpsaid>${preset ? `${PRESET_WORDS[preset][1]}. Так деталь стоит и за столом.` : "Своё: у картинок разные «когда» и «как стоит» — смотри в списке ниже."}</div>
        <h3>Круг углов</h3>
        <svg class="ring" data-ring viewBox="-110 -110 220 220"></svg>
        <div class="said">Вид сверху, лицо детали — вниз, к тебе. Точка — картинка на своём угле (жёлтая — «всегда»), тянешь — новый угол; стрелка — откуда ты смотришь; подсвечено — что видно.</div>
        <h3>Картинки</h3>
        <div class="bar" data-dangles><span class="said" style="margin:0">углы:</span><button class="chip" data-angles="sides">6 сторон</button><button class="chip" data-angles="ring">по кругу</button><label class="num"><input type="number" data-dring min="${RING_LIMITS[0]}" max="${RING_LIMITS[1]}" step="1" value="${routeNum("dn", 16)}"> шт.</label></div>
        <div class="said">По порядку: кто ниже в списке — рисуется поверх. Перетащить — за ☰.</div>
        <div class="rows" data-rows></div>
        <div class="bar"><button class="add" data-ladd>+ Картинка</button><span class="said" style="margin:0">новая — с угла, откуда смотришь</span></div>
        <div class="ed" data-ed></div>
        <h3>У стола</h3>
        <div class="sp-stage bg-felt" data-tstage style="perspective:${TABLE_PERSPECTIVE}px"><div class="tb-world" data-tworld>
          <div class="tb-table" style="--rim:${RIM * TABLE_PPU}px;width:${2 * (R + RIM) * TABLE_PPU}px;height:${2 * (R + RIM) * TABLE_PPU}px;left:${-(R + RIM) * TABLE_PPU}px;top:${-(R + RIM) * TABLE_PPU}px;transform:rotateX(90deg)"></div>
          <div class="tb-under" data-tunder style="width:${2 * (R + RIM) * TABLE_PPU}px;height:${2 * (R + RIM) * TABLE_PPU}px;left:${-(R + RIM) * TABLE_PPU}px;top:${-(R + RIM) * TABLE_PPU}px;transform:translateY(${TABLE_THICK * TABLE_PPU}px) rotateX(-90deg)"></div>
          <div class="tb-cells" data-tcells style="width:${2 * R * TABLE_PPU}px;height:${2 * R * TABLE_PPU}px;left:${-R * TABLE_PPU}px;top:${-R * TABLE_PPU}px;background-size:${TABLE_PPU}px ${TABLE_PPU}px;background-position:${((R * TABLE_PPU) % TABLE_PPU) - 0.5}px ${((R * TABLE_PPU) % TABLE_PPU) - 0.5}px;transform:translateY(-1px) rotateX(90deg)"></div>
          <div data-tcompass><div class="tb-north" style="width:${(R - 1.2) * TABLE_PPU}px;transform:translateY(-2px) rotateX(90deg) rotateZ(-90deg)"></div><span class="tb-cardinal" data-tcard="n">С</span><span class="tb-cardinal" data-tcard="s">Ю</span></div>
          <div class="tb-foot" data-tfoot></div><div class="tb-pole" data-tpole></div>
          <div class="tb-anchor" data-tanchor><div data-tbody></div></div>
        </div></div>
        <div class="bar">${(["compass", "grid"] as const).map((k) => `<button class="chip${tlayers[k] ? " on" : ""}" data-tlayer="${k}">${{ compass: "Стороны света", grid: "Клетка" }[k]}</button>`).join("")}</div>
        <div class="said">Тянешь — крутится стол вместе с деталью; вверх — заглянешь под стол. <b>Ctrl</b> + тянуть — двигать деталь (по экрану: вглубь — поверни стол), <b>Shift</b> + тянуть — поворачивать её.</div>
        <div class="bar">${([["x", "вправо"], ["y", "к тебе"], ["h", "вверх"], ["yaw", "поворот °"], ["tilt", "наклон °"]] as const).map(([k, n]) => `<label class="num">${n} <input type="number" data-tnum="${k}" step="${k === "yaw" || k === "tilt" ? 5 : 0.1}" value="${r1(at[k])}"></label>`).join("")}<button class="chip" data-treset>Сброс</button></div>
        <h3>Расцветки</h3>
        <div class="bar" data-dpals>${PALETTES.map((p, k) => `<button class="chip${!paint.own3 && k === paint.pal ? " on" : ""}" data-dpal="${k}" title="${esc(p.name)}"><span style="display:inline-flex;gap:2px;vertical-align:middle">${[p.red, p.blue, p.gold].map((c) => `<i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c}"></i>`).join("")}</span></button>`).join("")}</div>
        <div class="bar">${["основной", "второй", "акцент"].map((n, i) => `<label class="num">${n} <input type="color" data-dc="${i}" value="${paint.own3?.[i] ?? [PALETTES[paint.pal]!.red, PALETTES[paint.pal]!.blue, PALETTES[paint.pal]!.gold][i]}"></label>`).join("")}<button class="chip" data-dcoff>Как в расцветке</button></div>
        <div class="said" data-dpaint></div>
        <h3>Размер и теги</h3>
        <div class="ed"><div class="bar"><label class="num">ширина, ед. стола <input type="number" data-dwidth step="0.1" min="${DETAIL_LIMITS.width[0]}" max="${DETAIL_LIMITS.width[1]}" value="${draft.width}"></label></div>
          <div class="said">Сколько деталь шириной за столом при величине ×1: голова карты — 2.4, тело — 5.2.</div>
          <input data-dtags value="${esc(draft.tags.join(", "))}" placeholder="Теги через запятую: снеговик, зима" style="width:100%;box-sizing:border-box;font:inherit;font-size:15px;color:var(--ink);background:#0f1213;border:1px solid var(--line);border-radius:8px;padding:6px 8px"></div>
      </div>`;
      pageSaid = "";
      wire();
    };

    const stage = () => pageBox.querySelector<HTMLElement>("[data-dstage]")!;
    // ИСПЕКЛАСЬ КАРТИНКА — одна перерисовка на кадр, и подписка одна и та же: пекарь хранит ждущих множеством, и новая
    // функция на каждую перерисовку множила бы перерисовки на число ещё не испечённых (у бочки их 18 — страница висла).
    let soonFrame = 0;
    const soon = () => { if (!soonFrame) soonFrame = requestAnimationFrame(() => { soonFrame = 0; if (openKey === s.key && pageBox.isConnected) { drawRows(); pose(); } }); };
    /** Откуда ты смотришь на деталь — направлением в её осях (x — к правому боку, y — вверх, z — к лицу). */
    const viewer = (): [number, number, number] => dirOf(ry, -rx);
    const ppu = () => 260 / (draft.width * 2.2);

    /**
     * НАРИСОВАТЬ ДЕТАЛЬ в `body` (крутится вместе с деталью): видимые с `me` слои по порядку; «в своей плоскости» —
     * на своём угле и месте, «лицом» и «бумажная» — на своём месте, но обращены к камере (`unturn` — обратный поворот
     * всего, что над `body`). `u` — точек на единицу стола. Какие слои нарисованы.
     */
    function renderDetail(body: HTMLElement, me: readonly [number, number, number], u: number, unturn: string): Layer[] {
      const shown = visibleLayers(draft.layers, me);
      const ids = new Set(shown.map((l) => l.id));
      for (const el of [...body.querySelectorAll<HTMLElement>("[data-layer]")]) if (!ids.has(el.dataset.layer!)) el.remove();
      for (const l of shown) {
        let box = body.querySelector<HTMLElement>(`[data-layer="${l.id}"]`);
        const src = srcOf(l.sprite, soon, paint) ?? (box && box.dataset.ref === l.sprite ? box.querySelector("img")!.getAttribute("src") : null);
        if (!box) {
          box = document.createElement("div");
          box.className = "dt-plane";
          box.dataset.layer = l.id;
          const img = document.createElement("img");
          img.alt = "";
          img.onload = soon;
          box.append(img);
        }
        body.append(box);
        box.dataset.ref = l.sprite ?? "";
        const img = box.querySelector("img")!;
        box.hidden = !src;
        if (!src) continue;
        if (img.getAttribute("src") !== src) img.src = src;
        const aspect = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
        const w = draft.width * l.scale * u, h = w * aspect, out = outOf(draft.width, l);
        // Отражение — у самой картинки внутри: у плоскости своя лицевая сторона, и перевёрнутая не пропадает со спины.
        img.style.transform = l.flip ? "scaleX(-1)" : "";
        Object.assign(box.style, { width: `${w}px`, height: `${h}px`, left: `${-w / 2}px`, top: `${-h / 2}px`, transformOrigin: `${w / 2}px ${h / 2}px` });
        box.style.transform = l.stand === "plane"
          ? `${faceOf(l)} translate3d(${l.dx * u}px, ${-l.dy * u}px, ${out * u}px)`
          : `${faceOf(l)} translateZ(${out * u}px) ${unfaceOf(l)} ${unturn} translate(${l.dx * u}px, ${-l.dy * u}px) scaleX(${l.stand === "tilt" ? Math.max(0.15, dot(dirOf(l.yaw, l.pitch), me)) : 1})`;
        box.dataset.out = String(out);
        box.dataset.flip = l.flip ? "1" : "";
      }
      return shown;
    }

    /** Главная сцена: деталь крутится пальцем; что видно — как за столом с этого угла. */
    function pose(): void {
      const st = stage();
      st.dataset.rx = String(Math.round(rx));
      st.dataset.ry = String(Math.round(ry));
      const turn = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      const axes = pageBox.querySelector<HTMLElement>("[data-daxes]")!;
      axes.hidden = !layers.axes;
      axes.style.transform = `translateZ(0) ${turn}`;
      const cells = pageBox.querySelector<HTMLElement>("[data-dcells]")!, u = ppu();
      cells.hidden = !layers.grid;
      cells.style.backgroundSize = `${u}px ${u}px`;
      cells.style.backgroundPosition = `${(130 % u) - 0.5}px ${(130 % u) - 0.5}px`;
      const me = viewer();
      const body = pageBox.querySelector<HTMLElement>("[data-dbody]")!;
      body.style.transform = turn;
      const shown = renderDetail(body, me, u, `rotateY(${-ry}deg) rotateX(${-rx}deg)`);
      st.dataset.planes = String(shown.length);
      st.dataset.shown = shown.map((l) => l.id).join(",");
      st.dataset.toward = String(Math.round(wrapYaw(ry)));
      pageBox.querySelector<HTMLElement>("[data-dempty]")!.hidden = draft.layers.some((l) => l.sprite);
      pageBox.querySelector<HTMLElement>("[data-dseen]")!.textContent = shown.length ? `видно: ${shown.map((l) => angleName(l)).join(", ")}` : "";
      for (const row of pageBox.querySelectorAll<HTMLElement>("[data-row]")) row.classList.toggle("seen", shown.some((l) => l.id === row.dataset.row));
      drawRing(shown);
      tablePose();
    }

    function axesHtml(): string {
      const L = 80;
      const one = (name: string, key: string, v: V3) => {
        const turn = v[2] > 0.5 ? "rotateY(-90deg)" : v[2] < -0.5 ? "rotateY(90deg)" : `rotateZ(${(Math.atan2(v[1], v[0]) * 180) / Math.PI}deg)`;
        return `<div class="ax ax-${key}" data-ax="${key}" style="transform:${turn}"></div><span class="axl ax-${key}" style="transform:translate3d(${v[0] * (L + 16)}px,${v[1] * (L + 16)}px,${v[2] * (L + 16)}px) translate(-50%,-50%)">${name}</span>`;
      };
      return one("перед", "front", [0, 0, 1]) + one("верх", "up", [0, -1, 0]) + one("право", "right", [-1, 0, 0]);
    }

    // ——— круг углов: вид сверху, лицо — вниз (к тебе), право детали — влево ———
    const RING_R = 86;
    const ringXY = (yaw: number, r = RING_R) => [-Math.sin((yaw * Math.PI) / 180) * r, Math.cos((yaw * Math.PI) / 180) * r] as const;
    function drawRing(shown: Layer[]): void {
      const svg = pageBox.querySelector<SVGSVGElement>("[data-ring]");
      if (!svg) return;
      const [vx, vy] = ringXY(wrapYaw(ry), 104);
      const dots = draft.layers.map((l) => {
        const flat = Math.abs(l.pitch) > 45;
        const [x, y] = flat ? [0, l.pitch > 0 ? -10 : 10] : ringXY(l.yaw);
        const on = shown.some((v) => v.id === l.id), picked = l.id === sel;
        return `<g class="dot" data-rdot="${l.id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="${picked ? 11 : 8}" fill="${l.show === "always" ? "#f2c14e" : "#6fd0ff"}" fill-opacity="${l.sprite ? (on ? 1 : 0.45) : 0.15}" stroke="${picked ? "#fff" : on ? "#0b0704" : "rgba(255,255,255,.4)"}" stroke-width="${picked ? 3 : 1.5}"${l.sprite ? "" : ' stroke-dasharray="3 2"'}/></g>`;
      }).join("");
      svg.innerHTML = `<circle r="${RING_R}" fill="rgba(0,0,0,.25)" stroke="rgba(255,255,255,.25)"/>
        <text y="${RING_R + 16}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.6)">лицо</text><text y="${-RING_R - 6}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.6)">спина</text>
        <line x1="0" y1="0" x2="${vx.toFixed(1)}" y2="${vy.toFixed(1)}" stroke="#ff7ab8" stroke-width="2.5" data-rme/>${dots}`;
    }

    // ——— строки картинок ———
    function drawRows(): void {
      const box = pageBox.querySelector<HTMLElement>("[data-rows]");
      if (!box) return;
      box.innerHTML = draft.layers.map((l) => {
        const src = srcOf(l.sprite, soon, paint);
        return `<div class="row${l.id === sel ? " on" : ""}" data-row="${l.id}"><span class="grip" data-grip="${l.id}" title="Перетащить">☰</span>${src ? `<img src="${esc(src)}" alt=""${l.flip ? ' class="flip"' : ""}>` : `<span class="none">${l.sprite ? "…" : "пусто"}</span>`}<span class="rtext"><span class="rname">${l.sprite ? esc(picName(l.sprite)) : "место под картинку"}</span><span class="rsub">${angleName(l)} · ${SHOW_WORDS[l.show]} · ${STAND_WORDS[l.stand]}${l.flip ? " · отражена" : ""}</span></span></div>`;
      }).join("") || `<div class="said">Картинок нет.</div>`;
      const no = stiff(draft), paintSaid = pageBox.querySelector<HTMLElement>("[data-dpaint]");
      if (paintSaid) paintSaid.textContent = no.length ? `Не красятся (PNG): ${no.map(angleName).join(", ")}.` : "Красятся три краски рисунка: основной, второй, акцент.";
      for (const row of box.querySelectorAll<HTMLElement>("[data-row]")) row.onclick = (e) => { if ((e.target as Element).closest("[data-grip]")) return; select(row.dataset.row!, true); };
      // Перетащить за ☰ — на место строки, над которой отпустил.
      for (const grip of box.querySelectorAll<HTMLElement>("[data-grip]")) grip.onpointerdown = (e) => {
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        const id = grip.dataset.grip!, row = grip.closest<HTMLElement>("[data-row]")!;
        row.classList.add("lift");
        const target = (y: number) => { const rows = [...box.querySelectorAll<HTMLElement>("[data-row]")]; let k = rows.findIndex((r) => y < r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2); if (k < 0) k = rows.length; return k; };
        grip.onpointerup = (u) => {
          grip.onpointerup = null;
          row.classList.remove("lift");
          const from = draft.layers.findIndex((l) => l.id === id);
          let to = target(u.clientY);
          if (to > from) to -= 1;
          if (to === from) return;
          edit(() => { const [l] = draft.layers.splice(from, 1); draft.layers.splice(to, 0, l!); });
        };
      };
    }
    /** Выбрать слой: строка подсвечена, правка — его, деталь повёрнута к тебе его углом. */
    function select(id: string, turn: boolean): void {
      sel = id;
      const l = cur();
      if (l && turn) { rx = Math.abs(l.pitch) > 45 ? (l.pitch > 0 ? -80 : 80) : 0; ry = signed(l.yaw); }
      drawRows(); drawEditor(); pose(); keep();
    }

    function drawEditor(): void {
      const ed = pageBox.querySelector<HTMLElement>("[data-ed]")!;
      const l = cur();
      if (!l) { ed.innerHTML = `<div class="said">Выбери картинку в списке — здесь её правка.</div>`; return; }
      const nums: [keyof Layer & ("yaw" | "pitch" | "dx" | "dy" | "out" | "scale"), string, number][] = [["yaw", "угол °", 5], ["pitch", "наклон °", 5], ["dx", "вправо", 0.1], ["dy", "вверх", 0.1], ["out", "наружу", 0.1], ["scale", "величина ×", 0.05]];
      ed.innerHTML = `<div class="bar" style="margin-bottom:6px"><b>${l.sprite ? esc(picName(l.sprite)) : "место под картинку"}</b></div>
        <div class="bar"><button class="add" data-lpick>${l.sprite ? "Другая картинка" : "Выбрать картинку"}</button><label class="num"><input type="checkbox" data-lflip${l.flip ? " checked" : ""}> отразить</label></div>
        <div class="bar">${nums.map(([k, n, step]) => `<label class="num">${n} <input type="number" data-lnum="${k}" step="${step}" value="${l[k] ?? ""}"${k === "out" ? ` placeholder="${outOf(draft.width, { show: l.show, stand: l.stand })}"` : ""}></label>`).join("")}</div>
        <div class="bar"><span class="said" style="margin:0">когда:</span>${(["always", "nearest"] as const).map((k) => `<button class="chip${l.show === k ? " on" : ""}" data-lshow="${k}">${SHOW_WORDS[k]}</button>`).join("")}</div>
        <div class="bar"><span class="said" style="margin:0">как стоит:</span>${(["plane", "camera", "tilt"] as const).map((k) => `<button class="chip${l.stand === k ? " on" : ""}" data-lstand="${k}">${STAND_WORDS[k]}</button>`).join("")}</div>
        <div class="bar"><button class="chip" data-lup>выше в списке</button><button class="chip" data-ldown>ниже (поверх)</button><button class="chip" data-ldup>копия</button><button class="chip drop" data-ldel>убрать</button></div>
        <div class="said">Угол — откуда видна: 0 — лицо, 90 — правый бок, 180 — спина; наклон 90 — сверху. Вправо и вверх — по картинке, наружу — от середины детали по её углу (пусто — по умолчанию), всё в ед. стола.</div>`;
      ed.querySelector<HTMLElement>("[data-lpick]")!.onclick = () => openPicker(l, (ref) => edit(() => { const x = cur(); if (x) x.sprite = ref; }));
      ed.querySelector<HTMLInputElement>("[data-lflip]")!.onchange = (e) => edit(() => { const x = cur(); if (x) x.flip = (e.target as HTMLInputElement).checked; });
      for (const inp of ed.querySelectorAll<HTMLInputElement>("[data-lnum]")) inp.onchange = inp.oninput = () => {
        const k = inp.dataset.lnum as (typeof nums)[number][0], v = Number(inp.value);
        if (k === "out" && inp.value === "") { edit(() => { const x = cur(); if (x) delete x.out; }, false); return; }
        if (inp.value === "" || !Number.isFinite(v)) return;
        edit(() => {
          const x = cur();
          if (!x) return;
          if (k === "yaw") x.yaw = wrapYaw(v);
          else { const lim = DETAIL_LIMITS[k]; x[k] = Math.min(lim[1], Math.max(lim[0], v)); }
        }, false);
      };
      for (const b of ed.querySelectorAll<HTMLElement>("[data-lshow]")) b.onclick = () => edit(() => { const x = cur(); if (x) x.show = b.dataset.lshow as Show; });
      for (const b of ed.querySelectorAll<HTMLElement>("[data-lstand]")) b.onclick = () => edit(() => { const x = cur(); if (x) x.stand = b.dataset.lstand as Stand; });
      const move = (by: number) => edit(() => { const i = draft.layers.findIndex((x) => x.id === sel), j = i + by; if (i < 0 || j < 0 || j >= draft.layers.length) return; const [x] = draft.layers.splice(i, 1); draft.layers.splice(j, 0, x!); });
      ed.querySelector<HTMLElement>("[data-lup]")!.onclick = () => move(-1);
      ed.querySelector<HTMLElement>("[data-ldown]")!.onclick = () => move(1);
      ed.querySelector<HTMLElement>("[data-ldup]")!.onclick = () => edit(() => { const i = draft.layers.findIndex((x) => x.id === sel); if (i < 0) return; const copy = { ...draft.layers[i]!, id: layerId() }; draft.layers.splice(i + 1, 0, copy); sel = copy.id; });
      ed.querySelector<HTMLElement>("[data-ldel]")!.onclick = () => edit(() => { const i = draft.layers.findIndex((x) => x.id === sel); if (i < 0) return; draft.layers.splice(i, 1); sel = draft.layers[Math.min(i, draft.layers.length - 1)]?.id ?? ""; });
    }

    // ——— правка: своя — черновик; встроенная — сперва своя копия ———
    let forking = false;
    /** Правка детали: `fn` меняет черновик; у встроенной первая правка делает твою копию и открывает её. */
    function edit(fn: () => void, redrawEditor = true): void {
      if (forking) return;
      fn();
      if (!s.own) { void fork(); return; }
      const b = pageBox.querySelector<HTMLButtonElement>("[data-dsave]");
      if (b) b.disabled = !dirty();
      const act = pageBox.querySelector<HTMLElement>("[data-dact]")!;
      act.className = "said";
      act.textContent = dirty() ? "Есть несохранённое." : "";
      const preset = presetOf(draft.layers);
      for (const x of pageBox.querySelectorAll<HTMLElement>("[data-preset]")) x.classList.toggle("on", x.dataset.preset === preset);
      pageBox.querySelector<HTMLElement>("[data-preset-own]")!.classList.toggle("on", !preset);
      pageBox.querySelector<HTMLElement>("[data-dpsaid]")!.textContent = preset ? `${PRESET_WORDS[preset][1]}. Так деталь стоит и за столом.` : "Своё: у картинок разные «когда» и «как стоит» — смотри в списке ниже.";
      drawRows();
      if (redrawEditor) drawEditor();
      pose();
      keep();
    }
    async function fork(): Promise<void> {
      forking = true;
      const made = await create({ ...draft, name: freeName(draft.name) });
      forking = false;
      if (!made) { pageBox.querySelector<HTMLElement>("[data-dact]")!.textContent = "Копия не создалась — правка не сохранится."; return; }
      pageSaid = `Встроенную не изменить — сделана твоя копия «${made.name}», правишь её.`;
      put({ detail: made.id, dl: sel || null, dd: null });
      follow();
    }

    // ——— у стола: деталь рядом со столом; тянешь — крутится стол вместе с ней, Ctrl — двигать деталь, Shift — крутить ———
    const R3 = (ax: "x" | "y", deg: number): number[][] => {
      const c = Math.cos((deg * Math.PI) / 180), n = Math.sin((deg * Math.PI) / 180);
      return ax === "x" ? [[1, 0, 0], [0, c, -n], [0, n, c]] : [[c, 0, n], [0, 1, 0], [-n, 0, c]];
    };
    const mul = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((j) => row[0]! * b[0]![j]! + row[1]! * b[1]![j]! + row[2]! * b[2]![j]!));
    function tablePose(): void {
      const st = pageBox.querySelector<HTMLElement>("[data-tstage]");
      if (!st) return;
      const u = TABLE_PPU;
      pageBox.querySelector<HTMLElement>("[data-tworld]")!.style.transform = `rotateX(${cam.pitch}deg) rotateY(${cam.yaw}deg)`;
      // Север стола — от середины прочь от южного места (там по умолчанию деталь): взгляд с поворотом 0 смотрит туда.
      const compass = pageBox.querySelector<HTMLElement>("[data-tcompass]")!;
      compass.hidden = !tlayers.compass;
      const face = `rotateY(${-cam.yaw}deg) rotateX(${-cam.pitch}deg)`, far = (R + RIM + 1.1) * u;
      compass.querySelector<HTMLElement>('[data-tcard="n"]')!.style.transform = `translate3d(0, 0, ${-far}px) ${face} translate(-50%, -50%)`;
      compass.querySelector<HTMLElement>('[data-tcard="s"]')!.style.transform = `translate3d(0, 0, ${far}px) ${face} translate(-50%, -50%)`;
      pageBox.querySelector<HTMLElement>("[data-tcells]")!.hidden = !tlayers.grid;
      st.dataset.under = cam.pitch > 0 ? "1" : "";
      const anchor = pageBox.querySelector<HTMLElement>("[data-tanchor]")!;
      anchor.style.transform = `translate3d(${at.x * u}px, ${-at.h * u}px, ${at.y * u}px) rotateY(${at.yaw}deg) rotateX(${at.tilt}deg)`;
      pageBox.querySelector<HTMLElement>("[data-tfoot]")!.style.transform = `translate3d(${at.x * u}px, 0px, ${at.y * u}px) rotateX(90deg)`;
      Object.assign(pageBox.querySelector<HTMLElement>("[data-tpole]")!.style, { height: `${Math.max(0, at.h) * u}px`, transform: `translate3d(${at.x * u}px, ${-at.h * u}px, ${at.y * u}px) rotateY(${-cam.yaw}deg)` });
      // Откуда камера смотрит на деталь, в её осях: (камера · деталь)ᵀ · к зрителю, право детали — влево сцены, верх — вверх.
      const M = mul(mul(R3("x", cam.pitch), R3("y", cam.yaw)), mul(R3("y", at.yaw), R3("x", at.tilt)));
      const me: [number, number, number] = [-M[2]![0]!, -M[2]![1]!, M[2]![2]!];
      const shown = renderDetail(pageBox.querySelector<HTMLElement>("[data-tbody]")!, me, u, `rotateX(${-at.tilt}deg) rotateY(${-at.yaw}deg) rotateY(${-cam.yaw}deg) rotateX(${-cam.pitch}deg)`);
      st.dataset.planes = String(shown.length);
      st.dataset.shown = shown.map((l) => l.id).join(",");
      st.dataset.at = [at.x, at.y, at.h].map(r1).join(",");
      for (const inp of pageBox.querySelectorAll<HTMLInputElement>("[data-tnum]")) if (document.activeElement !== inp) inp.value = String(r1(at[inp.dataset.tnum as keyof typeof at]));
    }

    function wire(): void {
      pageBox.querySelector<HTMLElement>("[data-daxes]")!.innerHTML = axesHtml();
      // Всегда в галерею деталей: на страницу можно прийти и из заказа agy, «назад» по истории увёл бы туда.
      pageBox.querySelector<HTMLElement>("[data-dback]")!.onclick = () => { go({ detail: null, dd: null, dl: null }); follow(); };
      const st = stage();
      let drag: { x: number; y: number } | null = null;
      st.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY }; st.setPointerCapture(e.pointerId); };
      st.onpointermove = (e) => { if (!drag) return; ry += (e.clientX - drag.x) * 0.8; rx = Math.max(-85, Math.min(85, rx - (e.clientY - drag.y) * 0.6)); drag = { x: e.clientX, y: e.clientY }; pose(); };
      st.onpointerup = st.onpointercancel = () => { if (drag) keep(); drag = null; };
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-dlayer]")) b.onclick = () => { const k = b.dataset.dlayer as keyof typeof layers; layers[k] = !layers[k]; b.classList.toggle("on", layers[k]); pose(); keep(); };
      // Заготовки показа и углов.
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-preset]")) b.onclick = () => edit(() => { const p = PRESETS[b.dataset.preset as Preset]; for (const l of draft.layers) { l.show = p.show; l.stand = p.stand; } });
      const ringIn = pageBox.querySelector<HTMLInputElement>("[data-dring]")!;
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-angles]")) b.onclick = () => {
        const n = Math.min(RING_LIMITS[1], Math.max(RING_LIMITS[0], Math.round(Number(ringIn.value)) || 16));
        put({ dn: n === 16 ? null : n });
        edit(() => { draft.layers = placeAngles(draft.layers, b.dataset.angles === "ring" ? ringAngles(n) : sideAngles()); if (!cur()) sel = draft.layers[0]?.id ?? ""; });
      };
      pageBox.querySelector<HTMLElement>("[data-ladd]")!.onclick = () => {
        // Новая картинка — с угла, откуда смотришь (круглое число), «когда» и «как стоит» — как у первой.
        const like = draft.layers[0] ?? { show: "nearest" as Show, stand: "tilt" as Stand };
        const fresh: Layer = { id: layerId(), flip: false, yaw: wrapYaw(Math.round(ry / 5) * 5), pitch: Math.max(-90, Math.min(90, Math.round(-rx / 5) * 5)), dx: 0, dy: 0, scale: 1, show: like.show, stand: like.stand };
        openPicker(fresh, (ref) => edit(() => { draft.layers.push({ ...fresh, sprite: ref }); sel = fresh.id; }));
      };
      // Круг углов: тап — выбрать; тянуть — новый угол (через 5°).
      const ring = pageBox.querySelector<SVGSVGElement>("[data-ring]")!;
      ring.onpointerdown = (e) => {
        const dotEl = (e.target as Element).closest<SVGGElement>("[data-rdot]");
        if (!dotEl) return;
        const id = dotEl.dataset.rdot!;
        select(id, true);
        ring.setPointerCapture(e.pointerId);
        let moved = false;
        ring.onpointermove = (m) => {
          const r = ring.getBoundingClientRect(), x = ((m.clientX - r.left) / r.width) * 220 - 110, y = ((m.clientY - r.top) / r.height) * 220 - 110;
          if (Math.hypot(x, y) < 20) return;
          const yaw = wrapYaw(Math.round(((Math.atan2(-x, y) * 180) / Math.PI) / 5) * 5);
          const l = draft.layers.find((x2) => x2.id === id);
          if (!l || (l.yaw === yaw && l.pitch === 0)) return;
          moved = true;
          l.yaw = yaw; l.pitch = 0;
          ry = signed(yaw); rx = 0;
          drawRows(); pose();
        };
        ring.onpointerup = () => { ring.onpointermove = null; ring.onpointerup = null; if (moved) edit(() => {}); };
      };
      // У стола.
      const ts = pageBox.querySelector<HTMLElement>("[data-tstage]")!;
      let tdrag: { x: number; y: number } | null = null;
      ts.oncontextmenu = (e) => e.preventDefault();
      ts.onpointerdown = (e) => { tdrag = { x: e.clientX, y: e.clientY }; ts.setPointerCapture(e.pointerId); e.preventDefault(); };
      ts.onpointermove = (e) => {
        if (!tdrag) return;
        const dx = e.clientX - tdrag.x, dy = e.clientY - tdrag.y;
        tdrag = { x: e.clientX, y: e.clientY };
        if (e.ctrlKey || e.metaKey) {
          // Шаг по экрану — в оси стола: обратный поворот камеры.
          const M = mul(R3("x", cam.pitch), R3("y", cam.yaw));
          const w = [0, 1, 2].map((j) => (M[0]![j]! * dx + M[1]![j]! * dy) / TABLE_PPU);
          at.x += w[0]!; at.h -= w[1]!; at.y += w[2]!;
        } else if (e.shiftKey) {
          at.yaw += dx * 0.8;
          at.tilt = Math.max(-90, Math.min(90, at.tilt - dy * 0.6));
        } else {
          cam.yaw += dx * 0.5;
          cam.pitch = Math.max(-89, Math.min(60, cam.pitch - dy * 0.4));
        }
        tablePose();
      };
      ts.onpointerup = ts.onpointercancel = () => { if (tdrag) keepTable(); tdrag = null; };
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-tlayer]")) b.onclick = () => { const k = b.dataset.tlayer as keyof typeof tlayers; tlayers[k] = !tlayers[k]; b.classList.toggle("on", tlayers[k]); tablePose(); keepTable(); };
      for (const inp of pageBox.querySelectorAll<HTMLInputElement>("[data-tnum]")) inp.oninput = () => { const v = Number(inp.value); if (inp.value === "" || !Number.isFinite(v)) return; at[inp.dataset.tnum as keyof typeof at] = v; tablePose(); keepTable(); };
      pageBox.querySelector<HTMLElement>("[data-treset]")!.onclick = () => { Object.assign(at, { x: 0, y: SHOULDERS, h: SHOULDER_H.sit + 1.5, yaw: 0, tilt: 0 }); Object.assign(cam, { yaw: 25, pitch: -28 }); tablePose(); keepTable(); };
      // Имя, ширина, теги.
      const act = pageBox.querySelector<HTMLElement>("[data-dact]")!;
      const nameIn = pageBox.querySelector<HTMLInputElement>("[data-dname]")!;
      nameIn.onchange = nameIn.oninput = (e) => {
        if (!s.own && e.type === "input") return;
        edit(() => { draft.name = nameIn.value; }, false);
        if (taken(draft.name, s.key)) act.textContent = "Такое имя уже у другой детали.";
      };
      const wIn = pageBox.querySelector<HTMLInputElement>("[data-dwidth]")!;
      wIn.onchange = wIn.oninput = (e) => { const v = Number(wIn.value); if (wIn.value === "" || !Number.isFinite(v) || (!s.own && e.type === "input")) return; edit(() => { draft.width = Math.min(DETAIL_LIMITS.width[1], Math.max(DETAIL_LIMITS.width[0], v)); }, false); };
      const tIn = pageBox.querySelector<HTMLInputElement>("[data-dtags]")!;
      tIn.onchange = tIn.oninput = (e) => { if (!s.own && e.type === "input") return; edit(() => { draft.tags = [...new Set(tIn.value.split(",").map((t) => t.trim()).filter(Boolean))]; }, false); };
      pageBox.querySelector<HTMLElement>("[data-dsave]")?.addEventListener("click", async () => {
        if (!draft.name.trim()) { act.textContent = "Нужно имя."; return; }
        if (taken(draft.name, s.key)) { act.textContent = `Имя «${draft.name.trim()}» уже у другой детали — дай другое.`; return; }
        const res = await fetch(`${HOST}/table/admin/details/${saved.id}`, { method: "PUT", headers: json, body: JSON.stringify(draft) }).catch(() => null);
        if (!res?.ok) { act.textContent = res?.status === 409 ? "Имя уже у другой детали — дай другое." : `Не сохранилось (${res?.status ?? "нет связи"}).`; return; }
        const next = (await res.json()) as Detail;
        mine = mine.map((d) => (d.id === next.id ? next : d));
        put({ dd: null });
        pageSaid = "Сохранено.";
        openPage({ key: next.id, own: true, detail: next });
      });
      pageBox.querySelector<HTMLElement>("[data-dcopy]")!.onclick = async () => {
        const made = await create({ ...draft, name: freeName(draft.name) });
        if (!made) { act.textContent = "Не сохранилось."; return; }
        go({ detail: made.id, dd: null });
        follow();
      };
      pageBox.querySelector<HTMLElement>("[data-ddrop]")?.addEventListener("click", async () => {
        if (!confirm(`Удалить деталь «${saved.name}»?`)) return;
        const res = await fetch(`${HOST}/table/admin/details/${saved.id}`, { method: "DELETE", headers: auth }).catch(() => null);
        if (!res?.ok) { act.textContent = "Не удалилась."; return; }
        mine = mine.filter((d) => d.id !== saved.id);
        said = `Удалена «${saved.name}».`;
        put({ detail: null, dd: null, dl: null });
        follow();
      });
      // Краски: расцветка или свои три цвета — на сцене и в списке; что не красится, сказано.
      const showPaint = () => {
        for (const b of pageBox.querySelectorAll<HTMLElement>("[data-dpal]")) b.classList.toggle("on", !paint.own3 && Number(b.dataset.dpal) === paint.pal);
        drawRows(); pose(); keep();
      };
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-dpal]")) b.onclick = () => {
        paint.pal = Number(b.dataset.dpal); paint.own3 = null;
        const p = PALETTES[paint.pal]!;
        pageBox.querySelectorAll<HTMLInputElement>("[data-dc]").forEach((c, i) => (c.value = [p.red, p.blue, p.gold][i]!));
        showPaint();
      };
      const cs = [...pageBox.querySelectorAll<HTMLInputElement>("[data-dc]")];
      // Свои цвета — когда мышь в выборе цвета остановилась: каждый шаг по палитре иначе пёк бы все картинки заново.
      let own3Wait = 0;
      for (const c of cs) c.oninput = () => { clearTimeout(own3Wait); own3Wait = window.setTimeout(() => { paint.own3 = [cs[0]!.value, cs[1]!.value, cs[2]!.value]; showPaint(); }, OWN3_WAIT_MS); };
      pageBox.querySelector<HTMLElement>("[data-dcoff]")!.onclick = () => { paint.own3 = null; showPaint(); };
      pageBox.querySelector<HTMLElement>("[data-dagy]")?.addEventListener("click", () => orderAgy({ id: saved.id, name: draft.name }));
      drawEditor();
      showPaint();
    }

    /** ВЫБРАТЬ ИЗ БИБЛИОТЕКИ — картинки с того же угла, что слой (сторона или ракурс рядом, ~18°); можно шире и поиском. */
    function openPicker(l: Pick<Layer, "yaw" | "pitch">, take: (ref: string) => void): void {
      const over = document.createElement("div");
      over.className = "pick-over";
      over.dataset.picker = "";
      let anySide = false, q = "";
      const here = dirOf(l.yaw, l.pitch);
      const drawPick = () => {
        const list = pics().filter((p) => (anySide || (!!p.side && dot(viewDir(p.side), here) > 0.95)) && (!q || q.split(/\s+/).every((w) => fits(`${p.name} ${p.tags.join(" ")} ${SLOT_TAG[p.slot] ?? ""}`, w))));
        over.innerHTML = `<div class="pick-sheet"><div class="bar"><b>${anySide ? "любая сторона" : angleName(l)} · любые картинки</b><button class="chip" data-pclose style="margin-left:auto">Закрыть</button></div>
          <div class="bar"><input type="search" data-pq placeholder="Имя или тег" value="${esc(q)}"><button class="chip${anySide ? " on" : ""}" data-pside>любая сторона</button></div>
          <div class="grid">${list.map((p) => { const src = srcOf(p.ref, pickSoon); return `<button class="cell${p.ref.startsWith("b:") ? "" : " own"}" data-pref="${esc(p.ref)}">${src ? `<img src="${esc(src)}" alt="">` : `<div class="wait">…</div>`}<b>${esc(p.name)}</b><i>${p.ref.startsWith("b:") ? "встроенная" : "своя"}${p.side ? ` · ${viewName(p.side)}` : ""}</i></button>`; }).join("") || `<div class="said" style="grid-column:1/-1">Таких картинок нет — шире: «любая сторона».</div>`}</div></div>`;
        const qi = over.querySelector<HTMLInputElement>("[data-pq]")!;
        qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; drawPick(); const again = over.querySelector<HTMLInputElement>("[data-pq]")!; again.focus(); again.setSelectionRange(pos, pos); };
        over.querySelector<HTMLElement>("[data-pside]")!.onclick = () => { anySide = !anySide; drawPick(); };
        over.querySelector<HTMLElement>("[data-pclose]")!.onclick = () => over.remove();
        for (const b of over.querySelectorAll<HTMLElement>("[data-pref]")) b.onclick = () => { over.remove(); take(b.dataset.pref!); };
      };
      let pickFrame = 0;
      const pickSoon = () => { if (!pickFrame) pickFrame = requestAnimationFrame(() => { pickFrame = 0; if (over.isConnected) drawCellsOnly(); }); };
      const drawCellsOnly = () => {
        for (const b of over.querySelectorAll<HTMLElement>("[data-pref]")) {
          const src = srcOf(b.dataset.pref, pickSoon);
          const wait = b.querySelector(".wait");
          if (src && wait) { const img = document.createElement("img"); img.src = src; img.alt = ""; wait.replaceWith(img); }
        }
      };
      over.onclick = (e) => { if (e.target === over) over.remove(); };
      drawPick();
      root.append(over);
    }

    draw();
  }

  void refresh();
  return { refresh };
}
