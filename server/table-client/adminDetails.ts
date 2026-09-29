// ПАНЕЛЬ «ДЕТАЛИ» НА СТРАНИЦЕ ХОЗЯИНА — как библиотека спрайтов, только единица здесь — деталь (`details.ts`): вещь из
// картинок в своём пространстве, без вида — шар годится и в головы, и в ком снеговика, кем встанет — решает фигура.
// Галерея деталей (поиск по имени и тегам) → страница детали:
//
//   сцена     — three.js (`detailScene.ts`), движок на выбор: WebGL или CSS3D. Крутишь камеру пальцем, тап по картинке —
//               выбрать (Shift / Ctrl / ⌘ — добавить), на выбранной — ручки: двигать, крутить, величина;
//   форма     — заготовки: плоскость, куб, d4, d8, d12, d20, призма N, ракурсы N (картинки переезжают на ближайшие грани);
//   картинки  — список слоёв по порядку (ниже — поверх, ☰ — перетащить), у каждой галочка и ×; выбранным — правка
//               числами: место X/Y/Z, поворот X/Y/Z (Z — вокруг своей оси), от середины, величина, отражения, форма,
//               когда и как стоит; «Отменить / Вернуть» (⌘Z / ⇧⌘Z) — на любую правку;
//   у стола   — деталь рядом со столом: тянешь — камера, Ctrl — двигать деталь, Shift — крутить; С и Ю, дно, клетка;
//   встроенные детали каталога (`skins.ts`) — первая же правка делает твою копию, и дальше правишь её.
//
// Всё выбранное (деталь, слои, камера, движок, несохранённая правка) — в адресе (`adminRoute.ts`).

import { PALETTES } from "../src/table/dolls.js";
import { partOf, PARTS } from "../src/table/skins.js";
import { partName } from "../src/table/tunes.js";
import {
  atDist, DETAIL_LIMITS, DETAIL_WIDTH, distOf, facing, layerId, layerOf, layersFromViews, NEW_DETAIL, normalOf, RING_LIMITS, SHAPES, shapeLayers,
  viewAngle, viewDir, visibleLayers, wrapDeg, type Detail, type Layer, type Shape, type ShapeKind, type Show, type Stand, type V3,
} from "../src/table/details.js";
import { paintPart, partSprite } from "./dollSprites.js";
import { UNIT_WIDTH } from "./spriteAxes.js";
import { HOST } from "./host.js";
import { R, RIM, TABLE_THICK } from "./felt.js";
import { SHOULDERS, SHOULDER_H } from "../src/table/bodies.js";
import { go, onRoute, put, route, routeNum, routeOne } from "./adminRoute.js";
import { mountDetailStage, mountTableStage, type DetailStage, type Engine, type Grip, type TablePlace, type TableStage } from "./detailScene.js";

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
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const SHOW_WORDS: Record<Show, string> = { always: "всегда", nearest: "по углу" };
const STAND_WORDS: Record<Stand, string> = { plane: "как поставлена", camera: "лицом к камере", tilt: "бумажная" };
const SHAPE_WORDS: Record<Shape, string> = { rect: "как картинка", square: "квадрат", tri: "треугольник", pent: "пятиугольник", hex: "шестиугольник", circle: "круг" };
const KINDS: [ShapeKind, string, string][] = [
  ["plane", "плоскость", "одна картинка лицом к тебе"],
  ["cube", "куб", "шесть квадратных граней"],
  ["d4", "d4", "четыре треугольника"],
  ["d8", "d8", "восемь треугольников"],
  ["d12", "d12", "двенадцать пятиугольников"],
  ["d20", "d20", "двадцать треугольников"],
  ["prism", "призма", "N граней по кругу, всегда все — бочка в объёме"],
  ["views", "ракурсы", "N картинок по кругу, видна ближайшая, лицом к камере — бочка из рисунков"],
];
/** Сторона, куда смотрит лицо слоя: словом, если ровно туда. */
const sideName = (l: Layer): string => {
  const n = normalOf(l);
  const hit = (["front", "right", "back", "left", "top", "bottom"] as const).find((v) => dot(viewDir(v), n) > 0.999);
  return hit ? VIEW_NAMES[hit]! : "";
};
const f1 = (v: number) => String(Math.round(v * 100) / 100);

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fits = (hay: string, q: string) => hay.toLowerCase().replaceAll("ё", "е").includes(q.toLowerCase().replaceAll("ё", "е").trim());

const CSS = `
.dt { max-width: 980px; margin: 0 auto; padding: 12px 16px 40px; }
.dt .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.dt .chip { font: inherit; font-size: 13px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 999px; padding: 5px 11px; cursor: pointer; }
.dt .chip.on { background: var(--gold); color: #0b0704; border-color: var(--gold); font-weight: 600; }
.dt .chip:disabled { opacity: .4; cursor: default; }
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
.dt .d3 { height: 380px; border: 1px solid var(--line); border-radius: 12px; margin-bottom: 8px; background: radial-gradient(#1b4835, #0a2117); cursor: grab; }
.dt .d3-face { position: relative; }
.dt .d3-face > img { user-select: none; }
.dt .d3-face.empty { background: rgba(111,208,255,.16); }
.dt .d3-face.picked { filter: drop-shadow(0 0 4px #f2c14e) drop-shadow(0 0 2px #f2c14e); }
.dt .tb-cardinal { font: 700 15px/1 system-ui, sans-serif; color: #f2c14e; background: rgba(11,7,4,.8); border: 1.5px solid #f2c14e; border-radius: 8px; padding: 3px 6px; white-space: nowrap; }
.dt .rows { display: grid; gap: 6px; margin-bottom: 8px; }
.dt .row { display: flex; align-items: center; gap: 8px; background: #0f1f18; border: 1px solid var(--line); border-radius: 10px; padding: 5px 8px; cursor: pointer; min-width: 0; }
.dt .row.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.dt .row.seen .rname::after { content: " 👁"; }
.dt .row.lift { opacity: .6; }
.dt .row .grip { cursor: grab; touch-action: none; color: var(--dim); font-size: 18px; padding: 4px 2px; user-select: none; }
.dt .row input[type=checkbox] { width: 20px; height: 20px; flex: none; accent-color: var(--gold); }
.dt .row img, .dt .row .none { width: 44px; height: 44px; object-fit: contain; flex: none; }
.dt .row .none { display: grid; place-items: center; color: var(--dim); font-size: 11px; border: 1px dashed var(--line); border-radius: 6px; }
.dt .row .rtext { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.dt .row .rname { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt .row .rsub { font-size: 11.5px; color: var(--dim); }
.dt .row .x { font: inherit; font-size: 18px; line-height: 1; color: var(--dim); background: none; border: 1px solid var(--line); border-radius: 8px; width: 32px; height: 32px; flex: none; cursor: pointer; }
.dt .ed { border: 1px solid var(--line); border-radius: 12px; padding: 10px; margin-bottom: 8px; }
.dt .nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 10px; margin-bottom: 10px; }
.dt label.num { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--dim); }
.dt .nums label.num { display: flex; justify-content: space-between; }
.dt input[type=number] { width: 76px; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 5px 6px; }
.dt .nums input[type=number] { width: 100%; min-width: 0; box-sizing: border-box; max-width: 90px; }
.dt .dt-name { flex: 1; min-width: 0; font: inherit; font-size: 17px; font-weight: 600; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.dt .pick-over { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.6); display: flex; align-items: flex-end; justify-content: center; }
.dt .pick-sheet { width: 100%; max-width: 980px; max-height: 86vh; overflow: auto; background: #111816; border: 1px solid var(--line); border-radius: 14px 14px 0 0; padding: 12px 16px 24px; }
.dt .pick-sheet input[type=search] { flex: 1 1 180px; min-width: 0; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.dt .pick-sheet .cell.same { border-color: var(--gold); }
`;

/** Краски: одна из шестнадцати расцветок — или свои три цвета вместо красной, синей и золота рисунка. */
interface Paint { pal: number; own3: readonly [string, string, string] | null }
const PLAIN: Paint = { pal: 0, own3: null };
/** Свои цвета применяются, когда выбор цвета затих столько: тянешь мышью по палитре — печётся один раз, в конце. */
const OWN3_WAIT_MS = 200;
/** Правки подряд одним движением (ручки, число стрелками) — один шаг «Отменить», если между ними меньше этого. */
const MERGE_MS = 800;
const HISTORY_MAX = 100;

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
    const width = UNIT_WIDTH[p.slot] ?? DETAIL_WIDTH;
    return { key: `b:${p.id}`, own: false, detail: { id: p.id, name: `${partName(p.id)} · ${SLOT_TAG[p.slot] ?? p.slot}`, tags: [SLOT_TAG[p.slot] ?? p.slot], width, layers: layersFromViews(views, p.facing, width), at: 0 } };
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
  const PAGE_KEYS = { dl: null, dd: null } as const;
  function drawList(): void {
    listBox.innerHTML = `<div class="bar"><input type="search" data-dq placeholder="Имя или тег" value="${esc(route("dq") ?? "")}" style="flex:1 1 180px;min-width:0;font:inherit;font-size:15px;color:var(--ink);background:#0f1213;border:1px solid var(--line);border-radius:8px;padding:6px 8px"><button class="add" data-new>+ Новая деталь</button><button class="chip" data-dagynew>+ Заказать у agy</button></div>
      <div class="said" data-dsaid>${esc(said)}</div>
      <div class="grid" data-dgrid></div>`;
    const q = listBox.querySelector<HTMLInputElement>("[data-dq]")!;
    q.oninput = () => { put({ dq: q.value || null }); drawCells(); };
    listBox.querySelector<HTMLElement>("[data-new]")!.onclick = async () => {
      const made = await create(blank());
      if (!made) { said = "Не создалась."; drawList(); return; }
      go({ detail: made.id, ...PAGE_KEYS });
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
      const flip = c && (c.flipX || c.flipY) ? ` style="transform:scale(${c.flipX ? -1 : 1},${c.flipY ? -1 : 1})"` : "";
      return `<button class="cell${s.own ? " own" : ""}" data-detail="${esc(s.key)}">${src ? `<img src="${esc(src)}" alt=""${flip}>` : `<div class="wait">${c ? "…" : "пусто"}</div>`}<b>${esc(s.detail.name)}</b><i>${esc(s.detail.tags.join(", ") || "без тегов")} · ${n} ${n === 1 ? "картинка" : n > 1 && n < 5 ? "картинки" : "картинок"}</i><i>${s.own ? "своя" : "встроенная"}${stiff(s.detail).length ? " · не красится" : ""}</i></button>`;
    }).join("") || `<div class="said" style="grid-column:1/-1">Ничего не найдено.</div>`;
    for (const b of grid.querySelectorAll<HTMLElement>("[data-detail]")) b.onclick = () => { go({ detail: b.dataset.detail, ...PAGE_KEYS }); follow(); };
  }

  // ——— страница детали ———
  let openKey = "";
  /** Сказать на открывшейся странице (после копии встроенной, после сохранения). */
  let pageSaid = "";
  /** Сцены открытой страницы — гасятся, когда страница перерисована или закрыта. */
  let stages: { destroy(): void }[] = [];
  let unkeys: (() => void) | null = null;
  const closeStages = () => { for (const s of stages) s.destroy(); stages = []; unkeys?.(); unkeys = null; };
  function follow(): void {
    const key = route("detail");
    const s = key ? all().find((x) => x.key === key) : undefined;
    listBox.hidden = !!s;
    pageBox.hidden = !s;
    if (!s) { openKey = ""; closeStages(); drawList(); return; }
    openPage(s);
  }
  onRoute(() => { if (route("tab") === "details") follow(); });

  function openPage(s: Shown): void {
    closeStages();
    openKey = s.key;
    const saved = s.detail;
    const fields = (d: Draft): Draft => ({ name: d.name, tags: d.tags, width: d.width, layers: d.layers });
    let draft: Draft;
    try { draft = s.own && route("dd") ? structuredClone({ ...fields(saved), ...(JSON.parse(route("dd")!) as object) }) : structuredClone(fields(saved)); }
    catch { draft = structuredClone(fields(saved)); }
    const ids = new Set(draft.layers.map((l) => l.id));
    let sel = new Set((route("dl") ?? "").split(",").filter((id) => ids.has(id)));
    if (!sel.size && draft.layers[0]) sel.add(draft.layers[0].id);
    const engine: Engine = routeOne("de", ["webgl", "css"] as const, "webgl");
    let grip: Grip = routeOne("dg", ["translate", "rotate", "scale"] as const, "translate");
    let space: "local" | "world" = routeOne("ds", ["local", "world"] as const, "local");
    const layers = { axes: route("dax") !== "0", grid: route("dgr") !== "0" };
    const c3 = (route("dc") ?? "").split(",").filter((c) => /^[0-9a-f]{6}$/i.test(c)).map((c) => `#${c}`);
    const paint: { pal: number; own3: [string, string, string] | null } = { pal: Math.max(0, Math.min(PALETTES.length - 1, Math.round(routeNum("dp", 0)))), own3: c3.length === 3 ? (c3 as [string, string, string]) : null };
    const dirty = () => JSON.stringify(fields(draft)) !== JSON.stringify(fields(saved));
    let dStage: DetailStage | null = null, tStage: TableStage | null = null;
    const keep = () => {
      const v = dStage?.view();
      put({ dl: [...sel].join(",") || null, dry: v ? Math.round(v.yaw) || null : null, drx: v ? Math.round(v.pitch) || null : null, dz: v && Math.abs(v.dist - 3.2) > 0.01 ? Math.round(v.dist * 100) / 100 : null, dax: layers.axes ? null : "0", dgr: layers.grid ? null : "0", dp: paint.pal || null, dc: paint.own3 ? paint.own3.map((c) => c.slice(1)).join(",") : null, dd: s.own && dirty() ? JSON.stringify(draft) : null, dg: grip === "translate" ? null : grip, ds: space === "local" ? null : space });
    };
    const chosen = (): Layer[] => draft.layers.filter((l) => sel.has(l.id));

    // ——— у стола: где деталь и откуда камера ———
    const HEAD_H = SHOULDER_H.sit + 1.5;
    const at: TablePlace = { x: routeNum("tx", 0), y: routeNum("ty", SHOULDERS), h: routeNum("th", HEAD_H), yaw: routeNum("tyw", 0), tilt: routeNum("tpt", 0) };
    const tlayers = { compass: route("tlc") !== "0", grid: route("tlg") === "1" };
    const r1 = (n: number) => Math.round(n * 100) / 100;
    const keepTable = () => {
      const v = tStage?.view();
      put({ tx: r1(at.x) || null, ty: r1(at.y) === SHOULDERS ? null : r1(at.y), th: r1(at.h) === HEAD_H ? null : r1(at.h), tyw: Math.round(at.yaw) || null, tpt: Math.round(at.tilt) || null, tcy: v && Math.round(v.yaw) !== 25 ? Math.round(v.yaw) : null, tcp: v && Math.round(v.pitch) !== 28 ? Math.round(v.pitch) : null, tlc: tlayers.compass ? null : "0", tlg: tlayers.grid ? "1" : null });
    };

    // ——— отменить / вернуть ———
    const undo: string[] = [], redo: string[] = [];
    let lastMerge = "", lastAt = 0;
    const snap = () => JSON.stringify(fields(draft));
    const restore = (from: string[], to: string[]) => {
      const one = from.pop();
      if (!one) return;
      to.push(snap());
      draft = JSON.parse(one) as Draft;
      const have = new Set(draft.layers.map((l) => l.id));
      sel = new Set([...sel].filter((id) => have.has(id)));
      lastMerge = "";
      after(true, true);
    };

    const draw = () => {
      pageBox.innerHTML = `<div class="sp-page" data-detail-page="${esc(s.key)}">
        <div class="sp-top"><button class="chip" data-dback>← Все детали</button><input class="dt-name" data-dname maxlength="40" value="${esc(draft.name)}" aria-label="Имя"></div>
        <div class="bar">${s.own
          ? `<button class="add" data-dsave ${dirty() ? "" : "disabled"}>Сохранить</button><button class="chip" data-dcopy>Сохранить как новую</button><button class="chip" data-dagy>Заказать у agy</button><button class="chip drop" data-ddrop>Удалить</button>`
          : `<button class="add" data-dcopy>Сделать своей копией</button>`}</div>
        <div class="said${pageSaid ? " warn" : ""}" data-dact>${esc(pageSaid || (s.own ? (dirty() ? "Есть несохранённое." : "") : "Встроенная: первая же правка сделает твою копию, дальше правишь её."))}</div>
        <div class="bar"><span class="said" style="margin:0">движок:</span>${(["webgl", "css"] as const).map((k) => `<button class="chip${engine === k ? " on" : ""}" data-engine="${k}">${{ webgl: "WebGL", css: "CSS3D" }[k]}</button>`).join("")}<button class="chip" data-dundo>↶ Отменить</button><button class="chip" data-dredo>↷ Вернуть</button></div>
        <div class="d3" data-dstage></div>
        <div class="bar">${(["translate", "rotate", "scale"] as const).map((k) => `<button class="chip${grip === k ? " on" : ""}" data-grip-mode="${k}">${{ translate: "двигать", rotate: "крутить", scale: "величина" }[k]}</button>`).join("")}<button class="chip${space === "local" ? " on" : ""}" data-space>${space === "local" ? "свои оси" : "оси детали"}</button>${(["axes", "grid"] as const).map((k) => `<button class="chip${layers[k] ? " on" : ""}" data-dlayer="${k}">${{ axes: "Оси", grid: "Клетка" }[k]}</button>`).join("")}</div>
        <div class="said" data-dseen></div>
        <div class="said">Тянешь — крутится камера, колесо / два пальца — ближе. Тап по картинке — выбрать (Shift / Ctrl / ⌘ — добавить). На выбранной — ручки: стрелки двигают, кольца крутят, кубики — величина.</div>
        <h3>Форма</h3>
        <div class="bar" data-dshapes>${KINDS.map(([k, n, hint]) => `<button class="chip" data-shape="${k}" title="${esc(hint)}">${n}</button>`).join("")}<label class="num">N <input type="number" data-dring min="${RING_LIMITS[0]}" max="${RING_LIMITS[1]}" step="1" value="${routeNum("dn", 16)}"></label></div>
        <div class="said">Заготовка ставит слои гранями; картинки прежних слоёв переезжают на ближайшие грани. Передумал — «Отменить».</div>
        <h3>Картинки</h3>
        <div class="bar"><button class="add" data-ladd>+ Картинка</button><button class="chip" data-lblank>+ Пустое место</button><button class="chip" data-lall>выбрать все</button><button class="chip" data-lnone>снять выбор</button><button class="chip drop" data-ldelsel>убрать выбранные</button><button class="chip drop" data-ldelempty>убрать пустые</button></div>
        <div class="said">По порядку: кто ниже в списке — рисуется поверх. Перетащить — за ☰. Новая картинка встаёт лицом к тебе.</div>
        <div class="rows" data-rows></div>
        <div class="ed" data-ed></div>
        <h3>У стола</h3>
        <div class="d3" data-tstage></div>
        <div class="bar">${(["compass", "grid"] as const).map((k) => `<button class="chip${tlayers[k] ? " on" : ""}" data-tlayer="${k}">${{ compass: "Стороны света", grid: "Клетка" }[k]}</button>`).join("")}</div>
        <div class="said">Тянешь — камера вокруг стола; снизу видно дно. <b>Ctrl</b> + тянуть — двигать деталь (по экрану), <b>Shift</b> + тянуть — поворачивать её.</div>
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

    // ИСПЕКЛАСЬ КАРТИНКА — одна перерисовка на кадр, и подписка одна и та же: пекарь хранит ждущих множеством, и новая
    // функция на каждую перерисовку множила бы перерисовки на число ещё не испечённых (у бочки их 18 — страница висла).
    let soonFrame = 0;
    const soon = () => { if (!soonFrame) soonFrame = requestAnimationFrame(() => { soonFrame = 0; if (openKey === s.key && pageBox.isConnected) { drawRows(); scenes(); } }); };
    const look = () => ({ width: draft.width, layers: draft.layers, src: (l: Layer) => srcOf(l.sprite, soon, paint), sel });
    /** Сцены — по черновику; что видно — в строках и под сценой. */
    function scenes(): void {
      dStage?.set(look());
      tStage?.set(look());
      requestAnimationFrame(seen);
    }
    function seen(): void {
      if (!dStage) return;
      const shown = dStage.shown().filter((l) => l.sprite);
      const seenBox = pageBox.querySelector<HTMLElement>("[data-dseen]");
      if (seenBox) seenBox.textContent = shown.length ? `видно: ${shown.length} из ${draft.layers.filter((l) => l.sprite).length}` : draft.layers.some((l) => l.sprite) ? "" : "Картинок нет — «+ Картинка» или заготовка формы.";
      for (const row of pageBox.querySelectorAll<HTMLElement>("[data-row]")) row.classList.toggle("seen", shown.some((l) => l.id === row.dataset.row));
    }

    // ——— строки картинок ———
    const summary = (l: Layer) => [
      sideName(l) || `↻ ${f1(l.rx)}°, ${f1(l.ry)}°, ${f1(l.rz)}°`,
      `в ${f1(l.x)}, ${f1(l.y)}, ${f1(l.z)}`,
      `×${f1(l.scale)}`,
      l.shape === "rect" ? "" : SHAPE_WORDS[l.shape],
      SHOW_WORDS[l.show],
      STAND_WORDS[l.stand],
      l.flipX ? "↔" : "",
      l.flipY ? "↕" : "",
    ].filter(Boolean).join(" · ");
    function drawRows(): void {
      const box = pageBox.querySelector<HTMLElement>("[data-rows]");
      if (!box) return;
      box.innerHTML = draft.layers.map((l) => {
        const src = srcOf(l.sprite, soon, paint), flip = l.flipX || l.flipY ? ` style="transform:scale(${l.flipX ? -1 : 1},${l.flipY ? -1 : 1})"` : "";
        return `<div class="row${sel.has(l.id) ? " on" : ""}" data-row="${l.id}"><span class="grip" data-grip="${l.id}" title="Перетащить">☰</span><input type="checkbox" data-lcheck="${l.id}"${sel.has(l.id) ? " checked" : ""} aria-label="Выбрать">${src ? `<img src="${esc(src)}" alt=""${flip}>` : `<span class="none">${l.sprite ? "…" : "пусто"}</span>`}<span class="rtext"><span class="rname">${l.sprite ? esc(picName(l.sprite)) : "место под картинку"}</span><span class="rsub">${esc(summary(l))}</span></span><button class="x" data-lx="${l.id}" title="Убрать">×</button></div>`;
      }).join("") || `<div class="said">Картинок нет.</div>`;
      const no = stiff(draft), paintSaid = pageBox.querySelector<HTMLElement>("[data-dpaint]");
      if (paintSaid) paintSaid.textContent = no.length ? `Не красятся (PNG): ${no.length}.` : "Красятся три краски рисунка: основной, второй, акцент.";
      for (const row of box.querySelectorAll<HTMLElement>("[data-row]")) row.onclick = (e) => {
        const t = e.target as Element;
        if (t.closest("[data-grip]") || t.closest("[data-lx]") || t.closest("[data-lcheck]")) return;
        choose(row.dataset.row!, e.shiftKey || e.ctrlKey || e.metaKey);
      };
      for (const c of box.querySelectorAll<HTMLInputElement>("[data-lcheck]")) c.onchange = () => { if (c.checked) sel.add(c.dataset.lcheck!); else sel.delete(c.dataset.lcheck!); picked(); };
      for (const b of box.querySelectorAll<HTMLElement>("[data-lx]")) b.onclick = () => edit(() => { const id = b.dataset.lx!; draft.layers = draft.layers.filter((l) => l.id !== id); sel.delete(id); });
      // Перетащить за ☰ — на место строки, над которой отпустил.
      for (const g of box.querySelectorAll<HTMLElement>("[data-grip]")) g.onpointerdown = (e) => {
        e.preventDefault();
        g.setPointerCapture(e.pointerId);
        const id = g.dataset.grip!, row = g.closest<HTMLElement>("[data-row]")!;
        row.classList.add("lift");
        const target = (y: number) => { const rows = [...box.querySelectorAll<HTMLElement>("[data-row]")]; let k = rows.findIndex((r) => y < r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2); if (k < 0) k = rows.length; return k; };
        g.onpointerup = (u) => {
          g.onpointerup = null;
          row.classList.remove("lift");
          const from = draft.layers.findIndex((l) => l.id === id);
          let to = target(u.clientY);
          if (to > from) to -= 1;
          if (to === from) return;
          edit(() => { const [l] = draft.layers.splice(from, 1); draft.layers.splice(to, 0, l!); });
        };
      };
    }
    /** Выбрать картинку (`add` — добавить к выбранным или снять): строка, ручки, правка. */
    function choose(id: string | null, add: boolean): void {
      if (!id) return;
      if (add) { if (sel.has(id)) sel.delete(id); else sel.add(id); }
      else sel = new Set([id]);
      picked();
    }
    function picked(): void { drawRows(); drawEditor(); scenes(); keep(); }

    // ——— правка выбранных ———
    type NumKey = "x" | "y" | "z" | "rx" | "ry" | "rz" | "dist" | "scale";
    const NUMS: [NumKey, string, number][] = [["x", "X", 0.1], ["y", "Y", 0.1], ["z", "Z", 0.1], ["rx", "поворот X°", 5], ["ry", "поворот Y°", 5], ["rz", "Z° (своя ось)", 5], ["dist", "от середины", 0.1], ["scale", "величина ×", 0.05]];
    const valueOf = (l: Layer, k: NumKey): number => (k === "dist" ? distOf(l) : l[k]);
    /** Одно значение у всех выбранных — оно, разные — пусто. */
    const common = <T,>(get: (l: Layer) => T): T | undefined => { const c = chosen(); return c.length && c.every((l) => get(l) === get(c[0]!)) ? get(c[0]!) : undefined; };
    function drawEditor(): void {
      const ed = pageBox.querySelector<HTMLElement>("[data-ed]");
      if (!ed) return;
      const c = chosen();
      if (!c.length) { ed.innerHTML = `<div class="said">Выбери картинку — в списке или тапом по сцене. Галочками — несколько сразу.</div>`; return; }
      const one = c.length === 1 ? c[0]! : null;
      const num = (k: NumKey) => { const v = common((l) => Math.round(valueOf(l, k) * 1000) / 1000); return v === undefined ? "" : String(v); };
      const flag = (k: "flipX" | "flipY") => { const v = common((l) => l[k]); return v === undefined ? " data-mixed" : v ? " checked" : ""; };
      ed.innerHTML = `<div class="bar" style="margin-bottom:6px"><b>${one ? (one.sprite ? esc(picName(one.sprite)) : "место под картинку") : `выбрано: ${c.length}`}</b></div>
        <div class="bar"><button class="add" data-lpick>${one && !one.sprite ? "Выбрать картинку" : c.length > 1 ? "Картинка всем выбранным" : "Другая картинка"}</button><label class="num"><input type="checkbox" data-lflip="flipX"${flag("flipX")}> отразить ↔</label><label class="num"><input type="checkbox" data-lflip="flipY"${flag("flipY")}> отразить ↕</label></div>
        <div class="nums">${NUMS.map(([k, n, step]) => `<label class="num">${n} <input type="number" data-lnum="${k}" step="${step}" value="${num(k)}"${num(k) === "" ? ' placeholder="разные"' : ""}></label>`).join("")}</div>
        <div class="bar"><span class="said" style="margin:0">форма:</span>${SHAPES.map((k) => `<button class="chip${common((l) => l.shape) === k ? " on" : ""}" data-lshape="${k}">${SHAPE_WORDS[k]}</button>`).join("")}</div>
        <div class="bar"><span class="said" style="margin:0">когда:</span>${(["always", "nearest"] as const).map((k) => `<button class="chip${common((l) => l.show) === k ? " on" : ""}" data-lshow="${k}">${SHOW_WORDS[k]}</button>`).join("")}</div>
        <div class="bar"><span class="said" style="margin:0">как стоит:</span>${(["plane", "camera", "tilt"] as const).map((k) => `<button class="chip${common((l) => l.stand) === k ? " on" : ""}" data-lstand="${k}">${STAND_WORDS[k]}</button>`).join("")}</div>
        <div class="bar"><button class="chip" data-lup ${one ? "" : "disabled"}>выше в списке</button><button class="chip" data-ldown ${one ? "" : "disabled"}>ниже (поверх)</button><button class="chip" data-ldup>копия</button><button class="chip drop" data-ldel>убрать</button></div>
        <div class="said">Место — от середины детали: X вправо, Y вверх, Z к лицу, в ед. стола. Поворот: сначала Y (разворот), потом X (наклон), потом Z — вокруг своей оси. «От середины» тянет картинку по её направлению. «По углу» — видна, когда смотрит на тебя ближе остальных «по углу».</div>`;
      for (const b of ed.querySelectorAll<HTMLInputElement>("[data-mixed]")) b.indeterminate = true;
      ed.querySelector<HTMLElement>("[data-lpick]")!.onclick = () => openPicker(normalOf(c[0]!), (ref) => edit(() => { for (const l of chosen()) l.sprite = ref; }));
      for (const b of ed.querySelectorAll<HTMLInputElement>("[data-lflip]")) b.onchange = () => edit(() => { for (const l of chosen()) l[b.dataset.lflip as "flipX" | "flipY"] = b.checked; });
      for (const inp of ed.querySelectorAll<HTMLInputElement>("[data-lnum]")) inp.oninput = () => {
        const k = inp.dataset.lnum as NumKey, v = Number(inp.value);
        if (inp.value === "" || !Number.isFinite(v)) return;
        edit(() => {
          for (const l of chosen()) {
            if (k === "dist") Object.assign(l, atDist(l, Math.max(0, Math.min(DETAIL_LIMITS.pos[1], v))));
            else if (k === "rx" || k === "ry" || k === "rz") l[k] = wrapDeg(v);
            else if (k === "scale") l.scale = Math.min(DETAIL_LIMITS.scale[1], Math.max(DETAIL_LIMITS.scale[0], v));
            else l[k] = Math.min(DETAIL_LIMITS.pos[1], Math.max(DETAIL_LIMITS.pos[0], v));
          }
        }, { editor: false, merge: `num:${k}` });
        // «От середины» меняет место — числа места показать заново, не трогая то, что сейчас в руках.
        for (const other of ed.querySelectorAll<HTMLInputElement>("[data-lnum]")) if (other !== inp) { const val = num(other.dataset.lnum as NumKey); other.value = val; }
      };
      for (const b of ed.querySelectorAll<HTMLElement>("[data-lshape]")) b.onclick = () => edit(() => { for (const l of chosen()) l.shape = b.dataset.lshape as Shape; });
      for (const b of ed.querySelectorAll<HTMLElement>("[data-lshow]")) b.onclick = () => edit(() => { for (const l of chosen()) l.show = b.dataset.lshow as Show; });
      for (const b of ed.querySelectorAll<HTMLElement>("[data-lstand]")) b.onclick = () => edit(() => { for (const l of chosen()) l.stand = b.dataset.lstand as Stand; });
      const move = (by: number) => edit(() => { const i = draft.layers.findIndex((x) => sel.has(x.id)), j = i + by; if (i < 0 || j < 0 || j >= draft.layers.length) return; const [x] = draft.layers.splice(i, 1); draft.layers.splice(j, 0, x!); });
      ed.querySelector<HTMLElement>("[data-lup]")!.onclick = () => move(-1);
      ed.querySelector<HTMLElement>("[data-ldown]")!.onclick = () => move(1);
      ed.querySelector<HTMLElement>("[data-ldup]")!.onclick = () => edit(() => {
        const copies: string[] = [];
        draft.layers = draft.layers.flatMap((l) => { if (!sel.has(l.id)) return [l]; const copy = { ...l, id: layerId() }; copies.push(copy.id); return [l, copy]; });
        sel = new Set(copies);
      });
      ed.querySelector<HTMLElement>("[data-ldel]")!.onclick = () => removeSel();
    }
    function removeSel(): void {
      if (!sel.size) return;
      edit(() => {
        const i = draft.layers.findIndex((l) => sel.has(l.id));
        draft.layers = draft.layers.filter((l) => !sel.has(l.id));
        const next = draft.layers[Math.min(Math.max(0, i), draft.layers.length - 1)];
        sel = new Set(next ? [next.id] : []);
      });
    }

    // ——— правка: своя — черновик (с «Отменить»); встроенная — сперва своя копия ———
    let forking = false;
    /**
     * Правка детали: `fn` меняет черновик. `merge` — правки подряд одного рода (число стрелками, ручки) — один шаг
     * «Отменить»; `editor: false` — правку выбранных не перерисовывать (в ней сейчас пишут). У встроенной первая
     * правка делает твою копию и открывает её.
     */
    function edit(fn: () => void, o: { editor?: boolean; merge?: string } = {}): void {
      if (forking) return;
      const before = snap(), now = Date.now();
      fn();
      if (snap() === before) { after(o.editor !== false, false); return; }
      if (!o.merge || o.merge !== lastMerge || now - lastAt > MERGE_MS) { undo.push(before); if (undo.length > HISTORY_MAX) undo.shift(); }
      redo.length = 0;
      lastMerge = o.merge ?? "";
      lastAt = now;
      if (!s.own) { void fork(); return; }
      after(o.editor !== false, true);
    }
    /** После правки: кнопки, строки, правка выбранных, сцены, адрес. */
    function after(editor: boolean, rows: boolean): void {
      const b = pageBox.querySelector<HTMLButtonElement>("[data-dsave]");
      if (b) b.disabled = !dirty();
      const act = pageBox.querySelector<HTMLElement>("[data-dact]");
      if (act && !act.dataset.keep) { act.className = "said"; act.textContent = s.own ? (dirty() ? "Есть несохранённое." : "") : act.textContent; }
      delete act?.dataset.keep;
      pageBox.querySelector<HTMLButtonElement>("[data-dundo]")!.disabled = !undo.length;
      pageBox.querySelector<HTMLButtonElement>("[data-dredo]")!.disabled = !redo.length;
      if (rows) drawRows();
      if (editor) drawEditor();
      scenes();
      keep();
    }
    async function fork(): Promise<void> {
      forking = true;
      const made = await create({ ...draft, name: freeName(draft.name) });
      forking = false;
      if (!made) { pageBox.querySelector<HTMLElement>("[data-dact]")!.textContent = "Копия не создалась — правка не сохранится."; return; }
      pageSaid = `Встроенную не изменить — сделана твоя копия «${made.name}», правишь её.`;
      put({ detail: made.id, dl: [...sel].join(",") || null, dd: null });
      follow();
    }
    /** Сказать под кнопками и не затереть это следующей же перерисовкой. */
    const tell = (text: string, warn = true) => { const act = pageBox.querySelector<HTMLElement>("[data-dact]")!; act.className = `said${warn ? " warn" : ""}`; act.textContent = text; act.dataset.keep = "1"; };

    /** Новая картинка — лицом к тебе, в середине; «когда» и «как стоит» — как у первой. */
    const facingMe = (): Layer => {
      const me = dStage?.me() ?? ([0, 0, 1] as V3);
      const snapTo = (v: number) => Math.round(v * 20) / 20;
      const n: V3 = [snapTo(me[0]), snapTo(me[1]), snapTo(me[2])];
      const like = draft.layers[0];
      return layerOf({ ...facing(n, Math.abs(n[1]) > 0.9 ? [0, 0, n[1] > 0 ? -1 : 1] : [0, 1, 0]), ...(like ? { show: like.show, stand: like.stand } : {}) });
    };

    function wire(): void {
      // Всегда в галерею деталей: на страницу можно прийти и из заказа agy, «назад» по истории увёл бы туда.
      pageBox.querySelector<HTMLElement>("[data-dback]")!.onclick = () => { go({ detail: null, dd: null, dl: null }); follow(); };
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-engine]")) b.onclick = () => { if (b.dataset.engine === engine) return; keep(); keepTable(); put({ de: b.dataset.engine === "css" ? "css" : null }); openPage({ ...s, detail: saved }); };
      // Сцена детали.
      const host = pageBox.querySelector<HTMLElement>("[data-dstage]")!;
      dStage = mountDetailStage(host, engine, {
        pick: (id, add) => choose(id, add),
        grip: (id, patch) => {
          const l = draft.layers.find((x) => x.id === id);
          if (!l) return;
          edit(() => Object.assign(l, patch), { editor: false, merge: `grip:${id}` });
          const ed = pageBox.querySelector<HTMLElement>("[data-ed]");
          if (ed && sel.size === 1) for (const inp of ed.querySelectorAll<HTMLInputElement>("[data-lnum]")) inp.value = String(Math.round(valueOf(l, inp.dataset.lnum as NumKey) * 1000) / 1000);
        },
        gripEnd: () => { lastMerge = ""; },
        view: () => { keepSoon(); requestAnimationFrame(seen); },
      });
      stages.push(dStage);
      dStage.layersOn(layers.axes, layers.grid);
      dStage.grip(grip, space);
      dStage.set(look());
      dStage.setView({ yaw: routeNum("dry", 0), pitch: routeNum("drx", 0), dist: routeNum("dz", 3.2) });
      (window as unknown as { __dstage?: DetailStage }).__dstage = dStage;
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-grip-mode]")) b.onclick = () => { grip = b.dataset.gripMode as Grip; for (const x of pageBox.querySelectorAll<HTMLElement>("[data-grip-mode]")) x.classList.toggle("on", x === b); dStage!.grip(grip, space); keep(); };
      const sp = pageBox.querySelector<HTMLElement>("[data-space]")!;
      sp.onclick = () => { space = space === "local" ? "world" : "local"; sp.textContent = space === "local" ? "свои оси" : "оси детали"; sp.classList.toggle("on", space === "local"); dStage!.grip(grip, space); keep(); };
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-dlayer]")) b.onclick = () => { const k = b.dataset.dlayer as keyof typeof layers; layers[k] = !layers[k]; b.classList.toggle("on", layers[k]); dStage!.layersOn(layers.axes, layers.grid); keep(); };
      pageBox.querySelector<HTMLElement>("[data-dundo]")!.onclick = () => restore(undo, redo);
      pageBox.querySelector<HTMLElement>("[data-dredo]")!.onclick = () => restore(redo, undo);
      // Клавиши: ⌘Z / ⇧⌘Z, Delete — убрать выбранные, W / E / R — ручки. Не там, где пишут.
      const onKey = (e: KeyboardEvent) => {
        if (pageBox.hidden || openKey !== s.key) return;
        const t = e.target as HTMLElement;
        if (t.closest("input, textarea, select, [contenteditable]")) return;
        const cmd = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
        if (cmd && k === "z") { e.preventDefault(); if (e.shiftKey) restore(redo, undo); else restore(undo, redo); return; }
        if (cmd && k === "y") { e.preventDefault(); restore(redo, undo); return; }
        if (cmd) return;
        if (k === "delete" || k === "backspace") { e.preventDefault(); removeSel(); return; }
        const mode = ({ w: "translate", e: "rotate", r: "scale" } as const)[k as "w"];
        if (mode) pageBox.querySelector<HTMLElement>(`[data-grip-mode="${mode}"]`)?.click();
      };
      document.addEventListener("keydown", onKey);
      unkeys = () => document.removeEventListener("keydown", onKey);
      // Форма.
      const ringIn = pageBox.querySelector<HTMLInputElement>("[data-dring]")!;
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-shape]")) b.onclick = () => {
        const kind = b.dataset.shape as ShapeKind;
        const n = Math.min(RING_LIMITS[1], Math.max(RING_LIMITS[0], Math.round(Number(ringIn.value)) || 16));
        put({ dn: n === 16 ? null : n });
        let got: ReturnType<typeof shapeLayers> | null = null;
        edit(() => { got = shapeLayers(kind, draft.layers, draft.width, n); draft.layers = got.layers; sel = new Set(draft.layers[0] ? [draft.layers[0].id] : []); });
        const g = got as ReturnType<typeof shapeLayers> | null;
        if (g && s.own) tell(`Форма «${KINDS.find(([k]) => k === kind)![1]}»: граней — ${g.layers.length}; картинок переехало — ${g.moved}${g.dropped ? `, не нашли грани — ${g.dropped}` : ""}. «Отменить» вернёт прежнее.`);
      };
      pageBox.querySelector<HTMLElement>("[data-ladd]")!.onclick = () => {
        const fresh = facingMe();
        openPicker(normalOf(fresh), (ref) => edit(() => { draft.layers.push({ ...fresh, sprite: ref }); sel = new Set([fresh.id]); }));
      };
      pageBox.querySelector<HTMLElement>("[data-lblank]")!.onclick = () => { const fresh = facingMe(); edit(() => { draft.layers.push(fresh); sel = new Set([fresh.id]); }); };
      pageBox.querySelector<HTMLElement>("[data-lall]")!.onclick = () => { sel = new Set(draft.layers.map((l) => l.id)); picked(); };
      pageBox.querySelector<HTMLElement>("[data-lnone]")!.onclick = () => { sel = new Set(); picked(); };
      pageBox.querySelector<HTMLElement>("[data-ldelsel]")!.onclick = () => removeSel();
      pageBox.querySelector<HTMLElement>("[data-ldelempty]")!.onclick = () => edit(() => { draft.layers = draft.layers.filter((l) => l.sprite); sel = new Set([...sel].filter((id) => draft.layers.some((l) => l.id === id))); });
      // У стола.
      tStage = mountTableStage(pageBox.querySelector<HTMLElement>("[data-tstage]")!, engine, { r: R, rim: RIM, thick: TABLE_THICK }, (next, done) => {
        Object.assign(at, next);
        for (const inp of pageBox.querySelectorAll<HTMLInputElement>("[data-tnum]")) if (document.activeElement !== inp) inp.value = String(r1(at[inp.dataset.tnum as keyof TablePlace]));
        if (done) keepTable();
      }, () => keepTableSoon());
      stages.push(tStage);
      tStage.place(at);
      tStage.layersOn(tlayers.compass, tlayers.grid);
      tStage.set(look());
      tStage.setView({ yaw: routeNum("tcy", 25), pitch: routeNum("tcp", 28) });
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-tlayer]")) b.onclick = () => { const k = b.dataset.tlayer as keyof typeof tlayers; tlayers[k] = !tlayers[k]; b.classList.toggle("on", tlayers[k]); tStage!.layersOn(tlayers.compass, tlayers.grid); keepTable(); };
      for (const inp of pageBox.querySelectorAll<HTMLInputElement>("[data-tnum]")) inp.oninput = () => { const v = Number(inp.value); if (inp.value === "" || !Number.isFinite(v)) return; at[inp.dataset.tnum as keyof TablePlace] = v; tStage!.place(at); keepTable(); };
      pageBox.querySelector<HTMLElement>("[data-treset]")!.onclick = () => { Object.assign(at, { x: 0, y: SHOULDERS, h: HEAD_H, yaw: 0, tilt: 0 }); tStage!.place(at); tStage!.setView({ yaw: 25, pitch: 28 }); for (const inp of pageBox.querySelectorAll<HTMLInputElement>("[data-tnum]")) inp.value = String(r1(at[inp.dataset.tnum as keyof TablePlace])); keepTable(); };
      // Имя, ширина, теги.
      const act = pageBox.querySelector<HTMLElement>("[data-dact]")!;
      const nameIn = pageBox.querySelector<HTMLInputElement>("[data-dname]")!;
      nameIn.onchange = nameIn.oninput = (e) => {
        if (!s.own && e.type === "input") return;
        edit(() => { draft.name = nameIn.value; }, { editor: false, merge: "name" });
        if (taken(draft.name, s.key)) act.textContent = "Такое имя уже у другой детали.";
      };
      const wIn = pageBox.querySelector<HTMLInputElement>("[data-dwidth]")!;
      wIn.onchange = wIn.oninput = (e) => { const v = Number(wIn.value); if (wIn.value === "" || !Number.isFinite(v) || (!s.own && e.type === "input")) return; edit(() => { draft.width = Math.min(DETAIL_LIMITS.width[1], Math.max(DETAIL_LIMITS.width[0], v)); }, { editor: false, merge: "width" }); };
      const tIn = pageBox.querySelector<HTMLInputElement>("[data-dtags]")!;
      tIn.onchange = tIn.oninput = (e) => { if (!s.own && e.type === "input") return; edit(() => { draft.tags = [...new Set(tIn.value.split(",").map((t) => t.trim()).filter(Boolean))]; }, { editor: false, merge: "tags" }); };
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
        drawRows(); scenes(); keep();
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
      after(true, false);
    }
    // Камера двигается непрерывно — адрес пишется, когда затихла.
    let keepWait = 0, tableWait = 0;
    const keepSoon = () => { clearTimeout(keepWait); keepWait = window.setTimeout(keep, 250); };
    const keepTableSoon = () => { clearTimeout(tableWait); tableWait = window.setTimeout(keepTable, 250); };

    /** ВЫБРАТЬ ИЗ БИБЛИОТЕКИ — все картинки; сперва те, что нарисованы с той же стороны, куда смотрит слой; поиск. */
    function openPicker(dir: V3, take: (ref: string) => void): void {
      const over = document.createElement("div");
      over.className = "pick-over";
      over.dataset.picker = "";
      let onlySame = false, q = "";
      const same = (p: Pic) => !!p.side && dot(viewDir(p.side), dir) > 0.95;
      const drawPick = () => {
        const list = pics().filter((p) => (!onlySame || same(p)) && (!q || q.split(/\s+/).every((w) => fits(`${p.name} ${p.tags.join(" ")} ${SLOT_TAG[p.slot] ?? ""}`, w)))).sort((a, b) => Number(same(b)) - Number(same(a)));
        over.innerHTML = `<div class="pick-sheet"><div class="bar"><b>Картинка</b><button class="chip" data-pclose style="margin-left:auto">Закрыть</button></div>
          <div class="bar"><input type="search" data-pq placeholder="Имя или тег" value="${esc(q)}"><button class="chip${onlySame ? " on" : ""}" data-pside>только с этой стороны</button></div>
          <div class="grid">${list.map((p) => { const src = srcOf(p.ref, pickSoon); return `<button class="cell${p.ref.startsWith("b:") ? "" : " own"}${same(p) ? " same" : ""}" data-pref="${esc(p.ref)}">${src ? `<img src="${esc(src)}" alt="">` : `<div class="wait">…</div>`}<b>${esc(p.name)}</b><i>${p.ref.startsWith("b:") ? "встроенная" : "своя"}${p.side ? ` · ${viewName(p.side)}` : ""}</i></button>`; }).join("") || `<div class="said" style="grid-column:1/-1">Таких картинок нет.</div>`}</div></div>`;
        const qi = over.querySelector<HTMLInputElement>("[data-pq]")!;
        qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; drawPick(); const again = over.querySelector<HTMLInputElement>("[data-pq]")!; again.focus(); again.setSelectionRange(pos, pos); };
        over.querySelector<HTMLElement>("[data-pside]")!.onclick = () => { onlySame = !onlySame; drawPick(); };
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
