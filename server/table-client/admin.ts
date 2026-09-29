// СТРАНИЦА ХОЗЯИНА — вкладки. «Спрайты»: живая фигура (та же сцена, что в профиле, `skinStage.ts`) и правки части
// (`tunes.ts`) — величина, сдвиг, плечи, имя. Правка видна на сцене сразу, «Сохранить» кладёт её на стол, и столы
// подхватывают её сами (`tunesNet.ts`). «Столы» — прежний список комнат (в самой странице).
//
// Пускает стол, а не страница: она лишь приносит подпись Telegram или секрет стола из якоря ссылки (`#key=…`).

import { PALETTES } from "../src/table/dolls.js";
import { PARTS, SETS, SLOT_NAMES, partOf, type Parts, type Slot } from "../src/table/skins.js";
import { TUNE_LIMITS, cleanTune, partName, setTunes, tunes, type PartTune, type Tunes } from "../src/table/tunes.js";
import { HOST } from "./host.js";
import { mountSkinStage, type SkinStage } from "./skinStage.js";
import { pullTunes } from "./tunesNet.js";

type TelegramApp = { initData?: string; ready?: () => void; expand?: () => void };
const tg = (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
const key = new URLSearchParams(location.hash.slice(1)).get("key") ?? "";
const auth: Record<string, string> = tg?.initData ? { "x-telegram-init-data": tg.initData } : key ? { "x-table-secret": key } : {};

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ВКЛАДКИ
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
  b.onclick = () => {
    for (const x of document.querySelectorAll<HTMLButtonElement>("[data-tab]")) x.classList.toggle("on", x === b);
    for (const pane of document.querySelectorAll<HTMLElement>("[data-pane]")) pane.hidden = pane.dataset.pane !== b.dataset.tab;
  };
}

const CSS = `
.sp { max-width: 980px; margin: 0 auto; padding: 12px 16px 40px; display: grid; gap: 14px; }
.sp .stage-col { position: sticky; top: var(--tabs-h, 52px); z-index: 3; background: var(--felt); padding-bottom: 6px; }
@media (min-width: 820px) { .sp { grid-template-columns: 420px 1fr; align-items: start; } .sp .stage-col { top: calc(var(--tabs-h, 52px) + 12px); } .sp .stage { height: 420px !important; } }
.sp .stage { height: 250px; background: #0f1f18; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
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

function spritesTab(root: HTMLElement): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  let slot: Slot = "head";
  let partId = PARTS.find((p) => p.slot === slot)!.id;
  let setId = "king";
  let palette = 0;
  /** Что сохранено на столе — правка на экране сравнивается с этим. */
  let saved: Tunes = { parts: {}, at: 0 };
  let draft: PartTune = {};
  let stage: SkinStage | null = null;
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
    stage = mountSkinStage(box, HOST, look());
    wire();
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
        save.disabled = !dirty();
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
    draft = { ...(saved.parts[partId] ?? {}) };
    render();
  });
  render();
}

tg?.ready?.();
tg?.expand?.();
// Сцена прилипает под вкладками — их высота в Telegram больше на отступ под его шапку.
const tabs = document.querySelector<HTMLElement>("[data-tabs]");
if (tabs) new ResizeObserver(() => document.documentElement.style.setProperty("--tabs-h", `${tabs.offsetHeight}px`)).observe(tabs);
spritesTab(document.querySelector<HTMLElement>('[data-pane="sprites"]')!);
