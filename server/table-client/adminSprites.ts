// ПАНЕЛЬ «СПРАЙТЫ» НА СТРАНИЦЕ ХОЗЯИНА — плоская библиотека картинок. Спрайт — картинка со своим именем, без
// детали и без ракурса: какая картинка каким ракурсом какой детали встанет, решается в «Деталях».
//
// У каждой картинки — для чего она сделана: деталь (голова, тело…), сторона (лицо, спина…) и теги (набор, персонаж).
// По ним полки: фильтры по детали, стороне, тегу.
//
//   свои       — библиотека (`spriteLib.ts`): загруженные сюда SVG / PNG и принятые от agy; переименовать, поправить
//                деталь, сторону и теги, удалить. Загрузка кладёт картинку туда, что выбрано в фильтрах;
//   встроенные — уже нарисованное до библиотеки (колода, файлы, код), испечённое пекарем стола (`dollSprites.ts`);
//                их не удалить и не переименовать — они живут в коде.
//
// Тап — страница спрайта: крутить, красить (расцветки и свои три цвета: #b3221f, #1d4f80, #f2c14e), похожие по тегам.

import { PALETTES } from "../src/table/dolls.js";
import { PARTS } from "../src/table/skins.js";
import { partName } from "../src/table/tunes.js";
import { partSprite } from "./dollSprites.js";
import { HOST } from "./host.js";
import { go, onRoute, put, route, routeNum, routeOne } from "./adminRoute.js";

type Kind = "head" | "hair" | "body" | "legs" | "hands" | "other";
interface LibSprite {
  id: string;
  name: string;
  ext: "svg" | "png";
  origin: "upload" | "agy";
  at: number;
  slot: Kind;
  side: string | null;
  tags: string[];
}

/** Картинка на панели: своя (из библиотеки) или встроенная (сторона детали из кода). */
interface Shown {
  key: string;
  name: string;
  slot: Kind;
  side: string | null;
  tags: string[];
  own?: LibSprite;
  built?: { part: string; view: string };
}

const SIDE_NAMES: Record<string, string> = { front: "лицо", back: "спина", right: "бок", left: "левый бок", top: "верх", bottom: "низ" };
const ORIGIN_NAMES = { upload: "загружен", agy: "agy" } as const;
const KINDS: [Kind, string][] = [["head", "Головы"], ["hair", "Причёски"], ["body", "Тела"], ["legs", "Ноги"], ["hands", "Руки"], ["other", "Другое"]];
const KIND_ONE: Record<Kind, string> = { head: "голова", hair: "причёска", body: "тело", legs: "ноги", hands: "руки", other: "другое" };
const SIDES = ["front", "back", "right", "left", "top", "bottom"];
const ART_NAMES = { court: "колода", file: "файлы", draw: "код", png: "картинка", none: "" } as const;

const CSS = `
.sg { max-width: 980px; margin: 0 auto; padding: 12px 16px 40px; }
.sg .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.sg .bar input[type=search] { flex: 1 1 180px; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; min-width: 0; }
.sg .chip { font: inherit; font-size: 13px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 999px; padding: 5px 11px; cursor: pointer; }
.sg .chip.on { background: var(--gold); color: #0b0704; border-color: var(--gold); font-weight: 600; }
.sg .add { font: inherit; font-size: 14px; font-weight: 600; color: #0b0704; background: var(--gold); border: 1px solid var(--gold); border-radius: 10px; padding: 8px 14px; cursor: pointer; }
.sg .pal { display: inline-flex; gap: 2px; padding: 6px 8px; border-radius: 8px; }
.sg .pal i { width: 10px; height: 14px; border-radius: 2px; display: block; }
.sg .count { font-size: 13px; color: var(--dim); margin: 2px 0 10px; }
.sg .said { font-size: 13px; color: var(--dim); min-height: 1.3em; margin-bottom: 6px; }
.sg .said.bad { color: var(--hurt); }
.sg .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.sg .cell { font: inherit; color: var(--ink); background: #0f1f18; border: 1px solid var(--line); border-radius: 10px; padding: 6px 4px 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
.sg .cell img, .sg .cell .wait { width: 80px; height: 80px; object-fit: contain; }
.sg .cell .wait { display: grid; place-items: center; color: var(--dim); font-size: 11px; }
.sg .cell b { font-size: 11.5px; font-weight: 500; text-align: center; line-height: 1.25; overflow-wrap: anywhere; }
.sg .cell i { font-size: 10.5px; color: var(--dim); font-style: normal; text-align: center; }
.sg .chip small { opacity: .7; margin-left: 3px; }
.sg select { font: inherit; font-size: 13.5px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; max-width: 100%; }
.sg .into { font-size: 12.5px; color: var(--dim); }
.sg-look .pick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sg-look .pick button { font: inherit; font-size: 12.5px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.sg-look .pick button.on { background: var(--gold); color: #0b0704; border-color: var(--gold); font-weight: 600; }
.sg-look label { display: block; font-size: 12.5px; color: var(--dim); margin-top: 10px; }
.sg .cell.own { border-color: #3c4a3c; }
.sg button:focus-visible, .sg input:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.sp-page h2 { font-size: 17px; margin: 0; }
.sp-page h3 { font-size: 14px; color: var(--dim); font-weight: 500; margin: 16px 0 8px; }
.sp-top { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.sp-top input, .sp-page input.wide { flex: 1; min-width: 0; box-sizing: border-box; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; }
.sp-page input.wide { width: 100%; }
.sp-stage { height: 300px; border: 1px solid var(--line); border-radius: 12px; display: grid; place-items: center; perspective: 700px; touch-action: none; cursor: grab; overflow: hidden; margin-bottom: 8px; }
.sp-stage.bg-felt { background: radial-gradient(#1b4835, #0a2117); }
.sp-stage.bg-light { background: #efe6d2; }
.sp-stage.bg-check { background: repeating-conic-gradient(#8a8f8c 0 25%, #c8ccc9 0 50%) 0 0 / 20px 20px; }
.sp-card { width: 220px; height: 220px; transform-style: preserve-3d; }
.sp-card img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; user-select: none; }
.sp-page .num { font-size: 13px; color: var(--dim); display: inline-flex; gap: 6px; align-items: center; }
.sp-page .num input { width: 70px; font: inherit; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 5px 7px; }
.sp-pals { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
.sp-pal { font: inherit; color: var(--dim); background: #0f1f18; border: 1px solid var(--line); border-radius: 10px; padding: 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; font-size: 11px; }
.sp-pal img { width: 56px; height: 56px; object-fit: contain; }
.sp-pal.on { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); color: var(--ink); }
.sp-page .col { font-size: 12.5px; color: var(--dim); display: inline-flex; flex-direction: column; gap: 3px; align-items: center; }
.sp-page .col input { width: 48px; height: 34px; border: 1px solid var(--line); border-radius: 8px; background: none; padding: 2px; }
.sp-page .pick { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.sp-page .pick button { font: inherit; font-size: 12.5px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.sp-page .pick button.on { background: var(--gold); color: #0b0704; border-color: var(--gold); font-weight: 600; }
.sp-page .lbl { display: block; font-size: 12.5px; color: var(--dim); margin: 6px 0 4px; }
.sp-page .drop { color: var(--hurt); }
.sp-page button:focus-visible, .sp-page input:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
`;

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const recolor = (svg: string, k: number) => { const p = PALETTES[k] ?? PALETTES[0]!; return svg.replace(/#b3221f/gi, p.red).replace(/#1d4f80/gi, p.blue).replace(/#f2c14e/gi, p.gold); };

export function mountSpriteGallery(root: HTMLElement, auth: Record<string, string>): { refresh(): void } {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  // Полки, поиск, расцветка — из адреса (`adminRoute.ts`) и обратно в него.
  let which = routeOne("gw", ["all", "own", "built"] as const, "all");
  let kind = routeOne("gk", ["all", ...KINDS.map(([k]) => k)] as const, "all") as Kind | "all";
  let side = routeOne("gs", ["all", ...SIDES], "all");
  let tag = route("gt") ?? "";
  let query = route("gq") ?? "";
  let palette = Math.max(0, Math.min(PALETTES.length - 1, Math.round(routeNum("gp", 0))));
  const remember = () => put({ gw: which === "all" ? null : which, gk: kind === "all" ? null : kind, gs: side === "all" ? null : side, gt: tag, gq: query, gp: palette || null });
  let own: LibSprite[] = [];
  let said = "", bad = false;
  /** SVG своих — текстом: перекрашиваются здесь. PNG — как есть. */
  const texts = new Map<string, string>();
  /** Заменили файл — новый адрес картинки, чтобы браузер не показал прежнюю из памяти. */
  const bust = new Map<string, number>();

  const built = (): Shown[] => PARTS.filter((p) => p.art.kind !== "none").flatMap((p) => p.views.map((view) => ({ key: `b:${p.id}:${view}`, name: `${partName(p.id)} · ${SIDE_NAMES[view] ?? view}`, slot: p.slot as Kind, side: view, tags: [partName(p.id), ART_NAMES[p.art.kind]].filter(Boolean), built: { part: p.id, view } })));
  const mine = (): Shown[] => own.map((o) => ({ key: `o:${o.id}`, name: o.name, slot: o.slot, side: o.side, tags: o.tags, own: o }));

  let frame = 0;
  const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawGrid(); }); };
  const srcOf = (s: Shown, k: number, ready: () => void): string | null => {
    if (s.built) return partSprite(s.built.part, k, s.built.view, PALETTES[k]!.ink, HOST, ready)?.src ?? null;
    const o = s.own!;
    if (o.ext === "png") return `${HOST}/table/lib/${o.id}.png?v=${bust.get(o.id) ?? 0}`;
    const text = texts.get(o.id);
    if (text === undefined) {
      texts.set(o.id, "");
      void fetch(`${HOST}/table/lib/${o.id}.svg?v=${bust.get(o.id) ?? 0}`).then((r) => (r.ok ? r.text() : "")).then((t) => { texts.set(o.id, t); ready(); });
      return null;
    }
    return text ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolor(text, k))}` : null;
  };

  root.innerHTML = `<div class="sg"><div data-list>
    <div class="bar"><input type="search" data-q placeholder="Поиск по имени и тегам" aria-label="Поиск"><button class="add" data-add>Загрузить</button><input type="file" data-file accept=".svg,image/svg+xml,image/png" multiple hidden></div>
    <div class="bar into" data-into></div>
    <div class="bar" data-kinds></div>
    <div class="bar" data-sides></div>
    <div class="bar"><select data-tag aria-label="Тег"></select>${(["all", "own", "built"] as const).map((k) => `<button class="chip${which === k ? " on" : ""}" data-which="${k}">${{ all: "Все", own: "Свои", built: "Встроенные" }[k]}</button>`).join("")}</div>
    <div class="bar" data-pals></div>
    <div class="said" data-said></div>
    <div class="count" data-count></div>
    <div class="grid" data-grid></div>
  </div><div data-page hidden></div></div>`;
  const grid = root.querySelector<HTMLElement>("[data-grid]")!;
  const q = root.querySelector<HTMLInputElement>("[data-q]")!;
  q.value = query;
  q.oninput = () => { query = q.value.trim().toLowerCase(); drawGrid(); };
  const tagSel = root.querySelector<HTMLSelectElement>("[data-tag]")!;
  tagSel.onchange = () => { tag = tagSel.value; drawGrid(); };
  for (const b of root.querySelectorAll<HTMLElement>("[data-which]")) b.onclick = () => {
    which = b.dataset.which as typeof which;
    for (const x of root.querySelectorAll<HTMLElement>("[data-which]")) x.classList.toggle("on", x === b);
    drawGrid();
  };
  const pals = root.querySelector<HTMLElement>("[data-pals]")!;
  const drawPals = () => {
    pals.innerHTML = PALETTES.slice(0, 8).map((p, k) => `<button class="chip pal${k === palette ? " on" : ""}" data-gpal="${k}" title="${esc(p.name)}"><i style="background:${p.red}"></i><i style="background:${p.blue}"></i><i style="background:${p.gold}"></i></button>`).join("");
    for (const b of pals.querySelectorAll<HTMLElement>("[data-gpal]")) b.onclick = () => { palette = Number(b.dataset.gpal); drawPals(); drawGrid(); };
  };
  drawPals();

  const file = root.querySelector<HTMLInputElement>("[data-file]")!;
  root.querySelector<HTMLElement>("[data-add]")!.onclick = () => file.click();
  file.onchange = async () => {
    const files = [...(file.files ?? [])];
    file.value = "";
    let ok = 0;
    const fails: string[] = [];
    for (const f of files) {
      const name = f.name.replace(/\.(svg|png)$/i, "").slice(0, 40) || "картинка";
      const type = f.type || (/\.svg$/i.test(f.name) ? "image/svg+xml" : "image/png");
      const meta = new URLSearchParams({ name, slot: kind === "all" ? "other" : kind, ...(side === "all" ? {} : { side }), ...(tag ? { tags: tag } : {}) });
      const res = await fetch(`${HOST}/table/admin/lib?${meta}`, { method: "POST", headers: { ...auth, "content-type": type }, body: f }).catch(() => null);
      if (res?.ok) ok += 1;
      else fails.push(`${f.name}: ${res ? ((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.status : "нет связи"}`);
    }
    said = fails.length ? `Загружено ${ok}, не взято: ${fails.join("; ")}` : `Загружено: ${ok}.`;
    bad = fails.length > 0;
    await refresh();
  };

  /** Полки — фильтры со счётчиками: сколько картинок будет, если нажать. */
  function drawShelves(pool: Shown[]): void {
    const count = (f: (s: Shown) => boolean) => pool.filter(f).length;
    const kinds = root.querySelector<HTMLElement>("[data-kinds]")!, sides = root.querySelector<HTMLElement>("[data-sides]")!;
    kinds.innerHTML = [["all", "Все детали"] as const, ...KINDS].map(([k, n]) => `<button class="chip${kind === k ? " on" : ""}" data-kind="${k}">${n}<small>${count((s) => (k === "all" || s.slot === k) && (side === "all" || s.side === side))}</small></button>`).join("");
    sides.innerHTML = ["all", ...SIDES].map((k) => `<button class="chip${side === k ? " on" : ""}" data-side="${k}">${k === "all" ? "Любая сторона" : SIDE_NAMES[k]}<small>${count((s) => (kind === "all" || s.slot === kind) && (k === "all" || s.side === k))}</small></button>`).join("");
    for (const b of kinds.querySelectorAll<HTMLElement>("[data-kind]")) b.onclick = () => { kind = b.dataset.kind as typeof kind; drawGrid(); };
    for (const b of sides.querySelectorAll<HTMLElement>("[data-side]")) b.onclick = () => { side = b.dataset.side!; drawGrid(); };
    const tags = new Map<string, number>();
    for (const s of pool) for (const t of s.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    tagSel.innerHTML = `<option value="">Все теги</option>` + [...tags].sort((a, b) => a[0].localeCompare(b[0], "ru")).map(([t, n]) => `<option value="${esc(t)}"${t === tag ? " selected" : ""}>${esc(t)} (${n})</option>`).join("");
    root.querySelector<HTMLElement>("[data-into]")!.textContent = `Загрузка ляжет как: ${kind === "all" ? "другое" : KIND_ONE[kind]}${side === "all" ? "" : ` · ${SIDE_NAMES[side]}`}${tag ? ` · #${tag}` : ""} — поправить можно в карточке картинки.`;
  }

  function drawGrid(): void {
    remember();
    for (const x of root.querySelectorAll<HTMLElement>("[data-which]")) x.classList.toggle("on", x.dataset.which === which);
    const pool = [...(which === "built" ? [] : mine()), ...(which === "own" ? [] : built())];
    drawShelves(pool);
    const list = pool.filter((s) => (kind === "all" || s.slot === kind) && (side === "all" || s.side === side) && (!tag || s.tags.includes(tag)) && (!query || s.name.toLowerCase().includes(query) || s.tags.some((t) => t.toLowerCase().includes(query))));
    root.querySelector<HTMLElement>("[data-count]")!.textContent = `Картинок: ${list.length}${which === "all" ? ` (своих ${own.length})` : ""}`;
    const s0 = root.querySelector<HTMLElement>("[data-said]")!;
    s0.textContent = said;
    s0.classList.toggle("bad", bad);
    grid.innerHTML = list.map((s) => {
      const src = srcOf(s, palette, later);
      return `<button class="cell${s.own ? " own" : ""}" data-sprite="${esc(s.key)}">${src ? `<img src="${esc(src)}" alt="">` : `<div class="wait">…</div>`}<b>${esc(s.name)}</b><i>${KIND_ONE[s.slot]}${s.side ? ` · ${SIDE_NAMES[s.side] ?? s.side}` : ""} · ${s.own ? ORIGIN_NAMES[s.own.origin] : "встроенный"}</i></button>`;
    }).join("") || `<div class="said" style="grid-column:1/-1">Ничего не найдено.</div>`;
    const byKey = new Map(list.map((s) => [s.key, s]));
    for (const b of grid.querySelectorAll<HTMLElement>("[data-sprite]")) b.onclick = () => openPage(byKey.get(b.dataset.sprite!)!);
  }

  // СТРАНИЦА СПРАЙТА — вместо галереи, «назад» (и кнопка Telegram, и браузера) возвращает к ней.
  //   сцена: картинку крутят пальцем в объёме (как лист бумаги), отражают, приближают, ставят на разный фон;
  //   краски: любая из шестнадцати расцветок или свои три цвета (у SVG, где цвета — в самом рисунке);
  //   похожие: у кого общие теги (и та же деталь — выше), тап — их страница.
  const listBox = root.querySelector<HTMLElement>("[data-list]")!, pageBox = root.querySelector<HTMLElement>("[data-page]")!;
  let current: Shown | null = null;
  const svgs = new Map<string, Promise<string | null>>();
  /** Рисунок SVG текстом — если он есть: свой SVG или файл встроенной детали. Колоду и код печёт пекарь стола. */
  const svgOf = (s: Shown): Promise<string | null> => {
    const url = s.own ? (s.own.ext === "svg" ? `${HOST}/table/lib/${s.own.id}.svg?v=${bust.get(s.own.id) ?? 0}` : null)
      : (() => { const p = PARTS.find((x) => x.id === s.built!.part); return p?.art.kind === "file" ? `${HOST}/table/skins/${p.art.dir}/${s.built!.view}-${p.slot}.svg` : null; })();
    if (!url) return Promise.resolve(null);
    let got = svgs.get(url);
    if (!got) svgs.set(url, (got = fetch(url).then((r) => (r.ok ? r.text() : null)).catch(() => null)));
    return got;
  };
  const similar = (s: Shown): Shown[] => [...mine(), ...built()]
    .filter((o) => o.key !== s.key)
    .map((o) => ({ o, n: o.tags.filter((t) => s.tags.includes(t)).length * 2 + (o.slot === s.slot ? 1 : 0) }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 24)
    .map((x) => x.o);

  function openPage(s: Shown, push = true): void {
    current = s;
    // Открыть спрайт — новая запись истории; его настройки начинаются с чистого листа. Пришли по адресу — из адреса.
    if (push) go({ sprite: s.key, sp: null, sc: null, sbg: null, sz: null, sf: null, srx: null, sry: null });
    listBox.hidden = true;
    pageBox.hidden = false;
    window.scrollTo(0, 0);
    let pal = route("sp") === null ? palette : Math.max(0, Math.min(PALETTES.length - 1, Math.round(routeNum("sp", 0))));
    const c3 = (route("sc") ?? "").split(",").filter((c) => /^[0-9a-f]{6}$/i.test(c)).map((c) => `#${c}`);
    let own3: [string, string, string] | null = c3.length === 3 ? (c3 as [string, string, string]) : null;
    let rx = routeNum("srx", -12), ry = routeNum("sry", 24), zoom = Math.max(0.3, Math.min(4, routeNum("sz", 1))), flip = route("sf") === "1", spin = false;
    let bg = routeOne("sbg", ["felt", "light", "check"] as const, "felt");
    /** Настройки страницы — в адрес: обновил страницу — тот же поворот, краски, фон. */
    const keep = () => put({ sp: pal, sc: own3 ? own3.map((c) => c.slice(1)).join(",") : null, sbg: bg === "felt" ? null : bg, sz: zoom === 1 ? null : zoom, sf: flip, srx: Math.round(rx), sry: Math.round(ry) });
    let svg: string | null = null;
    const paintSrc = (): string | null => {
      if (own3 && svg) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/#b3221f/gi, own3[0]).replace(/#1d4f80/gi, own3[1]).replace(/#f2c14e/gi, own3[2]))}`;
      return srcOf(s, pal, () => { if (current === s) drawBig(); });
    };
    pageBox.innerHTML = `<div class="sp-page" data-sprite-page="${esc(s.key)}">
      <div class="sp-top"><button class="chip" data-back>← Все спрайты</button>${s.own ? `<input data-name value="${esc(s.own.name)}" maxlength="40" aria-label="Имя">` : `<h2>${esc(s.name)}</h2>`}</div>
      <div class="bar sp-acts">${s.own
        ? `<button class="add" data-save>Сохранить</button><button class="chip" data-copy>Сохранить как новый</button><button class="chip" data-replace>Заменить файл</button><input type="file" data-replace-file accept=".svg,image/svg+xml,image/png" hidden><button class="chip drop" data-drop>Удалить</button>`
        : `<button class="add" data-copy>Сделать своей копией</button>`}</div>
      <div class="said" data-act-said>${s.own ? "«Сохранить» — имя, деталь, сторона, теги. «Как новый» — копия с нынешней покраской и отражением." : "Встроенную не изменить — копия ляжет в «Свои» с нынешней покраской и отражением."}</div>
      <div class="sp-stage bg-${bg}" data-stage3d><div class="sp-card" data-card><img data-big alt=""></div></div>
      <div class="bar"><button class="chip" data-flip>Отразить</button><button class="chip" data-spin>Крутить само</button><button class="chip" data-reset>Сброс</button>
        <label class="num">Масштаб <input type="number" data-zoom min="0.3" max="4" step="0.1" value="${zoom}"></label></div>
      <div class="bar">${(["felt", "light", "check"] as const).map((k) => `<button class="chip${k === bg ? " on" : ""}" data-bg="${k}">${{ felt: "на сукне", light: "на светлом", check: "прозрачность" }[k]}</button>`).join("")}</div>
      <h3>Расцветки</h3>
      <div class="sp-pals" data-pals16>${PALETTES.map((p, k) => `<button class="sp-pal${k === pal ? " on" : ""}" data-pal16="${k}" title="${esc(p.name)}"><img alt=""><span>${esc(p.name)}</span></button>`).join("")}</div>
      <h3>Свои цвета</h3>
      <div class="bar" data-own3><label class="col">основной <input type="color" data-c="0" value="${own3?.[0] ?? PALETTES[pal]!.red}"></label><label class="col">второй <input type="color" data-c="1" value="${own3?.[1] ?? PALETTES[pal]!.blue}"></label><label class="col">акцент <input type="color" data-c="2" value="${own3?.[2] ?? PALETTES[pal]!.gold}"></label><button class="chip" data-own3-off>Как в расцветке</button></div>
      <div class="said" data-own3-said></div>
      <h3>Для чего</h3>
      ${s.own ? `<div class="pick" data-pick-kind>${KINDS.map(([k]) => `<button data-v="${k}" class="${s.own!.slot === k ? "on" : ""}">${KIND_ONE[k]}</button>`).join("")}</div>
      <div class="pick" data-pick-side><button data-v="" class="${s.own.side ? "" : "on"}">без стороны</button>${SIDES.map((k) => `<button data-v="${k}" class="${s.own!.side === k ? "on" : ""}">${SIDE_NAMES[k]}</button>`).join("")}</div>
      <label class="lbl" for="sp-tags">Теги, через запятую</label><input id="sp-tags" class="wide" data-tags value="${esc(s.own.tags.join(", "))}" placeholder="Лис, звери">
      <div class="said">${s.own.ext.toUpperCase()} · ${ORIGIN_NAMES[s.own.origin]} · ${new Date(s.own.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>`
      : `<div class="said">${KIND_ONE[s.slot]}${s.side ? ` · ${SIDE_NAMES[s.side] ?? s.side}` : ""} · теги: ${esc(s.tags.join(", "))}<br>встроенный — живёт в коде (${esc(s.built!.part)}), не удаляется</div>`}
      <h3>Похожие</h3>
      <div class="grid" data-similar></div>
    </div>`;
    const card = pageBox.querySelector<HTMLElement>("[data-card]")!, big = pageBox.querySelector<HTMLImageElement>("[data-big]")!, stage = pageBox.querySelector<HTMLElement>("[data-stage3d]")!;
    const pose = () => {
      card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(${zoom}) scaleX(${flip ? -1 : 1})`;
      stage.dataset.rx = String(Math.round(rx));
      stage.dataset.ry = String(Math.round(ry));
    };
    function drawBig(): void {
      const src = paintSrc();
      if (src && big.getAttribute("src") !== src) big.src = src;
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-pal16]")) {
        const k = Number(b.dataset.pal16), img = b.querySelector("img")!, one = srcOf(s, k, () => { if (current === s) drawBig(); });
        if (one && img.getAttribute("src") !== one) img.src = one;
        b.classList.toggle("on", !own3 && k === pal);
      }
    }
    // Крутить пальцем: вбок — вокруг вертикали, вверх-вниз — наклон.
    let drag: { x: number; y: number } | null = null;
    stage.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); spin = false; spinBtn.classList.remove("on"); };
    stage.onpointermove = (e) => { if (!drag) return; ry += (e.clientX - drag.x) * 0.8; rx = Math.max(-80, Math.min(80, rx - (e.clientY - drag.y) * 0.6)); drag = { x: e.clientX, y: e.clientY }; pose(); };
    stage.onpointerup = stage.onpointercancel = () => { if (drag) keep(); drag = null; };
    const spinBtn = pageBox.querySelector<HTMLElement>("[data-spin]")!;
    spinBtn.onclick = () => { spin = !spin; spinBtn.classList.toggle("on", spin); if (spin) turn(); };
    const turn = () => { if (!spin || current !== s || !pageBox.isConnected) return; ry += 1.2; pose(); requestAnimationFrame(turn); };
    pageBox.querySelector<HTMLElement>("[data-flip]")!.onclick = () => { flip = !flip; pose(); keep(); };
    pageBox.querySelector<HTMLElement>("[data-reset]")!.onclick = () => { rx = -12; ry = 24; zoom = 1; flip = false; (pageBox.querySelector("[data-zoom]") as HTMLInputElement).value = "1"; pose(); keep(); };
    const zoomIn = pageBox.querySelector<HTMLInputElement>("[data-zoom]")!;
    zoomIn.oninput = () => { const v = Number(zoomIn.value); if (Number.isFinite(v) && v > 0) { zoom = Math.max(0.3, Math.min(4, v)); pose(); keep(); } };
    for (const b of pageBox.querySelectorAll<HTMLElement>("[data-bg]")) b.onclick = () => {
      bg = b.dataset.bg as typeof bg;
      stage.className = `sp-stage bg-${bg}`;
      for (const x of pageBox.querySelectorAll<HTMLElement>("[data-bg]")) x.classList.toggle("on", x === b);
      keep();
    };
    for (const b of pageBox.querySelectorAll<HTMLElement>("[data-pal16]")) b.onclick = () => {
      pal = Number(b.dataset.pal16);
      own3 = null;
      const p = PALETTES[pal]!;
      pageBox.querySelectorAll<HTMLInputElement>("[data-c]").forEach((c, i) => (c.value = [p.red, p.blue, p.gold][i]!));
      drawBig();
      keep();
    };
    // СВОИ ЦВЕТА — только у SVG: у колоды и нарисованного кодом краски вшиты в пекаря стола.
    const own3Box = pageBox.querySelector<HTMLElement>("[data-own3]")!, own3Said = pageBox.querySelector<HTMLElement>("[data-own3-said]")!;
    const inputs = [...pageBox.querySelectorAll<HTMLInputElement>("[data-c]")];
    for (const c of inputs) c.disabled = true;
    own3Said.textContent = "Смотрю рисунок…";
    void svgOf(s).then((t) => {
      svg = t;
      for (const c of inputs) c.disabled = !t;
      own3Said.textContent = t ? "Красятся три цвета рисунка: основной, второй, акцент." : "У этой картинки свои цвета не выбрать: она не SVG (колода, код или PNG) — только расцветки.";
      if (own3) drawBig();
    });
    for (const c of inputs) c.oninput = () => { own3 = [inputs[0]!.value, inputs[1]!.value, inputs[2]!.value]; drawBig(); keep(); };
    own3Box.querySelector<HTMLElement>("[data-own3-off]")!.onclick = () => { own3 = null; drawBig(); keep(); };
    // Похожие
    const sim = similar(s), simBox = pageBox.querySelector<HTMLElement>("[data-similar]")!;
    const drawSimilar = () => {
      simBox.innerHTML = sim.map((o) => { const src = srcOf(o, pal, drawSimilar); return `<button class="cell${o.own ? " own" : ""}" data-sim="${esc(o.key)}">${src ? `<img src="${esc(src)}" alt="">` : `<div class="wait">…</div>`}<b>${esc(o.name)}</b><i>${KIND_ONE[o.slot]}${o.side ? ` · ${SIDE_NAMES[o.side] ?? o.side}` : ""}</i></button>`; }).join("") || `<div class="said" style="grid-column:1/-1">Похожих по тегам нет.</div>`;
      for (const b of simBox.querySelectorAll<HTMLElement>("[data-sim]")) b.onclick = () => openPage(sim.find((o) => o.key === b.dataset.sim)!);
    };
    drawSimilar();
    // Своё — править и удалить
    for (const box of pageBox.querySelectorAll<HTMLElement>(".pick")) for (const b of box.querySelectorAll<HTMLElement>("button")) b.onclick = () => { for (const x of box.querySelectorAll("button")) x.classList.toggle("on", x === b); };
    const save = pageBox.querySelector<HTMLElement>("[data-save]");
    if (save) save.onclick = async () => {
      const name = pageBox.querySelector<HTMLInputElement>("[data-name]")!.value.trim();
      const slot = pageBox.querySelector<HTMLElement>("[data-pick-kind] .on")?.dataset.v;
      const sideNow = pageBox.querySelector<HTMLElement>("[data-pick-side] .on")?.dataset.v ?? "";
      const tags = pageBox.querySelector<HTMLInputElement>("[data-tags]")!.value;
      const res = await fetch(`${HOST}/table/admin/lib/${s.own!.id}`, { method: "PATCH", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ name, slot, side: sideNow, tags }) }).catch(() => null);
      said = res?.ok ? "Сохранено." : "Не сохранилось.";
      bad = !res?.ok;
      await refresh();
      if (res?.ok) { const again = mine().find((o) => o.own!.id === s.own!.id); if (again) openPage(again, false); }
    };
    const drop = pageBox.querySelector<HTMLElement>("[data-drop]");
    if (drop) drop.onclick = async () => {
      if (!confirm(`Удалить «${s.own!.name}» из библиотеки?`)) return;
      const res = await fetch(`${HOST}/table/admin/lib/${s.own!.id}`, { method: "DELETE", headers: auth }).catch(() => null);
      said = res?.ok ? "Удалено." : "Не удалилось.";
      bad = !res?.ok;
      history.back();
      await refresh();
    };
    // СОЗДАТЬ ИЗ ТОГО, ЧТО НА ЭКРАНЕ: копия с нынешней покраской и отражением. SVG остаётся SVG (цвета и отражение —
    // в самом рисунке), остальное — PNG с испечённой картинки.
    const actSaid = pageBox.querySelector<HTMLElement>("[data-act-said]")!;
    const baked = async (): Promise<{ body: Blob; type: string } | null> => {
      if (svg) {
        const c = own3 ?? (() => { const p = PALETTES[pal]!; return [p.red, p.blue, p.gold]; })();
        let text = svg.replace(/#b3221f/gi, c[0]!).replace(/#1d4f80/gi, c[1]!).replace(/#f2c14e/gi, c[2]!);
        if (flip) {
          const [x, , w] = (/viewBox="([^"]+)"/.exec(text)?.[1] ?? "0 0 100 100").trim().split(/[\s,]+/).map(Number) as [number, number, number, number];
          text = text.replace(/<svg\b[^>]*>/, (root) => `${root}<g transform="matrix(-1 0 0 1 ${2 * x + w} 0)">`).replace(/<\/svg>\s*$/, "</g></svg>");
        }
        return { body: new Blob([text], { type: "image/svg+xml" }), type: "image/svg+xml" };
      }
      const src = paintSrc();
      if (!src) return null;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const g = cv.getContext("2d")!;
      if (flip) { g.translate(cv.width, 0); g.scale(-1, 1); }
      g.drawImage(img, 0, 0);
      const body = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/png"));
      return body ? { body, type: "image/png" } : null;
    };
    pageBox.querySelector<HTMLElement>("[data-copy]")!.onclick = async () => {
      const got = await baked().catch(() => null);
      if (!got) { actSaid.textContent = "Картинка ещё не готова — секунду."; return; }
      const name = (s.own ? `${pageBox.querySelector<HTMLInputElement>("[data-name]")!.value.trim() || s.name} (копия)` : s.name).slice(0, 40);
      const meta = new URLSearchParams({ name, slot: s.slot, ...(s.side ? { side: s.side } : {}), ...(s.tags.length ? { tags: s.tags.join(",") } : {}) });
      const res = await fetch(`${HOST}/table/admin/lib?${meta}`, { method: "POST", headers: { ...auth, "content-type": got.type }, body: got.body }).catch(() => null);
      if (!res?.ok) { actSaid.textContent = `Не сохранилось (${res?.status ?? "нет связи"}).`; return; }
      const made = (await res.json()) as LibSprite;
      said = `Новый спрайт «${made.name}» — в «Своих».`;
      bad = false;
      await refresh();
      const next = mine().find((o) => o.own!.id === made.id);
      if (next) openPage(next);
    };
    const replaceBtn = pageBox.querySelector<HTMLElement>("[data-replace]"), replaceFile = pageBox.querySelector<HTMLInputElement>("[data-replace-file]");
    if (replaceBtn && replaceFile) {
      replaceBtn.onclick = () => replaceFile.click();
      replaceFile.onchange = async () => {
        const f = replaceFile.files?.[0];
        replaceFile.value = "";
        if (!f) return;
        const res = await fetch(`${HOST}/table/admin/lib/${s.own!.id}/file`, { method: "PUT", headers: { ...auth, "content-type": f.type || (/\.svg$/i.test(f.name) ? "image/svg+xml" : "image/png") }, body: f }).catch(() => null);
        if (!res?.ok) { actSaid.textContent = `Не заменилось: ${res ? ((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.status : "нет связи"}.`; return; }
        texts.delete(s.own!.id);
        bust.set(s.own!.id, Date.now());
        for (const k of [...svgs.keys()]) if (k.includes(s.own!.id)) svgs.delete(k);
        await refresh();
        const again = mine().find((o) => o.own!.id === s.own!.id);
        if (again) openPage(again, false);
        pageBox.querySelector<HTMLElement>("[data-act-said]")!.textContent = "Файл заменён — имя, деталь и теги те же.";
      };
    }
    pageBox.querySelector<HTMLElement>("[data-back]")!.onclick = () => history.back();
    pose();
    drawBig();
    tgBack(true);
  }

  function closePage(): void {
    current = null;
    pageBox.hidden = true;
    pageBox.innerHTML = "";
    listBox.hidden = false;
    tgBack(false);
    drawGrid();
  }
  /** Спрайт из адреса — открыть его страницу (или закрыть, если в адресе его нет). */
  const follow = () => {
    const key = route("sprite");
    const s = key ? [...mine(), ...built()].find((o) => o.key === key) : null;
    if (s) { if (current?.key !== s.key) openPage(s, false); }
    else if (current) closePage();
  };
  onRoute(follow);
  /** Кнопка «назад» Telegram — пока открыта страница спрайта. */
  const tgBtn = (globalThis as { Telegram?: { WebApp?: { BackButton?: { show(): void; hide(): void; onClick(f: () => void): void } } } }).Telegram?.WebApp?.BackButton;
  tgBtn?.onClick(() => history.back());
  const tgBack = (on: boolean) => (on ? tgBtn?.show() : tgBtn?.hide());

  async function refresh(): Promise<void> {
    const res = await fetch(`${HOST}/table/admin/lib`, { headers: auth }).catch(() => null);
    if (res?.ok) own = ((await res.json()) as { sprites: LibSprite[] }).sprites;
    else if (res?.status === 403) { said = "Стол не узнал хозяина — открой страницу из бота или по ссылке с ключом."; bad = true; }
    drawGrid();
  }

  drawGrid();
  // Свои спрайты приходят со стола — открыть спрайт из адреса можно только после них.
  void refresh().then(follow);
  return { refresh: () => void refresh() };
}
