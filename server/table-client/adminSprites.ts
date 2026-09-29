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
import { ART, paintPart, partSprite } from "./dollSprites.js";
import { drawArt } from "./skinArt.js";
import { axesFor, unitSize, type V3 } from "./spriteAxes.js";
import { tuneOf } from "../src/table/tunes.js";
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
  built?: { part: string; view: string; art: "court" | "file" | "draw" | "png" | "none"; recolor: boolean };
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
.sg .qbox { flex: 1 1 220px; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; position: relative; background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 4px 6px; cursor: text; }
.sg .qbox:focus-within { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.sg .qbox input:focus-visible { outline: none; }
.sg .qchips { display: contents; }
.sg .qbox .qclear { font: inherit; font-size: 12px; color: var(--dim); background: none; border: 0; cursor: pointer; padding: 2px 4px; }
.sg .qlist { position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; right: 0; max-height: 60vh; overflow: auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
.sg .qg + .qg { margin-top: 8px; }
.sg .qh { font-size: 12px; color: var(--dim); margin-bottom: 4px; }
.sg .qrow { display: flex; flex-wrap: wrap; gap: 5px; }
.sg .qmore { font-size: 12px; color: var(--dim); align-self: center; }
.sg .qbox input { flex: 1 1 120px; min-width: 100px; font: inherit; font-size: 15px; color: var(--ink); background: transparent; border: 0; outline: none; padding: 5px 4px; }
.sg .drops { gap: 6px; }
.sg .drop { position: relative; }
.sg .dbtn { font: inherit; font-size: 13px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; cursor: pointer; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sg .drop.set .dbtn { border-color: var(--gold); color: var(--gold); }
.sg .drop.open .dbtn { background: #2d3436; }
.sg .dmenu { position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; min-width: 220px; max-width: min(320px, calc(100vw - 32px)); max-height: 60vh; overflow: auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 6px; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
.sg .dmenu input[data-dfind] { box-sizing: border-box; width: 100%; font: inherit; font-size: 14px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; margin-bottom: 4px; }
.sg .drow { display: flex; align-items: center; gap: 8px; padding: 7px 6px; border-radius: 6px; cursor: pointer; font-size: 14px; }
.sg .drow:hover { background: #22282a; }
.sg .drow span { flex: 1; }
.sg .drow small { color: var(--dim); font-variant-numeric: tabular-nums; }
.sg .drow.zero { opacity: .45; }
.sg .drow input { accent-color: #c9a227; width: 16px; height: 16px; }
.sg .fchip { display: inline-flex; align-items: center; gap: 4px; background: #22282a; border: 1px solid var(--gold); border-radius: 999px; padding: 3px 4px 3px 10px; font-size: 13px; }
.sg .fchip b { font-weight: 500; color: var(--dim); }
.sg .fchip button { font: inherit; font-size: 13px; color: var(--ink); background: none; border: 0; cursor: pointer; padding: 2px 5px; border-radius: 999px; }
.sg .fchip .fval { background: #0f1213; }
.sg .fchip .fx { color: var(--dim); }
.sg .cell i.fmt { font-size: 10px; opacity: .8; }
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
.sp-facts { display: grid; grid-template-columns: minmax(96px, max-content) 1fr; gap: 4px 12px; margin: 0 0 6px; font-size: 13px; }
.sp-facts dt { color: var(--dim); }
.sp-facts dd { margin: 0; overflow-wrap: anywhere; }
.sp-facts code { font-size: 12px; background: #22282a; border-radius: 4px; padding: 1px 4px; }
.sp-facts a { color: var(--gold); }
.sp-top { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.sp-top input, .sp-page input.wide { flex: 1; min-width: 0; box-sizing: border-box; font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; }
.sp-page input.wide { width: 100%; }
.sp-stage { height: 300px; border: 1px solid var(--line); border-radius: 12px; display: grid; place-items: center; perspective: 700px; touch-action: none; cursor: grab; overflow: hidden; margin-bottom: 8px; }
.sp-stage.bg-felt { background: radial-gradient(#1b4835, #0a2117); }
.sp-stage.bg-light { background: #efe6d2; }
.sp-stage.bg-check { background: repeating-conic-gradient(#8a8f8c 0 25%, #c8ccc9 0 50%) 0 0 / 20px 20px; }
.sp-card { width: 220px; height: 220px; transform-style: preserve-3d; }
.sp-card { position: relative; }
.sp-card img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; user-select: none; }
.sp-box { position: absolute; pointer-events: none; transform: translateZ(1px); }
.sp-box.sized { outline: 1.5px dashed rgba(242,193,78,.8); }
.sp-cells { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px); background-position: -0.5px -0.5px; }
.sp-axes { position: absolute; inset: 0; transform-style: preserve-3d; pointer-events: none; }
.sp-axes .ax { position: absolute; left: 0; top: -2px; width: 92px; height: 4px; transform-origin: 0 50%; border-radius: 2px; }
.sp-axes .ax::after { content: ""; position: absolute; right: -10px; top: -5px; border-left: 12px solid currentColor; border-top: 7px solid transparent; border-bottom: 7px solid transparent; }
.sp-axes .ax-front { background: #f2c14e; color: #f2c14e; }
.sp-axes .ax-up { background: #6fd0ff; color: #6fd0ff; }
.sp-axes .ax-right { background: #ff7ab8; color: #ff7ab8; }
.sp-axes .axl { position: absolute; left: 0; top: 0; font: 600 12px/1 system-ui, sans-serif; padding: 2px 5px; border-radius: 6px; background: rgba(11,7,4,.75); white-space: nowrap; }
.sp-axes .axl.ax-front { color: #f2c14e; }
.sp-axes .axl.ax-up { color: #6fd0ff; }
.sp-axes .axl.ax-right { color: #ff7ab8; }
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
  /**
   * ФИЛЬТР — ОДНО ПОЛЕ: «деталь:голова,тело формат:svg тег:Лис» и просто слова. Условие — ключ, двоеточие, значения
   * через запятую (внутри ключа — «или», между ключами — «и»); каждое становится чипом под полем, крестик — убрать.
   * Слова без двоеточия — поиск по имени и тегам. Значение из нескольких слов — через дефис или в кавычках.
   */
  const KEYS: { id: string; key: string; values: [string, string][] | null; of: (s: Shown) => string[] }[] = [
    { id: "gk", key: "деталь", values: KINDS.map(([k]) => [k, KIND_ONE[k]]), of: (s) => [s.slot] },
    { id: "gs", key: "сторона", values: [...SIDES.map((k): [string, string] => [k, SIDE_NAMES[k]!]), ["none", "без-стороны"]], of: (s) => [s.side ?? "none"] },
    { id: "gf", key: "формат", values: [["svg", "svg"], ["png", "png"]], of: (s) => (s.own ? [s.own.ext] : s.built!.art === "png" ? ["png"] : s.built!.art === "none" ? [] : ["svg"]) },
    { id: "gw", key: "откуда", values: [["upload", "загружены"], ["agy", "agy"], ["court", "колода"], ["file", "файлы"], ["draw", "код"], ["png", "картинки-стола"]], of: (s) => [s.own ? s.own.origin : s.built!.art] },
    { id: "gc", key: "красится", values: [["yes", "да"], ["no", "нет"]], of: (s) => [paints(s) ? "yes" : "no"] },
    { id: "gt", key: "тег", values: null, of: (s) => (s.tags.length ? s.tags : ["~"]) },
  ];
  const keyOf = (id: string) => KEYS.find((k) => k.id === id)!;
  /** Подпись значения; у тегов значение и есть подпись («~» — без тегов). */
  const labelOf = (id: string, v: string) => (id === "gt" ? (v === "~" ? "без-тегов" : v) : keyOf(id).values!.find(([code]) => code === v)?.[1] ?? v);
  const norm = (t: string) => t.toLowerCase().replace(/ё/g, "е").replace(/[\s_]+/g, "-");
  /** Набрано в другой раскладке — «rjhjkm» это «король». */
  const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`", RU = "йцукенгшщзхъфывапролджэячсмитьбюё";
  const swap = (t: string) => [...t.toLowerCase()].map((c) => { const i = EN.indexOf(c); if (i >= 0) return RU[i]!; const j = RU.indexOf(c); return j >= 0 ? EN[j]! : c; }).join("");
  /** Подходит ли текст `h` под набранное `w`: подстрока, с «ё» = «е», в любой раскладке. */
  const fits = (h: string, w: string) => { const H = norm(h), W = norm(w); return H.includes(W) || H.includes(norm(swap(w))); };
  /** Значение из слова: код или подпись (регистр, пробел/дефис — не важны). */
  const valueOf = (id: string, word: string, pool: Shown[]): string | null => {
    const w = norm(word.replace(/^"|"$/g, ""));
    if (id === "gt") {
      if (w === "без-тегов" || w === "~") return "~";
      return [...new Set(pool.flatMap((s) => s.tags))].find((t) => norm(t) === w) ?? null;
    }
    return keyOf(id).values!.find(([code, label]) => norm(code) === w || norm(label) === w)?.[0] ?? null;
  };
  /** Выбранное: ключ → значения. В адресе — как написал бы человек: `gf=деталь:голова,тело формат:svg`. */
  const chosen = new Map<string, Set<string>>();
  let query = route("gq") ?? "";
  let palette = Math.max(0, Math.min(PALETTES.length - 1, Math.round(routeNum("gp", 0))));
  const filterText = () => [...chosen].filter(([, v]) => v.size).map(([id, v]) => `${keyOf(id).key}:${[...v].map((x) => (labelOf(id, x).includes(" ") ? `"${labelOf(id, x)}"` : labelOf(id, x))).join(",")}`).join(" ");
  const remember = () => put({ gf: filterText(), gq: query, gw2: terms.join("|"), gp: palette || null });
  /** Перекрашивается ли расцветкой: PNG — нет; SVG — если в нём есть цвета колоды; встроенная — как её деталь. */
  const paints = (s: Shown): boolean => {
    if (s.built) return s.built.recolor && s.built.art !== "png";
    if (s.own!.ext === "png") return false;
    const t = texts.get(s.own!.id);
    return !t || /#b3221f|#1d4f80|#f2c14e/i.test(t);
  };
  let own: LibSprite[] = [];
  let said = "", bad = false;
  /** SVG своих — текстом: перекрашиваются здесь. PNG — как есть. */
  const texts = new Map<string, string>();
  /** Заменили файл — новый адрес картинки, чтобы браузер не показал прежнюю из памяти. */
  const bust = new Map<string, number>();

  const built = (): Shown[] => PARTS.filter((p) => p.art.kind !== "none").flatMap((p) => p.views.map((view) => ({ key: `b:${p.id}:${view}`, name: `${partName(p.id)} · ${SIDE_NAMES[view] ?? view}`, slot: p.slot as Kind, side: view, tags: [partName(p.id), ART_NAMES[p.art.kind]].filter(Boolean), built: { part: p.id, view, art: p.art.kind, recolor: p.recolor } })));
  const mine = (): Shown[] => own.map((o) => ({ key: `o:${o.id}`, name: o.name, slot: o.slot, side: o.side, tags: o.tags, own: o }));

  let frame = 0;
  /** Испеклась картинка — перерисовать только сетку: открытая выпадашка и поле не трогаются. */
  const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawCells(); }); };
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
    <div class="bar"><div class="qbox" data-qbox><span class="qchips" data-chips></span><input type="search" data-q placeholder="Поиск: голова, svg, король, agy…" aria-label="Поиск и фильтр" autocapitalize="off" autocomplete="off" spellcheck="false"><div class="qlist" data-qlist hidden></div></div><button class="add" data-add>Загрузить</button><input type="file" data-file accept=".svg,image/svg+xml,image/png" multiple hidden></div>
    <div class="bar into" data-into></div>
    <div class="bar" data-pals></div>
    <div class="said" data-said></div>
    <div class="count" data-count></div>
    <div class="grid" data-grid></div>
  </div><div data-page hidden></div></div>`;
  const grid = root.querySelector<HTMLElement>("[data-grid]")!;
  const q = root.querySelector<HTMLInputElement>("[data-q]")!;
  const qlist = root.querySelector<HTMLElement>("[data-qlist]")!;
  /** Слова, закреплённые чипами (Enter по свободному тексту), — ищутся везде, как и то, что сейчас в поле. */
  const terms: string[] = (route("gw2") ?? "").split("|").filter(Boolean);
  /** Разобрать написанное: условия — в чипы, остальное — поиск. `keepLast` — последнее слово ещё набирается. */
  const take = (text: string, keepLast: boolean): string => {
    const words = text.match(/[^\s"]*"[^"]*"\S*|\S+/g) ?? [];
    const tail = keepLast && !/\s$/.test(text) ? words.pop() ?? "" : "";
    const rest: string[] = [];
    const pool = [...mine(), ...built()];
    for (const w of words) {
      const m = /^([^:]+):(.+)$/.exec(w);
      const k = m && KEYS.find((x) => norm(x.key).startsWith(norm(m[1]!)) && norm(m[1]!).length >= 2);
      if (!m || !k) { rest.push(w); continue; }
      const vals = (m[2]!.match(/"[^"]*"|[^,]+/g) ?? []).map((v) => valueOf(k.id, v, pool)).filter((v): v is string => v !== null);
      if (!vals.length) { rest.push(w); continue; }
      const set = chosen.get(k.id) ?? new Set<string>();
      for (const v of vals) set.add(v);
      chosen.set(k.id, set);
    }
    return [...rest, tail].filter(Boolean).join(" ") + (tail ? "" : rest.length ? " " : "");
  };
  // Из адреса — выбранное и поиск.
  take(route("gf") ?? "", false);
  q.value = query;
  // ОДНО ПОЛЕ: набранное ищется сразу по всему, что есть у картинки; под полем — список всех вариантов по группам
  // (деталь, сторона, формат, откуда, красится, теги) со счётчиками, набранное его сужает; тап — вариант становится
  // чипом. Enter — набранное становится чипом (вариант, если он один подходит, иначе — слово поиска).
  q.oninput = () => { query = q.value.trim(); drawGrid(); openList(); };
  q.onfocus = q.onclick = () => openList();
  q.onblur = () => setTimeout(() => { if (document.activeElement !== q) qlist.hidden = true; }, 150);
  const qbox = root.querySelector<HTMLElement>("[data-qbox]")!;
  qbox.onclick = (e) => { if (e.target === qbox) q.focus(); };
  // Тап мимо поля — список закрыт сразу, до того как тап дойдёт до того, что под ним.
  document.addEventListener("pointerdown", (e) => { if (!qbox.contains(e.target as Node)) qlist.hidden = true; }, true);
  q.onkeydown = (e) => {
    if (e.key === "Escape") { qlist.hidden = true; return; }
    // Backspace в пустом поле — убрать последний чип.
    if (e.key === "Backspace" && !q.value) {
      if (terms.length) terms.pop();
      else { const last = [...chosen].filter(([, v]) => v.size).pop(); if (last) { const vals = [...last[1]]; last[1].delete(vals[vals.length - 1]!); } }
      drawGrid();
      openList();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    // «ключ:значение» — как раньше, чипом; что осталось — вариантом или словом поиска.
    const text = take(q.value.trim(), false).trim();
    if (!text) { q.value = ""; query = ""; drawGrid(); qlist.hidden = true; return; }
    const hits = listItems().filter((x) => fits(x.label, text));
    const exact = hits.find((x) => norm(x.label) === norm(text)) ?? (hits.length === 1 ? hits[0] : undefined);
    if (exact) pick(exact.id, exact.v);
    else terms.push(text);
    q.value = "";
    query = "";
    drawGrid();
    qlist.hidden = true;
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
      const meta = new URLSearchParams({ name, slot: one("gk") ?? "other", ...(one("gs") && one("gs") !== "none" ? { side: one("gs")! } : {}), ...(chosen.get("gt")?.size ? { tags: [...chosen.get("gt")!].filter((t) => t !== "~").join(",") } : {}) });
      const res = await fetch(`${HOST}/table/admin/lib?${meta}`, { method: "POST", headers: { ...auth, "content-type": type }, body: f }).catch(() => null);
      if (res?.ok) ok += 1;
      else fails.push(`${f.name}: ${res ? ((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.status : "нет связи"}`);
    }
    said = fails.length ? `Загружено ${ok}, не взято: ${fails.join("; ")}` : `Загружено: ${ok}.`;
    bad = fails.length > 0;
    await refresh();
  };

  /** Выбрано ровно одно значение ключа — какое (для загрузки). */
  const one = (id: string): string | null => { const v = chosen.get(id); return v && v.size === 1 ? [...v][0]! : null; };
  /** Всё, что у картинки можно найти: имя, теги, деталь, сторона, откуда, формат, красится ли. */
  const hay = (s: Shown): string => norm([s.name, ...s.tags, KIND_ONE[s.slot], s.side ? SIDE_NAMES[s.side] ?? s.side : "без стороны", s.own ? ORIGIN_NAMES[s.own.origin] : `встроенный ${labelOf("gw", s.built!.art)}`, labelOf("gf", keyOf("gf").of(s)[0]!), paints(s) ? "красится" : "не красится"].join(" "));
  const byQuery = (s: Shown) => { const h = hay(s); return [...terms, ...query.split(/\s+/)].filter(Boolean).every((w) => fits(h, w)); };
  /** Проходит ли картинка все условия, кроме ключа `skip`. */
  const passes = (s: Shown, skip = "") => KEYS.every((k) => { const v = chosen.get(k.id); return k.id === skip || !v?.size || k.of(s).some((x) => v.has(x)); }) && byQuery(s);

  /** Чипы выбранного и подсказки к тому, что набирается: ключи — а после двоеточия значения со счётчиками. */
  function drawShelves(pool: Shown[]): void {
    const chips = root.querySelector<HTMLElement>("[data-chips]")!;
    chips.innerHTML = [...chosen].filter(([, v]) => v.size).map(([id, v]) => `<span class="fchip" data-chip="${id}"><b>${keyOf(id).key}:</b>${[...v].map((x) => `<button class="fval" data-chip-v="${esc(x)}" title="убрать">${esc(labelOf(id, x).replace(/-/g, " "))} ×</button>`).join("")}<button class="fx" data-x title="убрать условие">×</button></span>`).join("")
      + terms.map((t, i) => `<span class="fchip"><b>найти:</b><button class="fval" data-term="${i}" title="убрать">${esc(t)} ×</button></span>`).join("")
      + ([...chosen.values()].some((v) => v.size) || terms.length ? `<button class="qclear" data-clear title="сбросить всё">сбросить</button>` : "");
    for (const c of chips.querySelectorAll<HTMLElement>("[data-chip]")) {
      const id = c.dataset.chip!;
      c.querySelector<HTMLElement>("[data-x]")!.onclick = () => { chosen.delete(id); drawGrid(); };
      for (const b of c.querySelectorAll<HTMLElement>("[data-chip-v]")) b.onclick = () => { chosen.get(id)?.delete(b.dataset.chipV!); drawGrid(); };
    }
    for (const b of chips.querySelectorAll<HTMLElement>("[data-term]")) b.onclick = () => { terms.splice(Number(b.dataset.term), 1); drawGrid(); };
    const clear = chips.querySelector<HTMLElement>("[data-clear]");
    if (clear) clear.onclick = () => { chosen.clear(); terms.length = 0; drawGrid(); };
    const k1 = one("gk") as Kind | null, sd = one("gs");
    const tags = [...(chosen.get("gt") ?? [])].filter((t) => t !== "~");
    root.querySelector<HTMLElement>("[data-into]")!.textContent = `Загрузка ляжет как: ${k1 ? KIND_ONE[k1] : "другое"}${sd && sd !== "none" ? ` · ${SIDE_NAMES[sd]}` : ""}${tags.length ? ` · #${tags.join(" #")}` : ""} — поправить можно на странице картинки.`;
  }
  /** Все варианты всех групп — с числом картинок, которые останутся, если выбрать (при прочих выбранных). */
  function listItems(): { id: string; v: string; label: string; n: number }[] {
    const pool = [...mine(), ...built()];
    return KEYS.flatMap((k) => {
      const rest = pool.filter((s) => passes(s, k.id));
      const vals = k.values ? k.values.map(([v]) => v) : ["~", ...[...new Set(pool.flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b, "ru"))];
      return vals.filter((v) => !chosen.get(k.id)?.has(v)).map((v) => ({ id: k.id, v, label: labelOf(k.id, v).replace(/-/g, " "), n: rest.filter((s) => k.of(s).includes(v)).length }));
    });
  }
  function pick(id: string, v: string): void {
    const set = chosen.get(id) ?? new Set<string>();
    set.add(v);
    chosen.set(id, set);
  }
  /** Список под полем: группы с вариантами; набранное сужает. */
  function openList(): void {
    if (document.activeElement !== q) return;
    const text = q.value.trim();
    const items = listItems().filter((x) => x.n > 0 && (!text || fits(x.label, text)));
    const groups = KEYS.map((k) => ({ k, rows: items.filter((x) => x.id === k.id) })).filter((g) => g.rows.length);
    qlist.innerHTML = groups.map(({ k, rows }) => `<div class="qg"><div class="qh">${esc(k.key)}</div><div class="qrow">${rows.slice(0, text ? 60 : 24).map((x) => `<button class="chip" data-qi="${k.id}|${esc(x.v)}">${esc(x.label)}<small>${x.n}</small></button>`).join("")}${rows.length > (text ? 60 : 24) ? `<span class="qmore">ещё ${rows.length - (text ? 60 : 24)} — наберите</span>` : ""}</div></div>`).join("") || `<div class="qh">Ничего не подходит — Enter сделает это словом поиска.</div>`;
    qlist.hidden = false;
    for (const b of qlist.querySelectorAll<HTMLElement>("[data-qi]")) b.onmousedown = (e) => {
      e.preventDefault();
      const [id, ...v] = b.dataset.qi!.split("|");
      pick(id!, v.join("|"));
      q.value = "";
      query = "";
      drawGrid();
      openList();
    };
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") qlist.hidden = true; });

  function drawGrid(): void {
    remember();
    drawShelves([...mine(), ...built()]);
    drawCells();
  }

  function drawCells(): void {
    const pool = [...mine(), ...built()];
    const list = pool.filter((s) => passes(s));
    root.querySelector<HTMLElement>("[data-count]")!.textContent = `Картинок: ${list.length} из ${pool.length} (своих ${own.length})`;
    const s0 = root.querySelector<HTMLElement>("[data-said]")!;
    s0.textContent = said;
    s0.classList.toggle("bad", bad);
    grid.innerHTML = list.map((s) => {
      const src = srcOf(s, palette, later);
      const fmt = keyOf("gf").of(s)[0] ?? "";
      return `<button class="cell${s.own ? " own" : ""}" data-sprite="${esc(s.key)}">${src ? `<img src="${esc(src)}" alt="">` : `<div class="wait">…</div>`}<b>${esc(s.name)}</b><i>${KIND_ONE[s.slot]}${s.side ? ` · ${SIDE_NAMES[s.side] ?? s.side}` : ""} · ${s.own ? ORIGIN_NAMES[s.own.origin] : "встроенный"}</i><i class="fmt">${fmt.toUpperCase()}${paints(s) ? "" : `${fmt ? " · " : ""}не красится`}</i></button>`;
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
  /**
   * Рисунок SVG текстом — если он есть: свой SVG, файл встроенной детали, рисунок кода. Колоду (кусок карты с
   * прозрачной бумагой) своими красками печёт пекарь стола — `paintPart`.
   */
  const svgOf = (s: Shown): Promise<string | null> => {
    const p = s.built ? PARTS.find((x) => x.id === s.built!.part) : undefined;
    if (p?.art.kind === "draw") return Promise.resolve(drawArt(p.art.art, s.built!.view) || null);
    const url = s.own ? (s.own.ext === "svg" ? `${HOST}/table/lib/${s.own.id}.svg?v=${bust.get(s.own.id) ?? 0}` : null)
      : p?.art.kind === "file" ? `${HOST}/table/skins/${p.art.dir}/${s.built!.view}-${p.slot}.svg` : null;
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

  /** Стрелки осей фигуры в осях картинки: из середины, в объёме — крутятся вместе с картинкой. */
  function axesHtml(a: { front: V3; up: V3; right: V3 }): string {
    const L = 92;
    const one = (name: string, key: string, v: V3) => {
      const turn = v[2] > 0.5 ? "rotateY(-90deg)" : v[2] < -0.5 ? "rotateY(90deg)" : `rotateZ(${(Math.atan2(v[1], v[0]) * 180) / Math.PI}deg)`;
      return `<div class="ax ax-${key}" data-ax="${key}" style="transform:translate3d(110px,110px,2px) ${turn}"></div>`
        + `<span class="axl ax-${key}" style="transform:translate3d(${110 + v[0] * (L + 16)}px,${110 + v[1] * (L + 16)}px,${2 + v[2] * (L + 16)}px) translate(-50%,-50%)">${name}</span>`;
    };
    return one("перед", "front", a.front) + one("верх", "up", a.up) + one("право", "right", a.right);
  }

  /**
   * ГДЕ И КАК ЛЕЖИТ — всё, что известно о картинке, строками «что — значение»: запись и файл (где на сервере, по
   * какому адресу отдаётся, сколько весит, какой рисунок внутри), из чего сделана, и как стоит на фигуре (деталь,
   * сторона, оси, как повёрнута к камере, ракурсы, размер за столом, подстройка). Вес и рисунок дописываются, когда
   * файл пришёл.
   */
  const AXIS_WORDS: Record<string, string> = { "0,0,1": "к зрителю", "0,0,-1": "от зрителя", "1,0,0": "вправо", "-1,0,0": "влево", "0,-1,0": "вверх", "0,1,0": "вниз" };
  const FACING_WORDS: Record<string, string> = {
    camera: "всегда лицом в камеру, по углу меняется только рисунок",
    box: "настоящая коробка — видно до трёх граней сразу",
    view: "плоскость ровно по своему ракурсу, сверху — плашмя",
    tilt: "бумажный: лицом в камеру, по ширине сужается по углу к ракурсу",
  };
  function factsHtml(s: Shown): { html: string; url: string | null } {
    const row = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;
    const code = (t: string) => `<code>${esc(t)}</code>`;
    const where: string[] = [], how: string[] = [];
    let url: string | null = null, looks = "";
    const part = s.built ? PARTS.find((x) => x.id === s.built!.part) : undefined;
    if (s.own) {
      const o = s.own;
      url = `/table/lib/${o.id}.${o.ext}`;
      where.push(row("Запись", `${code(`table_sprites · ${o.id}`)} — база стола`));
      where.push(row("Файл", `${code(`server/data/sprite-lib/${o.id}.${o.ext}`)}`));
      where.push(row("Откуда", `${ORIGIN_NAMES[o.origin]} · ${new Date(o.at).toLocaleString("ru-RU")}`));
    } else if (part) {
      const v = s.built!.view, art = part.art;
      where.push(row("Запись", `${code(`server/src/table/skins.ts`)} → деталь ${code(part.id)}`));
      if (art.kind === "court") {
        const box = ART[art.card], cutBox = part.slot === "head" ? box?.head : box?.body;
        url = `/table/sprites/${art.card}.svg`;
        where.push(row("Файл", `${code(`server/table-client/sprites/${art.card}.svg`)} — вся карта`));
        where.push(row("Как сделана", `кусок карты ${code((cutBox ?? []).join(", "))} (x, y, ширина, высота в единицах рисунка карты)${part.slot === "head" && box?.oval ? ", обрезан овалом" : ""}; бумага вокруг — прозрачная${v === "back" ? "; спина — лицо, отражённое и затемнённое" : ""}`));
        if (box) looks = row("Лицо смотрит", box.looks < 0 ? "влево по картинке" : "вправо по картинке");
      } else if (art.kind === "file") {
        url = `/table/skins/${art.dir}/${part.mirror?.[v] ?? v}-${part.slot}.svg`;
        where.push(row("Файл", code(`server/table-client/skins/${art.dir}/${part.mirror?.[v] ?? v}-${part.slot}.svg`)));
      } else if (art.kind === "draw") {
        where.push(row("Файл", `нет — рисует функция ${code(`server/table-client/skinArt.ts`)}, рисунок ${code(art.art)}, ракурс ${code(v)}`));
      } else if (art.kind === "png") {
        url = `/table/sprites/${art.file}.png`;
        where.push(row("Файл", code(`server/table-client/sprites/${art.file}.png`)));
      }
    }
    if (url) where.push(row("Адрес", `<a href="${esc(HOST + url)}" target="_blank" rel="noopener">${esc(url)}</a>`));
    where.push(row("Вес и рисунок", `<span data-fact-file>${url || s.built?.art === "draw" ? "…" : "—"}</span>`));
    where.push(row("На экране", `<span data-fact-px>…</span>`));
    const ax = axesFor(s.side), w3 = (v: V3) => AXIS_WORDS[v.map((n) => Math.round(n)).join()] ?? v.join();
    how.push(row("Деталь · сторона", `${KIND_ONE[s.slot]} · ${s.side ? SIDE_NAMES[s.side] ?? s.side : "без стороны"}`));
    const around = /^a(\d+)$/.exec(s.side ?? "");
    how.push(row("Оси фигуры на картинке", around ? `ракурс по кругу: фигура повёрнута на ${around[1]}° от лица к зрителю, верх — вверх` : `перед — ${w3(ax.front)}, верх — ${w3(ax.up)}, право — ${w3(ax.right)}`));
    if (looks) how.push(looks);
    if (part) {
      const t = tuneOf(part.id);
      how.push(row("К камере", `${code(part.facing)} — ${FACING_WORDS[part.facing] ?? ""}`));
      how.push(row("Ракурсы детали", `нарисованы: ${part.views.map((x) => SIDE_NAMES[x] ?? x).join(", ")}${part.mirror && Object.keys(part.mirror).length ? `; отражением: ${Object.entries(part.mirror).map(([a, b]) => `${SIDE_NAMES[a] ?? a} ← ${SIDE_NAMES[b] ?? b}`).join(", ")}` : ""}`));
      how.push(row("Подстройка", `масштаб ×${t.scale}, сдвиг вправо ${t.dx} ед., вверх ${t.dy} ед.${part.slot === "body" ? `, плечи ${t.shoulder ?? "по умолчанию"}` : ""} — правится в «Деталях»`));
      how.push(row("Красится", part.recolor ? "да — три краски колоды меняет расцветка" : "нет"));
    } else {
      how.push(row("В деталях", "пока ни в одной — картинка ставится в «Деталях»"));
    }
    how.push(row("За столом", `<span data-fact-units>…</span>`));
    return { html: `<h3>Где лежит</h3><dl class="sp-facts">${where.join("")}</dl><h3>Как лежит на фигуре</h3><dl class="sp-facts">${how.join("")}</dl>`, url };
  }

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
    /** Слои поверх картинки — каждый включается сам: оси фигуры, клетка в единицу стола, размер за столом. */
    const layers = { axes: route("sax") !== "0", grid: route("sgr") === "1", size: route("ssz") !== "0" };
    /** Настройки страницы — в адрес: обновил страницу — тот же поворот, краски, фон. */
    const keep = () => put({ sax: layers.axes ? null : "0", sgr: layers.grid ? "1" : null, ssz: layers.size ? null : "0", sp: pal, sc: own3 ? own3.map((c) => c.slice(1)).join(",") : null, sbg: bg === "felt" ? null : bg, sz: zoom === 1 ? null : zoom, sf: flip, srx: Math.round(rx), sry: Math.round(ry) });
    let svg: string | null = null;
    const court = s.built?.art === "court";
    const paints3 = new Map<string, string | null>();
    const paintSrc = (): string | null => {
      if (own3 && svg) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/#b3221f/gi, own3[0]).replace(/#1d4f80/gi, own3[1]).replace(/#f2c14e/gi, own3[2]))}`;
      if (own3 && court) {
        const k = own3.join();
        if (paints3.has(k)) return paints3.get(k) ?? null;
        paints3.set(k, null);
        void paintPart(s.built!.part, s.built!.view, own3, PALETTES[pal]!.ink, HOST).then((src) => { paints3.set(k, src); if (current === s && own3?.join() === k) drawBig(); });
        return big.getAttribute("src");
      }
      return srcOf(s, pal, () => { if (current === s) drawBig(); });
    };
    const facts = factsHtml(s);
    pageBox.innerHTML = `<div class="sp-page" data-sprite-page="${esc(s.key)}">
      <div class="sp-top"><button class="chip" data-back>← Все спрайты</button>${s.own ? `<input data-name value="${esc(s.own.name)}" maxlength="40" aria-label="Имя">` : `<h2>${esc(s.name)}</h2>`}</div>
      <div class="bar sp-acts">${s.own
        ? `<button class="add" data-save>Сохранить</button><button class="chip" data-copy>Сохранить как новый</button><button class="chip" data-replace>Заменить файл</button><input type="file" data-replace-file accept=".svg,image/svg+xml,image/png" hidden><button class="chip drop" data-drop>Удалить</button>`
        : `<button class="add" data-copy>Сделать своей копией</button>`}</div>
      <div class="said" data-act-said>${s.own ? "«Сохранить» — имя, деталь, сторона, теги. «Как новый» — копия с нынешней покраской и отражением." : "Встроенную не изменить — копия ляжет в «Свои» с нынешней покраской и отражением."}</div>
      <div class="sp-stage bg-${bg}" data-stage3d><div class="sp-card" data-card><img data-big alt=""><div class="sp-box" data-box><div class="sp-cells" data-cells></div></div><div class="sp-axes" data-axes>${axesHtml(axesFor(s.side))}</div></div></div>
      <div class="bar">${(["axes", "grid", "size"] as const).map((k) => `<button class="chip${layers[k] ? " on" : ""}" data-layer="${k}" aria-pressed="${layers[k]}">${{ axes: "Оси", grid: "Клетка", size: "Размер" }[k]}</button>`).join("")}<span class="said" data-size></span></div>
      <div class="bar"><button class="chip" data-flip>Отразить</button><button class="chip" data-spin>Крутить само</button><button class="chip" data-reset>Сброс</button>
        <label class="num">Масштаб <input type="number" data-zoom min="0.3" max="4" step="0.1" value="${zoom}"></label></div>
      <div class="bar">${(["felt", "light", "check"] as const).map((k) => `<button class="chip${k === bg ? " on" : ""}" data-bg="${k}">${{ felt: "на сукне", light: "на светлом", check: "прозрачность" }[k]}</button>`).join("")}</div>
      <div data-facts>${facts.html}</div>
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
    const layerEls = { axes: pageBox.querySelector<HTMLElement>("[data-axes]")!, box: pageBox.querySelector<HTMLElement>("[data-box]")!, cells: pageBox.querySelector<HTMLElement>("[data-cells]")!, size: pageBox.querySelector<HTMLElement>("[data-size]")! };
    /** Клетка и размер — по нарисованному прямоугольнику картинки (она вписана в квадрат сцены). */
    const fit = () => {
      const nw = big.naturalWidth, nh = big.naturalHeight, S = card.clientWidth;
      if (!nw || !nh) return;
      const aspect = nh / nw, W = aspect <= 1 ? S : S / aspect, H = aspect <= 1 ? S * aspect : S;
      Object.assign(layerEls.box.style, { left: `${(S - W) / 2}px`, top: `${(S - H) / 2}px`, width: `${W}px`, height: `${H}px` });
      const u = unitSize(s.slot, aspect, s.built ? tuneOf(s.built.part).scale : 1);
      const cell = u ? W / u.w : W / 4;
      layerEls.cells.style.backgroundSize = `${cell}px ${u ? H / u.h : cell}px`;
      layerEls.size.textContent = layers.size ? (u ? `за столом ≈ ${u.w.toFixed(2)} × ${u.h.toFixed(2)} ед. (${KIND_ONE[s.slot]}), клетка — 1 ед.` : "у «другого» размера за столом нет — клетка на четверть ширины") : "";
      stage.dataset.units = u ? `${u.w.toFixed(2)}x${u.h.toFixed(2)}` : "";
      const px = pageBox.querySelector("[data-fact-px]"), un = pageBox.querySelector("[data-fact-units]");
      if (px) px.textContent = `${nw} × ${nh} точек${s.built ? " (испечено, с обводкой)" : ""}`;
      if (un) un.textContent = u ? `≈ ${u.w.toFixed(2)} × ${u.h.toFixed(2)} ед. стола (ширина ${KIND_ONE[s.slot]} — ${(u.w / (s.built ? tuneOf(s.built.part).scale : 1)).toFixed(2)} ед.)` : "у «другого» размера за столом нет";
    };
    const showLayers = () => {
      layerEls.axes.hidden = !layers.axes;
      layerEls.cells.hidden = !layers.grid;
      layerEls.box.classList.toggle("sized", layers.size);
      for (const b of pageBox.querySelectorAll<HTMLElement>("[data-layer]")) { const on = layers[b.dataset.layer as keyof typeof layers]; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
      fit();
    };
    big.onload = fit;
    // Вес и рисунок — из самого файла (рисунок кода — из текста, что вернула функция).
    const fileBox = pageBox.querySelector<HTMLElement>("[data-fact-file]")!;
    void (async () => {
      const bytes = facts.url ? await fetch(`${HOST}${facts.url}${s.own ? `?v=${bust.get(s.own.id) ?? 0}` : ""}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
        : s.built?.art === "draw" ? new TextEncoder().encode((await svgOf(s)) ?? "").buffer : null;
      if (!bytes || current !== s) { if (current === s) fileBox.textContent = "—"; return; }
      const size = bytes.byteLength, head = new Uint8Array(bytes.slice(0, 24));
      let drawing: string;
      if (head[0] === 0x89 && head[1] === 0x50) {
        const dv = new DataView(bytes);
        drawing = `PNG ${dv.getUint32(16)} × ${dv.getUint32(20)} точек`;
      } else {
        const root = /<svg\b[^>]*>/i.exec(new TextDecoder().decode(bytes))?.[0] ?? "";
        const vb = /viewBox="([^"]+)"/.exec(root)?.[1], w = /\swidth="([^"]+)"/.exec(root)?.[1], h = /\sheight="([^"]+)"/.exec(root)?.[1];
        drawing = `SVG, viewBox ${vb ?? "нет"}${w || h ? `, width ${w ?? "—"} height ${h ?? "—"}` : ""}`;
      }
      fileBox.textContent = `${size.toLocaleString("ru-RU")} байт · ${drawing}`;
    })();
    for (const b of pageBox.querySelectorAll<HTMLElement>("[data-layer]")) b.onclick = () => { const k = b.dataset.layer as keyof typeof layers; layers[k] = !layers[k]; showLayers(); keep(); };
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
    // СВОИ ЦВЕТА — у всего, что красится: у SVG (свои, файлы, код) — в самом рисунке, колоду печёт пекарь стола.
    const own3Box = pageBox.querySelector<HTMLElement>("[data-own3]")!, own3Said = pageBox.querySelector<HTMLElement>("[data-own3-said]")!;
    const inputs = [...pageBox.querySelectorAll<HTMLInputElement>("[data-c]")];
    for (const c of inputs) c.disabled = true;
    own3Said.textContent = "Смотрю рисунок…";
    void svgOf(s).then((t) => {
      svg = t;
      const can = !!t || (court && paints(s));
      for (const c of inputs) c.disabled = !can;
      own3Said.textContent = can ? "Красятся три цвета рисунка: основной, второй, акцент." : "Эта картинка не красится: PNG — какой нарисован.";
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
    showLayers();
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
