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
// Тап — крупно в трёх расцветках (перекрашиваются три цвета колоды: #b3221f, #1d4f80, #f2c14e).

import { PALETTES } from "../src/table/dolls.js";
import { PARTS } from "../src/table/skins.js";
import { partName } from "../src/table/tunes.js";
import { partSprite } from "./dollSprites.js";
import { HOST } from "./host.js";

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
.sg-look { position: fixed; inset: 0; z-index: 20; background: rgba(5,8,7,.86); display: grid; place-items: center; padding: 16px; box-sizing: border-box; overflow: auto; }
.sg-look .box { box-sizing: border-box; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; max-width: 640px; width: 100%; }
.sg-look .big { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 10px 0; }
.sg-look .big img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #0f1f18; border-radius: 10px; }
.sg-look input { box-sizing: border-box; width: 100%; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; }
.sg-look .meta { font-size: 13px; color: var(--dim); margin: 6px 0 0; }
.sg-look .acts { display: flex; gap: 8px; margin-top: 12px; }
.sg-look .acts button { flex: 1; font: inherit; font-weight: 600; padding: 10px; border-radius: 10px; border: 1px solid var(--line); background: #22282a; color: var(--ink); cursor: pointer; }
.sg-look .acts .save { background: var(--gold); color: #0b0704; border-color: var(--gold); }
.sg-look .acts .drop { color: var(--hurt); }
`;

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const recolor = (svg: string, k: number) => { const p = PALETTES[k] ?? PALETTES[0]!; return svg.replace(/#b3221f/gi, p.red).replace(/#1d4f80/gi, p.blue).replace(/#f2c14e/gi, p.gold); };

export function mountSpriteGallery(root: HTMLElement, auth: Record<string, string>): { refresh(): void } {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  let which: "all" | "own" | "built" = "all";
  let kind: Kind | "all" = "all";
  let side: string | "all" = "all";
  let tag = "";
  let query = "";
  let palette = 0;
  let own: LibSprite[] = [];
  let said = "", bad = false;
  /** SVG своих — текстом: перекрашиваются здесь. PNG — как есть. */
  const texts = new Map<string, string>();

  const built = (): Shown[] => PARTS.filter((p) => p.art.kind !== "none").flatMap((p) => p.views.map((view) => ({ key: `b:${p.id}:${view}`, name: `${partName(p.id)} · ${SIDE_NAMES[view] ?? view}`, slot: p.slot as Kind, side: view, tags: [partName(p.id), ART_NAMES[p.art.kind]].filter(Boolean), built: { part: p.id, view } })));
  const mine = (): Shown[] => own.map((o) => ({ key: `o:${o.id}`, name: o.name, slot: o.slot, side: o.side, tags: o.tags, own: o }));

  let frame = 0;
  const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawGrid(); }); };
  const srcOf = (s: Shown, k: number, ready: () => void): string | null => {
    if (s.built) return partSprite(s.built.part, k, s.built.view, PALETTES[k]!.ink, HOST, ready)?.src ?? null;
    const o = s.own!;
    if (o.ext === "png") return `${HOST}/table/lib/${o.id}.png`;
    const text = texts.get(o.id);
    if (text === undefined) {
      texts.set(o.id, "");
      void fetch(`${HOST}/table/lib/${o.id}.svg`).then((r) => (r.ok ? r.text() : "")).then((t) => { texts.set(o.id, t); ready(); });
      return null;
    }
    return text ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolor(text, k))}` : null;
  };

  root.innerHTML = `<div class="sg">
    <div class="bar"><input type="search" data-q placeholder="Поиск по имени и тегам" aria-label="Поиск"><button class="add" data-add>Загрузить</button><input type="file" data-file accept=".svg,image/svg+xml,image/png" multiple hidden></div>
    <div class="bar into" data-into></div>
    <div class="bar" data-kinds></div>
    <div class="bar" data-sides></div>
    <div class="bar"><select data-tag aria-label="Тег"></select>${(["all", "own", "built"] as const).map((k) => `<button class="chip${which === k ? " on" : ""}" data-which="${k}">${{ all: "Все", own: "Свои", built: "Встроенные" }[k]}</button>`).join("")}</div>
    <div class="bar" data-pals></div>
    <div class="said" data-said></div>
    <div class="count" data-count></div>
    <div class="grid" data-grid></div>
  </div>`;
  const grid = root.querySelector<HTMLElement>("[data-grid]")!;
  const q = root.querySelector<HTMLInputElement>("[data-q]")!;
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
    }).join("") || `<div class="said">Ничего не найдено.</div>`;
    const byKey = new Map(list.map((s) => [s.key, s]));
    for (const b of grid.querySelectorAll<HTMLElement>("[data-sprite]")) b.onclick = () => look(byKey.get(b.dataset.sprite!)!);
  }

  /** Крупно: три расцветки; свою — переименовать и удалить. */
  function look(s: Shown): void {
    const layer = document.createElement("div");
    layer.className = "sg-look";
    layer.dataset.look = "";
    const paint = () => {
      const imgs = [0, 1, 5].map((k) => srcOf(s, k, paint));
      layer.innerHTML = `<div class="box" role="dialog" aria-label="Спрайт">
        ${s.own ? `<input data-name value="${esc(s.own.name)}" maxlength="40" aria-label="Имя">` : `<b>${esc(s.name)}</b>`}
        <div class="big">${imgs.map((src) => (src ? `<img src="${esc(src)}" alt="">` : `<div class="wait">…</div>`)).join("")}</div>
        ${s.own ? `<label>Для какой детали</label><div class="pick" data-pick-kind>${KINDS.map(([k]) => `<button data-v="${k}" class="${s.own!.slot === k ? "on" : ""}">${KIND_ONE[k]}</button>`).join("")}</div>
        <label>Сторона</label><div class="pick" data-pick-side><button data-v="" class="${s.own.side ? "" : "on"}">без стороны</button>${SIDES.map((k) => `<button data-v="${k}" class="${s.own!.side === k ? "on" : ""}">${SIDE_NAMES[k]}</button>`).join("")}</div>
        <label for="sg-tags">Теги, через запятую</label><input id="sg-tags" data-tags value="${esc(s.own.tags.join(", "))}" placeholder="Лис, звери">` : `<div class="meta">${KIND_ONE[s.slot]} · ${SIDE_NAMES[s.side ?? ""] ?? s.side ?? ""} · ${esc(s.tags.join(", "))}</div>`}
        <div class="meta">${s.own ? `${s.own.ext.toUpperCase()} · ${ORIGIN_NAMES[s.own.origin]} · ${new Date(s.own.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : `встроенный — живёт в коде (${esc(s.built!.part)}), не удаляется`}</div>
        <div class="acts">${s.own ? `<button class="drop" data-drop>Удалить</button><button class="save" data-save>Сохранить</button>` : ""}<button data-close>Закрыть</button></div></div>`;
      layer.querySelector<HTMLElement>("[data-close]")!.onclick = () => layer.remove();
      for (const box of layer.querySelectorAll<HTMLElement>(".pick")) for (const b of box.querySelectorAll<HTMLElement>("button")) b.onclick = () => { for (const x of box.querySelectorAll("button")) x.classList.toggle("on", x === b); };
      const save = layer.querySelector<HTMLElement>("[data-save]");
      if (save) save.onclick = async () => {
        const name = layer.querySelector<HTMLInputElement>("[data-name]")!.value.trim();
        const slot = layer.querySelector<HTMLElement>("[data-pick-kind] .on")?.dataset.v;
        const sideNow = layer.querySelector<HTMLElement>("[data-pick-side] .on")?.dataset.v ?? "";
        const tags = layer.querySelector<HTMLInputElement>("[data-tags]")!.value;
        const res = await fetch(`${HOST}/table/admin/lib/${s.own!.id}`, { method: "PATCH", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ name, slot, side: sideNow, tags }) }).catch(() => null);
        said = res?.ok ? "Сохранено." : "Не сохранилось.";
        bad = !res?.ok;
        layer.remove();
        await refresh();
      };
      const drop = layer.querySelector<HTMLElement>("[data-drop]");
      if (drop) drop.onclick = async () => {
        if (!confirm(`Удалить «${s.own!.name}» из библиотеки?`)) return;
        const res = await fetch(`${HOST}/table/admin/lib/${s.own!.id}`, { method: "DELETE", headers: auth }).catch(() => null);
        said = res?.ok ? "Удалено." : "Не удалилось.";
        bad = !res?.ok;
        layer.remove();
        await refresh();
      };
    };
    layer.onclick = (e) => { if (e.target === layer) layer.remove(); };
    paint();
    document.body.append(layer);
  }

  async function refresh(): Promise<void> {
    const res = await fetch(`${HOST}/table/admin/lib`, { headers: auth }).catch(() => null);
    if (res?.ok) own = ((await res.json()) as { sprites: LibSprite[] }).sprites;
    else if (res?.status === 403) { said = "Стол не узнал хозяина — открой страницу из бота или по ссылке с ключом."; bad = true; }
    drawGrid();
  }

  drawGrid();
  void refresh();
  return { refresh: () => void refresh() };
}
