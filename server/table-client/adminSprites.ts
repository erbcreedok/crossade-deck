// ПАНЕЛЬ «СПРАЙТЫ» НА СТРАНИЦЕ ХОЗЯИНА — сами картинки: каждый нарисованный ракурс каждой детали каталога
// (`skins.ts`), испечённый тем же пекарем, что и стол (`dollSprites.ts`), и нарисованное agy, что в каталог ещё не
// попало (`design/persona/skins`, `/table/admin/sprites/files`). По папкам-источникам: колода, файлы, код.
// Тап по картинке — крупно в трёх расцветках.

import { PALETTES } from "../src/table/dolls.js";
import { PARTS, SLOT_NAMES, type Part, type Slot } from "../src/table/skins.js";
import { partName } from "../src/table/tunes.js";
import { partSprite } from "./dollSprites.js";
import { HOST } from "./host.js";

type Source = "court" | "file" | "draw" | "png" | "loose";
const SOURCE_NAMES: Record<Source, string> = { court: "Колода", file: "Файлы", draw: "Код", png: "Картинки", loose: "Не в каталоге" };

/** Одна картинка: деталь каталога в ракурсе — или файл, который ещё не деталь. */
interface Sprite {
  group: string;
  source: Source;
  slot: Slot;
  view: string;
  /** Деталь каталога — печётся пекарем стола. */
  part?: Part;
  /** Файл не из каталога — SVG текстом, красится здесь. */
  svg?: string;
  file?: string;
}

const CSS = `
.sg { max-width: 980px; margin: 0 auto; padding: 12px 16px 40px; }
.sg .row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.sg .chip { font: inherit; font-size: 13px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 999px; padding: 5px 11px; cursor: pointer; }
.sg .chip.on { background: var(--gold); color: #0b0704; border-color: var(--gold); font-weight: 600; }
.sg .pal { display: inline-flex; gap: 2px; padding: 6px 8px; border-radius: 8px; }
.sg .pal i { width: 10px; height: 14px; border-radius: 2px; display: block; }
.sg .count { font-size: 13px; color: var(--dim); margin: 4px 0 10px; }
.sg .group { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; }
.sg .group h3 { font-size: 14.5px; margin: 0 0 8px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.sg .group h3 small { font-size: 12px; color: var(--dim); font-weight: 400; font-family: ui-monospace, Menlo, monospace; }
.sg .cells { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
.sg .cell { font: inherit; color: var(--ink); background: #0f1f18; border: 1px solid var(--line); border-radius: 10px; padding: 6px 4px 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.sg .cell img, .sg .cell .wait { width: 72px; height: 72px; object-fit: contain; }
.sg .cell .wait { display: grid; place-items: center; color: var(--dim); font-size: 11px; }
.sg .cell span { font-size: 11.5px; color: var(--dim); }
.sg .cell b { font-size: 11px; font-weight: 500; color: var(--ink); }
.sg button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.sg-look { position: fixed; inset: 0; z-index: 20; background: rgba(5,8,7,.86); display: grid; place-items: center; padding: 16px; box-sizing: border-box; overflow: auto; }
.sg-look .box { box-sizing: border-box; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; max-width: 640px; width: 100%; }
.sg-look .big { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 10px 0; }
.sg-look .big img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #0f1f18; border-radius: 10px; }
.sg-look dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 13px; margin: 0; }
.sg-look dt { color: var(--dim); }
.sg-look dd { margin: 0; font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
.sg-look .close { margin-top: 12px; width: 100%; font: inherit; font-weight: 600; padding: 10px; border-radius: 10px; border: 1px solid var(--line); background: #22282a; color: var(--ink); cursor: pointer; }
`;

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const recolor = (svg: string, k: number) => { const p = PALETTES[k] ?? PALETTES[0]!; return svg.replace(/#b3221f/gi, p.red).replace(/#1d4f80/gi, p.blue).replace(/#f2c14e/gi, p.gold); };
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Откуда деталь — папка-источник на панели. */
function groupOf(part: Part): { group: string; source: Source } {
  const a = part.art;
  if (a.kind === "court") return { group: `колода · ${a.card}`, source: "court" };
  if (a.kind === "file") return { group: a.dir, source: "file" };
  if (a.kind === "draw") return { group: `код · ${a.art}`, source: "draw" };
  if (a.kind === "png") return { group: `картинка · ${a.file}`, source: "png" };
  return { group: "—", source: "draw" };
}

export function mountSpriteGallery(root: HTMLElement, auth: Record<string, string>): { refresh(): void } {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  let slot: Slot | "all" = "all";
  let source: Source | "all" = "all";
  let palette = 0;
  let loose: Sprite[] = [];

  const catalogue = (): Sprite[] => PARTS.filter((p) => p.art.kind !== "none").flatMap((part) => part.views.map((view) => ({ ...groupOf(part), slot: part.slot, view, part })));

  const thumb = (s: Sprite, k: number, draw: () => void): string | null => {
    if (s.svg) return svgUrl(recolor(s.svg, k));
    return partSprite(s.part!.id, k, s.view, PALETTES[k]!.ink, HOST, draw)?.src ?? null;
  };

  let frame = 0;
  const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); };

  function render(): void {
    const all = [...catalogue(), ...loose].filter((s) => (slot === "all" || s.slot === slot) && (source === "all" || s.source === source));
    const groups = new Map<string, Sprite[]>();
    for (const s of all) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
    const y = window.scrollY;
    root.innerHTML = `<div class="sg">
      <div class="row">${(["all", "head", "hair", "body", "legs", "hands"] as const).map((k) => `<button class="chip${slot === k ? " on" : ""}" data-gslot="${k}">${k === "all" ? "Все" : SLOT_NAMES[k]}</button>`).join("")}</div>
      <div class="row">${(["all", "court", "file", "draw", "png", "loose"] as const).map((k) => `<button class="chip${source === k ? " on" : ""}" data-gsrc="${k}">${k === "all" ? "Откуда угодно" : SOURCE_NAMES[k]}</button>`).join("")}</div>
      <div class="row">${PALETTES.slice(0, 8).map((p, k) => `<button class="chip pal${k === palette ? " on" : ""}" data-gpal="${k}" title="${esc(p.name)}"><i style="background:${p.red}"></i><i style="background:${p.blue}"></i><i style="background:${p.gold}"></i></button>`).join("")}</div>
      <div class="count">Картинок: ${all.length}, папок: ${groups.size}</div>
      ${[...groups].map(([group, list]) => {
        const first = list[0]!;
        const names = [...new Set(list.map((s) => (s.part ? partName(s.part.id) : `${SLOT_NAMES[s.slot]} — ещё не деталь`)))].join(", ");
        return `<div class="group" data-group="${esc(group)}"><h3>${esc(names)}<small>${esc(group)} · ${SOURCE_NAMES[first.source]}</small></h3><div class="cells">${list.map((s, i) => {
          const src = thumb(s, palette, later);
          const mirror = s.part && Object.entries(s.part.mirror ?? {}).find(([, from]) => from === s.view)?.[0];
          return `<button class="cell" data-cell="${esc(group)}|${i}">${src ? `<img src="${src}" alt="">` : `<div class="wait">пеку…</div>`}<b>${esc(SLOT_NAMES[s.slot])}</b><span>${esc(s.view)}${mirror ? ` · ${mirror} зеркалом` : ""}</span></button>`;
        }).join("")}</div></div>`;
      }).join("")}
    </div>`;
    window.scrollTo(0, y);
    for (const b of root.querySelectorAll<HTMLElement>("[data-gslot]")) b.onclick = () => { slot = b.dataset.gslot as typeof slot; render(); };
    for (const b of root.querySelectorAll<HTMLElement>("[data-gsrc]")) b.onclick = () => { source = b.dataset.gsrc as typeof source; render(); };
    for (const b of root.querySelectorAll<HTMLElement>("[data-gpal]")) b.onclick = () => { palette = Number(b.dataset.gpal); render(); };
    for (const b of root.querySelectorAll<HTMLElement>("[data-cell]")) b.onclick = () => {
      const [group, i] = b.dataset.cell!.split("|");
      look(groups.get(group!)![Number(i)]!);
    };
  }

  /** Крупно: три расцветки, откуда картинка, как деталь стоит к камере. */
  function look(s: Sprite): void {
    const layer = document.createElement("div");
    layer.className = "sg-look";
    layer.dataset.look = "";
    const paint = () => {
      const imgs = [0, 1, 5].map((k) => thumb(s, k, paint));
      const file = s.file ?? (s.part?.art.kind === "file" ? `table-client/skins/${s.part.art.dir}/${s.view}-${s.slot}.svg` : s.part?.art.kind === "court" ? `колода, карта ${s.part.art.card}` : s.part?.art.kind === "draw" ? `код: skinArt.ts, «${s.part.art.art}»` : s.part?.art.kind === "png" ? `sprites/${s.part.art.file}.png` : "");
      layer.innerHTML = `<div class="box" role="dialog" aria-label="Спрайт">
        <b>${esc(s.part ? partName(s.part.id) : s.group)}</b> · ${esc(SLOT_NAMES[s.slot])} · ${esc(s.view)}
        <div class="big">${imgs.map((src) => (src ? `<img src="${src}" alt="">` : `<div class="wait">пеку…</div>`)).join("")}</div>
        <dl><dt>Файл</dt><dd>${esc(file)}</dd>${s.part ? `<dt>Деталь</dt><dd>${esc(s.part.id)}</dd><dt>К камере</dt><dd>${esc(s.part.facing)}</dd><dt>Ракурсы</dt><dd>${esc(s.part.views.join(", "))}${s.part.mirror ? ` (+ ${Object.entries(s.part.mirror).map(([a, b]) => `${a}←${b}`).join(", ")})` : ""}</dd>` : `<dt>Каталог</dt><dd>не в каталоге — принять можно во «Заказать у agy»</dd>`}</dl>
        <button class="close" data-close>Закрыть</button></div>`;
      layer.querySelector<HTMLElement>("[data-close]")!.onclick = () => layer.remove();
    };
    layer.onclick = (e) => { if (e.target === layer) layer.remove(); };
    paint();
    document.body.append(layer);
  }

  /** Нарисованное agy, но не отданное столу: файлы из `design/persona/skins`, у которых нет детали в каталоге. */
  async function refresh(): Promise<void> {
    const res = await fetch(`${HOST}/table/admin/sprites/files`, { headers: auth }).catch(() => null);
    if (res?.ok) {
      const { drawn } = (await res.json()) as { drawn: Record<string, string[]> };
      const known = new Set(PARTS.flatMap((p) => (p.art.kind === "file" ? p.views.map((v) => `${(p.art as { dir: string }).dir}/${v}-${p.slot}.svg`) : [])));
      const want = Object.entries(drawn).flatMap(([dir, files]) => files.filter((f) => !known.has(`${dir}/${f}`)).map((f) => ({ dir, f })));
      loose = (await Promise.all(want.map(async ({ dir, f }) => {
        const got = await fetch(`${HOST}/table/admin/sprites/files/drawn/${dir}/${f}`, { headers: auth }).catch(() => null);
        if (!got?.ok) return null;
        const [view, slot] = f.replace(/\.svg$/, "").split("-") as [string, Slot];
        return { group: dir, source: "loose" as const, slot, view, svg: await got.text(), file: `design/persona/skins/${dir}/${f}` };
      }))).filter((s): s is NonNullable<typeof s> => s !== null);
    }
    render();
  }

  render();
  void refresh();
  return { refresh: () => void refresh() };
}
