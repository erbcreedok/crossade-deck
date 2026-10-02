// СТРАНИЦА ХОЗЯИНА — вкладки:
//   «Спрайты» — сами картинки (`adminSprites.ts`) и заказ новых у agy (`spriteJobs.ts`);
//   «Детали»  — живая фигура (сцена профиля `skinStage.ts` или за столом `tableStage.ts`) и правки детали (`tunes.ts`):
//               величина, сдвиг, плечи, имя; видно сразу, «Сохранить» кладёт на стол, столы подхватывают сами (`tunesNet.ts`);
//   «Столы»   — прежний список комнат (в самой странице);
//   «Узлы»    — какие машины обслуживают Crossade и кто что делает (`adminNodes.ts`).
//
// Пускает стол, а не страница: она лишь приносит подпись Telegram или секрет стола из якоря ссылки (`#key=…`).

import { PALETTES } from "../src/table/dolls.js";
import { PARTS, SETS, SLOT_NAMES, partOf, type Parts, type Slot } from "../src/table/skins.js";
import { TUNE_LIMITS, cleanTune, partName, setTunes, tunes, type PartTune, type Tunes } from "../src/table/tunes.js";
import { HOST } from "./host.js";
import { mountSkinStage, type SkinStage } from "./skinStage.js";
import { mountTableStage, type TableStage } from "./tableStage.js";
import { pullTunes } from "./tunesNet.js";
import { mountSpriteGallery } from "./adminSprites.js";
import { mountDetails } from "./adminDetails.js";
import { mountNodes } from "./adminNodes.js";
import { go, onRoute, put, route, routeNum, routeOne } from "./adminRoute.js";

type TelegramApp = { initData?: string; ready?: () => void; expand?: () => void };
const tg = (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
const key = new URLSearchParams(location.hash.slice(1)).get("key") ?? "";
const auth: Record<string, string> = tg?.initData ? { "x-telegram-init-data": tg.initData } : key ? { "x-table-secret": key } : {};

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ВКЛАДКИ — и подвкладки «Спрайтов»: все картинки или заказ новых у agy. Какая открыта — в адресе (`adminRoute.ts`).
const TABS = [["tab", "pane", ["sprites", "details", "parts", "rooms", "nodes"]], ["sub", "subpane", ["gallery", "agy"]]] as const;
const showTabs = () => {
  for (const [btn, pane, all] of TABS) {
    const on = routeOne(btn, all, all[0]);
    for (const x of document.querySelectorAll<HTMLButtonElement>(`[data-${btn}]`)) x.classList.toggle("on", x.dataset[btn] === on);
    for (const p of document.querySelectorAll<HTMLElement>(`[data-${pane}]`)) p.hidden = p.dataset[pane] !== on;
  }
};
for (const [btn] of TABS) for (const b of document.querySelectorAll<HTMLButtonElement>(`[data-${btn}]`)) b.onclick = () => {
  put({ [btn]: b.dataset[btn] });
  showTabs();
  // Библиотека могла пополниться, пока были в «Спрайтах», — деталям свежий список картинок.
  if (b.dataset[btn] === "details") void details.refresh();
  if (b.dataset[btn] === "nodes") void nodes.refresh();
};
showTabs();
onRoute(showTabs);

const CSS = `
.sp { max-width: 980px; margin: 0 auto; padding: 12px 16px 40px; display: grid; gap: 14px; }
.sp .stage-col { position: sticky; top: var(--tabs-h, 52px); z-index: 3; background: var(--felt); padding-bottom: 6px; }
@media (min-width: 820px) { .sp { grid-template-columns: 420px 1fr; align-items: start; } .sp .stage-col { top: calc(var(--tabs-h, 52px) + 12px); } .sp .stage { height: 420px !important; } }
.sp .stage { height: 290px; background: #0f1f18; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.sp .btn { font: inherit; font-size: 12.5px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.sp .btn.on { background: var(--gold); color: #0b0704; border-color: var(--gold); }
.sp .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sp .chip { font: inherit; font-size: 13px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 8px; padding: 5px 9px; cursor: pointer; }
.sp .chip.on { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.sp .chip.tuned::after { content: " •"; color: var(--gold); }
.sp .pal { display: inline-flex; gap: 2px; padding: 5px 6px; }
.sp .pal i { width: 10px; height: 14px; border-radius: 2px; display: block; }
.sp h2 { font-size: 15px; margin: 14px 0 0; color: var(--dim); font-weight: 500; }
.sp .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.sp .field { display: grid; grid-template-columns: 1fr 110px; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--line); }
.sp .field:first-of-type { border-top: 0; }
.sp .field small { display: block; color: var(--dim); font-size: 12px; }
.sp input { font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; width: 100%; box-sizing: border-box; }
.sp input:focus-visible, .sp button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.sp .acts { display: flex; gap: 8px; margin-top: 12px; }
.sp .acts button { flex: 1; font: inherit; font-weight: 600; border-radius: 10px; padding: 10px; cursor: pointer; border: 1px solid var(--line); background: #22282a; color: var(--ink); }
.sp .acts .save { background: var(--gold); color: #0b0704; border-color: var(--gold); }
.sp .acts button:disabled { opacity: .45; cursor: default; }
.sp .said { min-height: 1.4em; font-size: 13px; color: var(--dim); margin-top: 8px; }
.sp .said.bad { color: var(--hurt); }
`;

/** Слоты, чьи части рисуются: руки — одна картинка на всех, её не правят. */
const EDITABLE: Slot[] = ["head", "hair", "body", "legs"];
const FIELDS: { k: keyof typeof TUNE_LIMITS; name: string; hint: string; step: number; def: (id: string) => number; only?: Slot }[] = [
  { k: "scale", name: "Величина", hint: "во сколько раз больше обычного", step: 0.05, def: () => 1 },
  { k: "dx", name: "Сдвиг вправо", hint: "единицы стола; минус — влево", step: 0.05, def: () => 0 },
  { k: "dy", name: "Сдвиг вверх", hint: "единицы стола; минус — вниз", step: 0.05, def: () => 0 },
  { k: "shoulder", name: "Линия плеч", hint: "доля высоты рисунка сверху", step: 0.01, def: (id) => (partOf(id)?.art.kind === "court" ? 0.12 : 0.18), only: "body" },
];

function partsTab(root: HTMLElement): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  // Выбор — из адреса (`adminRoute.ts`): деталь, на ком примерить, расцветка, сцена, камера стола, несохранённая правка.
  let partId = partOf(route("part") ?? "")?.id ?? PARTS.find((p) => p.slot === "head")!.id;
  let slot: Slot = partOf(partId)!.slot;
  let setId = SETS.some((s) => s.id === route("pset")) ? route("pset")! : "king";
  let palette = Math.max(0, Math.min(PALETTES.length - 1, Math.round(routeNum("pp", 0))));
  let cam = { yaw: routeNum("cy", 20), pitch: routeNum("cp", 38) };
  // Несохранённая правка из адреса — читается сразу: первая отрисовка перепишет адрес раньше, чем придут правки стола.
  let kept: PartTune | null = null;
  try { kept = cleanTune(JSON.parse(route("pd") ?? "null")); } catch { kept = null; }
  const remember = () => {
    if (kept) return;
    const d = cleanTune(draft);
    put({ part: partId, pset: setId, pp: palette || null, scene: scene === "table" ? "table" : null, pd: dirty() && d ? JSON.stringify(d) : null });
  };
  /** Что сохранено на столе — правка на экране сравнивается с этим. */
  let saved: Tunes = { parts: {}, at: 0 };
  let draft: PartTune = {};
  let stage: SkinStage | null = null;
  let table: TableStage | null = null;
  /** Какая сцена: фигура одна (как в профиле) или за столом на четырёх местах. */
  let scene: "figure" | "table" = routeOne("scene", ["figure", "table"], "figure");
  let said = "", bad = false;

  const figure = (): Parts => ({ ...(SETS.find((s) => s.id === setId) ?? SETS[0]!).parts, [slot]: partId });
  const look = () => ({ parts: figure(), palette, ink: PALETTES[palette]!.ink });
  /** Черновик — поверх сохранённого: сцена рисует то, что сейчас в полях. */
  const preview = () => {
    const parts = { ...saved.parts };
    const t = cleanTune(draft);
    if (t) parts[partId] = t;
    else delete parts[partId];
    setTunes({ parts, at: saved.at });
  };
  const dirty = () => JSON.stringify(cleanTune(draft)) !== JSON.stringify(cleanTune(saved.parts[partId] ?? {}));

  const render = () => {
    const parts = PARTS.filter((p) => p.slot === slot);
    root.innerHTML = `<div class="sp">
      <div class="stage-col">
        <div class="row scenes" style="margin:0 0 6px">${([["figure", "Фигура"], ["table", "За столом"]] as const).map(([k, n]) => `<button class="btn${scene === k ? " on" : ""}" data-scene="${k}">${n}</button>`).join("")}</div>
        <div class="stage" data-stage></div>
      </div>
      <div>
        <div class="row" style="margin-top:0">${EDITABLE.map((s) => `<button class="btn${s === slot ? " on" : ""}" data-slot="${s}">${SLOT_NAMES[s]}</button>`).join("")}</div>
        <div class="row">${parts.map((p) => `<button class="chip${p.id === partId ? " on" : ""}${saved.parts[p.id] ? " tuned" : ""}" data-part="${p.id}">${esc(partName(p.id))}</button>`).join("")}</div>
        <h2>${esc(partOf(partId)?.name ?? partId)} · <code>${esc(partId)}</code></h2>
        <div class="card" data-form>
          <div class="field"><label for="f-name">Имя<small>как видно в конструкторе</small></label><input id="f-name" data-f="name" maxlength="24" value="${esc(draft.name ?? "")}" placeholder="${esc(partOf(partId)?.name ?? "")}"></div>
          ${FIELDS.filter((f) => !f.only || f.only === slot).map((f) => `<div class="field"><label for="f-${f.k}">${f.name}<small>${f.hint}</small></label><input id="f-${f.k}" data-f="${f.k}" type="number" inputmode="decimal" step="${f.step}" min="${TUNE_LIMITS[f.k][0]}" max="${TUNE_LIMITS[f.k][1]}" value="${draft[f.k] ?? ""}" placeholder="${f.def(partId)}"></div>`).join("")}
          <div class="acts"><button data-reset>Как в каталоге</button><button class="save" data-save ${dirty() ? "" : "disabled"}>Сохранить</button></div>
          <div class="said${bad ? " bad" : ""}" data-said>${esc(said)}</div>
        </div>
        <h2>На ком примерить</h2>
        <div class="row">${SETS.map((s) => `<button class="chip${s.id === setId ? " on" : ""}" data-set="${s.id}">${esc(s.name)}</button>`).join("")}</div>
        <h2>Расцветка</h2>
        <div class="row">${PALETTES.map((p, k) => `<button class="chip pal${k === palette ? " on" : ""}" data-pal="${k}" title="${esc(p.name)}"><i style="background:${p.red}"></i><i style="background:${p.blue}"></i><i style="background:${p.gold}"></i></button>`).join("")}</div>
      </div>
    </div>`;
    const box = root.querySelector<HTMLElement>("[data-stage]")!;
    stage?.destroy();
    table?.destroy();
    stage = table = null;
    if (scene === "figure") stage = mountSkinStage(box, HOST, look());
    else table = mountTableStage(box, HOST, look(), { ...cam, onView: (yaw, pitch) => { cam = { yaw, pitch }; put({ cy: Math.round(yaw), cp: Math.round(pitch) }); } });
    wire();
    remember();
  };

  const pick = (id: string) => {
    partId = id;
    draft = { ...(saved.parts[id] ?? {}) };
    said = "";
    preview();
    render();
  };

  function wire(): void {
    for (const b of root.querySelectorAll<HTMLElement>("[data-slot]")) b.onclick = () => { slot = b.dataset.slot as Slot; pick(PARTS.find((p) => p.slot === slot)!.id); };
    for (const b of root.querySelectorAll<HTMLElement>("[data-part]")) b.onclick = () => pick(b.dataset.part!);
    for (const b of root.querySelectorAll<HTMLElement>("[data-scene]")) b.onclick = () => { scene = b.dataset.scene as typeof scene; render(); };
    for (const b of root.querySelectorAll<HTMLElement>("[data-set]")) b.onclick = () => { setId = b.dataset.set!; render(); };
    for (const b of root.querySelectorAll<HTMLElement>("[data-pal]")) b.onclick = () => { palette = Number(b.dataset.pal); render(); };
    const save = root.querySelector<HTMLButtonElement>("[data-save]")!;
    for (const input of root.querySelectorAll<HTMLInputElement>("[data-f]")) {
      input.oninput = () => {
        const k = input.dataset.f as keyof PartTune;
        const v = input.value.trim();
        if (k === "name") { if (v) draft.name = v; else delete draft.name; }
        else if (v === "" || !Number.isFinite(Number(v))) delete draft[k];
        else draft[k] = Number(v);
        preview();
        table?.draw();
        save.disabled = !dirty();
        remember();
      };
    }
    root.querySelector<HTMLElement>("[data-reset]")!.onclick = () => { draft = {}; preview(); render(); };
    save.onclick = async () => {
      save.disabled = true;
      const res = await fetch(`${HOST}/table/admin/tunes/${encodeURIComponent(partId)}`, { method: "PUT", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(cleanTune(draft) ?? {}) }).catch(() => null);
      if (res?.ok) {
        saved = (await res.json()) as Tunes;
        setTunes(saved);
        draft = { ...(saved.parts[partId] ?? {}) };
        said = "Сохранено — столы подхватят за 15 секунд.";
        bad = false;
      } else {
        said = res?.status === 403 ? "Стол не узнал хозяина — открой страницу из бота или по ссылке с ключом." : `Не сохранилось (${res?.status ?? "нет связи"}).`;
        bad = true;
      }
      render();
    };
  }

  void pullTunes().then(() => {
    saved = tunes();
    // Несохранённая правка из адреса — поверх сохранённой: обновил страницу посреди подкрутки — она на месте.
    draft = kept ?? { ...(saved.parts[partId] ?? {}) };
    kept = null;
    preview();
    render();
  });
  render();
}

tg?.ready?.();
tg?.expand?.();
// Сцена прилипает под вкладками — их высота в Telegram больше на отступ под его шапку.
const tabs = document.querySelector<HTMLElement>("[data-tabs]");
if (tabs) new ResizeObserver(() => document.documentElement.style.setProperty("--tabs-h", `${tabs.offsetHeight}px`)).observe(tabs);
partsTab(document.querySelector<HTMLElement>('[data-pane="parts"]')!);
const gallery = mountSpriteGallery(document.querySelector<HTMLElement>('[data-subpane="gallery"]')!, auth);
const nodes = mountNodes(document.querySelector<HTMLElement>('[data-pane="nodes"]')!, auth);
const details = mountDetails(document.querySelector<HTMLElement>('[data-pane="details"]')!, auth, (d) => agy.prefill(d));

// ВКЛАДКА «agy» — заказы спрайтов (`spriteJobs.ts`): форма, как у `/sprite` в чате, и список заказов с ходом работы,
// листом и кнопками «В каталог», «Другую», «По ней — ещё часть», «Удалить».

interface JobView {
  job: string;
  id: string;
  slot: "head" | "hair" | "body" | "legs";
  sides: "1" | "2" | "4" | "6";
  brief: string;
  name?: string;
  like?: string;
  keep?: string;
  views: string[];
  at: number;
  lib?: string[];
  /** Для какой детали: принятые стороны встанут в её пустые ракурсы. */
  detail?: string;
  state: "running" | "good" | "bad" | "broken";
  out: string;
  sheet: boolean;
}

const AGY_CSS = `
.agy { max-width: 720px; margin: 0 auto; padding: 12px 16px 40px; }
.agy .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; }
.agy label { display: block; font-size: 13px; color: var(--dim); margin: 10px 0 4px; }
.agy label:first-child { margin-top: 0; }
.agy input, .agy textarea, .agy select { font: inherit; font-size: 15px; color: var(--ink); background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; width: 100%; box-sizing: border-box; }
.agy textarea { min-height: 88px; resize: vertical; }
.agy .row { display: flex; flex-wrap: wrap; gap: 6px; }
.agy .chip { font: inherit; font-size: 13.5px; color: var(--ink); background: #22282a; border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px; cursor: pointer; }
.agy .chip.on { background: var(--gold); color: #0b0704; border-color: var(--gold); font-weight: 600; }
.agy .go { margin-top: 12px; width: 100%; font: inherit; font-weight: 600; border-radius: 10px; padding: 11px; cursor: pointer; background: var(--gold); color: #0b0704; border: 1px solid var(--gold); }
.agy .go:disabled { opacity: .45; }
.agy .said { min-height: 1.3em; font-size: 13px; color: var(--dim); margin-top: 8px; }
.agy .said.bad { color: var(--hurt); }
.agy .job { cursor: pointer; }
.agy .job .top { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.agy .job .what { font-weight: 600; }
.agy .job .when { font-size: 12px; color: var(--dim); font-family: ui-monospace, Menlo, monospace; }
.agy .job .brief { font-size: 13.5px; color: var(--dim); margin-top: 4px; }
.agy .badge { font-size: 12px; border-radius: 999px; padding: 1px 8px; border: 1px solid var(--line); }
.agy .badge.running { color: var(--gold); border-color: var(--gold); }
.agy .badge.good { color: var(--live); border-color: var(--live); }
.agy .badge.bad, .agy .badge.broken { color: var(--hurt); border-color: var(--hurt); }
.agy .badge.part { color: #0b0704; background: var(--live); border-color: var(--live); }
.agy pre { white-space: pre-wrap; word-break: break-word; font: 12px/1.45 ui-monospace, Menlo, monospace; background: #0f1213; border: 1px solid var(--line); border-radius: 8px; padding: 8px; max-height: 280px; overflow: auto; margin: 10px 0 0; }
.agy .sheet { width: 100%; border-radius: 8px; margin-top: 10px; display: block; }
.agy .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.agy .acts button { font: inherit; font-size: 13.5px; border-radius: 8px; padding: 7px 11px; cursor: pointer; border: 1px solid var(--line); background: #22282a; color: var(--ink); }
.agy .acts .main { background: var(--gold); color: #0b0704; border-color: var(--gold); font-weight: 600; }
.agy button:focus-visible, .agy input:focus-visible, .agy textarea:focus-visible, .agy select:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
`;

const JOB_SLOTS = [["head", "Голова"], ["hair", "Шапка / причёска"], ["body", "Тело"], ["legs", "Ноги"]] as const;
const LOOKS = [["2", "2D — лицо и спина"], ["6", "3D — 6 сторон"], ["1", "1 сторона"], ["4", "4 — без верха и низа"]] as const;
const STATE_SAID: Record<JobView["state"], string> = { running: "рисует…", good: "годно", bad: "не годно", broken: "оборвался" };

function agyTab(root: HTMLElement): { prefill(d: { id: string; name: string }): void } {
  const style = document.createElement("style");
  style.textContent = AGY_CSS;
  document.head.append(style);
  const form = { id: "", slot: "head" as JobView["slot"], sides: "6" as JobView["sides"], brief: "", name: "", like: "", keep: "", detail: "", detailName: "" };
  // НЕДОПИСАННЫЙ ЗАКАЗ — в памяти этого браузера: обновил страницу — бриф на месте. Раскрытый заказ — в адресе.
  const DRAFT = "crossade.admin.agyDraft";
  try { Object.assign(form, JSON.parse(localStorage.getItem(DRAFT) ?? "{}") as Partial<typeof form>); } catch { /* нет памяти — пустая форма */ }
  const keepDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify(form)); } catch { /* нет памяти */ } };
  let photo: File | null = null;
  let jobs: JobView[] = [];
  let like: string[] = [];
  let open: JobView | null = null;
  let sheetUrl = "";
  let said = "", bad = false, busy = false;

  const api = (path: string, init: RequestInit = {}) => fetch(`${HOST}/table/admin/sprites${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });

  const jobHtml = (j: JobView) => {
    const badge = j.lib?.length ? `<span class="badge part">в библиотеке</span>` : `<span class="badge ${j.state}">${STATE_SAID[j.state]}</span>`;
    const when = new Date(j.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const more = open?.job === j.job
      ? `<pre data-log>${esc(open.out || "пока тихо…")}</pre>`
        + (sheetUrl ? `<img class="sheet" src="${sheetUrl}" alt="лист ${esc(j.id)}">` : "")
        + `<div class="acts">`
        + (j.state === "good" && !j.lib?.length ? `<button class="main" data-accept="${j.job}">В библиотеку</button>` : "")
        + (j.state !== "running" ? `<button data-again="${j.job}">Другую</button>` : "")
        + (j.state === "good" ? `<button data-based="${j.job}">По ней — ещё часть</button>` : "")
        + `<button data-drop="${j.job}">${j.state === "running" ? "Остановить и удалить" : "Удалить"}</button>`
        + `</div>`
      : "";
    return `<div class="card job" data-job="${j.job}"><div class="top"><span class="what">${esc(j.name ?? j.id)} · ${esc(JOB_SLOTS.find(([s]) => s === j.slot)![1])}</span>${badge}<span class="when">${when} · ${j.views.length} стор.${j.detail ? " · в деталь" : ""}</span></div><div class="brief">${esc(j.brief)}</div>${more}</div>`;
  };

  root.innerHTML = `<div class="agy"><div data-form-box></div><div data-jobs></div></div>`;
  const formBox = root.querySelector<HTMLElement>("[data-form-box]")!, jobsBox = root.querySelector<HTMLElement>("[data-jobs]")!;
  /** Форма и список рисуются порознь: список обновляется сам, пока agy рисует, — набранный бриф не сбивается. */
  const render = () => { drawForm(); drawJobs(); };
  const drawForm = () => {
    formBox.innerHTML = `
      <div class="card" data-order>
        ${form.detail ? `<div class="said" data-for-detail style="margin:0 0 8px">Для детали «${esc(form.detailName || form.detail)}» — нарисованное встанет в её пустые ракурсы. <button class="chip" data-unlink>не для детали</button></div>` : ""}
        <label>Как рисовать</label><div class="row">${JOB_SLOTS.map(([s, n]) => `<button class="chip${form.slot === s ? " on" : ""}" data-slot="${s}">${n}</button>`).join("")}</div>
        <label>Вид</label><div class="row">${LOOKS.map(([k, n]) => `<button class="chip${form.sides === k ? " on" : ""}" data-sides="${k}">${n}</button>`).join("")}</div>
        <label for="a-brief">Что нарисовать</label><textarea id="a-brief" data-a="brief" placeholder="пират в треуголке, с повязкой на глазу">${esc(form.brief)}</textarea>
        <label for="a-id">Папка (латиница)</label><input id="a-id" data-a="id" value="${esc(form.id)}" placeholder="pirate" autocapitalize="off" autocomplete="off">
        <label for="a-name">Имя в конструкторе</label><input id="a-name" data-a="name" value="${esc(form.name)}" placeholder="как папка" maxlength="24">
        <label for="a-like">На основе готовой части</label><select id="a-like" data-a="like"><option value="">— с нуля —</option>${like.map((d) => `<option${d === form.like ? " selected" : ""}>${esc(d)}</option>`).join("")}</select>
        <label for="a-photo">Фото-референс</label><input id="a-photo" type="file" accept="image/*" data-photo>
        <label for="a-keep">Свои цвета, не перекрашиваются</label><input id="a-keep" data-a="keep" value="${esc(form.keep)}" placeholder="#c98a4b, #6b4a2b" autocapitalize="off">
        <button class="go" data-go ${busy ? "disabled" : ""}>Заказать agy</button>
        <div class="said${bad ? " bad" : ""}">${esc(said)}</div>
      </div>`;
    wireForm();
  };
  const drawJobs = () => {
    jobsBox.innerHTML = jobs.length ? jobs.map(jobHtml).join("") : `<div class="said">Заказов пока нет.</div>`;
    wireJobs();
    const log = jobsBox.querySelector<HTMLElement>("[data-log]");
    if (log) log.scrollTop = log.scrollHeight;
  };

  const refresh = async () => {
    const res = await api("").catch(() => null);
    if (!res?.ok) { said = res?.status === 403 ? "Стол не узнал хозяина — открой страницу из бота или по ссылке с ключом." : "Стол не отвечает."; bad = true; drawForm(); return; }
    const was = like.join();
    ({ jobs, like } = (await res.json()) as { jobs: JobView[]; like: string[] });
    if (open) await openJob(open.job, false);
    if (like.join() !== was) drawForm();
    drawJobs();
  };

  async function openJob(job: string, draw = true): Promise<void> {
    const res = await api(`/${job}`).catch(() => null);
    if (!res?.ok) { open = null; put({ job: null }); return; }
    const was = open;
    open = (await res.json()) as JobView;
    put({ job: open.job });
    if (open.sheet && (!sheetUrl || was?.job !== open.job)) {
      const png = await api(`/${job}/sheet.png`).catch(() => null);
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
      sheetUrl = png?.ok ? URL.createObjectURL(await png.blob()) : "";
    } else if (!open.sheet) sheetUrl = "";
    if (draw) drawJobs();
  }

  function wireForm(): void {
    for (const b of root.querySelectorAll<HTMLElement>("[data-slot]")) b.onclick = () => { form.slot = b.dataset.slot as JobView["slot"]; keepDraft(); render(); };
    root.querySelector<HTMLElement>("[data-unlink]")?.addEventListener("click", () => { form.detail = form.detailName = ""; keepDraft(); drawForm(); });
    for (const b of root.querySelectorAll<HTMLElement>("[data-sides]")) b.onclick = () => { form.sides = b.dataset.sides as JobView["sides"]; keepDraft(); render(); };
    for (const el of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-a]")) el.oninput = el.onchange = () => { (form as Record<string, string>)[el.dataset.a!] = el.value; keepDraft(); };
    const file = root.querySelector<HTMLInputElement>("[data-photo]")!;
    file.onchange = () => { photo = file.files?.[0] ?? null; };
    root.querySelector<HTMLElement>("[data-go]")!.onclick = async () => {
      if (!/^[a-z0-9-]+$/.test(form.id) || !form.brief.trim()) { said = "Нужны папка латиницей (a-z, 0-9, -) и что нарисовать."; bad = true; return render(); }
      busy = true; said = "Отправляю…"; bad = false; render();
      let photoName: string | undefined;
      if (photo) {
        const up = await api("/photo", { method: "POST", headers: { "content-type": photo.type || "image/jpeg" }, body: photo }).catch(() => null);
        if (!up?.ok) { busy = false; said = "Фото не загрузилось."; bad = true; return render(); }
        photoName = ((await up.json()) as { photo: string }).photo;
      }
      const body = { id: form.id, slot: form.slot, sides: form.sides, brief: form.brief, ...(form.name ? { name: form.name } : {}), ...(form.like ? { like: form.like } : {}), ...(form.keep ? { keep: form.keep } : {}), ...(photoName ? { photo: photoName } : {}), ...(form.detail ? { detail: form.detail } : {}) };
      const res = await api("", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      busy = false;
      if (res?.ok) {
        const job = (await res.json()) as JobView;
        said = `agy рисует «${job.id}» — это минуты, до получаса. Ход виден в заказе ниже.`;
        bad = false;
        photo = null;
        form.brief = "";
        form.detail = form.detailName = "";
        keepDraft();
        await refresh();
        await openJob(job.job);
      } else { said = `Не принято (${res?.status ?? "нет связи"}).`; bad = true; render(); }
    };
  }

  function wireJobs(): void {
    for (const card of root.querySelectorAll<HTMLElement>("[data-job]")) {
      card.onclick = (e) => {
        if ((e.target as Element).closest("button, pre, img")) return;
        if (open?.job === card.dataset.job) { open = null; put({ job: null }); drawJobs(); } else void openJob(card.dataset.job!);
      };
    }
    const pick = (job: string) => jobs.find((j) => j.job === job)!;
    for (const b of root.querySelectorAll<HTMLElement>("[data-accept]")) b.onclick = async () => {
      const res = await api(`/${b.dataset.accept}/accept`, { method: "POST" }).catch(() => null);
      const got = res?.ok ? ((await res.json()) as { detail?: string }) : null;
      said = !res?.ok ? `Не принято (${res?.status ?? "нет связи"}).` : got?.detail ? "Каждая сторона — картинкой в библиотеке и в пустом ракурсе детали." : "Каждая сторона — картинкой в библиотеке («Все спрайты»). Какой ракурс какой детали — в «Деталях».";
      bad = !res?.ok;
      await refresh();
      gallery.refresh();
      await details.refresh();
      // Заказ был для детали — сразу её страница, с нарисованным в ракурсах.
      if (got?.detail) { go({ tab: "details", detail: got.detail, dv: "front", dd: null }); showTabs(); await details.refresh(); return; }
      drawForm();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    for (const b of root.querySelectorAll<HTMLElement>("[data-again]")) b.onclick = () => {
      const j = pick(b.dataset.again!);
      Object.assign(form, { id: j.id.replace(/-\d+$/, ""), slot: j.slot, sides: j.sides, brief: j.brief, name: j.name ?? "", like: j.like ?? "", keep: j.keep ?? "", detail: j.detail ?? "", detailName: "" });
      said = "Та же заявка — поправь бриф, если нужно, и закажи: ляжет в новую папку, прежняя останется.";
      bad = false;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    for (const b of root.querySelectorAll<HTMLElement>("[data-based]")) b.onclick = () => {
      const j = pick(b.dataset.based!);
      Object.assign(form, { id: j.id, slot: j.slot === "head" ? "body" : "head", sides: j.sides, brief: "", name: j.name ?? "", like: j.id, keep: j.keep ?? "" });
      said = `Основа — «${j.id}». Выбери часть и опиши её.`;
      bad = false;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    for (const b of root.querySelectorAll<HTMLElement>("[data-drop]")) b.onclick = async () => {
      if (!confirm("Удалить эту попытку и её рисунки?")) return;
      await api(`/${b.dataset.drop}`, { method: "DELETE" }).catch(() => null);
      if (open?.job === b.dataset.drop) open = null;
      await refresh();
    };
  }

  // Пока что-то рисуется — список и открытый заказ обновляются сами.
  setInterval(() => {
    if (root.hidden || root.closest<HTMLElement>("[data-pane]")?.hidden || busy) return;
    if (jobs.some((j) => j.state === "running") || open?.state === "running") void refresh();
  }, 4_000);
  render();
  const asked = route("job");
  void refresh().then(() => (asked && !open ? openJob(asked) : undefined));
  return {
    /** Заказ для детали: форма помнит деталь, имя — её; открыта вкладка заказа. */
    prefill(d) {
      Object.assign(form, { detail: d.id, detailName: d.name, name: d.name.slice(0, 24) });
      said = ""; bad = false;
      keepDraft();
      go({ tab: "sprites", sub: "agy", job: null });
      showTabs();
      drawForm();
      window.scrollTo({ top: 0 });
    },
  };
}

const agy = agyTab(document.querySelector<HTMLElement>("[data-agy]")!);
