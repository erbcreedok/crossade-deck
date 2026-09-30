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

import type { Chair, ChairFlag, Face, GatherSide, Snapshot } from "../../server/src/table/contract.js";
import { SUITS } from "../../server/table-client/felt.js";
import { readLook, writeLook } from "../../server/table-client/deckArt.js";
import { BAR_LOOK, BAR, MENTION_INK, T } from "../../server/table-client/screenConst.js";
import { GLYPH, RIGHTS, SUBS, type BarKey, type GrabMode, type Section } from "../../server/table-client/glyphs.js";
import { barHeightU, blendOf, handWideOf, hudUnitOf, snapPose, type PoseBlend } from "../../server/table-client/handGeom.js";
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
const DECK_DOS: [string, string][] = [["shuffle", "Перемешать"], ["sort", "По масти"], ["flip", "Перевернуть"]];
/** Ручка позы — те же числа, что у стола. */
const HANDLE = { gap: 3, arm: 20, thick: 7, hit: 26, reach: 52 };
const HIT_LEFT = HANDLE.gap + HANDLE.thick + 8 - HANDLE.reach;
const POSE_PX = { wide: 140, lift: 120 };
const TAP_PX = 8;
const RIM_LEFT = 28;
const SIDES: GatherSide[] = ["keep", "down", "up"];
const plate = `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim}`;
const gold = `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo})`;
const TOP = "top:calc(12px + env(safe-area-inset-top, 0px))";

const CSS = `
@font-face { font-family: Tiny5; src: url(${HOST}/table/fonts/tiny5-cyrillic.woff2) format("woff2"); unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: Tiny5; src: url(${HOST}/table/fonts/tiny5-latin.woff2) format("woff2"); unicode-range: U+0000-00FF, U+2000-206F, U+2191, U+2193, U+2212; }
#hud { position: fixed; inset: 0; pointer-events: none; font: 400 13px Tiny5, monospace; color: ${T.ink}; }
#hud button, #hud [role=button], #hud [data-hand-menu], #hud [data-g=journal], #hud [data-g=tip], #hud [data-croupier-acts], #hud [data-confirm], #hud [data-deck-menu], #hud [data-lasso-layer] { pointer-events: auto; }
#hud button { font: inherit; }
`;

export function mountHud(root: HTMLElement, stage: HTMLElement, store: TableStore, scene: SceneApi): void {
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
    journal: false,
    poseDrag: null as null | { id: number; x0: number; y0: number; b0: PoseBlend; b: PoseBlend; moved: boolean },
    deckMenu: null as string | null,
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
  const settings = mountSettings(document.body, {
    sound, haptic, motion, look,
    lookChanged: () => { writeLook(look); scene.setLook({ ...look }); draw(); },
    soundChanged: () => {},
    replay: { may: () => false, ask: () => {}, link: () => null },
    app: { may: () => false, ask: () => {}, link: () => null, open: () => {} },
    meters: { on: () => false, toggle: () => {} },
    record: { on: () => false, toggle: () => {} },
    figures: { on: () => figuresOn, toggle: () => { figuresOn = !figuresOn; scene.setFigures(figuresOn); } },
    footer: () => "песочница 3D · three.js",
    changed: () => draw(),
  });
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
    pick: (x, y) => scene.pickAt(x, y),
    hand: () => (myChair()?.hand ?? []).map((c) => c.id),
    muted: (key) => muted.has(key),
    stickerUrl: (by, id) => `${HOST}/table/stickers/${encodeURIComponent(by)}/${encodeURIComponent(id)}`,
    stickers: () => myStickers,
    hud: () => { const g = scene.glass(), wide = handWideOf(g); return { left: Math.round((g.w - wide) / 2), width: wide }; },
  });
  let myStickers: string[] = [];
  store.onStickers((ids) => { myStickers = ids; talk.refresh(); });

  // ——— где что на стекле — как у стола ———
  const glass = () => scene.glass();
  const hudUnit = () => hudUnitOf(glass());
  const geomNow = (): Geom | null => scene.handGeom();
  const barTopOf = (g: Geom | null) => g?.barTop ?? glass().h - barHeightU() * hudUnit();
  const handTopOf = (g: Geom): number => (g.slots.length ? Math.min(...g.slots.map((sl) => sl.y - g.h / 2)) : g.barTop!);
  const handleInBar = (count: number) => count > 0 && !local.poseDrag?.moved && !!myChair()?.pose.tuck;
  function cornerOf(g: Geom): { x: number; y: number; angle: number } {
    const sl = g.slots.reduce((a, b) => (b.x > a.x ? b : a));
    const r = (sl.angle * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    return { x: sl.x + cos * (g.w / 2) + sin * (g.h / 2), y: sl.y + sin * (g.w / 2) - cos * (g.h / 2), angle: sl.angle };
  }
  function handleAt(g: Geom): { x: number; y: number; size: number } {
    const c = cornerOf(g), k = { x: HIT_LEFT + HANDLE.reach / 2, y: -HANDLE.hit / 2 };
    const r = (c.angle * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    return { x: c.x + cos * k.x - sin * k.y, y: c.y + sin * k.x + cos * k.y, size: HANDLE.hit };
  }
  const thumbTopOf = (g: Geom | null, side: number): number => {
    if (!g) return barTopOf(g) - side - 10;
    const base = g.slots.length && !handleInBar(g.slots.length) ? handleAt(g).y - HANDLE.hit / 2 : handTopOf(g);
    return base - side - 10;
  };

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
  function barRow(s: Snapshot, side: number, step: number): string {
    const open = local.section;
    if (open) {
      let row = barButton(`sec-${open}`, true, side, 0);
      row += `<span data-g="divider" style="position:absolute;left:${Math.round(side + (step - side) / 2 - 1)}px;top:${Math.round(side * 0.15)}px;width:2px;height:${Math.round(side * 0.7)}px;border-radius:1px;background:${BAR_LOOK.rim}"></span>`;
      SUBS[open].forEach((what, j) => (row += barButton(what, barLit(s, what), side, (j + 1) * step)));
      return row;
    }
    return BAR_SECTIONS.map((sec, j) => barButton(`sec-${sec}`, false, side, j * step)).join("");
  }
  const handleFace = (size: number, lit: boolean): string =>
    `<svg viewBox="0 0 24 20" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.52)}" fill="none" stroke="${T.black}" stroke-width="1.6" stroke-linejoin="round"><g fill="${lit ? T.ink : BAR_LOOK.goldHi}">${GLYPH.deck}</g></svg>`;

  // ——— низ: бар, рука, ручка позы, у пальцев — поза тела, компас, диалог ———
  function bottomHtml(s: Snapshot): string {
    const g = glass(), chair = myChair(s), geom = geomNow(), u = hudUnit();
    const wide = handWideOf(g), inset = Math.round((g.w - wide) / 2);
    const count = chair?.hand.length ?? 0, inBar = handleInBar(count);
    const most = 1 + Math.max(...BAR_SECTIONS.map((sec) => SUBS[sec].length)) + (inBar ? 1 : 0);
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
      + (inBar ? `<button data-pose-handle data-in-bar aria-label="Поза руки" style="position:absolute;left:${Math.round((most - 1) * step)}px;top:0;width:${Math.round(side)}px;height:${Math.round(side)}px;border:0;padding:0;border-radius:50%;touch-action:none;cursor:grab;display:flex;align-items:center;justify-content:center;${plate}">${handleFace(side * 0.9, false)}</button>` : "")
      + `</div></div>`;
    // Встать — вопрос над кнопкой, как у стола.
    if (local.confirmLeave && local.section === "chair") {
      const w = 176, h = 64, centre = inset + rowLeft + SUBS.chair.indexOf("leave") * step + step + side / 2;
      const left = Math.max(8, Math.min(g.w - w - 8, centre - w / 2)), arrow = Math.max(12, Math.min(w - 12, centre - left));
      html += `<div data-confirm style="position:absolute;left:${left}px;top:${barTop - h - 12}px;width:${w}px;height:${h}px;box-sizing:border-box;z-index:59;background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px">`
        + `<span style="font:400 12px Tiny5,monospace;color:${T.ink}">Покинуть стул?</span>`
        + `<button data-stand style="align-self:flex-start;border:0;cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:5px 10px;${gold};color:${T.black}">Встать</button>`
        + `<span style="position:absolute;left:${arrow - 7}px;bottom:-7px;width:14px;height:14px;background:${T.well};transform:rotate(45deg);box-shadow:3px 3px 0 0 ${T.black}"></span></div>`;
    }
    // Ручка позы — на правом верхнем углу руки; меню руки — над ней.
    if (geom && count && !inBar) {
      const { x, y, size } = handleAt(geom), c = cornerOf(geom), { gap, arm, thick, hit, reach } = HANDLE, m = gap + thick / 2;
      const path = `M${-arm} ${-m}L${m} ${-m}L${m} ${arm}`, drag = local.poseDrag;
      html += `<div data-g="pose-handle" style="position:absolute;left:${Math.round(c.x)}px;top:${Math.round(c.y)}px;width:0;height:0;z-index:32;transform:rotate(${c.angle}deg)">`
        + `<button data-pose-handle aria-label="Поза руки: вбок — шире или стопкой, вверх — в ряд, вниз — спрятать" style="position:absolute;left:${HIT_LEFT}px;top:${-hit}px;width:${reach}px;height:${hit - 1}px;border:0;padding:0;background:transparent;touch-action:none;cursor:grab"></button>`
        + `<svg data-g="pose-tab" width="1" height="1" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none"><path d="${path}" fill="none" stroke="${T.black}" stroke-width="${thick + 3}" stroke-linecap="round" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="${drag ? T.ink : BAR_LOOK.goldHi}" stroke-width="${thick}" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
      if (drag?.moved && chair) {
        const p = snapPose(drag.b, chair.pose);
        html += `<div data-pose-name style="position:absolute;left:${Math.round(x - 60)}px;top:${Math.round(y - size / 2 - 26)}px;width:120px;text-align:center;z-index:33;pointer-events:none;font:400 12px Tiny5,monospace;color:${T.ink};text-shadow:0 2px 0 ${T.black}">${p.tuck ? "Спрятать" : p.shrink ? "Стопкой" : p.fan ? "Веер" : "В ряд"}</div>`;
      }
      if (local.handMenu) html += handMenuHtml(x + size / 2, y - size / 2 - 8);
    } else if (inBar && local.handMenu) html += handMenuHtml(inset + rowLeft + (most - 1) * step + side, barTop - 8);
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
  function handMenuHtml(right: number, bottom: number): string {
    const g = glass();
    return `<div data-hand-menu style="position:absolute;right:${Math.round(Math.max(8, g.w - right))}px;bottom:${Math.round(g.h - bottom)}px;z-index:70;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;background:linear-gradient(${T.panel},${T.well});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 4px ${BAR_LOOK.rim}">`
      + HAND_DOS.map(([what, name]) => `<button data-hand-do="${what}" style="border:0;cursor:pointer;text-align:left;white-space:nowrap;font:400 13px Tiny5,monospace;color:${T.ink};padding:9px 14px;border-radius:7px;background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black}">${name}</button>`).join("")
      + `</div>`;
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

  // ——— на столе: индикатор стопки, окно стула ———
  function gripsHtml(s: Snapshot): string {
    return scene.pileSpots().map((p) => {
      const pile = s.piles.find((x) => x.id === p.pile)!, lit = local.deckMenu === p.pile;
      return `<div data-g="deck-grip" data-pile="${p.pile}" data-count="${p.count}" role="button" aria-label="Колода" style="position:absolute;left:${Math.round(p.x)}px;top:${Math.round(p.y + 6)}px;transform:translateX(-50%);height:24px;box-sizing:border-box;display:flex;align-items:center;gap:3px;padding:0 7px 0 5px;border-radius:12px;white-space:nowrap;touch-action:none;cursor:grab;z-index:20;user-select:none;`
        + (lit ? `${gold};box-shadow:inset 0 0 0 2px ${T.black},0 2px 0 rgba(11,7,4,.6);` : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 4px ${BAR_LOOK.rim},0 2px 0 rgba(11,7,4,.6);`)
        + `"><svg viewBox="0 0 24 20" width="22" height="17" fill="none" stroke="${T.black}" stroke-width="1.6" stroke-linejoin="round" style="pointer-events:none"><g fill="${lit ? T.ink : BAR_LOOK.goldHi}">${GLYPH.deck}</g></svg>`
        + `<span style="font:400 12px Tiny5,monospace;color:${lit ? T.black : T.ink};pointer-events:none">${pile.cards.length}</span></div>`
        + (lit ? `<div data-deck-menu style="position:absolute;left:${Math.round(p.x)}px;top:${Math.round(p.y + 36)}px;transform:translateX(-50%);z-index:70;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;background:linear-gradient(${T.panel},${T.well});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 4px ${BAR_LOOK.rim}">`
          + DECK_DOS.map(([how, name]) => `<button data-deck-do="${how}" data-pile="${p.pile}" style="border:0;cursor:pointer;text-align:left;white-space:nowrap;font:400 13px Tiny5,monospace;color:${T.ink};padding:9px 14px;border-radius:7px;background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black}">${name}</button>`).join("") + `</div>` : "");
    }).join("");
  }
  /** Окно стула по тапу на голову: кто, флаги (свой — кнопками), «не читать»; у крупье — его дела. */
  function tipHtml(s: Snapshot): string {
    const chair = s.chairs.find((c) => c.id === local.tip);
    if (!chair) return "";
    const sitter = s.people.find((p) => p.key === chair.owner), head = scene.heads().find((h) => h.key === chair.owner);
    const g = glass(), w = Math.min(g.w - 24, 320), left = Math.round(Math.max(12, Math.min(g.w - w - 12, (head?.x ?? g.w / 2) - w / 2))), top = Math.round(Math.max(64, (head?.y ?? 120) + (head?.r ?? 20) + 8));
    const may = chair.id === myChair(s)?.id || s.rights.includes("table.seats") || s.admin === me();
    const chip = (flag: ChairFlag) => {
      const on = chair[flag], lookOf = on ? `${gold};box-shadow:inset 0 0 0 2px ${T.black};` : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim};`;
      const icon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${on ? T.black : "white"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[flag]}</svg>`;
      return may ? `<button data-flag="${flag}" data-chair="${chair.id}" aria-pressed="${on}" style="width:30px;height:30px;border:0;padding:0;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;${lookOf}">${icon}</button>`
        : `<span data-status="${flag}" style="width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;opacity:${on ? 1 : 0.45};${lookOf}">${icon.replace(/width="16" height="16"/, 'width="12" height="12"')}</span>`;
    };
    const who = sitter
      ? `<span style="flex:none;width:30px;height:30px;border-radius:50%;background:${sitter.ink};box-shadow:inset 0 0 0 3px ${T.black};display:flex;align-items:center;justify-content:center;font:400 14px Tiny5,monospace;color:${T.black}">${esc([...sitter.name][0] ?? "?")}</span><span style="font:400 14px Tiny5,monospace;color:${T.ink};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sitter.name)}</span>`
        + (sitter.key !== me() ? `<span data-mute="${esc(sitter.key)}" role="button" aria-pressed="${muted.has(sitter.key)}" style="cursor:pointer;flex:none;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 8px;${muted.has(sitter.key) ? `${gold};color:${T.black}` : `box-shadow:inset 0 0 0 2px ${T.wood};color:${T.inkDim}`}">${muted.has(sitter.key) ? "Читать" : "Не читать"}</span>` : "")
      : `<span style="font:400 14px Tiny5,monospace;color:${T.inkDim};flex:1">Пустой стул</span>`;
    const crew = chair.croupier ? store.crew.filter((one) => !one.adminOnly || s.admin === me()) : [];
    return `<div data-g="tip" data-tip="${chair.id}" style="position:absolute;left:${left}px;top:${top}px;width:${w}px;box-sizing:border-box;z-index:40;background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px;padding:12px">`
      + `<div style="display:flex;align-items:center;gap:9px;height:30px;padding-bottom:8px">${who}<button data-tip-close style="flex:none;width:30px;height:30px;border:0;border-radius:8px;cursor:pointer;background:transparent;color:${T.inkDim};box-shadow:inset 0 0 0 2px ${T.wood}">✕</button></div>`
      + `<div style="display:flex;gap:6px;align-items:center">${RIGHTS.map(chip).join("")}<span style="font:400 11px Tiny5,monospace;color:${T.inkDim};margin-left:4px">${chair.hand.length} в руке</span></div>`
      + (crew.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding-top:10px">${crew.map((one) => `<button data-crew="${esc(one.id)}" style="border:0;cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:8px 10px;background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim};color:${T.ink}">${esc(one.name)}</button>`).join("")}</div>` : "")
      + `</div>`;
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
    const html = lassoLayerHtml() + gripsHtml(s) + tipHtml(s) + topHtml() + journalHtml() + bottomHtml(s);
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
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement, s = store.state, chair = myChair(s);
    const q = (sel: string) => t.closest<HTMLElement>(sel);
    let b: HTMLElement | null;
    if ((b = q("[data-section]"))) {
      const sec = b.dataset.section as Section;
      if (sec === "say") talk.toggle();
      else { local.section = local.section === sec ? null : sec; local.confirmLeave = false; if (sec === "lasso" && !local.section) { local.tool = "cursor"; if (myPicks(s).length) store.send({ t: "unpick" }); } }
    } else if ((b = q("[data-bar]"))) {
      const what = b.dataset.bar as BarKey;
      if ((RIGHTS as readonly string[]).includes(what) && chair) store.send({ t: "flag", chair: chair.id, flag: what as ChairFlag, on: !chair[what as ChairFlag] });
      else if (what === "leave") local.confirmLeave = !local.confirmLeave;
      else if (what === "cursor" || what === "lasso") local.tool = what;
      else if (what === "grab") local.grab = local.grab === "collect" ? "keep" : "collect";
      else if (what === "side") local.side = SIDES[(SIDES.indexOf(local.side) + 1) % SIDES.length]!;
    } else if (q("[data-stand]")) { store.send({ t: "stand" }); local.confirmLeave = false; }
    else if (q("[data-stance-toggle]")) scene.setStance(scene.stance() === "stand" ? "sit" : "stand");
    else if ((b = q("[data-hand-do]")) && chair) {
      const what = b.dataset.handDo!;
      store.send(what === "flip" ? { t: "flip", chair: chair.id } : { t: "arrange", how: what as "suit" | "rank" | "shuffle" | "reverse" });
      local.handMenu = false;
    } else if ((b = q("[data-lasso-act]"))) lassoAct(b.dataset.lassoAct as (typeof LASSO_ACTS)[number][0]);
    else if (q("[data-rooms-back]")) location.href = `${HOST}/table/?rooms`;
    else if (q("[data-settings]")) { if (settings.open) settings.hide(); else settings.show(); }
    else if (q("[data-journal]")) local.journal = !local.journal;
    else if ((b = q("[data-deck-do]"))) { store.send({ t: "deckDo", pile: b.dataset.pile!, how: b.dataset.deckDo as "shuffle" | "sort" | "flip" }); local.deckMenu = null; }
    else if ((b = q("[data-flag]"))) { const c = s.chairs.find((x) => x.id === b!.dataset.chair); if (c) store.send({ t: "flag", chair: c.id, flag: b.dataset.flag as ChairFlag, on: !c[b.dataset.flag as ChairFlag] }); }
    else if ((b = q("[data-mute]"))) { const k = b.dataset.mute!; if (muted.has(k)) muted.delete(k); else { muted.add(k); talk.muted(k); } }
    else if ((b = q("[data-crew]"))) { store.send({ t: "crew", act: b.dataset.crew!, ...(local.tip ? { chair: local.tip } : {}) }); local.tip = null; }
    else if (q("[data-tip-close]")) local.tip = null;
    else return;
    draw();
  });
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
  root.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement, chair = myChair();
    if (t.closest("[data-pose-handle]") && chair) {
      e.preventDefault();
      const b0 = blendOf(chair.pose);
      local.poseDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, b0, b: b0, moved: false };
      follow(e, (ev) => {
        const d = local.poseDrag!;
        const clamp = (v: number) => Math.max(0, Math.min(1, v));
        d.moved ||= Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) >= TAP_PX;
        d.b = { wide: clamp(d.b0.wide + (ev.clientX - d.x0) / POSE_PX.wide), lift: clamp(d.b0.lift - (ev.clientY - d.y0) / POSE_PX.lift) };
        if (d.moved) scene.setBlend(d.b);
        draw();
      }, () => {
        const d = local.poseDrag!;
        local.poseDrag = null;
        scene.setBlend(undefined);
        if (d.moved) { const c = myChair(); if (c) store.send({ t: "pose", chair: c.id, pose: snapPose(d.b, c.pose) }); }
        else local.handMenu = !local.handMenu;
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
    const grip = t.closest<HTMLElement>('[data-g="deck-grip"]');
    if (grip) {
      e.preventDefault();
      const pile = grip.dataset.pile!;
      let moved = false;
      follow(e, (ev) => { moved ||= Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) >= TAP_PX; }, (ev) => {
        if (!moved) { local.deckMenu = local.deckMenu === pile ? null : pile; draw(); return; }
        const at = scene.feltAt(ev.clientX, ev.clientY);
        if (at) store.send({ t: "deckMove", pile, x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100 });
      });
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
  });
  function follow(e: PointerEvent, move: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void): void {
    const m = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) move(ev); };
    const u = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; removeEventListener("pointermove", m); removeEventListener("pointerup", u); removeEventListener("pointercancel", u); up(ev); };
    addEventListener("pointermove", m);
    addEventListener("pointerup", u);
    addEventListener("pointercancel", u);
  }
  // Тап по голове на сцене — окно стула.
  stage.addEventListener("pointerup", (e) => {
    const hit = scene.pickAt(e.clientX, e.clientY);
    if (hit?.t !== "who") return;
    const chair = store.state.chairs.find((c) => c.owner === hit.key);
    local.tip = chair && local.tip !== chair.id ? chair.id : null;
    draw();
  });
  draw();
}
