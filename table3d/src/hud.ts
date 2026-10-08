// HUD ПЕСОЧНИЦЫ — HUD стола 2D (`server/table-client/screen.ts`) в том же виде, поверх сцены three.js. Что есть у стола
// отдельными вещами, берётся ими же: настройки (`settings.ts`), журнал (`journal.ts`), диалог (`talk.ts`), раскладка
// руки (`handGeom.ts`), значки (`glyphs.ts`), краски (`screenConst.ts`). Что у стола живёт внутри экрана — бар с
// секциями, ручка позы и меню руки, компас, поза тела, верхний ряд, индикатор стопки, окно стула с делами крупье,
// полоса лассо — перенесено оттуда же, теми же числами и видом; меняется только одно: вместо линзы 2D места на
// экране даёт сцена (`SceneApi`).
//
//   верх     выход из комнаты, имя комнаты, настройки, журнал;
//   низ      бар: «стул» (замок, скрыть, отклонять, навсегда, встать) и «лассо» (курсор, лассо, как нести, сторона);
//            над ним — своя рука раскладкой 2D, ручка позы на её правом верхнем углу (тянуть — поза, тап — меню руки:
//            по масти, по номиналу, перемешать, перевернуть, наоборот);
//   у руки   слева — поза тела и компас (тап — к своему стулу, тянуть вбок — вокруг стола), справа — диалог;
//   на столе индикатор стопки (сколько карт; тап — перемешать / по масти / перевернуть, тянуть — перенести стопку);
//            тап по голове — окно стула: флаги, «не читать», у крупье — его дела.

import { DEAL_PRESETS, HOLD_MS_RANGE, MERGE_MS, SHAKE_KNOBS, TABLE_PILE, type Chair, type ChairFlag, type DealDir, type DealRule, type Face, type GatherSide, type PileGuard, type SeenCard, type Snapshot } from "../../server/src/table/contract.js";
import { fingerHtml } from "./finger.js";
import { allowed, may as mayDo } from "../../server/src/table/access.js";
import { SUITS } from "../../server/table-client/felt.js";
import { CAM, CAM_LABEL, CAM_MODES, PEEK } from "./camera.js";
import { artUrl, readLook, writeLook } from "../../server/table-client/deckArt.js";
import { BAR_LOOK, BAR, CUE_HAPTIC, FLIGHT_MS, MENTION_INK, MINE_MS, SHUFFLE_CARDS, SHUFFLE_MS, SHUFFLE_STAGGER_MS, SHUFFLE_TICK_MS, T, TABLE_BUILD } from "../../server/table-client/screenConst.js";
import { cuesBetween, spots as cueSpots, type CueAt, type Spot as CueSpot } from "../../server/src/table/cues.js";
import { GLYPH, RIGHTS, SUBS, type BarKey, type GrabMode, type Section } from "../../server/table-client/glyphs.js";
import { barHeightU, blendOf, handPlan, handWideOf, hudUnitOf, snapPose, type PoseBlend } from "../../server/table-client/handGeom.js";
import { journal } from "../../server/table-client/journal.js";
import { mountSettings } from "../../server/table-client/settings.js";
import { tableSound } from "../../server/table-client/sound.js";
import { tableHaptic } from "../../server/table-client/haptic.js";
import { FEEL_LIVE, FEEL_OLD, tableFeel, type FeelKind } from "../../server/table-client/feel.js";
import { tableMotion } from "../../server/table-client/motion.js";
import { mountPileTap } from "./pileDrag.js";
import { mountTalk, type WordAnchor } from "../../server/table-client/talk.js";
import { HOST } from "../../server/table-client/host.js";
import type { TableStore } from "../../server/table-client/store.js";
import type { Geom } from "../../server/table-client/screenConst.js";
import type { SceneApi } from "./scene.js";
import { mountPanels } from "./panel.js";
import { pixelIcon } from "./pixel.js";
import { CHROME_CSS, DOCK_PX, SHEET_GAP, SHEET_PX, TABS } from "./chrome.js";
import { mountReplayBar, REPLAY_CSS } from "./replayBar.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Секции бара — как у стола: поза, порядок и диалог живут не в баре. */
const BAR_SECTIONS: Section[] = ["chair"];
const HAND_DOS: [string, string][] = [["suit", "По масти"], ["rank", "По номиналу"], ["shuffle", "Перемешать"], ["flip", "Перевернуть"], ["reverse", "Наоборот"]];
/** Держать стопку в пальце — «держу» чаще, чем истекает лок стола. */
const HOLD_MS = 1500;
const DOUBLE_TAP_MS = 350;
const TAP_PX = 8;
/** Сколько пикселей пальца на всю ось язычка: опустить и положить, сжать, веер ↔ ряд. */
/** Линии хода верхней ручки, доли высоты экрана (390×844): нести стопкой — под нижним краем зума, собираются — по низу кнопки «стоять/сидеть», положить — по центру чата и компаса. */
/** Линии хода ручки рисуются только для настройки: `?lines` в адресе стенда. */
const SHOW_LINES = new URLSearchParams(location.search).has("lines");
const LINES = { carry: 0.626, collect: 0.825, lay: 0.866 };
const TAB_PX = { dead: 50, lay: 190, width: 220, curl: 160, carry: 150, pull: 40, tapMs: 300 };
const RIM_LEFT = 28;
const plate = `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim}`;
const gold = `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo})`;
const TOP = "top:calc(12px + var(--safe-top))";

const CSS = `
@font-face { font-family: Tiny5; src: url(${HOST}/table/fonts/tiny5-cyrillic.woff2) format("woff2"); unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: Tiny5; src: url(${HOST}/table/fonts/tiny5-latin.woff2) format("woff2"); unicode-range: U+0000-00FF, U+2000-206F, U+2191, U+2193, U+2212; }
#hud { position: fixed; inset: 0; pointer-events: none; font: 400 13px Tiny5, monospace; color: ${T.ink}; }
#hud button, #hud [role=button], #hud [data-hand-tab], #hud [data-hand-menu], #hud [data-g=journal], #hud [data-g=tip], #hud [data-g=deck-tip], #hud [data-deal-panel], #hud [data-confirm], #hud [data-tip-card] { pointer-events: auto; }
#hud [data-tip-card], [data-panel] [data-tip-card] { touch-action: none; cursor: grab; }
#hud [data-tip-card][data-take="0"], [data-panel] [data-tip-card][data-take="0"] { touch-action: auto; cursor: not-allowed; }
[data-panel] { font: 400 13px Tiny5, monospace; color: ${T.ink}; user-select: none; -webkit-user-select: none; }
#panels { position: fixed; inset: 0; pointer-events: none; z-index: 5; }
#hud button { font: inherit; }
${CHROME_CSS}
${REPLAY_CSS}
`;

/**
 * `dev` — ТОЛЬКО ДЛЯ РАЗРАБОТКИ, есть лишь у стенда: экранов на странице два (мой и Алии); `onSwitch` меняет их местами (управляю
 * другим), `peek` — окно рядом с видом глазами другого: только смотреть.
 * `screen` — коробка этого экрана: всё, что HUD кладёт поверх страницы (окна, настройки), лежит в ней, а не в общей странице.
 */
export function mountHud(root: HTMLElement, stage: HTMLElement, store: TableStore, scene: SceneApi, dev?: { label: string; onSwitch(): void; peek: { label: string; on(): boolean; onToggle(): void } }, screen: HTMLElement = document.body): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  /** Только то, что есть у этого экрана и больше нигде — как `local` у стола. */
  const local = {
    section: null as Section | null,
    confirmLeave: false,
    handMenu: false,
    /** Какой список открыт из сабменю руки: порядок (`sort`) или поза (`pose`). */
    handPop: null as null | "sort" | "pose",
    /** Ручка тянется за пальцем: её место на экране, пока её держат (левая идёт по горизонтали, верхняя — по вертикали), независимо от того, куда рука сдвигает охват. */
    /** Пока тянут верхнюю ручку: на каких линиях экрана рука ложится на стол и несётся стопкой. */
    grabLines: null as null | { lay: number | null; collect: number | null; carry: number },
    grabOff: null as null | { which: "top" | "left"; x: number; y: number; from?: "stack"; morph: number },
    journal: false,
    /** Открыто меню вида камеры (рейка справа). */
    viewMenu: false,
    hold: null as null | "height" | "seat",
    /** Язычок руки тянут. */
    gripDrag: false,
    /** Где по ширине экрана язычок, пока ширину руки тянут вбок; `null` — по центру. */
    gripX: null as number | null,
    /** Что сказало гиро при включении (датчик не разрешили) — строкой под полосой, пока не уйдёт. */
    gyroNote: "",
    deckTip: null as string | null,
    /** Палец или курсор сейчас в окне (стопки, чужого стула) — только тогда моя рука лежит на том, с чем вожусь. */
    handOn: false,
    deckCarry: null as string | null,
    deal: null as null | { rule: DealRule; n: number; all: boolean; seats: string[]; from: string | null; dir: DealDir },
    tip: null as string | null,
  };
  const muted = new Set<string>();
  const me = () => store.me.key;
  const myChair = (s: Snapshot = store.state): Chair | undefined => { const seat = s.people.find((p) => p.key === me())?.seat; return s.chairs.find((c) => c.id === seat); };

  // ——— вещи стола, взятые как есть ———
  let look = readLook();
  const sound = tableSound(), haptic = tableHaptic(), motion = tableMotion();
  let figuresOn = true;
  const settings = mountSettings(screen, {
    sound, haptic, motion, look,
    lookChanged: () => { writeLook(look); scene.setLook({ ...look }); draw(); },
    soundChanged: () => {},
    replay: { may: () => false, ask: () => {}, link: () => null },
    app: { may: () => false, ask: () => {}, link: () => null, open: () => {} },
    meters: { on: () => false, toggle: () => {} },
    record: { on: () => false, toggle: () => {} },
    view: { min: CAM.fov.view.min, max: CAM.fov.view.max, get: () => scene.baseFov(), set: (deg) => { scene.setBaseFov(deg); try { localStorage.setItem("t3d.fov", String(scene.baseFov())); } catch { /* без памяти — обзор на эту сессию */ } } },
    // DEV-ползунок размера людей — только на локальном адресе (localhost, домашняя сеть, .local), в остальном его нет.
    ...(/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|\[::1\]|.*\.local$)/.test(location.hostname) ? { dollSize: { min: 40, max: 140, get: () => Math.round(scene.dollScale() * 100), set: (pct: number) => { scene.setDollScale(pct / 100); try { localStorage.setItem("t3d.dollScale", String(scene.dollScale())); } catch { /* без памяти — на эту сессию */ } } } } : {}),
    cardSize: { min: 50, max: 200, get: () => Math.round(scene.handSize() * 100), set: (pct) => { scene.setHandSize(pct / 100); try { localStorage.setItem("t3d.handSize", String(scene.handSize())); } catch { /* без памяти — размер на эту сессию */ } } },
    neckViz: Object.fromEntries((["vignette", "gauge"] as const).map((k) => [k, { on: () => scene.neckViz(k), toggle: () => { scene.setNeckViz(k, !scene.neckViz(k)); try { localStorage.setItem(`t3d.${k}`, scene.neckViz(k) ? "1" : "0"); } catch { /* без памяти — на эту сессию */ } } }])) as never,
    figures: { on: () => figuresOn, toggle: () => { figuresOn = !figuresOn; scene.setFigures(figuresOn); } },
    merge: {
      may: () => store.state.rights.includes("pile.guard"),
      knobs: ([
        ["delayMs", "Задержка до реакции, мс", 0, 3000, 50, MERGE_MS.delay], ["glowMs", "Ровный свет, мс", 0, 3000, 50, MERGE_MS.glow], ["holdMs", "Мигание, мс", HOLD_MS_RANGE.min, HOLD_MS_RANGE.max, 50, MERGE_MS.blink], ["liftMs", "Подъём нижней вещи, мс", 0, 2000, 50, MERGE_MS.lift],
        ["shakeAmp", "Тряска: размах, px", SHAKE_KNOBS.shakeAmp.min, SHAKE_KNOBS.shakeAmp.max, 5, SHAKE_KNOBS.shakeAmp.def], ["shakeTurns", "Тряска: взмахов (0 — выкл.)", SHAKE_KNOBS.shakeTurns.min, SHAKE_KNOBS.shakeTurns.max, 1, SHAKE_KNOBS.shakeTurns.def],
        ["shakeMs", "Тряска: окно, мс", SHAKE_KNOBS.shakeMs.min, SHAKE_KNOBS.shakeMs.max, 50, SHAKE_KNOBS.shakeMs.def], ["nextTurns", "Следующая тряска: взмахов", SHAKE_KNOBS.nextTurns.min, SHAKE_KNOBS.nextTurns.max, 1, SHAKE_KNOBS.nextTurns.def],
        ["nextMs", "Следующая тряска: окно, мс", SHAKE_KNOBS.nextMs.min, SHAKE_KNOBS.nextMs.max, 100, SHAKE_KNOBS.nextMs.def], ["shakeG", "Телефон: порог встряхивания", SHAKE_KNOBS.shakeG.min, SHAKE_KNOBS.shakeG.max, 1, SHAKE_KNOBS.shakeG.def],
      ] as const).map(([key, label, min, max, step, def]) => ({ key, label, min, max, step, get: () => (store.state.pileRules?.[TABLE_PILE] as unknown as Record<string, number | undefined> | undefined)?.[key] ?? def, set: (value: number) => store.send({ t: "pileRule", pile: TABLE_PILE, rule: key, value }) })),
      modes: (["dropSides", "holdSides"] as const).map((key) => ({ key, label: key === "dropSides" ? "Другая сторона при отпускании" : "Другая сторона при удержании", options: [["refuse", "строго"], ["flip", "переворачивать"]] as [string, string][], get: () => store.state.pileRules?.[TABLE_PILE]?.[key] ?? "refuse", set: (value: string) => store.send({ t: "pileRule", pile: TABLE_PILE, rule: key, value }) })),
    },
    footer: () => `build ${TABLE_BUILD} · песочница 3D · three.js${scene.gyro.on() ? ` · ${scene.gyro.info()}` : ""}`,
    changed: () => draw(),
  });
  try { const saved = Number(localStorage.getItem("t3d.dollScale")); if (saved) scene.setDollScale(saved); } catch { /* без памяти — обычный размер */ }
  try { const saved = Number(localStorage.getItem("t3d.handSize")); if (saved) scene.setHandSize(saved); } catch { /* без памяти — обычный размер */ }
  try { const saved = Number(localStorage.getItem("t3d.fov")); if (saved) scene.setBaseFov(saved); } catch { /* без памяти — обзор по умолчанию */ }
  for (const k of ["vignette", "gauge"] as const) { try { if (localStorage.getItem(`t3d.${k}`) === "0") scene.setNeckViz(k, false); } catch { /* без памяти — включено */ } }
  // ——— ЗВУКИ И ВИБРАЦИИ: те же поводы, что у обычного стола (`cues.ts`) — что поменялось между двумя кадрами, там, где это на экране ———
  // Действия, что владелец уже перевёл на новые звуки («В игру» на странице звуков, `feelPreset.json`): играет `feel.ts`, прежний звук тех же поводов молчит, пока это движение озвучено им.
  // Нет в списке — всё как раньше.
  const feel = tableFeel(sound, haptic, { factory: true });
  const feelAt = new Map<FeelKind, number>();
  for (const k of FEEL_LIVE) { const spec = feel.preset[k]; for (const t of [spec.track, ...(spec.extra ?? []).map((v) => v.track)]) if (t) void sound.ensure(t); }
  scene.onFeel((e) => { if (!FEEL_LIVE.has(e.kind)) return; feelAt.set(e.kind, performance.now()); if (!e.announce) feel.play(e); });
  const feelCovers = (cue: string): boolean => [...FEEL_LIVE].some((k) => FEEL_OLD[k].cues.includes(cue) && performance.now() - (feelAt.get(k) ?? -Infinity) < 2000);
  let touchedAt = -Infinity;
  addEventListener("pointerdown", () => (touchedAt = performance.now()), { capture: true });
  addEventListener("pointerup", () => (touchedAt = performance.now()), { capture: true });
  const knownCue = new Map<string, CueSpot>();
  let prevCue: Snapshot = store.state;
  function soundCues(prev: Snapshot, next: Snapshot): void {
    const g = scene.glass(), own = performance.now() - touchedAt < MINE_MS, seat = next.people.find((p) => p.key === me())?.seat;
    const where = (at: CueAt): { x: number; y: number } | null => {
      if ("felt" in at) return scene.feltToScreen(at.felt.x, at.felt.y);
      if ("pile" in at) { const p = next.piles.find((x) => x.id === at.pile) ?? prev.piles.find((x) => x.id === at.pile); return p ? scene.feltToScreen(p.x, p.y) : null; }
      if (at.chair === seat) return { x: g.w / 2, y: g.h };
      const hand = scene.handOf(at.chair);
      return hand ? scene.feltToScreen(hand.x, hand.y) : null;
    };
    for (const [id, spot] of cueSpots(prev)) knownCue.set(id, spot);
    for (const cue of cuesBetween(prev, next, knownCue)) {
      // Мерж и шафл звучат, пока идёт их анимация.
      const cut = cue.kind === "merge" ? Math.max(60, FLIGHT_MS) : cue.kind === "shuffle" ? SHUFFLE_MS + (SHUFFLE_CARDS - 1) * SHUFFLE_STAGGER_MS : undefined;
      const p = where(cue.at);
      if (p && !feelCovers(cue.kind)) sound.play(cue.kind, (p.x - g.w / 2) / (g.w / 2), (p.y - g.h / 2) / (g.h / 2), own, cut);
      // Вибрация — только своё: моё действие или что-то в моей руке, на моём стуле.
      if (own || ("chair" in cue.at && cue.at.chair === seat)) {
        if (cue.kind === "shuffle") { for (let t = 0; t < (cut ?? 0); t += SHUFFLE_TICK_MS) window.setTimeout(() => haptic.buzz("light"), t); }
        else haptic.buzz(CUE_HAPTIC[cue.kind]);
      }
    }
  }
  store.onChange(() => { const next = store.state; if (next === prevCue) return; const prev = prevCue; prevCue = next; soundCues(prev, next); });
  // Вибрация на нажатие кнопок худа и на «взял карту».
  addEventListener("click", (e) => { if ((e.target as Element | null)?.closest?.("#hud button, #hud [role=button]")) haptic.buzz("light"); }, { capture: true });
  scene.onGrab(() => { if (!FEEL_LIVE.has("grab")) haptic.buzz("light"); });
  // Отказ стола — вибрация ошибки.
  store.onRefused(() => haptic.buzz("error"));
  const book = journal();
  store.onOps?.((ops) => { if (book.take(ops, store.state, store.now())) draw(); });
  const cardLabel = (face: Face | undefined): { label: string; ink: string } => {
    if (!face) return { label: "🂠", ink: MENTION_INK.back };
    const suit = face.suit as "s" | "h" | "d" | "c";
    return { label: `${face.rank}${SUITS[face.suit][0]}`, ink: suit === "h" || suit === "d" ? MENTION_INK.red : MENTION_INK.black };
  };
  const talk = mountTalk(stage, store, () => draw(), {
    who: (key) => { const p = store.state.people.find((one) => one.key === key); return p && { name: p.name, ink: p.ink }; },
    card: (id) => {
      const s = store.state, all = [...s.felt, ...s.piles.flatMap((p) => p.cards), ...s.chairs.flatMap((c) => c.hand)];
      return cardLabel(all.find((c) => c.id === id)?.face);
    },
    pick: (x, y) => { const hit = scene.pickAt(x, y); return hit?.t === "chair" ? null : hit; },
    hand: () => (myChair()?.hand ?? []).map((c) => c.id),
    muted: (key) => muted.has(key),
    stickerUrl: (by, id) => `${HOST}/table/stickers/${encodeURIComponent(by)}/${encodeURIComponent(id)}`,
    stickers: () => myStickers,
    hud: () => { const g = scene.glass(), wide = handWideOf(g); return { left: Math.round((g.w - wide) / 2), width: wide }; },
  });
  let myStickers: string[] = [];
  // Окна вещей — панели (`panel.ts`): свой слой поверх экрана и слой CSS3D сцены для тех, что на столе.
  const panelOverlay = document.createElement("div");
  panelOverlay.id = "panels";
  screen.append(panelOverlay);
  // Ползунок зума справа под кнопками рейки — только в виде «вокруг» (расстояние до стола). Вне перерисовки HUD, чтобы палец его не терял.
  const zoom = document.createElement("div");
  zoom.dataset.zoomSlider = "";
  zoom.className = "cp";
  zoom.style.cssText = "touch-action:none;cursor:ns-resize;display:none";
  zoom.innerHTML = '<span class="tt"></span><div class="track">' + Array.from({ length: 7 }, (_, k) => `<i class="seg" style="top:${((k + 1) / 8) * 100}%"></i>`).join("") + '<i class="fill"></i><i class="knob2" data-zoom-knob></i></div><span class="val"></span>';
  const zoomKnob = zoom.querySelector<HTMLElement>("[data-zoom-knob]")!, zoomFill = zoom.querySelector<HTMLElement>(".fill")!, zoomTrack = zoom.querySelector<HTMLElement>(".track")!;
  const zoomTitle = zoom.querySelector<HTMLElement>(".tt")!, zoomVal = zoom.querySelector<HTMLElement>(".val")!;
    const zoomSync = () => {
    const on = scene.camMode() === "orbit" && !local.section && !!myChair();
    if (zoom.style.display !== (on ? "block" : "none")) zoom.style.display = on ? "block" : "none";
    if (!on) return;
    const v = scene.orbitZoom();
    zoomKnob.style.bottom = `calc(${v * 100}% - 6px)`; zoomFill.style.height = `${v * 100}%`;
    zoomTitle.textContent = "Даль";
    zoomVal.textContent = `${Math.round(8 + (1 - v) * 22)} м`;
    zoom.style.top = "calc(var(--safe-top) + 103px + 3 * 68px)";
  };
  const zoomTo = (e: PointerEvent) => { const r = zoomTrack.getBoundingClientRect(), t = 1 - (e.clientY - r.top) / r.height; scene.setOrbitZoom(t); zoomSync(); };
  zoom.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); zoom.setPointerCapture(e.pointerId); zoomTo(e); });
  zoom.addEventListener("pointermove", (e) => { if (zoom.hasPointerCapture(e.pointerId)) zoomTo(e); });
  root.append(zoom);
  setInterval(zoomSync, 200);
  // ЗАЖАТЬ «Сидя/Стоя» — вместо рейки появляется ползунок высоты обзора; зажать «Пересесть» — ползунок посадки. Тот же палец тянет его вверх-вниз, отпустил — рейка вернулась.
  // Короткий тап — как обычно: «Сидя/Стоя» садит и ставит, «Пересесть» открывает вид сверху (там стул тянут и по кругу, и от стола).
  const hold = document.createElement("div");
  hold.dataset.zoomSlider = "";
  hold.dataset.holdSlider = "";
  hold.className = "cp";
  hold.style.cssText = "touch-action:none;cursor:ns-resize;display:none;top:calc(var(--safe-top) + 103px);height:230px";
  hold.innerHTML = zoom.innerHTML.replace("data-zoom-knob", "data-hold-knob");
  const holdKnob = hold.querySelector<HTMLElement>("[data-hold-knob]")!, holdFill = hold.querySelector<HTMLElement>(".fill")!, holdTrack = hold.querySelector<HTMLElement>(".track")!;
  let holdUntil = 0;
  /** Откуда палец взялся за ползунок и каким было значение: ползунок идёт на сдвиг пальца от точки хвата, а не прыгает под палец. */
  let holdRef: { y: number; v: number } | null = null;
  const holdSync = () => {
    if (!local.hold) return;
    const height = local.hold === "height", v = height ? scene.viewHeight() : scene.seat();
    holdKnob.style.bottom = `calc(${v * 100}% - 6px)`; holdFill.style.height = `${v * 100}%`;
    hold.querySelector<HTMLElement>(".tt")!.textContent = height ? "Высота" : "Посадка";
    hold.querySelector<HTMLElement>(".val")!.textContent = height ? `${scene.viewHeightUnits() >= 0 ? "+" : "−"}${Math.abs(scene.viewHeightUnits()).toFixed(1)}` : v > 0.995 ? "у стола" : `−${((1 - v) * 2.5).toFixed(1)}`;
  };
  const holdTo = (e: PointerEvent) => { if (!holdRef) return; const r = holdTrack.getBoundingClientRect(), t = Math.max(0, Math.min(1, holdRef.v + (holdRef.y - e.clientY) / r.height)); if (local.hold === "height") scene.setViewHeight(t); else scene.setSeat(t); holdSync(); };
  const holdEnd = (e: PointerEvent) => { if (!local.hold || !hold.hasPointerCapture(e.pointerId)) return; holdRef = null; local.hold = null; hold.style.display = "none"; holdUntil = performance.now() + 600; draw(); };
  hold.addEventListener("pointermove", (e) => { if (hold.hasPointerCapture(e.pointerId)) holdTo(e); });
  hold.addEventListener("pointerup", holdEnd);
  hold.addEventListener("pointercancel", holdEnd);
  root.append(hold);
  {
    let press: { id: number; x: number; y: number; cy: number; kind: "height" | "seat"; timer: number } | null = null;
    const cancel = () => { if (press) clearTimeout(press.timer); press = null; };
    root.addEventListener("pointerdown", (e) => {
      const b = (e.target as Element).closest?.("[data-stance-toggle], [data-reseat]");
      if (!b || scene.reseatOn() || local.hold) return;
      const kind = b.hasAttribute("data-stance-toggle") ? "height" : "seat", id = e.pointerId, x = e.clientX, y = e.clientY;
      cancel();
      press = { id, x, y, cy: y, kind, timer: window.setTimeout(() => {
        const cy = press ? press.cy : y;
        press = null;
        local.hold = kind; holdUntil = performance.now() + 60000;
        holdRef = { y: cy, v: kind === "height" ? scene.viewHeight() : scene.seat() };
        hold.style.display = "block"; holdSync();
        try { hold.setPointerCapture(id); } catch { /* палец уже ушёл */ }
        draw();
      }, 420) };
    });
    root.addEventListener("pointermove", (e) => { if (press && press.id === e.pointerId) { press.cy = e.clientY; if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14) cancel(); } });
    for (const t of ["pointerup", "pointercancel"]) root.addEventListener(t, (e) => { if (press && press.id === (e as PointerEvent).pointerId) cancel(); });
  }
  const panels = mountPanels(panelOverlay, { ...scene.panels, feltAt: scene.feltAt, glass: scene.glass }, () => draw());
  let shown: string[] = [];
  store.onStickers((ids) => { myStickers = ids; talk.refresh(); });

  // ——— где что на стекле — как у стола ———
  const glass = () => scene.glass();
  const hudUnit = () => hudUnitOf(glass());
  const geomNow = (): Geom | null => scene.handGeom();
  const barTopOf = (g: Geom | null) => g?.barTop ?? glass().h - scene.safeBottom() - barHeightU() * hudUnit();
  const handTopOf = (g: Geom): number => (g.slots.length ? Math.min(...g.slots.map((sl) => sl.y - g.h / 2)) : g.barTop!);
  /** Кнопки у пальцев стоят над баром и от позы карт не зависят: рука подняли, положили, сжали — они на месте. */
  const thumbTopOf = (g: Geom | null, side: number): number => barTopOf(g) - side - 10;

  // ——— нижняя строка, лист вкладки, рука и её язычок ———
  const ic = (name: string, size = 2) => pixelIcon(name, size);
  /** Кнопка листа и рейки: значок, подпись, огонёк у тумблера. */
  const cbtn = (attrs: string, icon: string, label: string, o: { on?: boolean; dis?: boolean; led?: boolean; style?: string } = {}) =>
    `<button ${attrs} class="cp cb${o.on ? " on" : ""}${o.dis ? " dis" : ""}"${o.dis ? ' aria-disabled="true"' : ""} aria-pressed="${!!o.on}" style="position:relative;${o.style ?? ""}">${o.led === undefined ? "" : `<i class="led${o.led ? " lit" : ""}"></i>`}${icon}<span class="lb">${label}</span></button>`;
  // Панель пересадки: подсказка и «Отмена» / «Готово» — поверх нижней строки, пока тянут свой стул.
  const reseatBar = document.createElement("div");
  reseatBar.className = "cp";
  reseatBar.style.cssText = "display:none;position:absolute;left:12px;right:12px;bottom:calc(var(--safe-bottom) + 8px);height:64px;z-index:90;pointer-events:auto;align-items:center;gap:8px;padding:0 8px";
  reseatBar.innerHTML = `<span style="flex:1;font-size:12px;line-height:1.2;padding-left:6px">Тяни свой стул: по кругу и от стола или к нему. Зум и сдвиг — пальцами.</span>${cbtn("data-reseat-no", ic("cancel"), "Отмена", { style: "width:84px;height:48px" })}${cbtn("data-reseat-ok", ic("keep"), "Готово", { on: true, style: "width:84px;height:48px" })}`;
  reseatBar.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest("[data-reseat-ok],[data-reseat-no]") as HTMLElement | null;
    if (t) { scene.reseatDone(t.hasAttribute("data-reseat-ok")); e.stopPropagation(); }
  });
  root.append(reseatBar);
  const reseatSyncBar = () => { const on = scene.reseatOn(); if (reseatBar.style.display !== (on ? "flex" : "none")) { reseatBar.style.display = on ? "flex" : "none"; draw(); } };
  setInterval(reseatSyncBar, 150);
  // Зона «в руку» от первого лица — чаша в самой сцене (`handBowl` в scene.ts), а не полоса на худе; на худе — только подпись под её краем.
  const handTag = document.createElement("div");
  handTag.dataset.handTag = "";
  handTag.textContent = "В руку";
  handTag.style.cssText = "display:none;position:absolute;left:14px;z-index:37;pointer-events:none;font:400 11px Tiny5,monospace;letter-spacing:.5px;text-shadow:0 1px 0 rgba(0,0,0,.6)";
  root.append(handTag);
  const handTagSync = () => {
    const r = scene.bowlRim();
    if (!r) { if (handTag.style.display !== "none") handTag.style.display = "none"; return; }
    handTag.style.display = "block";
    handTag.style.top = `${Math.round(r.y + 6)}px`;
    handTag.style.color = r.lit ? T.gold : store.me.ink;
    handTag.style.opacity = r.lit ? "1" : "0.8";
  };
  setInterval(handTagSync, 50);
  const flagLit = (s: Snapshot, what: ChairFlag): boolean => !!myChair(s)?.[what];
  const POSE_NAME: Record<string, string> = { row: "В ряд", fan: "Веер", spine: "Корешок", tuck: "На стол" };
  const POSE_ICON: Record<string, string> = { row: "row", fan: "fan", spine: "spine", tuck: "tuck" };
  /** Лист вкладки: ряд кнопок над нижней строкой. */
  function sheetHtml(s: Snapshot): string {
    const sec = local.section, chair = myChair(s);
    if (!sec || sec === "say" || !chair) return "";
    const sep = '<span class="sep"></span>';
    let cap = "", body = "";
    if (sec === "pose") {
      const now = scene.handPoseAt(scene.handLevel());
      cap = "Как лежит рука — то же, что высота язычка";
      body = (["row", "fan", "spine", "tuck"] as const).map((k) => cbtn(`data-hand-pose2="${k}"`, ic(POSE_ICON[k]!), POSE_NAME[k]!, { on: now === k })).join("") + sep + cbtn('data-hand-do="flip"', ic("flip"), "Лицом");
    } else if (sec === "order") {
      cap = "Порядок карт в руке";
      body = cbtn('data-hand-do="suit"', ic("suit"), "Масть") + cbtn('data-hand-do="rank"', ic("rank"), "Номинал") + cbtn('data-hand-do="reverse"', ic("reverse"), "Наоборот") + cbtn('data-hand-do="shuffle"', ic("shuffle"), "Мешать");
    } else if (sec === "chair") {
      cap = "Твой стул";
      const flag = (k: ChairFlag, icon: string, label: string) => cbtn(`data-bar="${k}"`, ic(icon), label, { on: flagLit(s, k), led: flagLit(s, k) });
      body = flag("lock", "lock", "Замок") + flag("hide", "hide", "Скрыть") + flag("reject", "reject", "Не брать") + flag("forever", "keep", "Закрепить") + sep + cbtn('data-bar="leave"', ic("leave"), "Выйти", { on: local.confirmLeave });
    }
    let html = `<div class="cp c-sheet" data-sheet="${sec}"><span class="cap">${cap}</span>${body}</div>`;
    // Выйти — вопрос над листом, как у стола.
    if (local.confirmLeave && sec === "chair") {
      html += `<div data-confirm class="cp" style="right:12px;bottom:calc(var(--safe-bottom) + ${88 + SHEET_PX + 10}px);width:176px;height:64px;z-index:59;padding:10px 12px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box">`
        + `<span style="font:400 12px Tiny5,monospace;color:${T.ink}">Покинуть стул?</span>`
        + `<button data-stand class="cp on" style="position:relative;align-self:flex-start;border:0;cursor:pointer;font:400 11px Tiny5,monospace;padding:5px 10px">Встать</button></div>`;
    }
    return html;
  }
  function dockHtml(): string {
    const tabs = TABS.map(([k, icon, label]) => {
      // «В стопку» — не лист с кнопками, а режим стола: включён — кнопка горит, пока выбор не снят.
      if (k === "stack") { const on = scene.stackMode(), n = scene.stackPicked(); return `<button data-stack aria-pressed="${on}" class="cp cb c-tab${on ? " on open" : ""}">${ic(icon)}<span class="lb">${on && n ? `${label} · ${n}` : label}</span></button>`; }
      const on = k === "say" ? talk.open : local.section === k;
      return `<button data-section="${k}" aria-pressed="${on}" class="cp cb c-tab${on ? " on open" : ""}">${ic(icon)}<span class="lb">${label}</span></button>`;
    }).join("");
    return `<div class="c-dockbg"></div><div class="c-dock">${tabs}</div>`;
  }
  /** Язычок над самым верхом карт руки и счётчик слева от него. Рука на столе — язычок над нижней строкой. */
  function gripHtml(s: Snapshot): string {
    const chair = myChair(s);
    if (!chair || !chair.hand.length || scene.carryingHand() || scene.reseatOn()) return "";
    // СВОБОДНАЯ КАМЕРА: рука лежит на столе, хвата нет — ни поднять, ни вытащить стопкой; счётчик стоит там же, где при сложенной руке. Верхнюю карту стопки можно потянуть.
    const free = scene.camMode() === "orbit";
    const level = scene.handLevel(), pose = scene.handPoseAt(level), floor = glass().h - scene.safeBottom() - DOCK_PX - (local.section && local.section !== "say" ? SHEET_PX + SHEET_GAP : 0) - 4;
    const tucked = free || pose === "tuck";
    const top = tucked ? floor : scene.handTopPx() ?? floor;
    const y = Math.round(top - 26);
    const label = tucked ? `<span>на столе · ${chair.hand.length}</span>` : `<span>${chair.hand.length}</span>`;
    const grip = free ? "" : `<div class="cp c-grip${local.gripDrag ? " drag" : ""}" data-grip aria-label="Язычок руки: вверх-вниз — высота и поза, за самый верх — вся рука стопкой на стол; влево-вправо — ширина руки" style="left:${local.gripX === null ? "calc(50% - 42px)" : `${Math.max(8, Math.min(glass().w - 92, local.gripX - 42))}px`};top:${y}px"><i></i><i></i><i></i><i></i></div>`;
    const count = `<div class="cp c-count flat" style="left:14px;top:${y - 6}px">${ic("cards", 1)}${label}</div>`;
    // Потолок руки: взгляд вверх — рука уезжает вниз, и язычок со счётчиком с ней; прячутся за нижней строкой (обрезка по её верху).
    const shift = free ? 0 : Math.round(scene.handShiftPx());
    return `<div class="c-handclip" style="position:absolute;left:0;right:0;top:0;height:${floor}px;overflow:hidden;pointer-events:none;z-index:38"><div style="position:absolute;inset:0;transform:translateY(${shift}px)">${grip}${count}</div></div>`;
  }
  /** Рейка камеры справа: только то, что нужно этому виду. */
  function railHtml(s: Snapshot): string {
    const mode = scene.camMode(), chair = myChair(s);
    const view = cbtn("data-view", ic(mode === "head" ? "view" : mode === "orbit" ? "orbit" : "topdown"), mode === "head" ? "Голова" : mode === "orbit" ? "Вокруг" : "Сверху");
    let items = view;
    if (mode === "head") {
      items += cbtn(`data-gyro aria-label="${scene.gyro.on() ? "Выключить гиро" : "Гиро: поворот телефона — поворот головы"}"`, ic("gyro"), "Гиро", { on: scene.gyro.on(), led: scene.gyro.on() })
        + cbtn('data-stance-toggle', ic(scene.stance() === "stand" ? "stand" : "sit"), scene.stance() === "stand" ? "Стоя" : "Сидя");
    } else if (mode === "orbit" && chair) {
      const turn = chair.angle - scene.azimuth();
      items += cbtn("data-home aria-label=\"К своему стулу\"", `<span class="c-needle" style="transform:rotate(${turn.toFixed(1)}deg)">${ic("compass")}</span>`, "К стулу");
    } else if (mode === "top") {
      items += cbtn('data-zoom="in"', ic("zoomIn"), "Ближе") + cbtn('data-zoom="out"', ic("zoomOut"), "Дальше");
    }
    // Реплей: отмотать игру назад (ленту пишет обёртка хранилища). В самом просмотре — только вид и гиро: сесть, встать, двигать стул нельзя.
    if (store.replay?.on) items = view + (mode === "head" ? cbtn(`data-gyro aria-label="Гиро"`, ic("gyro"), "Гиро", { on: scene.gyro.on(), led: scene.gyro.on() }) : mode === "top" ? cbtn('data-zoom="in"', ic("zoomIn"), "Ближе") + cbtn('data-zoom="out"', ic("zoomOut"), "Дальше") : "");
    else {
      if (store.replay) items += cbtn("data-replay aria-label=\"Реплей: отмотать игру назад\"", ic("replay"), "Реплей");
      // DEV: пересадить свой стул — вид сверху со свободным зумом; потом кнопке найдём место.
      if (chair && !scene.reseatOn()) items += cbtn('data-reseat', ic("chair"), "Пересесть");
    }
    let html = scene.reseatOn() || local.hold ? "" : `<div class="c-rail">${items}</div>`;
    if (local.viewMenu) {
      const opt = (c: "head" | "orbit" | "top", icon: string, label: string) => cbtn(`data-cam="${c}"`, ic(icon), label, { on: mode === c });
      html += `<div class="cp c-view">${opt("head", "view", "Голова")}${opt("orbit", "orbit", "Вокруг")}${opt("top", "topdown", "Сверху")}</div>`;
    }
    return html;
  }
  function bottomHtml(s: Snapshot): string {
    const chair = myChair(s);
    // Рука стоит над нижней строкой и над листом открытой вкладки.
    const sheetOn = !!local.section && local.section !== "say" && !!chair, g = glass();
    scene.setDock(g.h - scene.safeBottom() - DOCK_PX, sheetOn ? SHEET_PX + SHEET_GAP : 0);
    if (!chair) return dockHtml();
    return gripHtml(s) + sheetHtml(s) + dockHtml();
  }

  // ——— верх: выход, имя, настройки, журнал ———
  /** ТОЛЬКО ДЛЯ РАЗРАБОТКИ (есть лишь у стенда): за кого я сижу; тап — стать другим игроком и обратно. */
  function devHtml(): string {
    if (!dev) return "";
    const chip = (attrs: string, top: number, aria: string, text: string, on = false) =>
      `<button ${attrs} aria-label="${aria}" style="position:absolute;left:14px;top:calc(${top + 90}px + var(--safe-top));z-index:61;border:0;cursor:pointer;padding:6px 10px;border-radius:9px;font:400 11px Tiny5,monospace;color:${on ? T.black : T.ink};background:${on ? `linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo})` : T.well};box-shadow:inset 0 0 0 2px ${store.me.ink},0 3px 0 rgba(11,7,4,.5);white-space:nowrap">${text}</button>`;
    return chip("data-dev-switch", 60, "Только для разработки: управлять другим экраном (клавиша Tab)", `DEV · ${esc(dev.label)} · Tab`)
      + chip("data-dev-cam", 128, "Только для разработки: модель камеры — орбита, голова, оптика, сверху", `DEV · камера: ${CAM_LABEL[scene.camMode()]}`, scene.camMode() !== "orbit")
      + chip("data-dev-peek", 94, "Только для разработки: окно с видом глазами другого", `DEV · окно: ${esc(dev.peek.label)} ${dev.peek.on() ? "вкл" : "выкл"}`, dev.peek.on());
  }
  function topHtml(s: Snapshot): string {
    const tb = (attrs: string, side: string, icon: string, aria: string) => `<button ${attrs} class="cp cb c-t" aria-label="${aria}" style="${side}">${icon}</button>`;
    const turnKey = s.rules.turnMark ? s.play?.turn ?? null : null, turnMan = turnKey ? s.people.find((p) => p.key === turnKey) : undefined;
    const turn = turnKey ? `<div class="cp c-turn${turnKey === me() ? " on" : ""}" data-turn>${ic("turn", 1)}<span>${turnKey === me() ? "Твой ход" : `Ход: ${esc(turnMan?.name ?? "")}`}</span></div>` : "";
    return tb("data-rooms-back", "left:14px", ic("exit"), "Выйти из комнаты")
      + `<div class="cp c-name" data-table-name><span>${esc(store.title)}</span><span class="who">${ic("people", 1)}${s.people.length}</span></div>`
      + tb(`data-settings aria-expanded="${settings.open}"`, "right:66px", ic("gear"), "Настройки")
      + tb(`data-journal aria-expanded="${local.journal}"`, "right:14px", ic("journal"), "Журнал партии")
      + turn;
  }
  function gyroNoteHtml(): string {
    return local.gyroNote ? `<div data-gyro-note style="position:absolute;left:12px;right:12px;top:calc(60px + var(--safe-top));z-index:62;padding:8px 12px;border-radius:12px;font:400 12px Tiny5,monospace;color:${T.ink};text-align:center;${plate};pointer-events:none">${esc(local.gyroNote)}</div>` : "";
  }
  function journalHtml(): string {
    if (!local.journal) return "";
    const deeds = [...book.all()].reverse();
    const card = (face: Face | null): string => {
      if (face === null) return `<span style="color:${MENTION_INK.back}">🂠</span>`;
      const l = cardLabel(face);
      return `<span style="color:${l.ink}">${esc(l.label)}</span>`;
    };
    const hour = (at: number) => new Date(at).toLocaleTimeString("ru-RU", { hour12: false }).slice(0, 5);
    const rows = deeds.length === 0
      ? `<div style="padding:18px 14px;color:${T.inkDim};text-align:center">Пока ничего не происходило.</div>`
      : deeds.map((one) => `<div data-deed style="padding:7px 14px;border-top:1px solid ${BAR_LOOK.rim};display:flex;gap:8px;align-items:baseline"><span style="color:${T.inkDim};font:400 11px Tiny5,monospace;flex:0 0 auto">${hour(one.at)}</span>`
        + `<span style="flex:1 1 auto;min-width:0">${one.who ? `<b style="color:${one.ink ?? T.ink};font-weight:600">${esc(one.who)}</b> ` : ""}${esc(one.says)}${one.deal ? ` <span style="color:${T.inkDim}">${esc(one.deal.map((d) => `${d.hand} ${d.n}`).join(", "))}</span>` : one.cards ? (one.cards.length > 8 ? ` <span style="color:${T.inkDim}">${one.cards.length} шт.</span>` : ` ${one.cards.map(card).join(" ")}`) : one.count !== undefined ? ` <span style="color:${T.inkDim}">${one.count} шт.</span>` : ""}</span></div>`).join("");
    return `<div data-g="journal" data-scroll style="position:absolute;left:12px;right:12px;top:calc(60px + var(--safe-top));max-height:min(52vh,420px);overflow-y:auto;overflow-x:hidden;touch-action:pan-y;overscroll-behavior:contain;z-index:62;border-radius:14px;font:400 13px/1.45 Tiny5,monospace;color:${T.ink};${plate}">`
      + `<div style="padding:9px 14px;color:${T.inkDim};font-size:11px;position:sticky;top:0;${plate};border-radius:14px 14px 0 0">Журнал · видно только то, что видно за столом</div>${rows}</div>`;
  }

  // ——— на столе: окно стопки, окно стула ———
  /** Карта в окне — картинка набора стола: лицо, если его видно, иначе рубашка. */
  const cardImg = (s: Snapshot, face: Face | undefined, w: number) =>
    `<img src="${artUrl(s.rules, face, look)}" alt="" draggable="false" style="width:100%;height:100%;display:block;border-radius:${Math.round(w * 0.12)}px;box-shadow:0 0 0 1px ${T.black};pointer-events:none">`;
  /** Карты веером в окне: `left` — середина веера, `top` — верх ряда; ширина карты `cw`, веер во `room` точек. */
  /** `gap` — щель на этом месте: туда встанет несомая карта (соседи расступаются). */
  function fanHtml(s: Snapshot, cards: SeenCard[], faceOf: (c: SeenCard) => Face | undefined, left: number, top: number, cw: number, room: number, z: number, attrs: (c: SeenCard) => string, gap: number | null = null, ghost: string | null = null, hidden: "back" | "finger" = "back"): string {
    const plan = handPlan({ fan: true, shrink: false, tuck: false }, cards.length + (gap === null ? 0 : 1), 1, 1.4, room / cw), ch = cw * 1.4;
    // Щель — шире самого места: соседи по обе стороны отходят ещё, чтобы её было видно и в длинном веере.
    const part = (i: number) => (gap === null ? 0 : i < gap ? -cw * 0.35 : cw * 0.35);
    return cards.map((c, i) => {
      const p = plan[gap !== null && i >= gap ? i + 1 : i]!;
      // Карту несут — в окне на её месте пустой контур (поверх соседей, чтобы был виден целиком): она ушла из окна, а не лежит в нём и на столе сразу; не примут — вернётся сюда.
      if (c.id === ghost) return `<div data-tip-slot="${c.id}" style="position:absolute;left:${Math.round(left + p.x * cw - cw / 2 + part(i))}px;top:${Math.round(top + p.y * cw)}px;width:${Math.round(cw)}px;height:${Math.round(ch)}px;box-sizing:border-box;transform:rotate(${p.angle}deg);z-index:${z + cards.length + 1};border-radius:${Math.round(cw * 0.12)}px;border:2px dashed ${BAR_LOOK.goldHi};background:rgba(11,7,4,.6);pointer-events:none"></div>`;
      return `<div data-tip-card="${c.id}" ${attrs(c)} style="position:absolute;left:${Math.round(left + p.x * cw - cw / 2 + part(i))}px;top:${Math.round(top + p.y * cw)}px;width:${Math.round(cw)}px;height:${Math.round(ch)}px;transform:rotate(${p.angle}deg);z-index:${z + i}">${hidden === "finger" && !faceOf(c) ? fingerHtml(c.id, cw) : cardImg(s, faceOf(c), cw)}</div>`;
    }).join("");
  }
  const fanDrop = (n: number, cw: number, room: number) => handPlan({ fan: true, shrink: false, tuck: false }, n, 1, 1.4, room / cw).reduce((m, p) => Math.max(m, p.y), 0) * cw;
  /** Кнопка окна стопки — как флаг в окне стула. */
  function deckChip(data: string, glyph: string, label: string, on = false, may = true): string {
    const lookOf = on ? `${gold};box-shadow:inset 0 0 0 2px ${T.black};` : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim};`;
    return `<button ${may ? data : `${data.replace(/^data-([a-z-]+)/, "data-$1-status")} disabled`} aria-label="${label}" aria-pressed="${on}" style="width:26px;height:26px;border:0;padding:0;border-radius:7px;cursor:${may ? "pointer" : "default"};${may ? "" : `opacity:${on ? 0.8 : 0.4};`}display:flex;align-items:center;justify-content:center;${lookOf}">`
      + `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${on ? T.black : "white"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></button>`;
  }
  /** Рамка окна — как у окон стола: колодец, кант дерева. Рисуется первым слоем панели. */
  const shell = `<div style="position:absolute;inset:0;background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px"></div>`;
  /** Окно стопки в своих точках: размер, веер (места карт на `n` мест). */
  function pileLayout(pile: Snapshot["piles"][number]) {
    const g = glass(), w = Math.min(g.w - 24, 340), cw = 44, room = w - 24 - cw, drop = fanDrop(pile.cards.length + 1, cw, room);
    const rowTop = 12 + 38 + 30, h = rowTop + cw * 1.4 + drop + 16;
    const slots = (n: number) => handPlan({ fan: true, shrink: false, tuck: false }, n, 1, 1.4, room / cw).map((p) => ({ x: w / 2 + p.x * cw, y: rowTop + p.y * cw + (cw * 1.4) / 2, angle: p.angle }));
    return { w, h, cw, room, rowTop, slots };
  }
  // ОКНО СТОПКИ — ЗОНА ДЛЯ НЕСОМОЙ КАРТЫ: палец над окном — карта встаёт в щель веера и ляжет в стопку на это место.
  // Точка окна — от панели (`panel.ts`): у экранной — по экрану, у столовой — лучом в её плоскость.
  // ОКНО ЧУЖОЙ РУКИ — ТАКАЯ ЖЕ ЗОНА: карта встаёт в щель её веера и ляжет в эту руку на это место — если рука принимает (замок, «не принимать»).
  scene.setZone((x, y) => {
    const s = store.state;
    const pile = s.piles.find((p) => p.id === local.deckTip);
    if (pile && !pile.lock && !pile.shut) {
      const q = panels.local(`pile:${pile.id}`, x, y);
      if (q) {
        const L = pileLayout(pile);
        const i = L.slots(pile.cards.length).filter((sl) => sl.x < q.x).length, sl = L.slots(pile.cards.length + 1)[i]!;
        return { where: { in: "deck", pile: pile.id, i }, spot: { x: sl.x, y: sl.y - L.cw * 0.35, w: L.cw, angle: sl.angle } };
      }
    }
    const chair = s.chairs.find((c) => c.id === local.tip && c.owner && c.owner !== me());
    if (chair && mayDropInto(s, chair)) {
      const q = panels.local(`chair:${chair.id}`, x, y);
      if (q) {
        const L = chairLayout(chair);
        const i = L.slots(chair.hand.length).filter((sl) => sl.x < q.x).length, sl = L.slots(chair.hand.length + 1)[i]!;
        return { where: { in: "hand", chair: chair.id, i }, spot: { x: sl.x, y: sl.y - L.cw * 0.35, w: L.cw, angle: sl.angle } };
      }
    }
    return null;
  });
  /** Чужая рука принимает карту — тем же разбором, что и сервер (`hand.drop`: замок, «не принимать»). */
  const mayDropInto = (s: Snapshot, chair: Chair) => allowed(mayDo("hand.drop", { locks: { lock: chair.lock, reject: chair.reject }, mine: chair.owner === me(), granted: s.rights }));
  /** Окно чужой руки в своих точках: ширина, веер (места карт на `n` мест). */
  function chairLayout(_chair: Chair) {
    const g = glass(), w = Math.min(g.w - 24, 320), cw = 40, room = w - 24 - cw, rowTop = 12 + 38 + 30 + 8;
    const slots = (n: number) => handPlan({ fan: true, shrink: false, tuck: false }, n, 1, 1.4, room / cw).map((p) => ({ x: w / 2 + p.x * cw, y: rowTop + p.y * cw + (cw * 1.4) / 2, angle: p.angle }));
    return { w, cw, room, rowTop, slots };
  }
  /** Несомая над окном — сама карта в щели, выше соседей, поверх окна (окно стопки и окно чужой руки). */
  function heldHtml(s: Snapshot, zone: NonNullable<ReturnType<SceneApi["heldZone"]>>, cw: number): string {
    const all = [...s.felt, ...s.piles.flatMap((p) => p.cards), ...s.chairs.flatMap((c) => c.hand)], c = all.find((x) => x.id === zone.id);
    const face = c && (s.chairs.some((ch) => ch.hand.includes(c)) ? c.face : c.up ? c.face : undefined), hw = cw * 1.15;
    return `<div data-g="tip-held" data-card="${zone.id}" style="position:absolute;left:${Math.round(zone.spot.x - hw / 2)}px;top:${Math.round(zone.spot.y - (hw * 1.4) / 2)}px;width:${Math.round(hw)}px;height:${Math.round(hw * 1.4)}px;transform:rotate(${zone.spot.angle}deg);z-index:90;pointer-events:none;filter:drop-shadow(0 6px 0 rgba(11,7,4,.45))">${cardImg(s, face, hw)}</div>`;
  }
  /**
   * ОКНО СТОПКИ — стопка картами, как у стола: какой стороной лежит, такой и видно; карту тянут из окна. Кнопки —
   * перемешать, отсортировать, перевернуть; пин, лок, приёмка, склейка и вечность — значками (что нельзя — погашено).
   */
  function pilePanel(s: Snapshot): void {
    const pile = s.piles.find((p) => p.id === local.deckTip), spot = scene.pileSpots().find((p) => p.pile === local.deckTip);
    if (!pile || !spot) { local.deckTip = null; return; }
    const { w, h, cw, room, rowTop } = pileLayout(pile);
    const zone = scene.heldZone();
    const gapAt = zone && zone.pile === pile.id ? zone.i : null;
    const held = zone && zone.pile === pile.id ? heldHtml(s, zone, cw) : "";
    const admin = s.rights.includes("pile.guard"), topId = pile.cards.at(-1)?.id;
    const acts: [string, string, string][] = [["shuffle", GLYPH.shuffle, "Перемешать"], ["sort", GLYPH.suit, "Отсортировать"]];
    const html = shell + `<div data-g="deck-tip" data-pile="${pile.id}" data-lock="${pile.lock}" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;box-sizing:border-box;padding:12px">`
      + `<div style="display:flex;align-items:center;gap:9px;height:30px;padding-bottom:8px"><span data-panel-drag data-tip-drag style="font:400 14px Tiny5,monospace;color:${T.ink};flex:1;min-width:0;overflow:hidden;white-space:nowrap;align-self:stretch;display:flex;align-items:center;touch-action:none;cursor:move">${esc(pile.name ?? "Колода")} · ${pile.cards.length}</span>`
      + `<span data-deck-shut role="button" style="cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;box-shadow:inset 0 0 0 2px ${T.wood};color:${T.inkDim}">Закрыть</span></div>`
      + `<div style="display:flex;align-items:center;gap:4px;height:26px">`
      + acts.map(([how, glyph, label]) => deckChip(`data-deck-do="${how}"`, glyph, label, false, !pile.lock)).join("")
      + `<span style="flex:1"></span>`
      + deckChip("data-deck-pin", GLYPH.pin, "Приколоть", pile.pin, !pile.pin || admin)
      + deckChip("data-deck-lock", GLYPH.lock, "Лок", pile.lock, admin)
      + deckChip("data-deck-accept", GLYPH.shut, "Приёмка закрыта", pile.shut, admin)
      + deckChip("data-deck-seal", GLYPH.seal, "Мерж закрыт", pile.seal, admin)
      + deckChip("data-deck-forever", GLYPH.forever, "Вечная", pile.forever) + `</div></div>`
      + fanHtml(s, pile.cards, (c) => (c.up ? c.face : undefined), w / 2, rowTop, cw, room, 42, (c) => `data-from="pile" data-take="${pile.shut || (pile.lock && c.id !== topId) ? "0" : "1"}"`, gapAt, scene.carrying())
      + held;
    // На столе — на полпути от стопки к середине, ближе ко мне: целиком в кадре.
    const a = ((myChair(s)?.angle ?? 0) * Math.PI) / 180, toward = { x: Math.sin(a), y: Math.cos(a) };
    panels.show(`pile:${pile.id}`, "pile", html, w, h, { screen: { x: spot.x, y: spot.y }, world: { x: pile.x * 0.5 + toward.x * 1.5, y: pile.y * 0.5 + toward.y * 1.5 } });
    shown.push(`pile:${pile.id}`);
  }
  /** Окно стула по тапу на голову: кто, флаги (свой — кнопками), «не читать», его рука; у крупье — его дела. */
  function chairPanel(s: Snapshot): void {
    const chair = s.chairs.find((c) => c.id === local.tip);
    if (!chair) return;
    const sitter = s.people.find((p) => p.key === chair.owner), head = scene.heads().find((h) => h.key === chair.owner);
    const g = glass(), w = Math.min(g.w - 24, 320);
    const may = chair.id === myChair(s)?.id || s.rights.includes("table.seats") || s.admin === me();
    const chip = (flag: ChairFlag) => {
      const on = chair[flag], lookOf = on ? `${gold};box-shadow:inset 0 0 0 2px ${T.black};` : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim};`;
      const icon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${on ? T.black : "white"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[flag]}</svg>`;
      return may ? `<button data-flag="${flag}" data-chair="${chair.id}" aria-pressed="${on}" style="width:30px;height:30px;border:0;padding:0;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;${lookOf}">${icon}</button>`
        : `<span data-status="${flag}" style="width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;opacity:${on ? 1 : 0.45};${lookOf}">${icon.replace(/width="16" height="16"/, 'width="12" height="12"')}</span>`;
    };
    const who = sitter
      ? `<span style="flex:none;width:30px;height:30px;border-radius:50%;background:${sitter.ink};box-shadow:inset 0 0 0 3px ${T.black};display:flex;align-items:center;justify-content:center;font:400 14px Tiny5,monospace;color:${T.black}">${esc([...sitter.name][0] ?? "?")}</span><span data-panel-drag style="font:400 14px Tiny5,monospace;color:${T.ink};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;align-self:stretch;display:flex;align-items:center;touch-action:none;cursor:move">${esc(sitter.name)}</span>`
        + (sitter.key !== me() ? `<span data-mute="${esc(sitter.key)}" role="button" aria-pressed="${muted.has(sitter.key)}" style="cursor:pointer;flex:none;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 8px;${muted.has(sitter.key) ? `${gold};color:${T.black}` : `box-shadow:inset 0 0 0 2px ${T.wood};color:${T.inkDim}`}">${muted.has(sitter.key) ? "Читать" : "Не читать"}</span>` : "")
      : `<span data-panel-drag style="font:400 14px Tiny5,monospace;color:${T.inkDim};flex:1;touch-action:none;cursor:move">Пустой стул</span>`
        + `<span data-sit="${chair.id}" role="button" style="flex:none;cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});color:${T.black}">Сесть</span>`;
    const admin = s.rights.includes("table.croupier");
    // Чужую руку под замком не берут: тем же разбором, что и сервер (`access.ts`) — тянуть из неё нельзя вовсе, а не «потянул — вернулось».
    const mayTake = allowed(mayDo("hand.take", { locks: { lock: chair.lock, reject: chair.reject }, mine: chair.owner === me(), granted: s.rights }));
    // Дела крупье: набора комнаты — и свои дела экрана распорядителю (раздать, перемешать, ещё стул, перевернуть руку).
    const crew = chair.croupier ? [
      ...store.crew.filter((one) => !one.adminOnly || admin).map((one) => ({ data: `data-crew="${esc(one.id)}"`, name: one.name })),
      ...(admin ? [{ data: `data-croupier="deal"`, name: "Раздать" }, { data: `data-croupier="shuffle"`, name: "Перемешать" }, { data: `data-chair-act="add"`, name: "Ещё стул" }, { data: `data-flip-chair="${chair.id}"`, name: "Перевернуть руку" }] : []),
    ] : [];
    const zone = scene.heldZone(), gapAt = zone && zone.chair === chair.id ? zone.i : null, shown3 = chair.hand.length + (gapAt === null ? 0 : 1);
    const cw = 40, room = w - 24 - cw, fan = shown3 ? fanDrop(shown3, cw, room) + cw * 1.4 + 10 : 0;
    const crewRows = crew.length ? Math.ceil(crew.length / 3) * 38 + 10 : 0, h = 12 + 38 + 30 + fan + crewRows + 12;
    const html = shell + `<div data-g="tip" data-tip="${chair.id}" style="position:absolute;left:0;top:0;width:${w}px;box-sizing:border-box;padding:12px">`
      + `<div style="display:flex;align-items:center;gap:9px;height:30px;padding-bottom:8px">${who}<button data-tip-close style="flex:none;width:30px;height:30px;border:0;border-radius:8px;cursor:pointer;background:transparent;color:${T.inkDim};box-shadow:inset 0 0 0 2px ${T.wood}">✕</button></div>`
      + `<div style="display:flex;gap:6px;align-items:center">${RIGHTS.map(chip).join("")}<span style="font:400 11px Tiny5,monospace;color:${T.inkDim};margin-left:4px">${chair.hand.length} в руке</span></div>`
      + (fan ? `<div style="height:${Math.round(fan)}px"></div>` : "")
      + (crew.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding-top:10px">${crew.map((one) => `<button ${one.data} style="border:0;cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:8px 10px;background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim};color:${T.ink}">${esc(one.name)}</button>`).join("")}</div>` : "")
      + `</div>`
      + (fan ? fanHtml(s, chair.hand, (c) => c.face, w / 2, 12 + 38 + 30 + 8, cw, room, 42, () => `data-from="hand" data-take="${mayTake ? "1" : "0"}"`, gapAt, scene.carrying(), "finger") : "") + (zone && zone.chair === chair.id ? heldHtml(s, zone, cw) : "");
    const wx = head ? head.wx * 0.7 : 0, wy = head ? head.wy * 0.7 : 0;
    panels.show(`chair:${chair.id}`, "chair", html, w, h, { screen: { x: head?.x ?? g.w / 2, y: (head?.y ?? 84) + (head?.r ?? 20) - 28 }, world: { x: wx, y: wy } });
    shown.push(`chair:${chair.id}`);
  }
  /** Окно раздачи — у распорядителя, из окна крупье. Какие раздачи — из контракта и рода стола. */
  function dealablePlayers(s: Snapshot, dir: DealDir): { chair: string; name: string; ink: string }[] {
    const from = s.chairs.find((c) => c.croupier)?.angle ?? 0;
    const step = (c: Chair) => (dir === "cw" ? (from - c.angle + 360) % 360 : (c.angle - from + 360) % 360);
    return [...s.chairs].sort((a, b) => step(a) - step(b)).flatMap((c) => {
      const sitter = !c.croupier && c.owner !== null ? s.people.find((p) => p.key === c.owner) : undefined;
      return sitter ? [{ chair: c.id, name: sitter.name, ink: sitter.ink }] : [];
    });
  }
  function dealHtml(s: Snapshot): string {
    const d = local.deal;
    if (!d) return "";
    const g = glass(), w = Math.min(320, g.w - 32);
    const chip = (on: boolean, data: string, label: string) => `<button ${data} aria-pressed="${on}" style="border:0;cursor:pointer;font:400 12px Tiny5,monospace;border-radius:8px;padding:7px 10px;${on ? `${gold};color:${T.black}` : `background:transparent;color:${T.ink};box-shadow:inset 0 0 0 2px ${T.wood}`}">${label}</button>`;
    const row = (title: string, inner: string) => `<div style="display:flex;flex-direction:column;gap:6px"><span style="font:400 11px Tiny5,monospace;color:${T.inkDim}">${title}</span><div style="display:flex;flex-wrap:wrap;gap:6px">${inner}</div></div>`;
    const rules = (Object.entries(DEAL_PRESETS) as [DealRule, (typeof DEAL_PRESETS)[DealRule]][]).filter(([r]) => store.deals.includes(r));
    const players = dealablePlayers(s, d.dir);
    const dot = (ink: string) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${ink};box-shadow:inset 0 0 0 1px ${T.black};margin-right:5px;vertical-align:-1px"></span>`;
    if (d.from !== null && !d.seats.includes(d.from)) d.from = null;
    if (d.from === null) d.from = players.find((p) => d.seats.includes(p.chair))?.chair ?? null;
    const want = DEAL_PRESETS[d.rule].seats, exact = want === 0 || d.seats.length === want;
    return `<div data-deal-panel role="dialog" aria-label="Раздача" style="position:absolute;left:${Math.round((g.w - w) / 2)}px;top:${Math.round(Math.max(24, g.h * 0.18))}px;width:${w}px;box-sizing:border-box;z-index:70;background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 8px 0 rgba(11,7,4,.5);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px">`
      + `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span style="font:400 15px Tiny5,monospace;color:${T.ink}">Раздача</span><button data-deal-shut style="border:0;cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;box-shadow:inset 0 0 0 2px ${T.wood};color:${T.inkDim};background:transparent">Закрыть</button></div>`
      + row("По пресету", rules.map(([r, preset]) => chip(d.rule === r, `data-deal-rule="${r}"`, preset.name)).join(""))
      + (DEAL_PRESETS[d.rule].askable ? row("Сколько карт", [1, 2, 3, 5, 6, 8, 10].map((n) => chip(!d.all && d.n === n, `data-deal-n="${n}"`, String(n))).join("") + chip(d.all, "data-deal-all", "Все по одной")) : "")
      + row("Куда", chip(d.dir === "cw", `data-deal-dir="cw"`, "По часовой") + chip(d.dir === "ccw", `data-deal-dir="ccw"`, "Против часовой"))
      + row("Кому", players.map((p) => chip(d.seats.includes(p.chair), `data-deal-seat="${p.chair}"`, dot(p.ink) + esc(p.name))).join("") || `<span style="font:400 11px Tiny5,monospace;color:${T.inkDim}">За столом никого</span>`)
      + row("Кому первым", players.filter((p) => d.seats.includes(p.chair)).map((p) => chip(d.from === p.chair, `data-deal-from="${p.chair}"`, dot(p.ink) + esc(p.name))).join("") || `<span style="font:400 11px Tiny5,monospace;color:${T.inkDim}">Никого не выбрано</span>`)
      + (exact ? "" : `<span style="font:400 11px Tiny5,monospace;color:${T.gold}">Нужно ровно ${want} игрока — выбрано ${d.seats.length}</span>`)
      + `<button data-deal-go ${exact ? "" : "disabled"} style="border:0;cursor:pointer;font:400 13px Tiny5,monospace;border-radius:8px;padding:9px 10px;${gold};color:${T.black};${exact ? "" : "opacity:.45;cursor:default"}">Раздать</button>`
      + `<span style="font:400 10px Tiny5,monospace;color:${T.inkDim}">Раздаёт крупье: его курсор и его метки. Себе не раздаёт.</span></div>`;
  }
  // ——— перерисовка: раз в кадр, и только если что-то поменялось ———
  let frame = 0;
  // ДВА СЛОЯ, и у каждого своя сверка: полоса сверху (кнопки) не пересобирается, пока сама не поменялась. Под гиро камера крутится
  // всё время, и всё, что стоит от неё, меняется каждый кадр, — а кнопка, пересобранная между нажатием и отпусканием, нажатием не считалась.
  const layerTop = document.createElement("div"), layerRail = document.createElement("div"), layerRest = document.createElement("div");
  root.append(layerTop, layerRail, layerRest);
  let lastTop = "", lastRail = "", lastRest = "";
  function draw(): void { if (!frame) frame = requestAnimationFrame(render); }
  // Грип ползёт назад и сужается/растёт — ему нужна перерисовка, пока раздвижка не сошла.
  setInterval(() => { if (scene.gripAmount() > 0.001) draw(); }, 50);
  function render(): void {
    frame = 0;
    const s = store.state;
    scene.setTabLit(new Set([local.deckTip, local.deckCarry].filter((x): x is string => !!x)));
    // Работаю с окном стопки — я с ней вожусь: моя правая рука на ней (и её видят остальные). Открыто, но не тронуто — рука свободна.
    // Работаю с окном чужого стула — моя правая рука у его левой руки (с веером).
    const open = local.handOn && local.deckTip ? s.piles.find((p) => p.id === local.deckTip) : undefined;
    const chairOpen = local.handOn ? s.chairs.find((c) => c.id === local.tip && c.owner && c.owner !== me()) : undefined;
    if (!local.deckCarry) scene.setRestRight(open ? { x: open.x, y: open.y } : chairOpen ? scene.handOf(chairOpen.id) : null);
    const replaying = store.replay?.on === true;
    const top = topHtml(s) + gyroNoteHtml() + devHtml() + journalHtml(), railS = railHtml(s), rest = replaying ? "" : bottomHtml(s) + dealHtml(s);
    shown = [];
    if (!replaying) { pilePanel(s); chairPanel(s); }
    panels.keep(shown);
    if (top !== lastTop) { lastTop = top; layerTop.innerHTML = top; }
    if (railS !== lastRail) { lastRail = railS; layerRail.innerHTML = railS; }
    if (rest !== lastRest) { lastRest = rest; layerRest.innerHTML = rest; }
    talk.place(anchors());
    root.dataset.open = local.section ?? "";
  }
  /** Строки диалога — у голов, в сторону середины стола, как у стола. */
  function anchors(): WordAnchor[] {
    const g = glass(), mid = { x: g.w / 2, y: g.h * 0.45 };
    return scene.heads().map((h) => {
      const len = Math.hypot(mid.x - h.x, mid.y - h.y) || 1, dir = { x: (mid.x - h.x) / len, y: (mid.y - h.y) / len };
      const size = Math.round(Math.max(12, Math.min(20, h.r * 0.4)));
      const reach = h.r + 10 + Math.max(0, dir.y) * 3 * size * 1.35;
      return { key: h.key, x: h.x + dir.x * reach, y: h.y + dir.y * reach, size, ink: h.ink, dx: dir.x, dy: dir.y, seatX: h.x, seatY: h.y, unit: h.r };
    });
  }
  store.onChange(draw);
  store.replay?.onChange(draw);
  mountReplayBar(root, store, scene);
  scene.onFrame(draw);
  new ResizeObserver(draw).observe(document.body);

  // ——— нажатия ———
  const onClick = (e: MouseEvent): void => {
    if (panels.click(e)) return;
    const t = e.target as HTMLElement, s = store.state, chair = myChair(s);
    const q = (sel: string) => t.closest<HTMLElement>(sel);
    let b: HTMLElement | null;
    if ((b = q("[data-section]"))) {
      const sec = b.dataset.section as Section;
      local.viewMenu = false;
      if (sec === "say") talk.toggle();
      else { local.section = local.section === sec ? null : sec; local.handMenu = false; local.handPop = null; local.confirmLeave = false; }
    } else if ((b = q("[data-bar]"))) {
      const what = b.dataset.bar as BarKey;
      if ((RIGHTS as readonly string[]).includes(what) && chair) store.send({ t: "flag", chair: chair.id, flag: what as ChairFlag, on: !chair[what as ChairFlag] });
      else if (what === "leave") local.confirmLeave = !local.confirmLeave;
    } else if (q("[data-stand]")) { store.send({ t: "stand" }); local.confirmLeave = false; }
    else if (q("[data-stance-toggle]")) { if (performance.now() >= holdUntil) scene.setStance(scene.stance() === "stand" ? "sit" : "stand"); }
    else if ((b = q("[data-hand-pose2]"))) { scene.setHandLevel(scene.poseLevels[b.dataset.handPose2 as "row" | "fan" | "spine" | "tuck"]); }
    else if (q("[data-view]")) local.viewMenu = !local.viewMenu;
    else if ((b = q("[data-cam]"))) { scene.setCamMode(b.dataset.cam as "head" | "orbit" | "top"); local.viewMenu = false; }
    else if ((b = q("[data-zoom]"))) scene.zoomBy(b.dataset.zoom === "in" ? 1.3 : 1 / 1.3);
    else if ((b = q("[data-hand-do]")) && chair) {
      const what = b.dataset.handDo!;
      store.send(what === "flip" ? { t: "flip", chair: chair.id } : { t: "arrange", how: what as "suit" | "rank" | "shuffle" | "reverse" });
      local.handPop = null;
    } else if (q("[data-stack]")) { scene.setStackMode(!scene.stackMode()); local.section = null; local.viewMenu = false; }
    else if (q("[data-rooms-back]")) location.href = `${HOST}/table/?rooms`;
    else if (q("[data-replay]")) { local.viewMenu = false; local.section = null; local.tip = null; local.deckTip = null; settings.hide(); store.replay?.enter(); scene.replay(true); }
    else if (q("[data-reseat]")) { if (performance.now() >= holdUntil) { scene.setReseat(true); local.viewMenu = false; local.section = null; } }
    else if (q("[data-settings]")) { if (settings.open) settings.hide(); else settings.show(); }
    else if (q("[data-journal]")) local.journal = !local.journal;
    else if (q("[data-gyro]")) {
      // Из жеста: iOS даёт датчик только так.
      void scene.gyro.toggle().then((note) => { local.gyroNote = note ?? ""; draw(); if (note) setTimeout(() => { local.gyroNote = ""; draw(); }, 4000); });
      draw();
    }
    else if (q("[data-dev-switch]")) dev?.onSwitch();
    else if (q("[data-dev-cam]")) { scene.setCamMode(CAM_MODES[(CAM_MODES.indexOf(scene.camMode()) + 1) % CAM_MODES.length]!); draw(); }
    else if (q("[data-dev-peek]")) { dev?.peek.onToggle(); draw(); }
    else if ((b = q("[data-sit]"))) { store.send({ t: "sit", chair: b.dataset.sit! }); local.tip = null; }
    else if ((b = q("[data-deck-do]")) && local.deckTip) { const how = b.dataset.deckDo as "shuffle" | "sort" | "flip"; if (scene.pileBarred(local.deckTip, how)) scene.denyPile(local.deckTip, how); else store.send({ t: "deckDo", pile: local.deckTip, how }); }
    else if (q("[data-deck-shut]")) local.deckTip = null;
    else if ((b = q("[data-deck-pin]")) && local.deckTip) { const p = s.piles.find((x) => x.id === local.deckTip); if (p) store.send({ t: "deckPin", pile: p.id, on: !p.pin }); }
    else if ((b = q("[data-deck-forever]")) && local.deckTip) { const p = s.piles.find((x) => x.id === local.deckTip); if (p) store.send({ t: "deckForever", pile: p.id, on: !p.forever }); }
    else if ((b = q("[data-deck-lock], [data-deck-accept], [data-deck-seal]")) && local.deckTip) {
      const p = s.piles.find((x) => x.id === local.deckTip), guard: PileGuard = b.hasAttribute("data-deck-lock") ? "lock" : b.hasAttribute("data-deck-accept") ? "shut" : "seal";
      if (p) store.send({ t: "deckGuard", pile: p.id, guard, on: !p[guard] });
    }
    else if ((b = q("[data-croupier]"))) {
      const what = b.dataset.croupier;
      if (what === "deal") local.deal = { rule: store.deals[0] ?? "each", n: 6, all: false, seats: dealablePlayers(s, "cw").map((p) => p.chair), from: null, dir: "cw" };
      else if (what === "shuffle") store.command({ t: "shuffle" });
      local.tip = null;
    }
    else if (q("[data-chair-act]")) store.send({ t: "chair", act: "add" });
    else if ((b = q("[data-flip-chair]"))) store.send({ t: "flip", chair: b.dataset.flipChair! });
    else if (q("[data-deal-shut]")) local.deal = null;
    else if ((b = q("[data-deal-rule]")) && local.deal) local.deal.rule = b.dataset.dealRule as DealRule;
    else if ((b = q("[data-deal-n]")) && local.deal) { local.deal.n = Number(b.dataset.dealN); local.deal.all = false; }
    else if (q("[data-deal-all]") && local.deal) local.deal.all = !local.deal.all;
    else if ((b = q("[data-deal-seat]")) && local.deal) { const c = b.dataset.dealSeat!, d = local.deal; d.seats = d.seats.includes(c) ? d.seats.filter((x) => x !== c) : [...d.seats, c]; }
    else if ((b = q("[data-deal-from]")) && local.deal) local.deal.from = b.dataset.dealFrom!;
    else if ((b = q("[data-deal-dir]")) && local.deal) local.deal.dir = b.dataset.dealDir as DealDir;
    else if (q("[data-deal-go]") && local.deal) {
      const d = local.deal;
      store.command({ t: "deal", rule: d.rule, ...(DEAL_PRESETS[d.rule].askable ? (d.all ? { n: 1 } : { n: d.n }) : {}), seats: d.seats, dir: d.dir, ...(d.from !== null ? { from: d.from } : {}), force: true });
      local.deal = null;
    }
    else if ((b = q("[data-flag]"))) { const c = s.chairs.find((x) => x.id === b!.dataset.chair); if (c) store.send({ t: "flag", chair: c.id, flag: b.dataset.flag as ChairFlag, on: !c[b.dataset.flag as ChairFlag] }); }
    else if ((b = q("[data-mute]"))) { const k = b.dataset.mute!; if (muted.has(k)) muted.delete(k); else { muted.add(k); talk.muted(k); } }
    else if ((b = q("[data-crew]"))) { store.send({ t: "crew", act: b.dataset.crew!, ...(local.tip ? { chair: local.tip } : {}) }); local.tip = null; }
    else if (q("[data-tip-close]")) local.tip = null;
    else return;
    draw();
  };
  // Нажатия — на HUD, на экранных панелях и на панелях на столе (слой CSS3D сцены).
  for (const el of [root, panelOverlay, scene.panelLayer()]) el.addEventListener("click", onClick);
  // НАЖАТИЕ, У КОТОРОГО КНОПКУ ПЕРЕСОБРАЛИ ПОД ПАЛЬЦЕМ, всё равно нажатие: браузер `click` не шлёт (нажали на одну кнопку, отпустили на её
  // копию), а человек нажал именно её. Сверяем кнопку по её data-атрибутам и нажимаем копию сами.
  const buttonKey = (el: Element | null): string | null => {
    const b = el?.closest("button, [role=button]");
    return b ? b.getAttributeNames().filter((n) => n.startsWith("data-")).map((n) => `${n}=${b.getAttribute(n)}`).join("|") || null : null;
  };
  for (const el of [root, panelOverlay, scene.panelLayer()]) {
    let downKey: string | null = null, clicked = false;
    el.addEventListener("pointerdown", (e) => { downKey = buttonKey(e.target as Element); clicked = false; });
    el.addEventListener("click", () => { clicked = true; }, true);
    el.addEventListener("pointerup", (e) => {
      const key = downKey;
      downKey = null;
      if (!key) return;
      const x = e.clientX, y = e.clientY;
      setTimeout(() => {
        if (clicked) return;
        const under = document.elementFromPoint(x, y);
        if (buttonKey(under) === key) (under!.closest("button, [role=button]") as HTMLElement).click();
      }, 60);
    });
  }
  // Тянуть: ручку позы, компас, индикатор стопки, лассо. Тап без сдвига — их тап.
  const onDown = (e: PointerEvent): void => {
    if (panels.press(e)) return;
    const t = e.target as HTMLElement, chair = myChair();
    // ЯЗЫЧОК РУКИ — две оси, и ось решается раз и навсегда с первого движения:
    //   вверх-вниз — высота руки, а вместе с ней поза (на столе — корешок — веер — в ряд); за самый верх — вся рука стопкой над столом,
    //   отпустил над столом — стопка легла там, вернул палец вниз, не отпуская, — карты назад в руку;
    //   влево-вправо — ширина руки: левее — теснее (самый левый край — стопкой, видна одна карта), правее — шире, до максимума.
    if (t.closest("[data-grip]") && chair) {
      e.preventDefault();
      const h0 = scene.handLevel(), w0 = scene.handWidth(), x0 = e.clientX, y0 = e.clientY, GRIP_PX = 150, WIDE_PX = 220, CARRY_AT = 1.22, carryY = y0 - (CARRY_AT - h0) * GRIP_PX;
      let carrying = false, axis: "h" | "v" | null = null;
      local.gripDrag = true;
      follow(e, (ev) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (axis === null && Math.max(Math.abs(dx), Math.abs(dy)) >= TAP_PX + 2) axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (axis === "h") { local.gripX = ev.clientX; scene.setHandWidth(w0 + dx / WIDE_PX); draw(); return; }
        if (axis !== "v") return;
        const target = h0 + (y0 - ev.clientY) / GRIP_PX;
        if (target > CARRY_AT || carrying) {
          carrying = scene.carryHand({ x: ev.clientX, y: ev.clientY }, { enter: carryY, exit: carryY + 20 });
          if (carrying) { draw(); return; }
        }
        scene.setHandLevel(Math.max(0, Math.min(1, target)));
        draw();
      }, () => {
        local.gripDrag = false;
        local.gripX = null;
        if (axis === "h") scene.setHandWidth(null);
        else if (carrying) scene.carryHand(null);
        else if (axis === "v" && scene.handLevel() < 0.06) scene.setHandLevel(0);
        draw();
      });
      return;
    }
    if (t.closest("[data-home]")) {
      e.preventDefault();
      let x = e.clientX, moved = false;
      follow(e, (ev) => { if (!moved && Math.abs(ev.clientX - e.clientX) < TAP_PX) return; moved = true; scene.turnBy(-(ev.clientX - x) * 0.6); x = ev.clientX; draw(); }, () => { if (!moved) scene.home(); draw(); });
      return;
    }
    // Карта из окна (стопки, стула) — её несут, как со стола.
    const tipCard = t.closest<HTMLElement>("[data-tip-card]");
    if (tipCard && tipCard.dataset.take === "1") {
      e.preventDefault();
      scene.carry(tipCard.dataset.tipCard!, e);
      return;
    }
  };
  for (const el of [root, panelOverlay, scene.panelLayer()]) el.addEventListener("pointerdown", onDown);
  // Рука ложится на стопку или на руку соседа, пока работаю с окном, и через HAND_LINGER_MS после последнего касания уходит.
  const HAND_LINGER_MS = 1200;
  let handOff = 0;
  const handTouch = (e: Event) => {
    if (!(e.target as HTMLElement).closest("[data-panel]")) return;
    window.clearTimeout(handOff);
    handOff = window.setTimeout(() => { local.handOn = false; draw(); }, HAND_LINGER_MS);
    if (!local.handOn) { local.handOn = true; draw(); }
  };
  for (const el of [panelOverlay, scene.panelLayer()]) for (const ev of ["pointerdown", "pointermove"]) el.addEventListener(ev, handTouch);

  /**
   * ЯЗЫЧОК СТОПКИ (лежит на столе, рисует сцена — `scene.onTab`): тянешь — стопка и язычок под пальцем, как несомая карта;
   * отпустил — в руку, в стопку или на сукно; тап — окно, двойной — перевернуть.
   */
  // Стопку берут за язычок и несут сама сцена (тот же движок, что у карты); худу доходит тап и то, какую стопку несут.
  scene.onTab(mountPileTap(scene, store, {
    tap: (pile) => { local.deckTip = local.deckTip === pile ? null : pile; },
    redraw: () => draw(),
  }));
  scene.onPileHeld((pile) => { local.deckCarry = pile; if (pile) local.deckTip = null; draw(); });

  function follow(e: PointerEvent, move: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void): void {
    const m = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) move(ev); };
    const u = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; removeEventListener("pointermove", m); removeEventListener("pointerup", u); removeEventListener("pointercancel", u); up(ev); };
    addEventListener("pointermove", m);
    addEventListener("pointerup", u);
    addEventListener("pointercancel", u);
  }
  // Тап по голове или по стулу на сцене — окно стула (тап, а не облёт камеры: палец почти не сдвинулся).
  let downAt: { x: number; y: number } | null = null;
  // В фазе перехвата: карту, язычок и стопку сцена берёт себе и дальше событие не пускает, а тап по ним тоже должен открывать окно стула.
  stage.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; }, { capture: true });
  stage.addEventListener("pointerup", (e) => {
    if ((e.target as HTMLElement).closest("[data-panel]")) return;
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > TAP_PX) return;
    const hit = scene.pickAt(e.clientX, e.clientY);
    if (hit?.t === "who") {
      const chair = store.state.chairs.find((c) => c.owner === hit.key);
      local.tip = chair && local.tip !== chair.id ? chair.id : null;
    } else if (hit?.t === "chair") local.tip = local.tip === hit.id ? null : hit.id;
    else return;
    draw();
  });
  draw();
}
