// ЭКРАН СТОЛА — холст со столом, моя рука внизу, чужие руки в тултипах и палец, который всё это носит.
//
// Экран не хранит стол: он спрашивает хранилище (`TableStore`) и держит только то, что есть лишь у
// него, — что сейчас в воздухе, какие окна открыты, как сложена моя рука. Всё, что меняет стол,
// уходит намерением; пока ответ не пришёл, экран показывает ожидаемое (`pending`), а отказ просто
// возвращает настоящий снимок.

import { HOLD_EVERY_MS, type Face, type Intent, type Person, type SeenCard, type Snapshot, type Where } from "../src/table/contract.js";
import { applyPatch } from "../src/table/patch.js";
import { CARD as FELT_CARD, SEAT_REACH, SUITS, deckAt, drawFelt, type FeltView, type Pose, type Seat, type Spot } from "./felt.js";
import { tableCamera } from "./camera.js";
import type { TableStore } from "./store.js";

const T = {
  black: "#0b0704", ink: "#f5ead0", inkDim: "#cdb98f", gold: "#f2c14e",
  well: "#1c120b", panel: "#3a2a1d", panelLight: "#4a3627", wood: "#6b4d2c",
};
const BAR_LOOK = { plateHi: "#25321f", plateLo: "#16210f", rim: "#6b4d2c", goldHi: "#f8d885", goldLo: "#b08a26" };

/** НИЖНИЙ БАР И ПОЛОСА РУКИ — числа продукта. Единица HUD — доля стекла, а не единица сукна. */
const BAR = { size: 0.6, gap: 0.08, margin: 0.22, pad: 0.11, radius: 0.11, tuck: 0.24, fade: 1 };
const HUD_FAN = { radius: 7, apart: 1.06, shut: 0.14, edge: 0.1 };
const HUD_CARDS = 6, HUD_GAP = 0.06, HUD_MARGIN = 0.14, HAND_PAD = 0.16, TUCK_TIP = 0.45;
/** На сколько несомая карта висит выше того места, куда летит — доля её высоты. */
const CARRY_CLEAR = 0.32;
const HAND_ROOM = 0.6 / 4 + 0.06;
const HUD_UNIT_FRACTION = 0.25;
const CARD = { w: 1, h: 1.4 };

const RIGHTS = ["pin", "lock", "hide"] as const;
const FOLDS = ["fan", "shrink", "tuck"] as const;
const POSES = ["flip", ...FOLDS] as const;
type BarKey = (typeof RIGHTS)[number] | (typeof POSES)[number];
const GLYPH: Record<BarKey, string> = {
  pin: '<path d="M9 3h6l-1 6h2l1 5H7l1-5h2L9 3z"/><path d="M12 14v7"/>',
  lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3"/><path d="M5 11h14v10H5z"/>',
  hide: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9 9 0 0 1 22 12s-1.5 2.6-4.3 4.5"/><path d="M6.4 7.6C3.9 9.3 2 12 2 12s4 7 10 7c1.5 0 2.9-.3 4.1-.9"/>',
  flip: '<rect x="7.5" y="4" width="9" height="16" rx="1.5"/><path d="M4 9.5A9 9 0 0 1 8.2 4.4"/><path d="M8.6 2.2 8.2 4.4l2.2.5"/><path d="M20 14.5A9 9 0 0 1 15.8 19.6"/><path d="M15.4 21.8l.4-2.2-2.2-.5"/>',
  fan: '<rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(-28 12 20)"/><rect x="9" y="5" width="6" height="12" rx="1"/><rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(28 12 20)"/>',
  shrink: '<rect x="8" y="5" width="8" height="14" rx="1"/><path d="M2 12h4"/><path d="M4 9.5 6.5 12 4 14.5"/><path d="M22 12h-4"/><path d="M20 9.5 17.5 12l2.5 2.5"/>',
  tuck: '<rect x="8" y="3" width="8" height="11" rx="1"/><path d="M3 18h18"/><path d="M12 14v-4"/><path d="M9.5 12.5 12 15l2.5-2.5"/>',
};

type Slot = { x: number; y: number; angle: number };
interface Geom {
  which: string;
  mirror: boolean;
  w: number;
  h: number;
  slots: Slot[];
  barTop?: number;
  box?: TipBox;
}
interface TipBox { left: number; top: number; w: number; height: number; cw: number; ch: number; rowH: number; rowTop: number; inner: number }

type Aim = { kind: "hand"; which: string; index: number } | { kind: "felt"; at: { x: number; y: number } };

interface Drag {
  card: SeenCard;
  shown: boolean;
  w: number;
  h: number;
  gx: number;
  gy: number;
  x: number;
  y: number;
  target: Aim;
  markKind?: Aim["kind"];
  hold: number;
}

export function mountScreen(stage: HTMLElement, store: TableStore): void {
  const canvas = stage.querySelector("canvas")!;
  const over = stage.querySelector<HTMLElement>("#over")!;
  const images: Record<string, HTMLImageElement> = {};

  /** Только то, что есть у этого экрана и больше нигде. */
  const local = {
    pose: { fan: true, shrink: false, tuck: false } as Pose,
    on: { pin: false, lock: false, hide: false },
    tips: [] as string[],
  };
  let drag: Drag | null = null;
  /**
   * ПОЛОЖЕНО, НО СЕРВЕР ЕЩЁ НЕ ОТВЕТИЛ: показываем то, что ждём. Ответ узнаётся по блокировке — она
   * была моей и снялась (дроп приходит вместе с `unlock`). По месту карты его не узнать: карта,
   * переложенная внутри той же руки, «уже на месте» ещё до того, как сервер что-то сделал.
   */
  let pending: { id: string; to: Where; card: SeenCard; from: Where; sawLock: boolean } | null = null;
  let spots: Spot[] = [];
  let view: FeltView | null = null;
  /** Кадр камеры — стекло над рукой; пишется при каждом рисовании, читается камерой на жесте. */
  let lastFrame = { w: 1, h: 1 };
  let frameRequested = false;
  /** Кадр по требованию: жест и бросок просят перерисовку, а не крутят свой цикл. */
  const redraw = () => {
    if (frameRequested) return;
    frameRequested = true;
    let last = performance.now();
    const tick = (now: number) => {
      frameRequested = false;
      const flying = cam.control.step((now - last) / 1000);
      last = now;
      draw();
      if (flying && !frameRequested) {
        frameRequested = true;
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  };
  const cam = tableCamera(canvas, () => lastFrame, redraw);
  /** Кадр сменился (рука выросла, телефон повернули) — камера держит стол в новом. */
  let seenFrame = "";
  const syncCamera = () => {
    const key = `${lastFrame.w}x${lastFrame.h}`;
    if (key === seenFrame) return;
    seenFrame = key;
    cam.control.refresh();
  };

  // ── ЧТО ПОКАЗЫВАТЬ ─────────────────────────────────────────────────────────────────────────

  const me = () => store.me.key;

  /** Снимок, каким его видно сейчас: настоящий, с ожидаемым ходом поверх и без карты в воздухе. */
  function seen(): Snapshot {
    let s = store.state;
    if (pending) s = applyPatch(s, { v: s.v, ops: [{ t: "move", card: pending.card, from: pending.from, to: pending.to }] });
    if (!drag) return s;
    const id = drag.card.id;
    const hands = Object.fromEntries(Object.entries(s.hands).map(([k, h]) => [k, h.filter((c) => c.id !== id)]));
    return { ...s, hands, deck: s.deck.filter((c) => c.id !== id), felt: s.felt.filter((c) => c.id !== id) };
  }

  const people = (s: Snapshot): Person[] => [...s.people.filter((p) => p.key === me()), ...s.people.filter((p) => p.key !== me())];
  const handOf = (s: Snapshot, key: string): SeenCard[] => s.hands[key] ?? [];
  const inkOf = (s: Snapshot, key: string) => s.people.find((p) => p.key === key)?.ink ?? T.inkDim;
  const heldByOthers = (s: Snapshot): Record<string, string> =>
    Object.fromEntries(Object.entries(s.locks).filter(([, by]) => by !== me()).map(([id, by]) => [id, inkOf(s, by)]));

  function whereIs(s: Snapshot, id: string): Where | null {
    if (s.deck.some((c) => c.id === id)) return { in: "deck" };
    const f = s.felt.find((c) => c.id === id);
    if (f) return { in: "felt", x: f.x, y: f.y, up: f.up };
    for (const [who, hand] of Object.entries(s.hands)) {
      const i = hand.findIndex((c) => c.id === id);
      if (i >= 0) return { in: "hand", who, i };
    }
    return null;
  }

  // ── ГЕОМЕТРИЯ ───────────────────────────────────────────────────────────────────────────────

  const glass = () => ({ w: stage.clientWidth, h: stage.clientHeight });
  const hudUnit = () => Math.max(1, Math.round(Math.min(glass().w, glass().h) * HUD_UNIT_FRACTION));
  const barHeight = () => BAR.size + 2 * BAR.pad;

  /** ГДЕ СТОИТ КАЖДАЯ КАРТА РУКИ НА СТЕКЛЕ — на дуге, если веер, и в ряд, если нет. */
  function handPlan(pose: Pose, n: number, w: number, h: number, roomU: number): Slot[] {
    const apart = (pose.shrink ? HUD_FAN.shut : HUD_FAN.apart) * w;
    const mid = (n - 1) / 2;
    if (!pose.fan) {
      const step = n > 1 ? Math.min(apart, Math.max(0, roomU - 2 * (w / 2 + HUD_FAN.edge * w)) / (n - 1)) : 0;
      return Array.from({ length: n }, (_, i) => ({ x: (i - mid) * step, y: 0, angle: 0 }));
    }
    const R = HUD_FAN.radius * h;
    const deg = (rad: number) => (rad * 180) / Math.PI;
    const most = deg(2 * Math.asin(Math.min(1, apart / (2 * R))));
    let step = 0;
    if (n > 1) {
      // Край считается по УГЛУ наклонной карты, а не по её середине — три прохода сходятся.
      let reach = w / 2;
      for (let pass = 0; pass < 3; pass += 1) {
        const chord = Math.max(0, Math.min(1, (roomU - 2 * (reach + HUD_FAN.edge * w)) / (2 * R)));
        step = Math.min(most, deg(2 * Math.asin(chord)) / (n - 1));
        const outer = ((step * (n - 1)) / 2 / 180) * Math.PI;
        reach = (w / 2) * Math.cos(outer) + (h / 2) * Math.sin(outer);
      }
    }
    return Array.from({ length: n }, (_, i) => {
      const angle = (i - mid) * step;
      const rad = (angle * Math.PI) / 180;
      return { x: R * Math.sin(rad), y: R * (1 - Math.cos(rad)), angle };
    });
  }

  /** Полоса руки на столько карт, сколько будет ПОСЛЕ того, как карту в воздухе положат. */
  function handBox(count: number) {
    const u = hudUnit();
    const g = glass();
    const room = g.w / u - 2 * HUD_MARGIN;
    const scale = Math.min(1, room / (HUD_CARDS * CARD.w * (1 + HUD_GAP)));
    const wide = Math.max(1, g.w / u / scale);
    const plan = handPlan(local.pose, count, CARD.w, CARD.h, wide);
    const drop = plan.reduce((m, p) => Math.max(m, p.y), 0);
    const high = CARD.h + drop + 2 * HAND_PAD + HAND_ROOM;
    const barTop = g.h - barHeight() * u;
    const shown = local.pose.tuck ? TUCK_TIP : Math.max(0, (high - HAND_ROOM) * scale - BAR.tuck);
    const cardsBottom = barTop + BAR.tuck * u + (local.pose.tuck ? Math.max(0, (high - HAND_ROOM) * scale * u - TUCK_TIP * u) : 0);
    const mid = cardsBottom + (HAND_ROOM - high / 2) * scale * u;
    return { u, scale, wide, plan, barTop, mid, shown };
  }

  function mineGeom(count: number): Geom {
    const { u, scale, barTop, mid, plan } = handBox(count);
    const g = glass();
    return {
      which: me(), mirror: false, w: CARD.w * scale * u, h: CARD.h * scale * u, barTop,
      slots: plan.map((p) => ({ x: g.w / 2 + p.x * scale * u, y: mid + p.y * scale * u, angle: p.angle })),
    };
  }

  /**
   * ГДЕ СТОИТ ОКНО ЧУЖОЙ РУКИ — лучшее из мест вокруг человека, а не одно заранее выбранное.
   *
   * Места — по лучу «середина стола → человек» (наружу) и по четырём сторонам его диска; каждое
   * прижато к кадру. Из них берётся то, что нарушает меньше, по старшинству:
   *   1. ЦЕЛИКОМ В КАДРЕ — всегда: кадр — стекло над рукой, и окно, упёршееся в край, прижимается к
   *      нему, а не уезжает за экран вслед за человеком, которого камера оставила за кромкой.
   *   2. НЕ НА КОЛОДЕ. Середина стола — то, ради чего окно открыли рядом, а не поверх.
   *   3. НЕ НА ДРУГОМ ОКНЕ. Окна ставятся по очереди открытия, и каждое обходит уже стоящие: иначе
   *      карты верхнего ложатся на кнопку «Закрыть» нижнего, и закрыть его нечем.
   *   4. СТУЛ ВИДНО ХОТЯ БЫ КРАЕМ — и свой, и чужие: тапом по стулу окно открывают и закрывают.
   *   5. НЕ НА ДИСКЕ — лицо человека остаётся рядом со своей рукой.
   *   6. ДАЛЬШЕ ОТ КОЛОДЫ, ПОТОМ БЛИЖЕ К ЧЕЛОВЕКУ.
   *
   * Старшинство, а не «все условия разом», потому что на телефоне в портрете их разом не выполнить:
   * стол во всю ширину, окно почти во всю ширину, и человек напротив сидит так близко к верхнему краю,
   * что над ним окно не помещается целиком. Тогда оно ложится краем на его диск, но не на колоду и не
   * на весь стул.
   */
  function tipBox(spot: Spot, taken: readonly TipBox[]): TipBox {
    const frame = lastFrame;
    const EDGE = 8, GAP = 12;
    const w = Math.min(frame.w - 2 * EDGE, 292);
    const cw = 46, ch = Math.round(cw * 1.4);
    const rowH = ch + 24;
    const height = 12 + 30 + 8 + 16 + rowH + 12;
    const k = view?.k ?? 1;
    const middle = view ? view.toGlass({ x: 0, y: 0 }) : { x: frame.w / 2, y: frame.h / 2 };
    const deck = { w: (FELT_CARD.w / 2) * k, h: (FELT_CARD.h / 2) * k };
    const chair = SEAT_REACH * k;

    const len = Math.hypot(spot.x - middle.x, spot.y - middle.y);
    const ray = len < 1 ? { x: 0, y: -1 } : { x: (spot.x - middle.x) / len, y: (spot.y - middle.y) / len };
    const along = (d: { x: number; y: number }) => {
      const reach = Math.abs(d.x) * (w / 2) + Math.abs(d.y) * (height / 2);
      return { x: spot.x + d.x * (spot.r + GAP + reach), y: spot.y + d.y * (spot.r + GAP + reach) };
    };
    const centres = [along(ray), along({ x: 0, y: -1 }), along({ x: 0, y: 1 }), along({ x: -1, y: 0 }), along({ x: 1, y: 0 })];

    const overlaps = (box: { left: number; top: number }, c: { x: number; y: number }, hw: number, hh: number) =>
      box.left < c.x + hw && box.left + w > c.x - hw && box.top < c.y + hh && box.top + height > c.y - hh;
    const covers = (box: { left: number; top: number }, c: { x: number; y: number }, r: number) =>
      box.left <= c.x - r && box.left + w >= c.x + r && box.top <= c.y - r && box.top + height >= c.y + r;
    const fromDeck = (box: { left: number; top: number }) =>
      Math.hypot(Math.max(box.left - middle.x, 0, middle.x - box.left - w), Math.max(box.top - middle.y, 0, middle.y - box.top - height));

    const scored = centres.map((c) => {
      const box = {
        left: Math.max(EDGE, Math.min(frame.w - w - EDGE, c.x - w / 2)),
        top: Math.max(EDGE, Math.min(frame.h - height - EDGE, c.y - height / 2)),
      };
      const rank = [
        overlaps(box, middle, deck.w, deck.h) ? 1 : 0,
        taken.filter((t) => overlaps(box, { x: t.left + t.w / 2, y: t.top + t.height / 2 }, t.w / 2, t.height / 2)).length,
        covers(box, spot, chair) ? 1 : 0,
        spots.filter((other) => other.key !== spot.key && covers(box, other, chair)).length,
        overlaps(box, spot, spot.r, spot.r) ? 1 : 0,
        // Дальше от колоды — пока это заметно; за полторы карты все места равны, и решает близость.
        -Math.round(Math.min(fromDeck(box), 1.5 * FELT_CARD.h * k)),
        Math.hypot(box.left + w / 2 - spot.x, box.top + height / 2 - spot.y),
      ];
      return { box, rank };
    });
    scored.sort((p, q) => {
      for (let i = 0; i < p.rank.length; i += 1) if (p.rank[i] !== q.rank[i]) return p.rank[i]! - q.rank[i]!;
      return 0;
    });
    const { left, top } = scored[0]!.box;
    return { left, top, w, height, cw, ch, rowH, rowTop: top + 12 + 30 + 8 + 16, inner: w - 24 };
  }

  /** ЧУЖАЯ РУКА зеркальна: её левая карта — моя правая, поэтому порядок гнёзд считается наоборот. */
  /** Где встали открытые окна в этом кадре — по ним же ищут гнёзда их вееров. */
  let placedTips = new Map<string, TipBox>();

  function tipGeom(key: string, spot: Spot, count: number): Geom {
    const box = placedTips.get(key) ?? tipBox(spot, [...placedTips.values()]);
    const plan = handPlan({ fan: true, shrink: false, tuck: false }, count, 1, 1.4, box.inner / box.cw);
    return {
      which: key, mirror: true, w: box.cw, h: box.ch, box,
      slots: plan.map((p) => ({ x: box.left + 12 + box.inner / 2 + p.x * box.cw, y: box.rowTop + 8 + box.ch / 2 + p.y * box.cw, angle: p.angle })),
    };
  }

  /** В какое гнездо целится палец — по числу гнёзд ЛЕВЕЕ него: карта в веере лежит под соседкой. */
  function slotAt(geom: Geom, x: number, room: number): number {
    const j = Math.max(0, Math.min(room, geom.slots.filter((s) => s.x < x).length));
    return geom.mirror ? room - j : j;
  }

  function hudFloor(count: number): number {
    const { u, shown } = handBox(count);
    return (barHeight() + shown + HUD_MARGIN) * u;
  }

  // ── РАЗМЕТКА ────────────────────────────────────────────────────────────────────────────────

  function cardHtml(face: Face | undefined, w: number): string {
    const h = Math.round(w * 1.4);
    if (!face) {
      return `<span style="position:absolute;inset:0;border-radius:${w * 0.12}px;background:${T.panelLight};box-shadow:inset 0 0 0 ${Math.max(2, w * 0.05)}px ${T.black},0 2px 0 rgba(11,7,4,.55)">`
        + `<span style="position:absolute;inset:${w * 0.08}px;border-radius:3px;background:repeating-linear-gradient(45deg,${T.wood} 0 4px,${T.panel} 4px 8px);opacity:.9"></span></span>`;
    }
    const [sign, colour] = SUITS[face.suit];
    return `<span style="position:absolute;inset:0;border-radius:${w * 0.12}px;background:${T.ink};box-shadow:inset 0 0 0 ${Math.max(2, w * 0.05)}px ${T.black},0 2px 0 rgba(11,7,4,.55)">`
      + `<span style="position:absolute;left:${w * 0.1}px;top:${w * 0.06}px;font:400 ${w * 0.3}px Tiny5,monospace;color:${colour}">${face.rank}</span>`
      + `<span style="position:absolute;left:0;right:0;top:${h * 0.33}px;text-align:center;font:400 ${w * 0.45}px Tiny5,monospace;color:${colour}">${sign}</span></span>`;
  }

  function barButton(what: BarKey, lit: boolean, px: number): string {
    const side = Math.round(px);
    return `<button data-bar="${what}" style="position:relative;width:${side}px;height:${side}px;border:0;padding:0;`
      + `border-radius:${Math.round((side * BAR.radius) / BAR.size)}px;cursor:pointer;display:flex;align-items:center;justify-content:center;`
      + (lit
        ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});box-shadow:inset 0 0 0 3px ${T.black};`
        : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim};`)
      + `"><svg viewBox="0 0 24 24" width="${Math.round(side * 0.5)}" height="${Math.round(side * 0.5)}" fill="none" `
      + `stroke="${lit ? T.black : "white"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[what]}</svg></button>`;
  }

  /**
   * КОНТУР — КАРТИНКА МЕСТА, А НЕ КАРТЫ: пунктир без заливки. Чёрная обводка вокруг пунктира нужна,
   * потому что в руке контур ложится НА соседнюю кремовую карту, и кремовый пунктир на ней пропадает.
   */
  function markHtml(w: number, h: number, angle: number, x: number, y: number, z: number, squash = 1): string {
    const line = Math.max(1.5, w * 0.04);
    return `<div data-g="mark" style="position:absolute;width:${w}px;height:${h}px;left:${x - w / 2}px;top:${y - h / 2}px;`
      // Сжатие — СНАРУЖИ поворота, как у камеры: наклон давит вертикаль стекла, а не стола.
      + `transform:scale(1,${squash}) rotate(${angle}deg);z-index:${z};pointer-events:none;border-radius:${w * 0.12}px;border:${line}px dashed ${T.ink};opacity:.9;`
      + `box-shadow:0 0 0 ${Math.max(1, line * 0.6)}px ${T.black}, inset 0 0 0 ${Math.max(1, line * 0.6)}px ${T.black};`
      + `transition:left .16s ease-out, top .16s ease-out, transform .16s ease-out"></div>`;
  }

  /** Карта в гнезде. Взятую другим пальцем не берут: она в его цвете и не ловит касание. */
  function slotCard(c: SeenCard, shown: boolean, geom: Geom, slot: Slot, z: number, owner: string, held?: string): string {
    return `<div data-card="${c.id}" data-owner="${owner}" style="position:absolute;width:${geom.w}px;height:${geom.h}px;`
      + `left:${slot.x - geom.w / 2}px;top:${slot.y - geom.h / 2}px;transform:rotate(${slot.angle}deg);z-index:${z};touch-action:none;`
      + (held ? `pointer-events:none;filter:brightness(.6);outline:3px solid ${held};border-radius:${geom.w * 0.12}px;` : "cursor:grab;")
      + `transition:left .16s ease-out, top .16s ease-out, transform .16s ease-out">${cardHtml(shown ? c.face : undefined, geom.w)}</div>`;
  }

  /** Рука вместе с контуром под карту в воздухе. Чужая рука живёт над своей коробкой — этаж 41. */
  function layHand(geom: Geom, cards: SeenCard[], mark: number | null, shown: boolean, owner: string, held: Record<string, string>): string {
    const list: (SeenCard | null)[] = mark === null ? cards : [...cards.slice(0, mark), null, ...cards.slice(mark)];
    const floor = owner === me() ? 1 : 41;
    return list
      .map((c, i) => {
        const slot = geom.slots[geom.mirror ? list.length - 1 - i : i];
        if (!slot) return "";
        if (c === null) return markHtml(geom.w, geom.h, slot.angle, slot.x, slot.y, floor + i);
        return slotCard(c, shown, geom, slot, floor + i, owner, held[c.id]);
      })
      .join("");
  }

  /** ЗОНА РУКИ, КОТОРАЯ ЗАГОРАЕТСЯ, ПОКА КАРТА В ВОЗДУХЕ. Под картами (`z-index: 0`), не крышка. */
  function handZoneHtml(geom: Geom): string {
    if (!drag) return "";
    const pad = geom.h * 0.12;
    const left = geom.slots.reduce((m, s) => Math.min(m, s.x - geom.w / 2), Infinity) - pad;
    const right = geom.slots.reduce((m, s) => Math.max(m, s.x + geom.w / 2), -Infinity) + pad;
    const top = geom.slots.reduce((m, s) => Math.min(m, s.y - geom.h / 2), Infinity) - pad;
    const bottom = geom.barTop!;
    const here = drag.target.kind === "hand" && drag.target.which === me();
    const line = here ? T.gold : T.inkDim;
    return `<div data-g="zone" style="position:absolute;left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;`
      + `z-index:0;pointer-events:none;border-radius:${Math.round(geom.w * 0.16)}px;border:2px dashed ${line};`
      + `background:${here ? "rgba(242,193,78,.16)" : "rgba(245,234,208,.07)"};opacity:${here ? 1 : 0.75};`
      + `transition:opacity .12s ease-out,background .12s ease-out,border-color .12s ease-out;display:flex;align-items:flex-start;justify-content:center">`
      + `<span style="margin-top:${Math.max(1, Math.round(pad * 0.16))}px;font:400 ${Math.round(pad * 0.9)}px Tiny5,monospace;`
      + `letter-spacing:.14em;color:${line};text-shadow:0 1px 0 ${T.black}">В РУКУ</span></div>`;
  }

  function hudHtml(s: Snapshot): string {
    const g = glass();
    const cards = handOf(s, me());
    const mark = drag && drag.target.kind === "hand" && drag.target.which === me() ? drag.target.index : null;
    const geom = mineGeom(cards.length + (mark === null ? 0 : 1));
    const u = hudUnit();
    const need = 3 * BAR.size + 2 * BAR.gap + (4 * BAR.size + 3 * BAR.gap) + 2 * BAR.margin + BAR.gap;
    const fit = g.w / u > 0 && need > g.w / u ? Math.max(0.5, g.w / u / need) : 1;
    const side = BAR.size * u * fit;
    const gap = BAR.gap * u * fit;
    const margin = BAR.margin * u * fit;
    return `<div style="position:absolute;left:0;right:0;top:${geom.barTop! - BAR.fade * u}px;height:${BAR.fade * u}px;`
      + `background:linear-gradient(to top, rgba(11,7,4,.85), rgba(11,7,4,0));pointer-events:none"></div>`
      + handZoneHtml(mark === null && cards.length === 0 ? mineGeom(1) : geom)
      + layHand(geom, cards, mark, !local.on.hide, me(), heldByOthers(s))
      // ПОЛОСА — ПОВЕРХ КАРТ: карты уходят под её край на `BAR.tuck`.
      + `<div style="position:absolute;left:0;right:0;top:${geom.barTop}px;height:${barHeight() * u}px;z-index:${cards.length + 10};`
      + `background:linear-gradient(${T.panel},${T.well});box-shadow:inset 0 3px 0 -1px ${T.black};display:flex;align-items:center">`
      + `<div style="position:absolute;left:${margin}px;display:flex;gap:${gap}px">`
      + RIGHTS.map((what) => barButton(what, local.on[what], side)).join("") + `</div>`
      + `<div style="position:absolute;right:${margin}px;display:flex;gap:${gap}px">`
      + POSES.map((what) => barButton(what, what !== "flip" && local.pose[what], side)).join("") + `</div></div>`;
  }

  function tipHtml(s: Snapshot, who: Person, spot: Spot): { shell: string; cards: string } {
    const cards = handOf(s, who.key);
    const mark = drag && drag.target.kind === "hand" && drag.target.which === who.key ? drag.target.index : null;
    const geom = tipGeom(who.key, spot, cards.length + (mark === null ? 0 : 1));
    const box = geom.box!;
    const shell = `<div data-g="tip" data-tip="${who.key}" style="position:absolute;left:${box.left}px;top:${box.top}px;width:${box.w}px;box-sizing:border-box;z-index:40;`
      + `background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px;padding:12px">`
      + `<div style="display:flex;align-items:center;gap:9px;padding-bottom:8px">`
      + `<span style="flex:none;width:30px;height:30px;border-radius:50%;background:${who.ink};box-shadow:inset 0 0 0 3px ${T.black};`
      + `display:flex;align-items:center;justify-content:center;font:400 14px Tiny5,monospace;color:${T.black}">${escape([...who.name][0] ?? "?")}</span>`
      + `<span style="font:400 14px Tiny5,monospace;color:${T.ink};flex:1">${escape(who.name)}</span>`
      + `<span data-shut="${who.key}" role="button" style="cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;`
      + `box-shadow:inset 0 0 0 2px ${T.wood};color:${T.inkDim}">Закрыть</span></div>`
      + `<span style="font:400 10px Tiny5,monospace;letter-spacing:.1em;color:${T.inkDim};opacity:.7">РУКА · ${cards.length}</span>`
      + `<div style="position:relative;height:${box.rowH}px"></div></div>`;
    // Карты чужого веера — рядом с коробкой, не внутри: их вытаскивают на стол, и край не должен их резать.
    return { shell, cards: layHand(geom, cards, mark, false, who.key, heldByOthers(s)) };
  }

  function feltMarkHtml(): string {
    if (!drag || drag.target.kind !== "felt" || !view) return "";
    const at = view.toGlass(drag.target.at);
    return markHtml(FELT_CARD.w * view.k, FELT_CARD.h * view.k, view.rotation, at.x, at.y, 30, view.squash);
  }

  function carryHtml(): string {
    if (!drag) return "";
    return `<div data-g="carry" style="position:fixed;width:${drag.w}px;height:${drag.h}px;left:${drag.x - drag.gx}px;`
      + `top:${drag.y - drag.gy - drag.h * CARRY_CLEAR}px;z-index:60;pointer-events:none;filter:drop-shadow(0 ${Math.round(drag.h * 0.12)}px 0 rgba(11,7,4,.45))">`
      + cardHtml(drag.shown ? drag.card.face : undefined, drag.w) + `</div>`;
  }

  // ── РИСОВАНИЕ ───────────────────────────────────────────────────────────────────────────────

  function draw(): void {
    const g = glass();
    const s = seen();
    const mineCount = handOf(s, me()).length;
    const floor = hudFloor(mineCount);
    const seats: Seat[] = people(s).map((p) => ({
      key: p.key, name: p.name, ink: p.ink, mine: p.key === me(),
      // Своя рука — внизу, на стекле; в стуле у себя карт не рисуем.
      cards: p.key === me() ? 0 : handOf(s, p.key).length,
      ...(p.photo ? { face: face(p) } : {}),
    }));
    lastFrame = { w: g.w, h: g.h - floor };
    syncCamera();
    view = drawFelt(canvas, {
      W: g.w, H: g.h, people: seats, images, deck: s.deck, felt: s.felt, held: heldByOthers(s),
      view: cam.camera.transform(), k: cam.camera.pixelsPerUnit, squash: cam.camera.squash, rotation: cam.camera.rotation,
    });
    spots = view.spots;
    // Взгляд — на холсте атрибутом: его видно в инспекторе и его читает прогон жестов.
    const c = cam.camera;
    canvas.dataset.view = `${c.target.x.toFixed(2)},${c.target.y.toFixed(2)},${c.zoom.toFixed(3)},${c.rotation.toFixed(1)},${c.pitch.toFixed(1)}`;
    const middle = view.toGlass({ x: 0, y: 0 });
    canvas.dataset.spots = JSON.stringify({
      frame: lastFrame,
      k: view.k,
      middle: { x: Math.round(middle.x), y: Math.round(middle.y) },
      seats: spots.map((sp) => ({ key: sp.key, x: Math.round(sp.x), y: Math.round(sp.y), r: Math.round(sp.r), chair: Math.round(SEAT_REACH * view!.k) })),
    });
    local.tips = local.tips.filter((key) => s.people.some((p) => p.key === key));
    // ОКНА СТАВЯТСЯ ПО ОЧЕРЕДИ ОТКРЫТИЯ: каждое знает, где уже стоят раньше открытые.
    placedTips = new Map();
    for (const key of local.tips) {
      const spot = spots.find((sp) => sp.key === key);
      if (spot) placedTips.set(key, tipBox(spot, [...placedTips.values()]));
    }
    const open = local.tips
      .map((key) => ({ who: s.people.find((p) => p.key === key)!, spot: spots.find((sp) => sp.key === key) }))
      .filter((one): one is { who: Person; spot: Spot } => Boolean(one.spot))
      .map((one) => tipHtml(s, one.who, one.spot));
    // ВСЕ КОРОБКИ СНАЧАЛА, ПОТОМ ВСЕ КАРТЫ: чужой веер вылезает за свою коробку, и соседняя его не режет.
    over.innerHTML = hudHtml(s) + open.map((t) => t.shell).join("") + open.map((t) => t.cards).join("") + feltMarkHtml() + carryHtml();
    wire();
  }

  function face(p: Person): string {
    if (!images[p.key]) {
      const img = new Image();
      img.onload = () => draw();
      img.src = p.photo!;
      images[p.key] = img;
    }
    return p.key;
  }

  // ── ЖЕСТ ────────────────────────────────────────────────────────────────────────────────────

  function aimAt(x: number, y: number): Aim {
    const s = seen();
    for (const key of local.tips) {
      const spot = spots.find((sp) => sp.key === key);
      if (!spot) continue;
      const room = handOf(s, key).length;
      const geom = tipGeom(key, spot, room + 1);
      const box = geom.box!;
      if (x >= box.left && x <= box.left + box.w && y >= box.top && y <= box.top + box.height) {
        return { kind: "hand", which: key, index: slotAt(geom, x, room) };
      }
    }
    const room = handOf(s, me()).length;
    const geom = mineGeom(room + 1);
    // Рука принимает ровно там, где горит её зона: верх карт и поле над ними (`handZoneHtml`).
    const top = geom.slots.reduce((m, sl) => Math.min(m, sl.y - geom.h / 2), Infinity) - geom.h * 0.12;
    if (y >= top && x >= 0 && x <= glass().w) return { kind: "hand", which: me(), index: slotAt(geom, x, room) };
    // НА СУКНО — туда, где середина несомой карты, а не где палец: за неё и держат.
    const d = drag!;
    return { kind: "felt", at: view!.toDesk({ x: x - d.gx + d.w / 2, y: y - d.gy + d.h / 2 }) };
  }

  const sameAim = (a: Aim, b: Aim) =>
    a.kind === b.kind && (a.kind === "felt" || (b.kind === "hand" && a.which === b.which && a.index === b.index));

  /** Что под пальцем на сукне: сверху вниз, и с колоды — только верхняя. */
  function feltPick(x: number, y: number): { card: SeenCard; at: { x: number; y: number }; from: "felt" | "deck"; up: boolean } | null {
    if (!view) return null;
    const s = store.state;
    const { x: ux, y: uy } = view.toDesk({ x, y });
    const over = (at: { x: number; y: number }) => Math.abs(ux - at.x) <= FELT_CARD.w / 2 && Math.abs(uy - at.y) <= FELT_CARD.h / 2;
    for (let i = s.felt.length - 1; i >= 0; i -= 1) {
      const one = s.felt[i]!;
      if (over(one)) return { card: one, at: one, from: "felt", up: one.up };
    }
    const top = s.deck.at(-1);
    if (top && over(deckAt(s.deck.length - 1, s.deck.length))) return { card: top, at: deckAt(s.deck.length - 1, s.deck.length), from: "deck", up: false };
    return null;
  }

  /** Поднять. Экран снимает карту сразу, намерение уходит следом; отказ вернёт её на место. */
  function lift(card: SeenCard, shown: boolean, box: { left: number; top: number; w: number; h: number }, e: PointerEvent, target: Aim) {
    if (store.state.locks[card.id] && store.state.locks[card.id] !== me()) return;
    drag = {
      card, shown, w: box.w, h: box.h,
      gx: e.clientX - box.left, gy: e.clientY - box.top, x: e.clientX, y: e.clientY, target,
      hold: window.setInterval(() => store.send({ t: "hold", id: card.id }), HOLD_EVERY_MS),
    };
    store.send({ t: "grab", id: card.id });
    draw();
  }

  function grabFromFelt(e: PointerEvent, pick: NonNullable<ReturnType<typeof feltPick>>) {
    // В ВОЗДУХЕ КАРТА СТОИТ: размером по зуму, но без наклона и поворота стола — её держат пальцем.
    const w = FELT_CARD.w * view!.k;
    const h = FELT_CARD.h * view!.k;
    const mid = view!.toGlass(pick.at);
    const left = mid.x - w / 2;
    const top = mid.y - h / 2;
    // Снятая с колоды идёт рубашкой: лицом она станет в руке.
    lift(pick.card, pick.up, { left, top, w, h }, e, { kind: "felt", at: pick.at });
  }

  function grabFromHand(e: PointerEvent, owner: string, id: string, el: HTMLElement) {
    const s = store.state;
    const index = handOf(s, owner).findIndex((c) => c.id === id);
    if (index < 0) return;
    // РАЗМЕР — У ГЕОМЕТРИИ, СЕРЕДИНА — У ЭЛЕМЕНТА: рамка повёрнутой карты шире её самой.
    const geom = owner === me() ? mineGeom(handOf(s, me()).length) : tipGeom(owner, spots.find((sp) => sp.key === owner)!, handOf(s, owner).length);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const card = handOf(s, owner)[index]!;
    const mine = owner === me();
    lift(card, mine && !local.on.hide, { left: cx - geom.w / 2, top: cy - geom.h / 2, w: geom.w, h: geom.h }, e, { kind: "hand", which: owner, index });
    try { el.setPointerCapture?.(e.pointerId); } catch { /* пальца уже нет */ }
  }

  function moveDrag(e: PointerEvent) {
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const aim = aimAt(e.clientX, e.clientY);
    const carry = over.querySelector<HTMLElement>('[data-g="carry"]');
    if (carry) {
      carry.style.left = `${drag.x - drag.gx}px`;
      carry.style.top = `${drag.y - drag.gy - drag.h * CARRY_CLEAR}px`;
    }
    if (sameAim(aim, drag.target) && aim.kind !== "felt") return;
    drag.target = aim;
    // НА СУКНЕ ДВИГАЕТСЯ ОДИН КОНТУР, А НЕ ВЕСЬ ЭКРАН.
    const mark = over.querySelector<HTMLElement>('[data-g="mark"]');
    if (aim.kind === "felt" && mark && drag.markKind === "felt" && view) {
      const at = view.toGlass(aim.at);
      mark.style.left = `${at.x - (FELT_CARD.w * view.k) / 2}px`;
      mark.style.top = `${at.y - (FELT_CARD.h * view.k) / 2}px`;
      return;
    }
    drag.markKind = aim.kind;
    draw();
  }

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    clearInterval(d.hold);
    const aim = d.target;
    const to: Where = aim.kind === "hand"
      ? { in: "hand", who: aim.which, i: aim.index }
      // На сукно карта ложится так, как её несли: лицом — если её было видно.
      : { in: "felt", x: aim.at.x, y: aim.at.y, up: d.shown };
    const from = whereIs(store.state, d.card.id);
    if (from) {
      const keepsFace = (to.in === "hand" && to.who === me()) || (to.in === "felt" && to.up);
      pending = { id: d.card.id, from, to, card: keepsFace ? d.card : { id: d.card.id }, sawLock: store.state.locks[d.card.id] === me() };
      store.send({ t: "drop", id: d.card.id, to });
    }
    draw();
  }

  function wire() {
    for (const el of over.querySelectorAll<HTMLElement>("[data-bar]")) {
      el.onclick = (e) => {
        e.stopPropagation();
        const what = el.dataset.bar as BarKey;
        if (what === "pin" || what === "lock" || what === "hide") local.on[what] = !local.on[what];
        else if (what === "flip") store.send({ t: "flip" });
        else local.pose[what] = !local.pose[what];
        draw();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-shut]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        local.tips = local.tips.filter((k) => k !== el.dataset.shut);
        draw();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-card]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        grabFromHand(e, el.dataset.owner!, el.dataset.card!, el);
      };
    }
  }

  // ── СЕТЬ ────────────────────────────────────────────────────────────────────────────────────

  store.onChange(() => {
    if (pending) {
      const holder = store.state.locks[pending.id];
      if (holder === me()) pending.sawLock = true;
      else if (pending.sawLock) pending = null;
    }
    // ВЗЯТОЕ У МЕНЯ ИЗ-ПОД ПАЛЬЦА: блокировка истекла и карту взял другой — отпускаю.
    if (drag && store.state.locks[drag.card.id] && store.state.locks[drag.card.id] !== me()) {
      clearInterval(drag.hold);
      drag = null;
    }
    draw();
  });

  store.onRefused((intent: Intent) => {
    if (intent.t === "grab" && drag?.card.id === intent.id) {
      clearInterval(drag.hold);
      drag = null;
    }
    if (intent.t === "drop" && pending?.id === intent.id) pending = null;
    draw();
  });

  addEventListener("pointermove", moveDrag, { passive: true });
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);

  // ТАП ПО СУКНУ: сперва карта под пальцем, потом — диск человека (открыть или закрыть его окно).
  //
  // КОМУ ПАЛЕЦ — РЕШАЕТСЯ ЗДЕСЬ И РАНЬШЕ КАМЕРЫ: слушатель стоит на `stage` в фазе захвата, то есть
  // до холста, на котором слушает камера. Карта, аватар или палец, пришедший, пока другой несёт
  // карту, — не доходят до неё вовсе (`stopPropagation`). Пустое сукно — доходит, и стол едет.
  stage.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target !== canvas) return;
      if (drag) return void e.stopPropagation();
      const pick = feltPick(e.clientX, e.clientY);
      if (pick) {
        e.preventDefault();
        e.stopPropagation();
        return grabFromFelt(e, pick);
      }
      // ОКНО ОТКРЫВАЕТСЯ И ЗАКРЫВАЕТСЯ ТАПОМ ПО МЕСТУ — по диску на стекле или по стулу на столе.
      const finger = view?.toDesk({ x: e.clientX, y: e.clientY });
      const hit = spots.find(
        (sp) =>
          sp.key !== me() &&
          (Math.hypot(e.clientX - sp.x, e.clientY - sp.y) <= sp.r + 6 ||
            (finger !== undefined && Math.hypot(finger.x - sp.seat.x, finger.y - sp.seat.y) <= SEAT_REACH)),
      );
      if (!hit) return;
      e.stopPropagation();
      local.tips = local.tips.includes(hit.key) ? local.tips.filter((k) => k !== hit.key) : [...local.tips, hit.key];
      draw();
    },
    { capture: true },
  );

  addEventListener("resize", draw);
  addEventListener("orientationchange", draw);
  void document.fonts?.ready.then(draw);
  draw();
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
