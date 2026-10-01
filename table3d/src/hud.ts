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

import { DEAL_PRESETS, type Chair, type ChairFlag, type DealDir, type DealRule, type Face, type GatherSide, type PileGuard, type SeenCard, type Snapshot } from "../../server/src/table/contract.js";
import { fingerHtml } from "./finger.js";
import { allowed, may as mayDo } from "../../server/src/table/access.js";
import { SUITS } from "../../server/table-client/felt.js";
import { CAM, CAM_LABEL, CAM_MODES } from "./camera.js";
import { artUrl, readLook, writeLook } from "../../server/table-client/deckArt.js";
import { BAR_LOOK, BAR, MENTION_INK, T } from "../../server/table-client/screenConst.js";
import { GLYPH, RIGHTS, SUBS, type BarKey, type GrabMode, type Section } from "../../server/table-client/glyphs.js";
import { barHeightU, blendOf, handPlan, handWideOf, hudUnitOf, snapPose, type PoseBlend } from "../../server/table-client/handGeom.js";
import { journal } from "../../server/table-client/journal.js";
import { mountSettings } from "../../server/table-client/settings.js";
import { tableSound } from "../../server/table-client/sound.js";
import { tableHaptic } from "../../server/table-client/haptic.js";
import { tableMotion } from "../../server/table-client/motion.js";
import { mountTalk, type WordAnchor } from "../../server/table-client/talk.js";
import { HOST } from "../../server/table-client/host.js";
import type { TableStore } from "../../server/table-client/store.js";
import type { Geom } from "../../server/table-client/screenConst.js";
import type { SceneApi } from "./scene.js";
import { mountPanels } from "./panel.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Секции бара — как у стола: поза, порядок и диалог живут не в баре. */
const BAR_SECTIONS: Section[] = ["chair", "lasso"];
const HAND_DOS: [string, string][] = [["suit", "По масти"], ["rank", "По номиналу"], ["shuffle", "Перемешать"], ["flip", "Перевернуть"], ["reverse", "Наоборот"]];
const LASSO_ACTS = [
  ["cancel", "Отменить", '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'],
  ["flip", "Перевернуть", GLYPH.reverse],
  ["hand", "В руку", '<path d="M12 3v11"/><path d="M7.5 9.5 12 14l4.5-4.5"/><path d="M4 20h16"/>'],
  ["gather", "Собрать", GLYPH.deck],
] as const;
/** Держать стопку в пальце — «держу» чаще, чем истекает лок стола. */
const HOLD_MS = 1500;
const DOUBLE_TAP_MS = 350;
const TAP_PX = 8;
/** Сколько пикселей пальца на всю ось язычка: опустить и положить, сжать, веер ↔ ряд. */
/** Линии хода верхней ручки, доли высоты экрана (390×844): нести стопкой — под нижним краем зума, собираются — по низу кнопки «стоять/сидеть», положить — по центру чата и компаса. */
const LINES = { carry: 0.626, collect: 0.825, lay: 0.866 };
const TAB_PX = { dead: 50, lay: 190, width: 220, curl: 160, carry: 150, pull: 40, tapMs: 300 };
const RIM_LEFT = 28;
const SIDES: GatherSide[] = ["keep", "down", "up"];
const plate = `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim}`;
const gold = `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo})`;
const TOP = "top:calc(12px + env(safe-area-inset-top, 0px))";

const CSS = `
@font-face { font-family: Tiny5; src: url(${HOST}/table/fonts/tiny5-cyrillic.woff2) format("woff2"); unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: Tiny5; src: url(${HOST}/table/fonts/tiny5-latin.woff2) format("woff2"); unicode-range: U+0000-00FF, U+2000-206F, U+2191, U+2193, U+2212; }
#hud { position: fixed; inset: 0; pointer-events: none; font: 400 13px Tiny5, monospace; color: ${T.ink}; }
#hud button, #hud [role=button], #hud [data-hand-tab], #hud [data-hand-menu], #hud [data-g=journal], #hud [data-g=tip], #hud [data-g=deck-tip], #hud [data-deal-panel], #hud [data-confirm], #hud [data-lasso-layer], #hud [data-tip-card] { pointer-events: auto; }
#hud [data-tip-card], [data-panel] [data-tip-card] { touch-action: none; cursor: grab; }
#hud [data-tip-card][data-take="0"], [data-panel] [data-tip-card][data-take="0"] { touch-action: auto; cursor: not-allowed; }
[data-panel] { font: 400 13px Tiny5, monospace; color: ${T.ink}; user-select: none; -webkit-user-select: none; }
#panels { position: fixed; inset: 0; pointer-events: none; z-index: 5; }
#hud button { font: inherit; }
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
    tool: "cursor" as "cursor" | "lasso",
    grab: "collect" as GrabMode,
    side: "keep" as GatherSide,
    handMenu: false,
    /** Какой список открыт из сабменю руки: порядок (`sort`) или поза (`pose`). */
    handPop: null as null | "sort" | "pose",
    /** Ручка тянется за пальцем: её место на экране, пока её держат (левая идёт по горизонтали, верхняя — по вертикали), независимо от того, куда рука сдвигает охват. */
    /** Пока тянут верхнюю ручку: на каких линиях экрана рука ложится на стол и несётся стопкой. */
    grabLines: null as null | { lay: number | null; collect: number | null; carry: number },
    grabOff: null as null | { which: "top" | "left"; x: number; y: number; from?: "stack"; morph: number },
    journal: false,
    deckTip: null as string | null,
    /** Палец или курсор сейчас в окне (стопки, чужого стула) — только тогда моя рука лежит на том, с чем вожусь. */
    handOn: false,
    deckCarry: null as string | null,
    deal: null as null | { rule: DealRule; n: number; all: boolean; seats: string[]; from: string | null; dir: DealDir },
    tip: null as string | null,
    lassoPath: null as { x: number; y: number }[] | null,
  };
  const muted = new Set<string>();
  const me = () => store.me.key;
  const myChair = (s: Snapshot = store.state): Chair | undefined => { const seat = s.people.find((p) => p.key === me())?.seat; return s.chairs.find((c) => c.id === seat); };
  const lassoOn = () => local.section === "lasso";
  const myPicks = (s: Snapshot) => Object.entries(s.picks ?? {}).filter(([, by]) => by === me()).map(([id]) => id);

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
    figures: { on: () => figuresOn, toggle: () => { figuresOn = !figuresOn; scene.setFigures(figuresOn); } },
    footer: () => "песочница 3D · three.js",
    changed: () => draw(),
  });
  try { const saved = Number(localStorage.getItem("t3d.fov")); if (saved) scene.setBaseFov(saved); } catch { /* без памяти — обзор по умолчанию */ }
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
  let lastGripTap = 0;
  // Окна вещей — панели (`panel.ts`): свой слой поверх экрана и слой CSS3D сцены для тех, что на столе.
  const panelOverlay = document.createElement("div");
  panelOverlay.id = "panels";
  screen.append(panelOverlay);
  // Вертикальный ползунок оптики (вид «голова»): вверх — поле зрения уже, рука в кадре остаётся того же размера. Вне перерисовки HUD, чтобы палец его не терял.
  const zoom = document.createElement("div");
  zoom.dataset.zoomSlider = "";
  zoom.style.cssText = `position:absolute;right:${RIM_LEFT - 6}px;top:50%;transform:translateY(-50%);z-index:41;width:44px;height:200px;touch-action:none;cursor:ns-resize;display:none`;
  zoom.innerHTML = `<span style="position:absolute;left:19px;top:6px;bottom:6px;width:6px;border-radius:3px;background:rgba(255,255,255,.35);box-shadow:0 0 0 1.5px rgba(11,7,4,.55)"></span>`
    + `<span data-zoom-knob style="position:absolute;left:8px;width:28px;height:28px;margin-top:-14px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 0 0 2px rgba(11,7,4,.6),0 2px 4px rgba(11,7,4,.4)"></span>`;
  const zoomKnob = zoom.querySelector<HTMLElement>("[data-zoom-knob]")!;
  const zoomPad = 20;
  const zoomSync = () => {
    const on = scene.camMode() === "head";
    if (zoom.style.display !== (on ? "block" : "none")) zoom.style.display = on ? "block" : "none";
    if (on) zoomKnob.style.top = `${zoomPad + (200 - 2 * zoomPad) * (1 - scene.optics())}px`;
  };
  const zoomTo = (e: PointerEvent) => { const r = zoom.getBoundingClientRect(); scene.setOptics(1 - (e.clientY - r.top - zoomPad) / (r.height - 2 * zoomPad)); zoomSync(); };
  zoom.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); zoom.setPointerCapture(e.pointerId); zoomTo(e); });
  zoom.addEventListener("pointermove", (e) => { if (zoom.hasPointerCapture(e.pointerId)) zoomTo(e); });
  screen.append(zoom);
  setInterval(zoomSync, 200);
  const panels = mountPanels(panelOverlay, { ...scene.panels, feltAt: scene.feltAt, glass: scene.glass }, () => draw());
  let shown: string[] = [];
  store.onStickers((ids) => { myStickers = ids; talk.refresh(); });

  // ——— где что на стекле — как у стола ———
  const glass = () => scene.glass();
  const hudUnit = () => hudUnitOf(glass());
  const geomNow = (): Geom | null => scene.handGeom();
  const barTopOf = (g: Geom | null) => g?.barTop ?? glass().h - barHeightU() * hudUnit();
  const handTopOf = (g: Geom): number => (g.slots.length ? Math.min(...g.slots.map((sl) => sl.y - g.h / 2)) : g.barTop!);
  /** Кнопки у пальцев стоят над баром и от позы карт не зависят: рука подняли, положили, сжали — они на месте. */
  const thumbTopOf = (g: Geom | null, side: number): number => barTopOf(g) - side - 10;

  // ——— кнопки бара — вид стола ———
  function barButton(what: BarKey | `sec-${Section}`, lit: boolean, px: number, left = 0): string {
    const glyphOf = what === "grab" ? GLYPH[`grab-${local.grab}`] : what === "side" ? GLYPH[`side-${local.side}`] : undefined;
    const mode = what === "grab" ? ` data-mode="${local.grab}"` : what === "side" ? ` data-mode="${local.side}"` : "";
    const side = Math.round(px), section = what.startsWith("sec-");
    const data = section ? `data-section="${what.slice(4)}"` : `data-bar="${what}"${mode}`;
    const lookOf = section
      ? `border-radius:50%;background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});`
        + (lit ? `box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 5px ${BAR_LOOK.goldHi},0 0 0 2px ${T.black};` : `box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim};`)
      : `border-radius:${Math.round((side * BAR.radius) / BAR.size)}px;`
        + (lit ? `${gold};box-shadow:inset 0 0 0 3px ${T.black};` : `${plate};`);
    const glyph = section && lit ? GLYPH.back : (glyphOf ?? GLYPH[what as keyof typeof GLYPH]);
    const ink = !section && lit ? T.black : section && lit ? BAR_LOOK.goldHi : "white";
    return `<button ${data} aria-pressed="${lit}" style="position:absolute;left:${Math.round(left)}px;top:0;width:${side}px;height:${side}px;border:0;padding:0;`
      + `cursor:pointer;display:flex;align-items:center;justify-content:center;${lookOf}`
      + `"><svg viewBox="0 0 24 24" width="${Math.round(side * 0.5)}" height="${Math.round(side * 0.5)}" fill="none" `
      + `stroke="${ink}" stroke-width="${section && lit ? 2.6 : 2}" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></button>`;
  }
  function barLit(s: Snapshot, what: BarKey): boolean {
    const seat = myChair(s);
    if ((RIGHTS as readonly string[]).includes(what)) return !!seat?.[what as ChairFlag];
    if (what === "leave") return local.confirmLeave;
    if (what === "cursor" || what === "lasso") return local.tool === what;
    return false;
  }
  /**
   * ЛЕВАЯ РУКА — самая левая кнопка бара, видна всегда, как будто левая рука. Нажал — рука поднялась (если лежала) и раскрылось
   * сабменю, как у остальных секций: «порядок» (сорт), «поза», «отпустить» (положить на стол). Карт нет — кнопка тусклая.
   */
  const handOpenNow = (chair: Chair | undefined): boolean => !!chair && chair.hand.length > 0 && local.handMenu && !chair.pose.tuck;
  function handButton(chair: Chair | undefined, side: number): string {
    const has = !!chair && chair.hand.length > 0, open = handOpenNow(chair);
    const lookOf = `border-radius:50%;background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});`
      + (open ? `box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 5px ${BAR_LOOK.goldHi},0 0 0 2px ${T.black};` : `box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim};`);
    return `<button data-hand-btn aria-label="Левая рука" aria-pressed="${open}" style="position:absolute;left:0;top:0;width:${Math.round(side)}px;height:${Math.round(side)}px;border:0;padding:0;cursor:pointer;`
      + `display:flex;align-items:center;justify-content:center;opacity:${has ? 1 : 0.4};${lookOf}">`
      + `<svg viewBox="0 0 24 24" width="${Math.round(side * 0.5)}" height="${Math.round(side * 0.5)}" fill="none" stroke="${open ? BAR_LOOK.goldHi : "white"}" stroke-width="${open ? 2.6 : 2}" stroke-linecap="round" stroke-linejoin="round">${open ? GLYPH.back : GLYPH.deck}</svg></button>`;
  }
  /** Кнопка сабменю руки: квадратная плашка, как у подкнопок секций. */
  const HAND_SUBS = [
    ["sort", "Порядок карт", GLYPH.suit],
    ["pose", "Поза руки", '<path d="M12 20V8"/><path d="M12 20 5 10"/><path d="M12 20l7-10"/><path d="M4 8c2.5-2 5-3 8-3s5.500 1 8 3"/>'],
    ["release", "Отпустить карты на стол", '<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.500-4.500"/><path d="M4 20h16"/>'],
  ] as const;
  function handSubButton(what: (typeof HAND_SUBS)[number], lit: boolean, side: number, left: number): string {
    const [key, label, glyph] = what;
    return `<button data-hand-sub="${key}" aria-label="${label}" aria-pressed="${lit}" style="position:absolute;left:${Math.round(left)}px;top:0;width:${Math.round(side)}px;height:${Math.round(side)}px;border:0;padding:0;cursor:pointer;`
      + `display:flex;align-items:center;justify-content:center;border-radius:${Math.round((side * BAR.radius) / BAR.size)}px;${lit ? `${gold};box-shadow:inset 0 0 0 3px ${T.black};` : `${plate};`}">`
      + `<svg viewBox="0 0 24 24" width="${Math.round(side * 0.5)}" height="${Math.round(side * 0.5)}" fill="none" stroke="${lit ? T.black : "white"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></button>`;
  }
  function barRow(s: Snapshot, side: number, step: number): string {
    const open = local.section, chair = myChair(s);
    let row = handButton(chair, side);
    const divider = (at: number) => `<span data-g="divider" style="position:absolute;left:${Math.round(at + side + (step - side) / 2 - 1)}px;top:${Math.round(side * 0.15)}px;width:2px;height:${Math.round(side * 0.7)}px;border-radius:1px;background:${BAR_LOOK.rim}"></span>`;
    if (handOpenNow(chair)) {
      row += divider(0);
      HAND_SUBS.forEach((sub, j) => (row += handSubButton(sub, local.handPop === sub[0], side, (j + 1) * step + 4)));
      return row;
    }
    if (open) {
      row += barButton(`sec-${open}`, true, side, step);
      row += divider(step);
      SUBS[open].forEach((what, j) => (row += barButton(what, barLit(s, what), side, (j + 2) * step)));
      return row;
    }
    return row + BAR_SECTIONS.map((sec, j) => barButton(`sec-${sec}`, false, side, (j + 1) * step)).join("");
  }
  // ——— низ: бар, рука, ручка позы, у пальцев — поза тела, компас, диалог ———
  function bottomHtml(s: Snapshot): string {
    const g = glass(), chair = myChair(s), geom = geomNow(), u = hudUnit();
    const wide = handWideOf(g), inset = Math.round((g.w - wide) / 2);
    const count = chair?.hand.length ?? 0;
    if (!count) { local.handMenu = false; local.handPop = null; }
    const most = 2 + Math.max(...BAR_SECTIONS.map((sec) => SUBS[sec].length));
    const need = most * BAR.size + (most - 1) * BAR.gap + 2 * BAR.margin;
    const fit = wide / u > 0 && need > wide / u ? Math.max(0.5, wide / u / need) : 1;
    const side = BAR.size * u * fit, step = side + BAR.gap * u * fit, margin = BAR.margin * u * fit;
    const rowW = (need - 2 * BAR.margin) * u * fit, rowLeft = Math.max(margin, Math.round((wide - rowW) / 2));
    const barTop = barTopOf(geom), tray = inset > 0, round = Math.round(BAR.radius * u * 2);
    const edge = tray ? `border-radius:${round}px ${round}px 0 0;box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim}` : `box-shadow:inset 0 3px 0 -1px ${T.black}`;
    let html = (tray ? "" : `<div data-g="fade" style="position:absolute;left:0;right:0;top:${barTop - BAR.fade * u}px;height:${BAR.fade * u}px;background:linear-gradient(to top, rgba(11,7,4,.85), rgba(11,7,4,0));pointer-events:none"></div>`)
      + `<div data-g="bar" style="position:absolute;left:${inset}px;right:${inset}px;top:${barTop}px;height:${barHeightU() * u + 40}px;z-index:30;background:linear-gradient(${T.panel},${T.well});${edge}">`
      + `<div style="position:absolute;left:${rowLeft}px;right:${rowLeft}px;top:${(barHeightU() * u - side) / 2}px;height:${side}px">`
      + barRow(s, side, step)
      + `</div></div>`;
    // Встать — вопрос над кнопкой, как у стола.
    if (local.confirmLeave && local.section === "chair") {
      const w = 176, h = 64, centre = inset + rowLeft + SUBS.chair.indexOf("leave") * step + 2 * step + side / 2;
      const left = Math.max(8, Math.min(g.w - w - 8, centre - w / 2)), arrow = Math.max(12, Math.min(w - 12, centre - left));
      html += `<div data-confirm style="position:absolute;left:${left}px;top:${barTop - h - 12}px;width:${w}px;height:${h}px;box-sizing:border-box;z-index:59;background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px">`
        + `<span style="font:400 12px Tiny5,monospace;color:${T.ink}">Покинуть стул?</span>`
        + `<button data-stand style="align-self:flex-start;border:0;cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:5px 10px;${gold};color:${T.black}">Встать</button>`
        + `<span style="position:absolute;left:${arrow - 7}px;bottom:-7px;width:14px;height:14px;background:${T.well};transform:rotate(45deg);box-shadow:3px 3px 0 0 ${T.black}"></span></div>`;
    }
    // Язычки руки — по центру краёв, каждый за свою ось: сверху — поднять и отпустить, по бокам — сжать и разжать, по углам — веер и не веер.
    const fr = chair && count && !chair.pose.tuck ? scene.handFrame() : null;
    const held = local.grabOff;
    if (fr) html += handGrabsHtml(fr, held?.which ?? null);
    if (local.grabLines) html += grabLinesHtml(local.grabLines);
    if (held) html += heldGrabHtml(held);
    // Рука положена: у стопки на столе — своя ручка (боковая); потянул — рука поднимается и ручка становится верхней ручкой руки.
    const st = chair && count && chair.pose.tuck ? scene.stackScreen() : null;
    if (st && !held) html += handStackGrabHtml(st, barTop);
    // Списки сабменю руки — над своей кнопкой.
    if (chair && handOpenNow(chair) && local.handPop) html += handPopHtml(chair, inset + rowLeft + (local.handPop === "sort" ? 1 : 2) * step + 4, barTop - 8);
    // У пальцев: поза тела и компас слева, диалог справа.
    if (chair) {
      const top = thumbTopOf(geom, side);
      html += `<div data-g="thumb-chat" style="position:absolute;right:${inset + 12}px;top:${Math.round(top)}px;width:${side}px;height:${side}px;z-index:40">${barButton("sec-say", talk.open, side, 0)}</div>`
        + `<div data-g="thumb-stance" style="position:absolute;left:${inset + 12 + (52 - side) / 2}px;top:${Math.round(top - side - 12)}px;width:${side}px;height:${side}px;z-index:40">${barButton("stance", scene.stance() === "stand", side, 0).replace('data-bar="stance"', "data-stance-toggle")}</div>`
        + compassHtml(chair, { left: inset + 12, top: Math.round(top + (side - 52) / 2) });
    }
    if (lassoOn()) html += lassoActsHtml(s, barTop);
    return html;
  }
  /** Ручка у положенной стопки — сбоку от неё, привязана к стопке на столе: ездит с ней по экрану, растёт и уменьшается вместе с ней, а стопки не видно — нет и ручки. */
  function handStackGrabHtml(box: { x: number; y: number; w: number; h: number }, barTop: number): string {
    const g = glass(), ph = Math.round(Math.max(24, Math.min(56, box.h * 0.7))), cy = box.y + box.h / 2;
    // Нижний HUD ручку не перекрывает: стопка ушла под него — ручки нет, у самой кромки — ручка над ним.
    if (cy > barTop) return "";
    return pillHtml("stack", Math.min(g.w - 14, box.x + box.w + 10), Math.min(cy, barTop - 24 - 4), 5, ph, 0.7);
  }
  /** Список из сабменю: порядок карт или поза руки. */
  function handPopHtml(chair: Chair, left: number, bottom: number): string {
    const g = glass(), p = chair.pose, fits = scene.fanFits();
    const btn = (attrs: string, name: string, lit = false, off = false) => `<button ${attrs}${off ? " disabled" : ""} style="border:0;cursor:${off ? "default" : "pointer"};text-align:left;white-space:nowrap;font:400 13px Tiny5,monospace;color:${lit ? T.black : T.ink};opacity:${off ? 0.4 : 1};padding:9px 14px;border-radius:7px;${lit ? gold : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo})`};box-shadow:inset 0 0 0 2px ${T.black}">${name}</button>`;
    const items = local.handPop === "sort"
      ? HAND_DOS.map(([what, name]) => btn(`data-hand-do="${what}"`, name)).join("")
      : btn(`data-hand-pose="fan"`, p.fan ? "В ряд" : "Веер", false, !p.fan && !fits) + btn(`data-hand-pose="shrink"`, p.shrink ? "Разжать" : "Ужать");
    return `<div data-hand-menu style="position:absolute;left:${Math.round(Math.max(8, Math.min(g.w - 170, left)))}px;bottom:${Math.round(g.h - bottom)}px;z-index:70;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;background:linear-gradient(${T.panel},${T.well});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 4px ${BAR_LOOK.rim}">${items}</div>`;
  }
  /**
   * РУЧКИ РУКИ — две обычные ручки, как у шторок на телефоне, без значков: тонкая полоска, за которую тянут.
   *   сверху — высота руки от камеры: потянул вниз — рука опускается и ложится на стол; высоко вверх — левая рука несёт стопку над столом;
   *   слева  — ширина руки: к краю экрана шире, от него уже: стопкой (одна карта) → веер → в ряд (самая широкая, карты не сжаты).
   * Вокруг каждой — зона нажатия не меньше пальца.
   */
  function handGrabsHtml(fr: { x: number; y: number; w: number; h: number }, skip: "top" | "left" | null): string {
    const g = glass(), hit = 48;
    const grab = (which: "top" | "left", cx: number, cy: number, pw: number, ph: number) => {
      if (skip === which) return "";
      const x = Math.max(hit / 2, Math.min(g.w - hit / 2, cx)), y = Math.max(hit / 2, Math.min(g.h - hit / 2, cy));
      return pillHtml(which, x, y, pw, ph, 0.62);
    };
    return grab("top", fr.x + fr.w / 2, fr.y, 40, 5) + grab("left", Math.max(76, fr.x), fr.y + fr.h / 2, 5, 40);
  }
  /** Ручка с зоной нажатия в палец: полоска `pw`×`ph` в точке `x, y`. */
  function pillHtml(which: string, x: number, y: number, pw: number, ph: number, alpha: number): string {
    const hit = 48;
    return `<div data-hand-tab="${which}" aria-label="${which === "left" ? "Ширина руки" : which === "top" ? "Высота руки" : "Поднять руку"}" style="position:absolute;left:${Math.round(x - hit / 2)}px;top:${Math.round(y - hit / 2)}px;width:${hit}px;height:${hit}px;z-index:31;touch-action:none;cursor:grab;display:flex;align-items:center;justify-content:center">`
      + `<span style="width:${pw}px;height:${ph}px;border-radius:${Math.round(Math.min(pw, ph) / 2)}px;background:rgba(255,255,255,${alpha});box-shadow:0 0 0 1.5px rgba(11,7,4,.55),0 2px 4px rgba(11,7,4,.4)"></span></div>`;
  }
  /**
   * Ручка в пальце: одна и та же ручка, пока её держат, — всегда под пальцем и не зависит от того, куда рука сдвигает охват или
   * как пропадает рамка. Та, что была боковой у стопки, разворачивается в верхнюю ручку руки (`morph` 0 → 1) и не прыгает.
   */
  function heldGrabHtml(o: { which: "top" | "left"; x: number; y: number; from?: "stack"; morph: number }): string {
    const g = glass(), x = Math.max(24, Math.min(g.w - 24, o.x)), y = Math.max(24, Math.min(g.h - 24, o.y));
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * o.morph);
    const [pw, ph] = o.which === "left" ? [5, 40] : o.from === "stack" ? [lerp(5, 40), lerp(40, 5)] : [40, 5];
    return pillHtml(o.which, x, y, pw, ph, 0.95);
  }
  /** Линии хода верхней ручки: за оранжевую карты начинают собираться в стопку, за красную рука ложится на стол, за золотую несётся стопкой над столом. Видны, пока ручку тянут. */
  function grabLinesHtml(l: { lay: number | null; collect: number | null; carry: number }): string {
    const line = (k: string, y: number, color: string, text: string) => `<div data-grab-line="${k}" style="position:absolute;left:0;right:0;top:${Math.round(y)}px;height:0;border-top:2px dashed ${color};z-index:32;pointer-events:none"><span style="position:absolute;left:72px;top:-20px;padding:2px 6px;border-radius:6px;font:400 11px Tiny5,monospace;color:${T.black};background:${color}">${text}</span></div>`;
    return line("carry", l.carry, "#f2c14e", "нести стопкой") + (l.collect === null ? "" : line("collect", l.collect, "#f08a24", "карты собираются")) + (l.lay === null ? "" : line("lay", l.lay, "#e0654b", "положить на стол"));
  }
  /** Компас стола: стрелка — к своему стулу, диск лежит под наклоном камеры. */
  function compassHtml(chair: Chair, at: { left: number; top: number }): string {
    const turn = chair.angle - scene.azimuth(), lean = 90 - scene.elevation();
    return `<button data-home aria-label="К своему стулу" style="position:absolute;left:${at.left}px;top:${at.top}px;width:52px;height:52px;border:0;padding:0;z-index:45;touch-action:none;`
      + `border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;${plate}">`
      + `<svg viewBox="0 0 52 52" width="52" height="52" style="position:absolute;left:0;top:0;transform:rotate(${turn.toFixed(1)}deg);pointer-events:none">`
      + `<path d="M26 5 L30 14 L22 14 Z" fill="${T.gold}"/><path d="M26 47 L22 38 L30 38 Z" fill="${BAR_LOOK.rim}"/>`
      + `<circle cx="7" cy="26" r="2" fill="${T.inkDim}" opacity=".7"/><circle cx="45" cy="26" r="2" fill="${T.inkDim}" opacity=".7"/></svg>`
      + `<span data-lean style="position:relative;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;`
      + `box-shadow:inset 0 0 0 2px ${T.black};transform:perspective(90px) rotateX(${lean.toFixed(1)}deg);background:linear-gradient(${T.panelLight},${T.panel});color:${T.inkDim}">`
      + `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="7" width="12.5" height="10" rx="2.5"/><path d="M15 10.5 L21.5 7 v10 L15 13.5 Z"/></svg></span></button>`;
  }
  function lassoActsHtml(s: Snapshot, barTop: number): string {
    const n = myPicks(s).length, g = glass(), w = Math.min(g.w - 16, 360), geom = geomNow();
    const top = (geom && geom.slots.length ? handTopOf(geom) : barTop) - 50;
    return `<div data-g="lasso-acts" data-n="${n}" style="position:absolute;left:${(g.w - w) / 2}px;top:${top}px;width:${w}px;height:42px;z-index:57;display:flex;gap:6px;box-sizing:border-box;padding:4px;border-radius:12px;background:${T.well};box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 4px ${T.wood},0 4px 0 rgba(11,7,4,.5)">`
      + LASSO_ACTS.map(([act, label, glyph]) => `<button data-lasso-act="${act}" aria-disabled="${n === 0}" style="flex:1 1 0;min-width:0;border:0;border-radius:8px;cursor:${n ? "pointer" : "default"};display:flex;align-items:center;justify-content:center;gap:4px;padding:0 4px;opacity:${n ? 1 : 0.45};color:${T.ink};font:400 11px Tiny5,monospace;white-space:nowrap;background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim}">`
        + `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${glyph}</svg><span style="overflow:hidden;text-overflow:ellipsis">${label}</span></button>`).join("")
      + `</div>`;
  }

  // ——— верх: выход, имя, настройки, журнал ———
  /** ТОЛЬКО ДЛЯ РАЗРАБОТКИ (есть лишь у стенда): за кого я сижу; тап — стать другим игроком и обратно. */
  function devHtml(): string {
    if (!dev) return "";
    const chip = (attrs: string, top: number, aria: string, text: string, on = false) =>
      `<button ${attrs} aria-label="${aria}" style="position:absolute;left:${RIM_LEFT}px;top:calc(${top}px + env(safe-area-inset-top, 0px));z-index:61;border:0;cursor:pointer;padding:6px 10px;border-radius:9px;font:400 11px Tiny5,monospace;color:${on ? T.black : T.ink};background:${on ? `linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo})` : T.well};box-shadow:inset 0 0 0 2px ${store.me.ink},0 3px 0 rgba(11,7,4,.5);white-space:nowrap">${text}</button>`;
    return chip("data-dev-switch", 60, "Только для разработки: управлять другим экраном (клавиша Tab)", `DEV · ${esc(dev.label)} · Tab`)
      + chip("data-dev-cam", 128, "Только для разработки: модель камеры — орбита, голова, оптика, сверху", `DEV · камера: ${CAM_LABEL[scene.camMode()]}`, scene.camMode() !== "orbit")
      + chip("data-dev-peek", 94, "Только для разработки: окно с видом глазами другого", `DEV · окно: ${esc(dev.peek.label)} ${dev.peek.on() ? "вкл" : "выкл"}`, dev.peek.on());
  }
  function topHtml(): string {
    const btn = (attrs: string, at: string, inner: string) => `<button ${attrs} style="position:absolute;${at};${TOP};width:40px;height:40px;border:0;padding:0;z-index:61;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;${plate}">${inner}</button>`;
    const icon = (body: string, stroke = "white", size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    return btn(`data-rooms-back aria-label="Выйти из комнаты"`, `left:${RIM_LEFT}px`, icon(`<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 16l-4-4 4-4"/><path d="M5 12h10"/>`))
      + `<div data-table-name style="position:absolute;left:${RIM_LEFT + 48}px;right:${RIM_LEFT + 96}px;${TOP};height:40px;z-index:60;display:flex;align-items:center;pointer-events:none"><span style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 12px;border-radius:12px;font:400 13px Tiny5,monospace;color:${T.ink};line-height:28px;${plate}">${esc(store.title)}</span></div>`
      + btn(`data-settings aria-label="Настройки" aria-expanded="${settings.open}"`, `right:${RIM_LEFT + 48}px`, icon(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`))
      + btn(`data-journal aria-label="Журнал партии" aria-expanded="${local.journal}"`, `right:${RIM_LEFT}px`, icon(`<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h7M8 11h7M8 15h4"/>`, local.journal ? T.gold : "white", 21));
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
    return `<div data-g="journal" style="position:absolute;left:12px;right:12px;top:calc(60px + env(safe-area-inset-top, 0px));max-height:min(52vh,420px);overflow-y:auto;overflow-x:hidden;touch-action:pan-y;overscroll-behavior:contain;z-index:62;border-radius:14px;font:400 13px/1.45 Tiny5,monospace;color:${T.ink};${plate}">`
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
    const acts: [string, string, string][] = [["shuffle", GLYPH.shuffle, "Перемешать"], ["sort", GLYPH.suit, "Отсортировать"], ["flip", GLYPH.reverse, "Перевернуть"]];
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
  function lassoLayerHtml(): string {
    if (!lassoOn() || local.tool !== "lasso") return "";
    const path = local.lassoPath;
    return `<div data-lasso-layer style="position:absolute;inset:0;z-index:25;touch-action:none;cursor:crosshair">`
      + (path && path.length > 1 ? `<svg width="100%" height="100%" style="position:absolute;inset:0;pointer-events:none"><polygon points="${path.map((q) => `${q.x.toFixed(0)},${q.y.toFixed(0)}`).join(" ")}" fill="rgba(242,193,78,.12)" stroke="${T.black}" stroke-width="4" stroke-linejoin="round"/><polygon points="${path.map((q) => `${q.x.toFixed(0)},${q.y.toFixed(0)}`).join(" ")}" fill="none" stroke="${T.gold}" stroke-width="2" stroke-dasharray="6 4" stroke-linejoin="round"/></svg>` : "")
      + `</div>`;
  }

  // ——— перерисовка: раз в кадр, и только если что-то поменялось ———
  let frame = 0, last = "";
  function draw(): void { if (!frame) frame = requestAnimationFrame(render); }
  function render(): void {
    frame = 0;
    const s = store.state;
    scene.setLasso(lassoOn(), local.grab);
    scene.setTabLit(new Set([local.deckTip, local.deckCarry].filter((x): x is string => !!x)));
    // Работаю с окном стопки — я с ней вожусь: моя правая рука на ней (и её видят остальные). Открыто, но не тронуто — рука свободна.
    // Работаю с окном чужого стула — моя правая рука у его левой руки (с веером).
    const open = local.handOn && local.deckTip ? s.piles.find((p) => p.id === local.deckTip) : undefined;
    const chairOpen = local.handOn ? s.chairs.find((c) => c.id === local.tip && c.owner && c.owner !== me()) : undefined;
    if (!local.deckCarry) scene.setRestRight(open ? { x: open.x, y: open.y } : chairOpen ? scene.handOf(chairOpen.id) : null);
    const html = lassoLayerHtml() + topHtml() + devHtml() + journalHtml() + bottomHtml(s) + dealHtml(s);
    shown = [];
    pilePanel(s);
    chairPanel(s);
    panels.keep(shown);
    if (html !== last) { last = html; root.innerHTML = html; }
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
      if (sec === "say") talk.toggle();
      else { local.section = local.section === sec ? null : sec; local.handMenu = false; local.handPop = null; local.confirmLeave = false; if (sec === "lasso" && !local.section) { local.tool = "cursor"; if (myPicks(s).length) store.send({ t: "unpick" }); } }
    } else if ((b = q("[data-bar]"))) {
      const what = b.dataset.bar as BarKey;
      if ((RIGHTS as readonly string[]).includes(what) && chair) store.send({ t: "flag", chair: chair.id, flag: what as ChairFlag, on: !chair[what as ChairFlag] });
      else if (what === "leave") local.confirmLeave = !local.confirmLeave;
      else if (what === "cursor" || what === "lasso") local.tool = what;
      else if (what === "grab") local.grab = local.grab === "collect" ? "keep" : "collect";
      else if (what === "side") local.side = SIDES[(SIDES.indexOf(local.side) + 1) % SIDES.length]!;
    } else if (q("[data-stand]")) { store.send({ t: "stand" }); local.confirmLeave = false; }
    else if (q("[data-stance-toggle]")) scene.setStance(scene.stance() === "stand" ? "sit" : "stand");
    else if (q("[data-hand-btn]")) {
      if (chair && chair.hand.length) {
        // Рука лежала — нажатие только поднимает её; сабменю раскрывается следующим нажатием (ещё раз — сворачивается).
        local.handPop = null;
        if (chair.pose.tuck) { store.send({ t: "pose", chair: chair.id, pose: { ...chair.pose, tuck: false } }); local.handMenu = false; local.section = null; }
        else { local.handMenu = !local.handMenu; if (local.handMenu) local.section = null; }
      }
    } else if ((b = q("[data-hand-sub]")) && chair) {
      const what = b.dataset.handSub as "sort" | "pose" | "release";
      if (what === "release") { store.send({ t: "pose", chair: chair.id, pose: { ...chair.pose, tuck: true } }); local.handMenu = false; local.handPop = null; }
      else local.handPop = local.handPop === what ? null : what;
    } else if ((b = q("[data-hand-pose]")) && chair) {
      const what = b.dataset.handPose as "fan" | "shrink";
      store.send({ t: "pose", chair: chair.id, pose: { ...chair.pose, [what]: !chair.pose[what] } });
      local.handPop = null;
    } else if ((b = q("[data-hand-do]")) && chair) {
      const what = b.dataset.handDo!;
      store.send(what === "flip" ? { t: "flip", chair: chair.id } : { t: "arrange", how: what as "suit" | "rank" | "shuffle" | "reverse" });
      local.handPop = null;
    } else if ((b = q("[data-lasso-act]"))) lassoAct(b.dataset.lassoAct as (typeof LASSO_ACTS)[number][0]);
    else if (q("[data-rooms-back]")) location.href = `${HOST}/table/?rooms`;
    else if (q("[data-settings]")) { if (settings.open) settings.hide(); else settings.show(); }
    else if (q("[data-journal]")) local.journal = !local.journal;
    else if (q("[data-dev-switch]")) dev?.onSwitch();
    else if (q("[data-dev-cam]")) { scene.setCamMode(CAM_MODES[(CAM_MODES.indexOf(scene.camMode()) + 1) % CAM_MODES.length]!); draw(); }
    else if (q("[data-dev-peek]")) { dev?.peek.onToggle(); draw(); }
    else if ((b = q("[data-sit]"))) { store.send({ t: "sit", chair: b.dataset.sit! }); local.tip = null; }
    else if ((b = q("[data-deck-do]")) && local.deckTip) store.send({ t: "deckDo", pile: local.deckTip, how: b.dataset.deckDo as "shuffle" | "sort" | "flip" });
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
  function lassoAct(act: (typeof LASSO_ACTS)[number][0]): void {
    const s = store.state, ids = myPicks(s), chair = myChair(s);
    if (act === "cancel") { store.send({ t: "unpick" }); return; }
    if (!ids.length) return;
    if (act === "flip") store.send({ t: "turnMany", ids });
    else if (act === "hand" && chair) { const staying = chair.hand.filter((c) => !ids.includes(c.id)).length; store.send({ t: "moveMany", moves: ids.map((id, k) => ({ id, to: { in: "hand" as const, chair: chair.id, i: staying + k } })) }); store.send({ t: "unpick" }); }
    else if (act === "gather") {
      const felt = s.felt.filter((f) => ids.includes(f.id)), g = glass();
      const at = felt.length ? { x: felt.reduce((m, f) => m + f.x, 0) / felt.length, y: felt.reduce((m, f) => m + f.y, 0) / felt.length } : scene.feltAt(g.w / 2, g.h / 2) ?? { x: 0, y: 0 };
      store.send({ t: "gather", ids, side: local.side, to: { ...at, angle: ((-(chair?.angle ?? 0) % 360) + 360) % 360 } });
      store.send({ t: "unpick" });
    }
  }

  // Тянуть: ручку позы, компас, индикатор стопки, лассо. Тап без сдвига — их тап.
  const onDown = (e: PointerEvent): void => {
    if (panels.press(e)) return;
    const t = e.target as HTMLElement, chair = myChair();
    const tab = t.closest<HTMLElement>("[data-hand-tab]");
    if (tab && chair) {
      // Ручку тянут: сама ручка идёт за пальцем, рука меняется по своей оси, отпустил — поза легла.
      e.preventDefault();
      const raw = tab.dataset.handTab as "top" | "left" | "stack", fromStack = raw === "stack", which: "top" | "left" = fromStack ? "top" : raw;
      // Ручка у положенной стопки: тап — рука поднимается; потянул с запасом — поднимается и она же становится верхней ручкой руки;
      // держишь или чуть потянул и вернул — рука остаётся на столе.
      const b0 = blendOf({ ...chair.pose, tuck: false }), w0 = scene.handWidth(), c0 = scene.handCurl(), h0 = scene.handHeight();
      const box = tab.getBoundingClientRect(), x0 = box.x + box.width / 2, y0 = box.y + box.height / 2;
      // Ручка у стопки не исчезает вместе со стопкой: сразу становится ручкой в пальце, идёт под ним и разворачивается в верхнюю.
      if (fromStack) local.grabOff = { which: "top", x: x0, y: y0, from: "stack", morph: 0 };
      // Линии хода верхней ручки: «положить» — на уровне кнопок чата и компаса (по их центру), «нести стопкой» — на нижней границе оптического зума,
      // но не ближе `carry` над местом хвата (выше — диапазон высоты руки). Рука ложится, если отпустить ниже красной линии; несётся стопкой, пока палец выше золотой (вернул к месту хвата — снова в руке).
      // Линии — якоря экрана: доли его высоты, снятые с кнопок и зума как они стоят сейчас; кнопки и зум переедут — линии останутся.
      // Золотая линия — граница несения: палец выше неё — вся рука несётся стопкой туда, куда указал, ниже (с запасом) — снова в руке.
      const H = glass().h, layY = H * LINES.lay, collectY = H * LINES.collect;
      const carryY = !fromStack && which === "top" ? H * LINES.carry : -Infinity;
      if (!fromStack && which === "top") local.grabLines = { lay: b0.lift > 0.25 ? layY : null, collect: b0.lift > 0.25 ? collectY : null, carry: carryY };
      let lastY = y0;
      let dx = 0, dy = 0, moved = false, carrying = false, lifted = !fromStack;
      const t0 = performance.now(), lift = () => { if (!lifted) { lifted = true; const c = myChair(); if (c) store.send({ t: "pose", chair: c.id, pose: { ...c.pose, tuck: false } }); } };
      follow(e, (ev) => {
        dx = ev.clientX - e.clientX; dy = ev.clientY - e.clientY; lastY = ev.clientY; moved ||= Math.hypot(dx, dy) >= TAP_PX;
        const dist = Math.hypot(dx, dy);
        if (fromStack && !lifted && dist >= TAB_PX.pull) lift();
        local.grabOff = moved || fromStack ? { which, x: fromStack || which === "left" ? x0 + dx : x0, y: y0 + dy, ...(fromStack ? { from: "stack" as const } : {}), morph: fromStack ? Math.max(0, Math.min(1, (dist - TAB_PX.pull) / 40)) : 1 } : null;
        if (fromStack && !lifted) { draw(); return; }
        if (which === "left") {
          // К краю экрана — шире. За пределом ручка продолжает идти за пальцем, а карты натягиваются и перестают расти.
          // Вверх — веер загибается сильнее, вниз — выпрямляется (карты по дуге, как держат пальцами).
          if (moved) { scene.setHandWidth(w0 - dx / TAB_PX.width); scene.setHandCurl(c0 - dy / TAB_PX.curl); }
        } else {
          // Высоко вверх — левая рука несёт всю руку стопкой над столом, как колоду; вернул вниз, не отпуская, — карты назад в руку.
          if (fromStack ? dy <= -TAB_PX.carry || carrying : (ev.clientY <= carryY && dy <= -TAB_PX.pull) || carrying) {
            carrying = scene.carryHand({ x: ev.clientX, y: ev.clientY }, fromStack ? undefined : { enter: carryY, exit: carryY + 20 });
            if (carrying) { scene.setBlend(undefined); draw(); return; }
          }
          // Иначе рука следует за ручкой по высоте и остаётся там, где отпустили: вверх — выпрямляется веер, вниз — вслед за пальцем до оранжевой линии, дальше карты собираются и опускается на стол.
          if (moved) scene.setHandHeight(h0 - Math.min(dy, Math.max(0, collectY - y0)));
          // Карты не трогаются, пока палец не пересёк оранжевую линию; от неё до красной собираются в стопку, на красной — собраны.
          scene.setBlend(moved && ev.clientY > collectY ? { wide: b0.wide, lift: Math.max(0, b0.lift * (1 - (ev.clientY - collectY) / Math.max(1, layY - collectY))) } : undefined);
        }
        draw();
      }, () => {
        local.grabLines = null;
        local.grabOff = null;
        scene.setBlend(undefined);
        // Тап по ручке стопки поднимает руку; держал или потянул и вернул — остаётся на столе.
        if (fromStack && !lifted) { if (!moved && performance.now() - t0 < TAB_PX.tapMs) lift(); draw(); return; }
        if (carrying) { scene.carryHand(null); draw(); return; }
        const c = myChair();
        if (which === "left") scene.setHandWidth(null);
        else if (c && moved && dy > TAB_PX.dead && lastY >= layY) { store.send({ t: "pose", chair: c.id, pose: { ...c.pose, tuck: true } }); scene.setHandHeight(0); local.handMenu = false; local.handPop = null; }
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
    if (t.closest("[data-lasso-layer]")) {
      e.preventDefault();
      local.lassoPath = [{ x: e.clientX, y: e.clientY }];
      follow(e, (ev) => { local.lassoPath!.push({ x: ev.clientX, y: ev.clientY }); draw(); }, () => {
        const poly = local.lassoPath ?? [];
        local.lassoPath = null;
        const ids = poly.length > 2 ? scene.cardsIn(poly).filter((id) => !store.state.picks[id]) : [];
        if (ids.length) store.send({ t: "pick", ids, on: true });
        draw();
      });
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
  function tabDown(pile: string, e: PointerEvent): void {
    e.preventDefault();
    scene.grabPile(pile, { x: e.clientX, y: e.clientY });
    const pinned = !!store.state.piles.find((x) => x.id === pile)?.pin;
    let moved = false, hold = 0;
    follow(e, (ev) => {
      if (pinned) return;
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < TAP_PX) return;
      if (!moved) { moved = true; local.deckTip = null; local.deckCarry = pile; store.send({ t: "grip", pile }); hold = window.setInterval(() => { if (local.deckCarry === pile) store.send({ t: "hold", id: pile }); else clearInterval(hold); }, HOLD_MS); }
      if (moved && local.deckCarry !== pile) return;
      scene.carryPile(pile, { x: ev.clientX, y: ev.clientY });
      draw();
    }, (ev) => {
      clearInterval(hold);
      if (moved && local.deckCarry !== pile) return;
      if (!moved) {
        const now = performance.now();
        if (now - lastGripTap < DOUBLE_TAP_MS) { lastGripTap = 0; const p = store.state.piles.find((x) => x.id === pile); if (p && !p.lock) store.send({ t: "deckDo", pile, how: "flip" }); }
        else { lastGripTap = now; local.deckTip = local.deckTip === pile ? null : pile; }
        draw();
        return;
      }
      local.deckCarry = null;
      store.send({ t: "release", id: pile });
      const a = scene.aim(ev.clientX, ev.clientY, pile);
      if (a.in === "hand") store.send({ t: "pileDrop", pile, to: a });
      else if (a.in === "deck") store.send({ t: "pileDrop", pile, to: a });
      else { const at = scene.pileAt(pile) ?? a; store.send({ t: "deckMove", pile, x: at.x, y: at.y, angle: ((-(myChair()?.angle ?? 0) % 360) + 360) % 360 }); }
      scene.carryPile(pile, null);
      draw();
    });
  }
  scene.onTab(tabDown);

  function follow(e: PointerEvent, move: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void): void {
    const m = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) move(ev); };
    const u = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; removeEventListener("pointermove", m); removeEventListener("pointerup", u); removeEventListener("pointercancel", u); up(ev); };
    addEventListener("pointermove", m);
    addEventListener("pointerup", u);
    addEventListener("pointercancel", u);
  }
  // Тап по голове или по стулу на сцене — окно стула (тап, а не облёт камеры: палец почти не сдвинулся).
  let downAt: { x: number; y: number } | null = null;
  stage.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
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
