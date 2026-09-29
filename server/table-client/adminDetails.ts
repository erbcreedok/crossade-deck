// ПАНЕЛЬ «ДЕТАЛИ» НА СТРАНИЦЕ ХОЗЯИНА — как библиотека спрайтов, только единица здесь — деталь (`details.ts`): вещь из
// картинок, без вида — шар годится и в головы, и в ком снеговика, кем встанет — решает фигура. Галерея деталей
// (поиск по имени и тегам) → страница детали:
//
//   сцена   — деталь одна, крутишь пальцем; показана так, как выбрано переключателем под ней (он же — как деталь
//             стоит за столом): коробка — все стороны в объёме, каждая на своём месте; всегда лицом / бумажный /
//             плоскость — к тебе ближайший по углу ракурс; оси детали и клетка в единицу стола — слоями;
//   ракурсы — набор: шесть сторон (лицо, бок, спина, левый бок, верх, низ) или N по кругу (бочка); у каждого картинка
//             из библиотеки (или отражение другого), свои сдвиг, величина и «наружу» от середины детали. Сменил набор —
//             картинки переехали на ближайшие углы. Выбор картинки — любые картинки библиотеки этой стороны;
//   встроенные детали каталога (`skins.ts`) — только смотреть; «Сделать своей копией» — своя деталь с теми же
//             картинками.
//
// Всё выбранное (деталь, ракурс, поворот, слои, несохранённая правка) — в адресе (`adminRoute.ts`).

import { PALETTES } from "../src/table/dolls.js";
import { partOf, PARTS, type Facing } from "../src/table/skins.js";
import { partName } from "../src/table/tunes.js";
import { DETAIL_LIMITS, DETAIL_WIDTH, FACINGS, moveViews, nearestView, NEW_DETAIL, outOf, RING_LIMITS, viewAngle, viewDir, viewsOf, type Detail, type DetailView, type ViewSetup } from "../src/table/details.js";
import { paintPart, partSprite } from "./dollSprites.js";
import { UNIT_WIDTH, type V3 } from "./spriteAxes.js";
import { HOST } from "./host.js";
import { go, onRoute, put, route, routeNum, routeOne } from "./adminRoute.js";

interface LibSprite { id: string; name: string; ext: "svg" | "png"; slot: string; side: string | null; tags: string[] }
/** Деталь на панели: своя (из базы) или встроенная (из каталога, `b:<деталь>`). */
interface Shown { key: string; own: boolean; detail: Detail }
/** Картинка для выбора: своя из библиотеки или сторона встроенной детали. */
interface Pic { ref: string; name: string; slot: string; side: string | null; tags: string[] }

/** Кем встроенная деталь служит в каталоге — её тег, не вид: своя копия годится куда угодно. */
const SLOT_TAG: Record<string, string> = { head: "голова", hair: "причёска", body: "тело", legs: "ноги", hands: "руки", other: "другое" };
const VIEW_NAMES: Record<string, string> = { front: "лицо", right: "бок", back: "спина", left: "левый бок", top: "верх", bottom: "низ" };
/** Имя ракурса: сторона — словом, по кругу — углом. */
const viewName = (v: string): string => VIEW_NAMES[v] ?? `${viewAngle(v).yaw}°`;
const signed = (yaw: number) => (yaw > 180 ? yaw - 360 : yaw);
/** Куда повернуть деталь, чтобы к тебе был этот ракурс: наклон и поворот, градусы. */
const poseOf = (v: string): [number, number] => { const { yaw, pitch } = viewAngle(v); return pitch > 45 ? [-80, 0] : pitch < -45 ? [80, 0] : [0, signed(yaw)]; };
/** Как повернуть плоскость ракурса, чтобы она смотрела наружу своей стороной (право детали — влево сцены). */
const faceOf = (v: string): string => { const { yaw, pitch } = viewAngle(v); return pitch > 45 ? "rotateX(90deg)" : pitch < -45 ? "rotateX(-90deg)" : signed(yaw) ? `rotateY(${-signed(yaw)}deg)` : ""; };
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const FACING_WORDS: Record<Facing, [string, string]> = {
  box: ["коробка", "все стороны в объёме, каждая на своём месте — видно до трёх сразу, как у кубика"],
  camera: ["всегда лицом", "к тебе — ближайший по углу ракурс, всегда лицом; по углу меняется только рисунок — шар, бочка"],
  tilt: ["бумажный", "к тебе — ближайший ракурс, лицом, но по ширине сужается по углу — карты, звери"],
  view: ["плоскость", "ближайший ракурс лежит ровно в своей плоскости, сверху — плашмя"],
};

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
.dt .dt-flat { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; transform: translateZ(1px); }
.dt .dt-plane { position: absolute; pointer-events: none; user-select: none; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.dt .dt-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--dim); font-size: 13px; text-align: center; padding: 20px; }
.dt .dt-axes { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transform-style: preserve-3d; pointer-events: none; }
.dt .dt-axes .ax { position: absolute; left: 0; top: -2px; width: 80px; height: 4px; transform-origin: 0 50%; border-radius: 2px; }
.dt .dt-axes .ax::after { content: ""; position: absolute; right: -10px; top: -5px; border-left: 12px solid currentColor; border-top: 7px solid transparent; border-bottom: 7px solid transparent; }
.dt .dt-axes .axl { position: absolute; left: 0; top: 0; font: 600 12px/1 system-ui, sans-serif; padding: 2px 5px; border-radius: 6px; background: rgba(11,7,4,.75); white-space: nowrap; }
.dt .ax-front { background: #f2c14e; color: #f2c14e; } .dt .axl.ax-front { background: rgba(11,7,4,.75); }
.dt .ax-up { background: #6fd0ff; color: #6fd0ff; } .dt .axl.ax-up { background: rgba(11,7,4,.75); }
.dt .ax-right { background: #ff7ab8; color: #ff7ab8; } .dt .axl.ax-right { background: rgba(11,7,4,.75); }
.dt .views { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }
.dt .vw { font: inherit; color: var(--ink); background: #0f1f18; border: 1px solid var(--line); border-radius: 10px; padding: 5px 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
.dt .vw.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.dt .vw.seen b::after { content: " 👁"; }
.dt .vw img, .dt .vw .none { width: 56px; height: 56px; object-fit: contain; }
.dt .vw .none { display: grid; place-items: center; color: var(--dim); font-size: 11px; }
.dt .vw b { font-size: 12px; font-weight: 500; }
.dt .vw i { font-size: 10.5px; color: var(--dim); font-style: normal; }
.dt .vw img.flip { transform: scaleX(-1); }
.dt .ed { border: 1px solid var(--line); border-radius: 12px; padding: 10px; margin-bottom: 8px; }
.dt .ed label.num { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--dim); }
.dt .ed input[type=number] { width: 76px; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 5px 6px; }
.dt select { font: inherit; font-size: 13px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 999px; padding: 5px 8px; }
.dt .facing { display: grid; gap: 6px; }
.dt .facing button { font: inherit; text-align: left; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; cursor: pointer; }
.dt .facing button.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.dt .facing button small { display: block; color: var(--dim); font-size: 12px; margin-top: 2px; }
.dt .dt-name { flex: 1; min-width: 0; font: inherit; font-size: 17px; font-weight: 600; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.dt .pick-over { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.6); display: flex; align-items: flex-end; justify-content: center; }
.dt .pick-sheet { width: 100%; max-width: 980px; max-height: 86vh; overflow: auto; background: #111816; border: 1px solid var(--line); border-radius: 14px 14px 0 0; padding: 12px 16px 24px; }
.dt .pick-sheet input[type=search] { flex: 1 1 180px; min-width: 0; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
`;

/** Краски: одна из шестнадцати расцветок — или свои три цвета вместо красной, синей и золота рисунка. */
interface Paint { pal: number; own3: readonly [string, string, string] | null }
const PLAIN: Paint = { pal: 0, own3: null };

/** `orderAgy` — заказать у agy для этой детали: нарисованное встанет в её пустые ракурсы (форма — в «Спрайтах»). */
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
  /** Адрес картинки по ссылке: своя — файл библиотеки, встроенная — испечённая пекарем стола (первая расцветка). */
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
  const stiff = (d: Omit<Detail, "id" | "at">): DetailView[] => viewsOf(d).filter((v) => d.views[v]?.sprite && !paints(d.views[v]!.sprite));
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
  /** Встроенная деталь каталога — как деталь: ракурсы из её нарисованных сторон и отражений. */
  const builtIn = (): Shown[] => PARTS.filter((p) => p.art.kind !== "none").map((p) => {
    const views: Detail["views"] = {};
    // Ракурсы по кругу (бочка: a0…a340) — набор «по кругу» из стольких же; иначе — шесть сторон и отражения.
    const ring = p.views.every((v) => /^a\d+$/.test(v)) ? p.views.length : undefined;
    for (const v of viewsOf({ ring })) {
      if (p.views.includes(v)) views[v] = { sprite: `b:${p.id}:${v}`, dx: 0, dy: 0, scale: 1 };
      else if (p.mirror?.[v] && p.views.includes(p.mirror[v]!)) views[v] = { mirror: p.mirror[v] as DetailView, dx: 0, dy: 0, scale: 1 };
    }
    return { key: `b:${p.id}`, own: false, detail: { id: p.id, name: `${partName(p.id)} · ${SLOT_TAG[p.slot] ?? p.slot}`, tags: [SLOT_TAG[p.slot] ?? p.slot], width: UNIT_WIDTH[p.slot] ?? DETAIL_WIDTH, facing: p.facing, ...(ring ? { ring } : {}), views, at: 0 } };
  });
  const all = (): Shown[] => [...mine.map((d) => ({ key: d.id, own: true, detail: d })), ...builtIn()];
  // ИМЯ — ОДНО НА ДЕТАЛЬ, среди своих и встроенных: иначе в фигурах не разобрать, какая «Дама бубен» где.
  const norm = (t: string) => t.trim().toLowerCase().replaceAll("ё", "е");
  const taken = (name: string, except: string | null = null) => all().some((x) => x.key !== except && norm(x.detail.name) === norm(name));
  /** Свободное имя: как есть, а занято — с номером («… 2», «… 3»). */
  const freeName = (base: string): string => { const b = base.trim().slice(0, 36); if (!taken(b)) return b; let k = 2; while (taken(`${b} ${k}`)) k += 1; return `${b} ${k}`; };
  const face = (d: Detail): { ref?: string; flip: boolean } => {
    for (const v of viewsOf(d)) {
      const one = d.views[v];
      if (one?.sprite) return { ref: one.sprite, flip: false };
      if (one?.mirror) return { ref: d.views[one.mirror]?.sprite, flip: true };
    }
    return { flip: false };
  };

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
  function drawList(): void {
    listBox.innerHTML = `<div class="bar"><input type="search" data-dq placeholder="Имя или тег" value="${esc(route("dq") ?? "")}" style="flex:1 1 180px;min-width:0;font:inherit;font-size:15px;color:var(--ink);background:#0f1213;border:1px solid var(--line);border-radius:8px;padding:6px 8px"><button class="add" data-new>+ Новая деталь</button><button class="chip" data-dagynew>+ Заказать у agy</button></div>
      <div class="said" data-dsaid>${esc(said)}</div>
      <div class="grid" data-dgrid></div>`;
    const q = listBox.querySelector<HTMLInputElement>("[data-dq]")!;
    q.oninput = () => { put({ dq: q.value || null }); drawCells(); };
    const create = async (): Promise<Detail | null> => {
      const res = await fetch(`${HOST}/table/admin/details`, { method: "POST", headers: json, body: JSON.stringify({ name: freeName(NEW_DETAIL), tags: [], width: DETAIL_WIDTH, facing: "tilt", views: {} }) }).catch(() => null);
      if (!res?.ok) { said = `Не создалась (${res?.status ?? "нет связи"}).`; drawList(); return null; }
      const made = (await res.json()) as Detail;
      mine = [made, ...mine];
      return made;
    };
    listBox.querySelector<HTMLElement>("[data-new]")!.onclick = async () => {
      const made = await create();
      if (!made) return;
      go({ detail: made.id, dv: "front", drx: null, dry: null, dd: null });
      follow();
    };
    // Сразу у agy: пустая деталь, заказ для неё; принятое встанет в ракурсы, а деталь возьмёт имя заказа.
    listBox.querySelector<HTMLElement>("[data-dagynew]")!.onclick = async () => {
      const made = await create();
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
      const f = face(s.detail), src = srcOf(f.ref, later), n = Object.keys(s.detail.views).length;
      return `<button class="cell${s.own ? " own" : ""}" data-detail="${esc(s.key)}">${src ? `<img src="${esc(src)}" alt=""${f.flip ? ' style="transform:scaleX(-1)"' : ""}>` : `<div class="wait">${f.ref ? "…" : "пусто"}</div>`}<b>${esc(s.detail.name)}</b><i>${esc(s.detail.tags.join(", ") || "без тегов")} · ${n} ${n === 1 ? "ракурс" : n > 1 && n < 5 ? "ракурса" : "ракурсов"}</i><i>${s.own ? "своя" : "встроенная"}${stiff(s.detail).length ? " · не красится" : ""}</i></button>`;
    }).join("") || `<div class="said" style="grid-column:1/-1">Ничего не найдено.</div>`;
    for (const b of grid.querySelectorAll<HTMLElement>("[data-detail]")) b.onclick = () => { go({ detail: b.dataset.detail, dv: "front", drx: null, dry: null, dd: null }); follow(); };
  }

  // ——— страница детали ———
  let openKey = "";
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
    let draft: Omit<Detail, "id" | "at">;
    const fields = (d: Omit<Detail, "id" | "at">) => ({ name: d.name, tags: d.tags, width: d.width, facing: d.facing, ring: d.ring, views: d.views });
    try { draft = s.own && route("dd") ? { ...fields(saved), ...(JSON.parse(route("dd")!) as object) } : structuredClone(fields(saved)); }
    catch { draft = structuredClone(fields(saved)); }
    let view: DetailView = routeOne("dv", viewsOf(draft), viewsOf(draft)[0]!);
    let rx = routeNum("drx", 0), ry = routeNum("dry", 0);
    const layers = { axes: route("dax") !== "0", grid: route("dgr") !== "0" };
    const c3 = (route("dc") ?? "").split(",").filter((c) => /^[0-9a-f]{6}$/i.test(c)).map((c) => `#${c}`);
    const paint: { pal: number; own3: [string, string, string] | null } = { pal: Math.max(0, Math.min(PALETTES.length - 1, Math.round(routeNum("dp", 0)))), own3: c3.length === 3 ? (c3 as [string, string, string]) : null };
    const dirty = () => JSON.stringify(fields(draft)) !== JSON.stringify(fields(saved));
    const keep = () => put({ dv: view, drx: Math.round(rx) || null, dry: Math.round(ry) || null, dax: layers.axes ? null : "0", dgr: layers.grid ? null : "0", dp: paint.pal || null, dc: paint.own3 ? paint.own3.map((c) => c.slice(1)).join(",") : null, dd: s.own && dirty() ? JSON.stringify(draft) : null });

    const draw = () => {
      pageBox.innerHTML = `<div class="sp-page" data-detail-page="${esc(s.key)}">
        <div class="sp-top"><button class="chip" data-dback>← Все детали</button>${s.own ? `<input class="dt-name" data-dname maxlength="40" value="${esc(draft.name)}" aria-label="Имя">` : `<h2>${esc(draft.name)}</h2>`}</div>
        <div class="bar">${s.own
          ? `<button class="add" data-dsave ${dirty() ? "" : "disabled"}>Сохранить</button><button class="chip" data-dcopy>Сохранить как новую</button><button class="chip" data-dagy>Заказать у agy</button><button class="chip drop" data-ddrop>Удалить</button>`
          : `<button class="add" data-dcopy>Сделать своей копией</button>`}</div>
        <div class="said" data-dact>${s.own ? (dirty() ? "Есть несохранённое." : "") : "Встроенную не изменить — копия ляжет в «Свои» с теми же картинками."}</div>
        <div class="sp-stage bg-felt" data-dstage><div class="dt-world" data-world><div class="dt-cells" data-dcells></div><div class="dt-body" data-dbody></div><div class="dt-flat" data-dflat></div><div class="dt-empty" data-dempty hidden>Сторон нет — выбери картинку для лица ниже.</div><div class="dt-mid"></div><div class="dt-axes" data-daxes></div></div></div>
        <div class="bar" data-dshow>${FACINGS.map((f) => `<button class="chip${draft.facing === f ? " on" : ""}" data-facing="${f}">${FACING_WORDS[f][0]}</button>`).join("")}</div>
        <div class="said" data-dfsaid></div>
        <div class="bar">${(["axes", "grid"] as const).map((k) => `<button class="chip${layers[k] ? " on" : ""}" data-dlayer="${k}">${{ axes: "Оси", grid: "Клетка" }[k]}</button>`).join("")}<span class="said" data-dseen></span></div>
        <h3>Расцветки</h3>
        <div class="bar" data-dpals>${PALETTES.map((p, k) => `<button class="chip${!paint.own3 && k === paint.pal ? " on" : ""}" data-dpal="${k}" title="${esc(p.name)}"><span style="display:inline-flex;gap:2px;vertical-align:middle">${[p.red, p.blue, p.gold].map((c) => `<i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c}"></i>`).join("")}</span></button>`).join("")}</div>
        <div class="bar">${["основной", "второй", "акцент"].map((n, i) => `<label class="num">${n} <input type="color" data-dc="${i}" value="${paint.own3?.[i] ?? [PALETTES[paint.pal]!.red, PALETTES[paint.pal]!.blue, PALETTES[paint.pal]!.gold][i]}"></label>`).join("")}<button class="chip" data-dcoff>Как в расцветке</button></div>
        <div class="said" data-dpaint></div>
        <h3>Ракурсы</h3>
        <div class="bar" data-dsets>${s.own ? `<button class="chip${draft.ring ? "" : " on"}" data-dset="sides">6 сторон</button><button class="chip${draft.ring ? " on" : ""}" data-dset="ring">по кругу</button><label class="num" data-dringbox${draft.ring ? "" : " hidden"}>ракурсов <input type="number" data-dring min="${RING_LIMITS[0]}" max="${RING_LIMITS[1]}" step="1" value="${draft.ring ?? 16}"></label>` : `<span class="said" style="margin:0">${draft.ring ? `${draft.ring} ракурсов по кругу` : "6 сторон"}</span>`}</div>
        <div class="views" data-views></div>
        <div class="ed" data-ed></div>
        <h3>Размер и теги</h3>
        <div class="ed"><div class="bar"><label class="num">ширина, ед. стола <input type="number" data-dwidth step="0.1" min="${DETAIL_LIMITS.width[0]}" max="${DETAIL_LIMITS.width[1]}" value="${draft.width}"${s.own ? "" : " disabled"}></label></div>
          <div class="said">Сколько деталь шириной за столом при величине ×1: голова карты — 2.4, тело — 5.2.</div>
          ${s.own ? `<input data-dtags value="${esc(draft.tags.join(", "))}" placeholder="Теги через запятую: снеговик, зима" style="width:100%;box-sizing:border-box;font:inherit;font-size:15px;color:var(--ink);background:#0f1213;border:1px solid var(--line);border-radius:8px;padding:6px 8px">` : `<div class="said">Теги: ${esc(draft.tags.join(", "))}</div>`}</div>
      </div>`;
      wire();
    };

    const stage = () => pageBox.querySelector<HTMLElement>("[data-dstage]")!;
    // ИСПЕКЛАСЬ КАРТИНКА — одна перерисовка на кадр, и подписка одна и та же: пекарь хранит ждущих множеством, и новая
    // функция на каждую перерисовку множила бы перерисовки на число ещё не испечённых (у бочки их 18 — страница висла).
    let soonFrame = 0;
    const soon = () => { if (!soonFrame) soonFrame = requestAnimationFrame(() => { soonFrame = 0; if (openKey === s.key && pageBox.isConnected) { drawViews(); pose(); } }); };
    /** Откуда ты смотришь на деталь — направлением в её осях (x — к правому боку, y — вверх, z — к лицу). */
    const viewer = (): [number, number, number] => {
      const a = (ry * Math.PI) / 180, b = (-rx * Math.PI) / 180;
      return [Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
    };
    const ppu = () => 260 / (draft.width * 2.2);

    /**
     * СЦЕНА — как деталь стоит за столом (`facing`): коробка — каждая сторона плоскостью на своём месте, вся деталь
     * крутится; всегда лицом и бумажный — к тебе ближайший по углу из заданных ракурсов (бумажный сужается по углу);
     * плоскость — этот ракурс в своей плоскости, в объёме.
     */
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
      const keys = viewsOf(draft), me = viewer();
      const toward = nearestView(keys, me)!;
      const defined = keys.filter((k) => draft.views[k]);
      const mode = draft.facing, single = mode === "box" ? null : nearestView(defined, me);
      st.dataset.toward = toward;
      st.dataset.mode = mode;
      st.dataset.shown = single ?? "";
      const body = pageBox.querySelector<HTMLElement>("[data-dbody]")!, flat = pageBox.querySelector<HTMLElement>("[data-dflat]")!;
      body.style.transform = turn;
      const inBody = mode === "box" ? defined : mode === "view" && single ? [single] : [];
      const inFlat = mode === "camera" || mode === "tilt" ? (single ? [single] : []) : [];
      for (const img of [...body.querySelectorAll<HTMLImageElement>("[data-plane]")]) if (!inBody.includes(img.dataset.plane!)) img.remove();
      for (const img of [...flat.querySelectorAll<HTMLImageElement>("[data-plane]")]) if (!inFlat.includes(img.dataset.plane!)) img.remove();
      let shown = 0;
      const place = (box: HTMLElement, v: string, lay: (one: ViewSetup, w: number, h: number) => string) => {
        const one = draft.views[v]!;
        let img = box.querySelector<HTMLImageElement>(`[data-plane="${v}"]`);
        const ref = one.sprite ?? (one.mirror ? draft.views[one.mirror]?.sprite : undefined);
        const src = srcOf(ref, soon, paint) ?? (img && img.dataset.ref === ref ? img.getAttribute("src") : null);
        if (!img) {
          img = document.createElement("img");
          img.className = "dt-plane";
          img.alt = "";
          img.dataset.plane = v;
          img.onload = soon;
          box.append(img);
        }
        img.dataset.ref = ref ?? "";
        img.hidden = !src;
        if (!src) return;
        shown += 1;
        if (img.getAttribute("src") !== src) img.src = src;
        const aspect = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
        const w = draft.width * one.scale * u, h = w * aspect;
        Object.assign(img.style, { width: `${w}px`, height: `${h}px`, left: `${-w / 2}px`, top: `${-h / 2}px`, transformOrigin: `${w / 2}px ${h / 2}px` });
        img.style.transform = lay(one, w, h);
        img.dataset.flip = one.mirror ? "1" : "";
      };
      for (const v of inBody) place(body, v, (one) => {
        const out = outOf(draft, one);
        pageBox.querySelector<HTMLElement>(`[data-dbody] [data-plane="${v}"]`)?.setAttribute("data-out", String(out));
        return `${faceOf(v)} translate3d(${one.dx * u}px, ${-one.dy * u}px, ${out * u}px)${one.mirror ? " scaleX(-1)" : ""}`;
      });
      for (const v of inFlat) place(flat, v, (one) => {
        // Бумажный сужается по углу между тобой и ракурсом; всегда лицом — нет.
        const squeeze = mode === "tilt" ? Math.max(0.15, dot(viewDir(v), me)) : 1;
        return `translate(${one.dx * u}px, ${-one.dy * u}px) scaleX(${(one.mirror ? -1 : 1) * squeeze})`;
      });
      const empty = pageBox.querySelector<HTMLElement>("[data-dempty]")!;
      empty.hidden = defined.length > 0;
      pageBox.querySelector<HTMLElement>("[data-dseen]")!.textContent = `к тебе — ${viewName(toward)}${draft.views[toward] ? "" : ` (этой стороны нет${single ? `, видно ближайшее — ${viewName(single)}` : ""})`}`;
      pageBox.querySelector<HTMLElement>("[data-dfsaid]")!.textContent = `${FACING_WORDS[mode][1]}. Так деталь стоит и за столом.`;
      st.dataset.planes = String(shown);
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-vw]")) b.classList.toggle("seen", b.dataset.vw === (single ?? toward));
    }

    function axesHtml(): string {
      const L = 80;
      const one = (name: string, key: string, v: V3) => {
        const turn = v[2] > 0.5 ? "rotateY(-90deg)" : v[2] < -0.5 ? "rotateY(90deg)" : `rotateZ(${(Math.atan2(v[1], v[0]) * 180) / Math.PI}deg)`;
        return `<div class="ax ax-${key}" data-ax="${key}" style="transform:${turn}"></div><span class="axl ax-${key}" style="transform:translate3d(${v[0] * (L + 16)}px,${v[1] * (L + 16)}px,${v[2] * (L + 16)}px) translate(-50%,-50%)">${name}</span>`;
      };
      return one("перед", "front", [0, 0, 1]) + one("верх", "up", [0, -1, 0]) + one("право", "right", [-1, 0, 0]);
    }

    function drawViews(): void {
      const box = pageBox.querySelector<HTMLElement>("[data-views]")!;
      box.style.gridTemplateColumns = draft.ring ? "repeat(auto-fill, minmax(76px, 1fr))" : "";
      box.innerHTML = viewsOf(draft).map((v) => {
        const one = draft.views[v], ref = one?.sprite ?? (one?.mirror ? draft.views[one.mirror]?.sprite : undefined);
        const src = srcOf(ref, soon, paint);
        const note = one?.sprite ? esc(picName(one.sprite)) : one?.mirror ? `отражение: ${viewName(one.mirror)}` : "нет";
        return `<button class="vw${v === view ? " on" : ""}" data-vw="${v}">${src ? `<img src="${esc(src)}" alt=""${one?.mirror ? ' class="flip"' : ""}>` : `<span class="none">${ref ? "…" : "—"}</span>`}<b>${viewName(v)}</b><i>${note}</i></button>`;
      }).join("");
      const no = stiff(draft), said = pageBox.querySelector<HTMLElement>("[data-dpaint]");
      if (said) said.textContent = no.length ? `Не красятся (PNG): ${no.map(viewName).join(", ")}.` : "Красятся три краски рисунка: основной, второй, акцент.";
      for (const b of box.querySelectorAll<HTMLElement>("[data-vw]")) b.onclick = () => {
        view = b.dataset.vw as DetailView;
        [rx, ry] = poseOf(view);
        drawViews(); drawEditor(); pose(); keep();
      };
    }

    function drawEditor(): void {
      const ed = pageBox.querySelector<HTMLElement>("[data-ed]")!;
      const one = draft.views[view];
      const others = viewsOf(draft).filter((v) => v !== view && draft.views[v]?.sprite);
      ed.innerHTML = `<div class="bar" style="margin-bottom:6px"><b>${viewName(view)}</b><span class="said" style="margin:0">${one?.sprite ? esc(picName(one.sprite)) : one?.mirror ? `отражение ракурса «${viewName(one.mirror)}»` : "не задан — за столом возьмётся ближайший"}</span></div>
        ${s.own ? `<div class="bar"><button class="add" data-dpick>Выбрать из библиотеки</button>
          <select data-dmirror><option value="">Отражением от…</option>${others.map((v) => `<option value="${v}"${one?.mirror === v ? " selected" : ""}>${viewName(v)}</option>`).join("")}</select>
          ${one ? `<button class="chip" data-dclear>Убрать</button>` : ""}</div>` : ""}
        ${one ? `<div class="bar">${(["dx", "dy", "scale", "out"] as const).map((k) => `<label class="num">${{ dx: "вправо", dy: "вверх", scale: "величина ×", out: "наружу" }[k]}<input type="number" data-dnum="${k}" step="${k === "scale" ? 0.05 : 0.1}" min="${DETAIL_LIMITS[k][0]}" max="${DETAIL_LIMITS[k][1]}" value="${one[k] ?? ""}"${k === "out" ? ` placeholder="${outOf(draft, {})}"` : ""}${s.own ? "" : " disabled"}></label>`).join("")}</div>
          <div class="said">Всё — в единицах стола (клетка — 1 ед.). Вправо и вверх — по этой стороне; наружу — как далеко сторона от середины детали (жёлтый кружок): у кубика — полширины, у карты — 0. Пусто — по тому, как деталь стоит к камере.</div>` : ""}`;
      const touched = () => { const b = pageBox.querySelector<HTMLButtonElement>("[data-dsave]"); if (b) b.disabled = !dirty(); pageBox.querySelector<HTMLElement>("[data-dact]")!.textContent = s.own && dirty() ? "Есть несохранённое." : ""; keep(); };
      ed.querySelector<HTMLElement>("[data-dpick]")?.addEventListener("click", () => openPicker((ref) => {
        draft.views[view] = { sprite: ref, dx: draft.views[view]?.dx ?? 0, dy: draft.views[view]?.dy ?? 0, scale: draft.views[view]?.scale ?? 1 };
        drawViews(); drawEditor(); pose(); touched();
      }));
      const sel = ed.querySelector<HTMLSelectElement>("[data-dmirror]");
      if (sel) sel.onchange = () => {
        if (!sel.value) return;
        draft.views[view] = { mirror: sel.value as DetailView, dx: one?.dx ?? 0, dy: one?.dy ?? 0, scale: one?.scale ?? 1 };
        drawViews(); drawEditor(); pose(); touched();
      };
      ed.querySelector<HTMLElement>("[data-dclear]")?.addEventListener("click", () => {
        delete draft.views[view];
        for (const v of viewsOf(draft)) if (draft.views[v]?.mirror === view) delete draft.views[v];
        drawViews(); drawEditor(); pose(); touched();
      });
      for (const inp of ed.querySelectorAll<HTMLInputElement>("[data-dnum]")) inp.oninput = () => {
        const k = inp.dataset.dnum as "dx" | "dy" | "scale" | "out", v = Number(inp.value), cur = draft.views[view];
        if (cur && k === "out" && inp.value === "") { delete cur.out; pose(); touched(); return; }
        if (!cur || inp.value === "" || !Number.isFinite(v)) return;
        (cur as ViewSetup)[k] = Math.min(DETAIL_LIMITS[k][1], Math.max(DETAIL_LIMITS[k][0], v));
        pose(); touched();
      };
    }

    function wire(): void {
      pageBox.querySelector<HTMLElement>("[data-daxes]")!.innerHTML = axesHtml();
      // Всегда в галерею деталей: на страницу можно прийти и из заказа agy, «назад» по истории увёл бы туда.
      pageBox.querySelector<HTMLElement>("[data-dback]")!.onclick = () => { go({ detail: null, dd: null }); follow(); };
      const st = stage();
      let drag: { x: number; y: number } | null = null;
      st.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY }; st.setPointerCapture(e.pointerId); };
      st.onpointermove = (e) => { if (!drag) return; ry += (e.clientX - drag.x) * 0.8; rx = Math.max(-85, Math.min(85, rx - (e.clientY - drag.y) * 0.6)); drag = { x: e.clientX, y: e.clientY }; pose(); };
      st.onpointerup = st.onpointercancel = () => { if (drag) keep(); drag = null; };
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-dlayer]")) b.onclick = () => { const k = b.dataset.dlayer as keyof typeof layers; layers[k] = !layers[k]; b.classList.toggle("on", layers[k]); pose(); keep(); };
      const touched = () => { const b = pageBox.querySelector<HTMLButtonElement>("[data-dsave]"); if (b) b.disabled = !dirty(); pageBox.querySelector<HTMLElement>("[data-dact]")!.textContent = dirty() ? "Есть несохранённое." : ""; keep(); };
      const nameIn = pageBox.querySelector<HTMLInputElement>("[data-dname]");
      if (nameIn) nameIn.oninput = () => {
        draft.name = nameIn.value;
        touched();
        if (taken(draft.name, s.key)) act.textContent = "Такое имя уже у другой детали.";
      };
      // Как показывать — у своей это её правка; встроенную можно так посмотреть, сохранить — копией.
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-facing]")) b.onclick = () => { draft.facing = b.dataset.facing as Facing; for (const x of pageBox.querySelectorAll("[data-facing]")) x.classList.toggle("on", x === b); drawEditor(); pose(); if (s.own) touched(); };
      if (s.own) {
        // НАБОР: шесть сторон ↔ по кругу; картинки переезжают на ближайшие углы.
        const setTo = (ring: number | undefined) => {
          draft.views = moveViews(draft.views, { ring });
          if (ring) draft.ring = ring; else delete draft.ring;
          view = viewsOf(draft)[0]!;
          [rx, ry] = poseOf(view);
          for (const x of pageBox.querySelectorAll<HTMLElement>("[data-dset]")) x.classList.toggle("on", (x.dataset.dset === "ring") === !!ring);
          pageBox.querySelector<HTMLElement>("[data-dringbox]")!.hidden = !ring;
          drawViews(); drawEditor(); pose(); touched();
        };
        const ringIn = pageBox.querySelector<HTMLInputElement>("[data-dring]")!;
        for (const b of pageBox.querySelectorAll<HTMLElement>("[data-dset]")) b.onclick = () => setTo(b.dataset.dset === "ring" ? Math.round(Number(ringIn.value)) || 16 : undefined);
        ringIn.onchange = () => { const n = Math.round(Number(ringIn.value)); if (n >= RING_LIMITS[0] && n <= RING_LIMITS[1]) setTo(n); };
        const wIn = pageBox.querySelector<HTMLInputElement>("[data-dwidth]")!;
        wIn.oninput = () => { const v = Number(wIn.value); if (wIn.value === "" || !Number.isFinite(v)) return; draft.width = Math.min(DETAIL_LIMITS.width[1], Math.max(DETAIL_LIMITS.width[0], v)); pose(); touched(); };
        const tIn = pageBox.querySelector<HTMLInputElement>("[data-dtags]")!;
        tIn.oninput = () => { draft.tags = [...new Set(tIn.value.split(",").map((t) => t.trim()).filter(Boolean))]; touched(); };
      }
      const act = pageBox.querySelector<HTMLElement>("[data-dact]")!;
      pageBox.querySelector<HTMLElement>("[data-dsave]")?.addEventListener("click", async () => {
        if (!draft.name.trim()) { act.textContent = "Нужно имя."; return; }
        if (taken(draft.name, s.key)) { act.textContent = `Имя «${draft.name.trim()}» уже у другой детали — дай другое.`; return; }
        const res = await fetch(`${HOST}/table/admin/details/${saved.id}`, { method: "PUT", headers: json, body: JSON.stringify(draft) }).catch(() => null);
        if (!res?.ok) { act.textContent = res?.status === 409 ? "Имя уже у другой детали — дай другое." : `Не сохранилось (${res?.status ?? "нет связи"}).`; return; }
        const next = (await res.json()) as Detail;
        mine = mine.map((d) => (d.id === next.id ? next : d));
        put({ dd: null });
        openPage({ key: next.id, own: true, detail: next });
        pageBox.querySelector<HTMLElement>("[data-dact]")!.textContent = "Сохранено.";
      });
      pageBox.querySelector<HTMLElement>("[data-dcopy]")!.onclick = async () => {
        const body = { ...draft, name: freeName(draft.name) };
        const res = await fetch(`${HOST}/table/admin/details`, { method: "POST", headers: json, body: JSON.stringify(body) }).catch(() => null);
        if (!res?.ok) { act.textContent = `Не сохранилось (${res?.status ?? "нет связи"}).`; return; }
        const made = (await res.json()) as Detail;
        mine = [made, ...mine];
        go({ detail: made.id, dd: null });
        follow();
      };
      pageBox.querySelector<HTMLElement>("[data-ddrop]")?.addEventListener("click", async () => {
        if (!confirm(`Удалить деталь «${saved.name}»?`)) return;
        const res = await fetch(`${HOST}/table/admin/details/${saved.id}`, { method: "DELETE", headers: auth }).catch(() => null);
        if (!res?.ok) { act.textContent = "Не удалилась."; return; }
        mine = mine.filter((d) => d.id !== saved.id);
        said = `Удалена «${saved.name}».`;
        put({ detail: null, dd: null });
        follow();
      });
      // Краски: расцветка или свои три цвета — на сцене и в ракурсах; что не красится, сказано.
      const showPaint = () => {
        for (const b of pageBox.querySelectorAll<HTMLElement>("[data-dpal]")) b.classList.toggle("on", !paint.own3 && Number(b.dataset.dpal) === paint.pal);
        drawViews(); pose(); keep();
      };
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-dpal]")) b.onclick = () => {
        paint.pal = Number(b.dataset.dpal); paint.own3 = null;
        const p = PALETTES[paint.pal]!;
        pageBox.querySelectorAll<HTMLInputElement>("[data-dc]").forEach((c, i) => (c.value = [p.red, p.blue, p.gold][i]!));
        showPaint();
      };
      const cs = [...pageBox.querySelectorAll<HTMLInputElement>("[data-dc]")];
      for (const c of cs) c.oninput = () => { paint.own3 = [cs[0]!.value, cs[1]!.value, cs[2]!.value]; showPaint(); };
      pageBox.querySelector<HTMLElement>("[data-dcoff]")!.onclick = () => { paint.own3 = null; showPaint(); };
      pageBox.querySelector<HTMLElement>("[data-dagy]")?.addEventListener("click", () => orderAgy({ id: saved.id, name: draft.name }));
      drawEditor();
      showPaint();
    }

    /** ВЫБРАТЬ ИЗ БИБЛИОТЕКИ — картинки этой детали и этой стороны; можно шире: любая сторона, любая деталь, поиск. */
    function openPicker(take: (ref: string) => void): void {
      const over = document.createElement("div");
      over.className = "pick-over";
      over.dataset.picker = "";
      let anySide = false, q = "";
      const drawPick = () => {
        // Эта сторона — картинки, нарисованные с того же угла (сторона или ракурс по кругу рядом, в пределах ~18°).
        const list = pics().filter((p) => (anySide || (!!p.side && dot(viewDir(p.side), viewDir(view)) > 0.95)) && (!q || q.split(/\s+/).every((w) => fits(`${p.name} ${p.tags.join(" ")} ${SLOT_TAG[p.slot] ?? ""}`, w))));
        over.innerHTML = `<div class="pick-sheet"><div class="bar"><b>${anySide ? "любая сторона" : viewName(view)} · любые картинки</b><button class="chip" data-pclose style="margin-left:auto">Закрыть</button></div>
          <div class="bar"><input type="search" data-pq placeholder="Имя или тег" value="${esc(q)}"><button class="chip${anySide ? " on" : ""}" data-pside>любая сторона</button></div>
          <div class="grid">${list.map((p) => { const src = srcOf(p.ref, pickSoon); return `<button class="cell${p.ref.startsWith("b:") ? "" : " own"}" data-pref="${esc(p.ref)}">${src ? `<img src="${esc(src)}" alt="">` : `<div class="wait">…</div>`}<b>${esc(p.name)}</b><i>${p.ref.startsWith("b:") ? "встроенная" : "своя"}${p.side ? ` · ${viewName(p.side)}` : ""}</i></button>`; }).join("") || `<div class="said" style="grid-column:1/-1">Таких картинок нет — шире: «любая сторона».</div>`}</div></div>`;
        const qi = over.querySelector<HTMLInputElement>("[data-pq]")!;
        qi.oninput = () => { q = qi.value; const at = qi.selectionStart; drawPick(); const again = over.querySelector<HTMLInputElement>("[data-pq]")!; again.focus(); again.setSelectionRange(at, at); };
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
