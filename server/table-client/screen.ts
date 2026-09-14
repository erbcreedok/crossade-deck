// ЭКРАН СТОЛА — холст со столом, моя рука внизу, чужие руки в тултипах и палец, который всё это носит.
//
// Экран не хранит стол: он спрашивает хранилище (`TableStore`) и держит только то, что есть лишь у
// него, — что сейчас в воздухе, какие окна открыты, как сложена моя рука. Всё, что меняет стол,
// уходит намерением; пока ответ не пришёл, экран показывает ожидаемое (`pending`), а отказ просто
// возвращает настоящий снимок.

import { CARRY_EVERY_MS, HOLD_EVERY_MS, type Carry, type Chair, type ChairFlag, type Face, type Intent, type Person, type SeenCard, type Snapshot, type Where } from "../src/table/contract.js";
import { applyPatch } from "../src/table/patch.js";
import { CARD as FELT_CARD, HAND_SCALE, SEAT_REACH, SUITS, deckAt, drawFelt, type FeltView, type Pose, type Seat, type Spot } from "./felt.js";
import { orbits, tableCamera } from "./camera.js";
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

/** Флаги стула в нижнем HUD и в окне стула — одни и те же кнопки, одни и те же значки. */
const RIGHTS = ["pin", "lock", "hide", "forever"] as const satisfies readonly ChairFlag[];
const FOLDS = ["fan", "shrink", "tuck"] as const;
const POSES = ["flip", ...FOLDS] as const;
type BarKey = (typeof RIGHTS)[number] | (typeof POSES)[number];
const GLYPH: Record<BarKey, string> = {
  pin: '<path d="M9 3h6l-1 6h2l1 5H7l1-5h2L9 3z"/><path d="M12 14v7"/>',
  lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3"/><path d="M5 11h14v10H5z"/>',
  hide: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9 9 0 0 1 22 12s-1.5 2.6-4.3 4.5"/><path d="M6.4 7.6C3.9 9.3 2 12 2 12s4 7 10 7c1.5 0 2.9-.3 4.1-.9"/>',
  forever: '<path d="M6.5 8.5C3.5 8.5 2 10.2 2 12s1.5 3.5 4.5 3.5C10 15.5 14 8.5 17.5 8.5 20.5 8.5 22 10.2 22 12s-1.5 3.5-4.5 3.5C14 15.5 10 8.5 6.5 8.5z"/>',
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

/**
 * КУДА ЦЕЛИТСЯ КАРТА В ВОЗДУХЕ. `chair` — стул на столе: карта уйдёт в конец руки его стула. `back` —
 * стул под локом: он не принимает, и отпущенная над ним карта возвращается туда, откуда её взяли.
 */
type Aim =
  | { kind: "hand"; which: string; index: number }
  | { kind: "chair"; which: string }
  | { kind: "back" }
  | { kind: "felt"; at: { x: number; y: number } };

/** Место в веере: карта или щель — под мою карту в воздухе или под чужую (`carry` — id той карты). */
interface Gap {
  index: number;
  ink: string;
  carry?: string;
}
type Laid = { card: SeenCard; slot: Slot; z: number } | { gap: Gap; slot: Slot; z: number };

/**
 * ГДЕ КАРТА НАРИСОВАНА У МЕНЯ СЕЙЧАС — середина на стекле, размер, поворот, сжатие и лицо. `key` —
 * место словами («колода», «рука X, 3-я», «в воздухе у Y»): сменился ключ — карта переехала, и её
 * перелёт рисуется от старого места к новому. Сменились только пиксели (камера, раскладка) — нет.
 */
interface Place {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  squash: number;
  face?: Face;
}

/** Сколько летит карта из места в место. */
const FLIGHT_MS = 260;

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
  /** Откуда карту взяли — туда она вернётся, если отпустить над стулом под локом. */
  from: Where;
  /** Когда палец последний раз сказал серверу, над чем он (`CARRY_EVERY_MS`). */
  toldAt: number;
}

export function mountScreen(stage: HTMLElement, store: TableStore): void {
  const canvas = stage.querySelector("canvas")!;
  const over = stage.querySelector<HTMLElement>("#over")!;
  const images: Record<string, HTMLImageElement> = {};

  /** Только то, что есть у этого экрана и больше нигде. */
  const local = {
    pose: { fan: true, shrink: false, tuck: false } as Pose,
    /** Открытые окна стульев — id стульев, по порядку открытия. */
    tips: [] as string[],
  };
  let drag: Drag | null = null;
  /**
   * ВОЗДУХ — слой поверх экрана, который НЕ пересобирается на каждом кадре: в нём чужие карты в руках и
   * перелёты. Их движение — переходы и анимации браузера, а `over` переписывается целиком и убил бы их.
   */
  const air = document.createElement("div");
  air.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:70;overflow:hidden";
  stage.append(air);
  /** Карты, летящие копией: на своём месте они не рисуются, пока не долетят. */
  const flying = new Set<string>();
  /** Где каждая карта была нарисована прошлым кадром — откуда начинать перелёт. */
  let prevPlaces = new Map<string, Place>();
  /** Карта, отпущенная над закрытым стулом: летит из-под пальца на своё место в следующем кадре. */
  let returning: { id: string; from: Place } | null = null;
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
    // В ВОЗДУХЕ — МОЯ КАРТА И ЧУЖИЕ: со своего места они сняты, пока их несут.
    const up = new Set(store.carries.map((c) => c.id));
    if (drag) up.add(drag.card.id);
    if (up.size === 0) return s;
    const chairs = s.chairs.map((c) => ({ ...c, hand: c.hand.filter((card) => !up.has(card.id)) }));
    return { ...s, chairs, deck: s.deck.filter((c) => !up.has(c.id)), felt: s.felt.filter((c) => !up.has(c.id)) };
  }

  /** Мой стул — на нём я сижу; пока стол не прислал его, пустая строка ни с чем не совпадёт. */
  const mine = (s: Snapshot = store.state): string => s.people.find((p) => p.key === me())?.seat ?? "";
  const chairOf = (s: Snapshot, id: string): Chair | undefined => s.chairs.find((c) => c.id === id);
  const handOf = (s: Snapshot, chair: string): SeenCard[] => chairOf(s, chair)?.hand ?? [];
  const sitterOf = (s: Snapshot, chair: Chair): Person | undefined => (chair.owner ? s.people.find((p) => p.key === chair.owner) : undefined);
  /** Флаги стула меняет его хозяин, любой — у покинутого, админ — у любого (тот же закон, что у `Table.mayFlag`). */
  const mayFlag = (s: Snapshot, chair: Chair) => chair.owner === null || chair.owner === me() || s.admin === me();
  /** Замок закрывает руку стула для всех, кроме того, кто на нём сидит. */
  const closed = (s: Snapshot, chairId: string) => {
    const chair = chairOf(s, chairId);
    return chair !== undefined && chair.lock && chair.owner !== me();
  };
  const inkOf = (s: Snapshot, key: string) => s.people.find((p) => p.key === key)?.ink ?? T.inkDim;
  const heldByOthers = (s: Snapshot): Record<string, string> =>
    Object.fromEntries(Object.entries(s.locks).filter(([, by]) => by !== me()).map(([id, by]) => [id, inkOf(s, by)]));

  function whereIs(s: Snapshot, id: string): Where | null {
    if (s.deck.some((c) => c.id === id)) return { in: "deck" };
    const f = s.felt.find((c) => c.id === id);
    if (f) return { in: "felt", x: f.x, y: f.y, up: f.up, angle: f.angle };
    for (const chair of s.chairs) {
      const i = chair.hand.findIndex((c) => c.id === id);
      if (i >= 0) return { in: "hand", chair: chair.id, i };
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
      which: mine(), mirror: false, w: CARD.w * scale * u, h: CARD.h * scale * u, barTop,
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
   *
   * БЕЗ ПЕРЕХОДОВ. Контур — это «вот сюда ляжет, если отпустить сейчас», и отпустить можно в любой кадр:
   * контур, догоняющий палец за 0.16 с, показывает место, куда карта уже не ляжет.
   */
  function markHtml(w: number, h: number, angle: number, x: number, y: number, z: number, squash = 1, ink: string = T.ink): string {
    const line = Math.max(1.5, w * 0.04);
    return `<div data-g="mark" style="position:absolute;width:${w}px;height:${h}px;left:${x - w / 2}px;top:${y - h / 2}px;`
      // Сжатие — СНАРУЖИ поворота, как у камеры: наклон давит вертикаль стекла, а не стола.
      + `transform:scale(1,${squash}) rotate(${angle}deg);z-index:${z};pointer-events:none;border-radius:${w * 0.12}px;border:${line}px dashed ${ink};opacity:.9;`
      + `box-shadow:0 0 0 ${Math.max(1, line * 0.6)}px ${T.black}, inset 0 0 0 ${Math.max(1, line * 0.6)}px ${T.black};`
      + `"></div>`;
  }

  /** Карта в гнезде. Взятую другим пальцем не берут: она в его цвете и не ловит касание. */
  /**
   * Карта в гнезде — лицом, если лицо пришло (стол сам решил, видно ли её мне). Взятую другим пальцем и
   * карту под чужим замком не берут: первая в цвете держащего, вторая приглушена, и обе не ловят касание.
   */
  function slotCard(c: SeenCard, geom: Geom, slot: Slot, z: number, owner: string, held?: string, shut = false): string {
    return `<div data-card="${c.id}" data-owner="${owner}" style="position:absolute;width:${geom.w}px;height:${geom.h}px;`
      + `left:${slot.x - geom.w / 2}px;top:${slot.y - geom.h / 2}px;transform:rotate(${slot.angle}deg);z-index:${z};touch-action:none;`
      + (held ? `pointer-events:none;filter:brightness(.6);outline:3px solid ${held};border-radius:${geom.w * 0.12}px;` : shut ? "pointer-events:none;filter:brightness(.7);" : "cursor:grab;")
      + (flying.has(c.id) ? "visibility:hidden;" : "")
      + `transition:left .16s ease-out, top .16s ease-out, transform .16s ease-out">${cardHtml(c.face, geom.w)}</div>`;
  }

  /**
   * ЩЕЛИ В РУКЕ СТУЛА — под мою карту в воздухе и под чужие, которые держат над этой рукой. Их видят все,
   * у кого эта рука на экране: хозяин внизу, остальные — в окне стула.
   */
  function gapsIn(s: Snapshot, chair: string): Gap[] {
    const out: Gap[] = [];
    if (drag && drag.target.kind === "hand" && drag.target.which === chair) out.push({ index: drag.target.index, ink: T.ink });
    for (const c of store.carries) {
      if (c.over.in === "hand" && c.over.chair === chair) out.push({ index: c.over.i, ink: inkOf(s, c.by), carry: c.id });
    }
    return out.sort((a, b) => a.index - b.index);
  }

  /** Карты и щели руки — по гнёздам. Чужая рука зеркальна, и живёт над своей коробкой — этаж 41. */
  function laid(geom: Geom, cards: SeenCard[], gaps: Gap[], owner: string): Laid[] {
    const list: (SeenCard | Gap)[] = [...cards];
    for (const gap of gaps) list.splice(Math.max(0, Math.min(list.length, gap.index)), 0, gap);
    const floor = owner === mine() ? 1 : 41;
    return list.flatMap((item, i): Laid[] => {
      const slot = geom.slots[geom.mirror ? list.length - 1 - i : i];
      if (!slot) return [];
      return "index" in item ? [{ gap: item, slot, z: floor + i }] : [{ card: item, slot, z: floor + i }];
    });
  }

  function layHand(geom: Geom, cards: SeenCard[], gaps: Gap[], owner: string, held: Record<string, string>, shut = false): string {
    return laid(geom, cards, gaps, owner)
      .map((one) =>
        "gap" in one
          ? markHtml(geom.w, geom.h, one.slot.angle, one.slot.x, one.slot.y, one.z, 1, one.gap.ink)
          : slotCard(one.card, geom, one.slot, one.z, owner, held[one.card.id], shut),
      )
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
    const here = drag.target.kind === "hand" && drag.target.which === mine();
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
    const cards = handOf(s, mine(s));
    const seat = chairOf(s, mine(s));
    const gaps = gapsIn(s, mine(s));
    const mark = drag && drag.target.kind === "hand" && drag.target.which === mine(s) ? drag.target.index : null;
    const geom = mineGeom(cards.length + gaps.length);
    const u = hudUnit();
    const need = 4 * BAR.size + 3 * BAR.gap + (4 * BAR.size + 3 * BAR.gap) + 2 * BAR.margin + BAR.gap;
    const fit = g.w / u > 0 && need > g.w / u ? Math.max(0.5, g.w / u / need) : 1;
    const side = BAR.size * u * fit;
    const gap = BAR.gap * u * fit;
    const margin = BAR.margin * u * fit;
    return `<div style="position:absolute;left:0;right:0;top:${geom.barTop! - BAR.fade * u}px;height:${BAR.fade * u}px;`
      + `background:linear-gradient(to top, rgba(11,7,4,.85), rgba(11,7,4,0));pointer-events:none"></div>`
      + handZoneHtml(mark === null && cards.length === 0 ? mineGeom(1) : geom)
      // СВОИ КАРТЫ Я ВИЖУ ВСЕГДА, КАК ДЕРЖУ: «скрыть» — про то, что видят другие, а не я.
      + layHand(geom, cards, gaps, mine(s), heldByOthers(s))
      // ПОЛОСА — ПОВЕРХ КАРТ: карты уходят под её край на `BAR.tuck`.
      + `<div style="position:absolute;left:0;right:0;top:${geom.barTop}px;height:${barHeight() * u}px;z-index:${cards.length + 10};`
      + `background:linear-gradient(${T.panel},${T.well});box-shadow:inset 0 3px 0 -1px ${T.black};display:flex;align-items:center">`
      + `<div style="position:absolute;left:${margin}px;display:flex;gap:${gap}px">`
      + RIGHTS.map((what) => barButton(what, seat?.[what] === true, side)).join("") + `</div>`
      + `<div style="position:absolute;right:${margin}px;display:flex;gap:${gap}px">`
      + POSES.map((what) => barButton(what, what !== "flip" && local.pose[what], side)).join("") + `</div></div>`;
  }

  /** Значок флага в окне стула: кнопка, если право есть, и только статус — если нет. */
  function flagChip(chair: Chair, flag: ChairFlag, may: boolean): string {
    const on = chair[flag];
    const look = on
      ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});box-shadow:inset 0 0 0 2px ${T.black};`
      : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim};`;
    const icon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${on ? T.black : "white"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[flag]}</svg>`;
    return may
      ? `<button data-flag="${flag}" data-chair="${chair.id}" aria-pressed="${on}" style="width:30px;height:30px;border:0;padding:0;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;${look}">${icon}</button>`
      : `<span data-status="${flag}" data-on="${on}" style="width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;opacity:${on ? 1 : 0.45};${look}">${icon.replace(/width="16" height="16"/, 'width="12" height="12"')}</span>`;
  }

  /**
   * ОКНО СТУЛА — чья-то рука или рука покинутого стула, и его флаги.
   *
   * Флаги — кнопками там, где их можно менять (свой стул, покинутый, любой — у админа), и значками
   * состояния там, где нельзя. У покинутого стула — ещё и «Сесть».
   */
  function tipHtml(s: Snapshot, chair: Chair, spot: Spot): { shell: string; cards: string } {
    const cards = chair.hand;
    const sitter = sitterOf(s, chair);
    const may = mayFlag(s, chair);
    const gaps = gapsIn(s, chair.id);
    const geom = tipGeom(chair.id, spot, cards.length + gaps.length);
    const box = geom.box!;
    const head = sitter
      ? `<span style="flex:none;width:30px;height:30px;border-radius:50%;background:${sitter.ink};box-shadow:inset 0 0 0 3px ${T.black};`
        + `display:flex;align-items:center;justify-content:center;font:400 14px Tiny5,monospace;color:${T.black}">${escape([...sitter.name][0] ?? "?")}</span>`
        + `<span style="font:400 14px Tiny5,monospace;color:${T.ink};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escape(sitter.name)}</span>`
      : `<span style="flex:none;width:30px;height:30px;border-radius:50%;box-shadow:inset 0 0 0 2px ${T.inkDim};opacity:.6"></span>`
        + `<span style="font:400 14px Tiny5,monospace;color:${T.inkDim};flex:1">Пустой стул</span>`
        + `<span data-sit="${chair.id}" role="button" style="cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;`
        + `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});color:${T.black}">Сесть</span>`;
    const flags = RIGHTS.map((flag) => flagChip(chair, flag, may)).join("");
    const shell = `<div data-g="tip" data-tip="${chair.id}" style="position:absolute;left:${box.left}px;top:${box.top}px;width:${box.w}px;box-sizing:border-box;z-index:40;`
      + `background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px;padding:12px">`
      + `<div style="display:flex;align-items:center;gap:9px;height:30px;padding-bottom:8px">${head}`
      + `<span data-shut="${chair.id}" role="button" style="cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;`
      + `box-shadow:inset 0 0 0 2px ${T.wood};color:${T.inkDim}">Закрыть</span></div>`
      + `<div style="display:flex;align-items:center;gap:6px;height:16px">`
      + `<span style="font:400 10px Tiny5,monospace;letter-spacing:.1em;color:${T.inkDim};opacity:.7;flex:1">РУКА · ${cards.length}</span>${flags}</div>`
      + `<div style="position:relative;height:${box.rowH}px"></div></div>`;
    // Карты веера — рядом с коробкой, не внутри: их вытаскивают на стол, и край не должен их резать.
    return { shell, cards: layHand(geom, cards, gaps, chair.id, heldByOthers(s), closed(s, chair.id)) };
  }

  /**
   * УГОЛ, ПОД КОТОРЫМ КАРТА ЛЯЖЕТ НА СУКНО, — в осях стола. Карта в воздухе стоит ровно к экрану, и
   * ложится так же: против поворота камеры. Смотришь на стол боком — карта ляжет боком к столу и ровно
   * к тебе.
   */
  const dropAngle = () => -(view?.rotation ?? 0);

  /**
   * СТУЛ ПОД ПАЛЬЦЕМ — его граница на столе: круг, до которого достаёт арка (`SEAT_REACH`). Аватар —
   * часть стула, только пока он на этом стуле сидит: его диск тогда тоже принимает тап и карту, но
   * своей границей стул не обрезает.
   */
  function chairUnder(s: Snapshot, x: number, y: number): Spot | undefined {
    if (!view) return undefined;
    const v = view;
    const finger = v.toDesk({ x, y });
    return spots.find((sp) => {
      const chair = chairOf(s, sp.key);
      if (!chair) return false;
      if (Math.hypot(finger.x - sp.seat.x, finger.y - sp.seat.y) <= SEAT_REACH) return true;
      const seat = v.toGlass(sp.seat);
      const sitting = chair.owner !== null && Math.hypot(sp.x - seat.x, sp.y - seat.y) <= SEAT_REACH * v.k;
      return sitting && Math.hypot(x - sp.x, y - sp.y) <= sp.r;
    });
  }

  /**
   * ЗОНЫ ПРИЁМКИ СТУЛЬЕВ — та же пунктирная граница, что у зоны руки. Пока я несу карту, горят все
   * стулья, которые её примут, а тот, над которым палец, — золотом. Чужую карту над рукой стула видно
   * всем: его зона горит в цвете того, кто несёт. Стул под локом не горит ни у кого.
   */
  function chairZonesHtml(s: Snapshot): string {
    if (!view) return "";
    const lit = new Map<string, { ink: string; here: boolean }>();
    for (const c of store.carries) {
      if (c.over.in === "hand" && !closed(s, c.over.chair)) lit.set(c.over.chair, { ink: inkOf(s, c.by), here: true });
    }
    if (drag) {
      for (const chair of s.chairs) {
        if (closed(s, chair.id) || lit.has(chair.id)) continue;
        const here = drag.target.kind === "chair" && drag.target.which === chair.id;
        lit.set(chair.id, { ink: here ? T.gold : T.inkDim, here });
      }
    }
    let html = "";
    for (const [id, look] of lit) {
      const spot = spots.find((sp) => sp.key === id);
      if (!spot) continue;
      const at = view.toGlass(spot.seat);
      const rx = SEAT_REACH * view.k;
      const ry = rx * view.squash;
      html += `<div data-g="chair-zone" data-chair="${id}" data-here="${look.here}" style="position:absolute;left:${at.x - rx}px;top:${at.y - ry}px;`
        + `width:${2 * rx}px;height:${2 * ry}px;border-radius:50%;box-sizing:border-box;z-index:25;pointer-events:none;border:2px dashed ${look.ink};`
        + `background:${look.here ? `color-mix(in srgb, ${look.ink} 22%, transparent)` : "rgba(245,234,208,.06)"};opacity:${look.here ? 1 : 0.7}"></div>`;
    }
    return html;
  }

  function feltMarkHtml(): string {
    if (!drag || drag.target.kind !== "felt" || !view) return "";
    const at = view.toGlass(drag.target.at);
    // На экране: поворот стола + поворот карты = 0, и остаётся только наклон — контур стоит ровно, сжатый.
    return markHtml(FELT_CARD.w * view.k, FELT_CARD.h * view.k, view.rotation + dropAngle(), at.x, at.y, 30, view.squash);
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
    const seat = mine(s);
    const floor = hudFloor(handOf(s, seat).length);
    // СВОЙ СТУЛ — ВНИЗУ: у каждого зрителя стол повёрнут так, что его место на шести часах.
    const turn = chairOf(s, seat)?.angle ?? 0;
    const seats: Seat[] = s.chairs.map((c) => {
      const sitter = sitterOf(s, c);
      return {
        key: c.id,
        angle: (c.angle - turn + 360) % 360,
        mine: c.id === seat,
        // Своя рука — внизу, на стекле; в своём стуле карт не рисуем.
        cards: c.id === seat ? 0 : c.hand.filter((card) => !flying.has(card.id)).length + gapsIn(s, c.id).filter((gap) => gap.carry).length,
        ...(sitter ? { name: sitter.name, ink: sitter.ink } : {}),
        ...(sitter?.photo ? { face: face(sitter) } : {}),
      };
    });
    lastFrame = { w: g.w, h: g.h - floor };
    syncCamera();
    view = drawFelt(canvas, {
      W: g.w, H: g.h, people: seats, images, deck: s.deck, felt: s.felt, held: heldByOthers(s), hidden: flying,
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
      felt: s.felt.map((f) => ({ id: f.id, angle: f.angle })),
      seats: spots.map((sp) => {
        const c = chairOf(s, sp.key);
        return { key: sp.key, who: c && sitterOf(s, c)?.name, x: Math.round(sp.x), y: Math.round(sp.y), r: Math.round(sp.r), chair: Math.round(SEAT_REACH * view!.k) };
      }),
    });
    local.tips = local.tips.filter((id) => id !== seat && chairOf(s, id) !== undefined);
    // ОКНА СТАВЯТСЯ ПО ОЧЕРЕДИ ОТКРЫТИЯ: каждое знает, где уже стоят раньше открытые.
    placedTips = new Map();
    for (const key of local.tips) {
      const spot = spots.find((sp) => sp.key === key);
      if (spot) placedTips.set(key, tipBox(spot, [...placedTips.values()]));
    }
    const open = local.tips
      .map((id) => ({ chair: chairOf(s, id)!, spot: spots.find((sp) => sp.key === id) }))
      .filter((one): one is { chair: Chair; spot: Spot } => Boolean(one.spot))
      .map((one) => tipHtml(s, one.chair, one.spot));
    // ВСЕ КОРОБКИ СНАЧАЛА, ПОТОМ ВСЕ КАРТЫ: чужой веер вылезает за свою коробку, и соседняя его не режет.
    over.innerHTML = hudHtml(s) + open.map((t) => t.shell).join("") + open.map((t) => t.cards).join("") + chairZonesHtml(s) + feltMarkHtml() + carryHtml();
    wire();

    // ПЕРЕЕХАВШЕЕ — ЛЕТИТ. Запущенный перелёт прячет карту на месте, поэтому кадр рисуется ещё раз;
    // во втором проходе места те же, и нового перелёта не будет.
    const places = placesOf(s);
    let started = fly(places);
    if (returning && places.has(returning.id)) {
      launch(returning.id, returning.from, places.get(returning.id)!);
      started = true;
    }
    returning = null;
    prevPlaces = places;
    paintCarries(s, places);
    if (started) draw();
  }

  // ── ЧУЖИЕ РУКИ В ВОЗДУХЕ И ПЕРЕЛЁТЫ ────────────────────────────────────────────────────────────

  /** Руки, которые у меня на экране веером: моя внизу и открытые окна. */
  function handsShown(s: Snapshot): Map<string, { geom: Geom; lay: Laid[] }> {
    const out = new Map<string, { geom: Geom; lay: Laid[] }>();
    const put = (chair: string, geom: (n: number) => Geom) => {
      const cards = handOf(s, chair);
      const gaps = gapsIn(s, chair);
      const g = geom(cards.length + gaps.length);
      out.set(chair, { geom: g, lay: laid(g, cards, gaps, chair) });
    };
    if (mine(s)) put(mine(s), mineGeom);
    for (const key of placedTips.keys()) {
      const spot = spots.find((sp) => sp.key === key);
      if (spot && chairOf(s, key)) put(key, (n) => tipGeom(key, spot, n));
    }
    return out;
  }

  /** Все карты, какими они нарисованы у меня сейчас. Порядковый номер в руке — среди карт, без щелей. */
  function placesOf(s: Snapshot): Map<string, Place> {
    const out = new Map<string, Place>();
    if (!view) return out;
    const v = view;
    const onDesk = (key: string, at: { x: number; y: number }, scale: number, angle: number, face?: Face): Place => {
      const p = v.toGlass(at);
      return { key, x: p.x, y: p.y, w: FELT_CARD.w * scale * v.k, h: FELT_CARD.h * scale * v.k, angle: v.rotation + angle, squash: v.squash, face };
    };
    s.deck.forEach((c, i) => out.set(c.id, onDesk("deck", deckAt(i, s.deck.length), 1, 0)));
    for (const f of s.felt) out.set(f.id, onDesk(`felt:${f.x.toFixed(2)},${f.y.toFixed(2)},${f.angle}`, f, 1, f.angle, f.up ? f.face : undefined));
    const shown = handsShown(s);
    for (const c of s.chairs) {
      const hand = shown.get(c.id);
      if (hand) {
        let i = 0;
        for (const one of hand.lay) {
          if (!("card" in one)) continue;
          out.set(one.card.id, { key: `hand:${c.id}:${i++}`, x: one.slot.x, y: one.slot.y, w: hand.geom.w, h: hand.geom.h, angle: one.slot.angle, squash: 1, face: one.card.face });
        }
        continue;
      }
      const spot = spots.find((sp) => sp.key === c.id);
      if (spot) c.hand.forEach((card, i) => out.set(card.id, onDesk(`hand:${c.id}:${i}`, spot.seat, HAND_SCALE, 0)));
    }
    for (const c of store.carries) {
      const at = carryPlace(s, c, shown);
      if (at) out.set(c.id, at);
    }
    return out;
  }

  /**
   * ГДЕ У МЕНЯ ЧУЖАЯ КАРТА В РУКАХ — там, над чем она у держащего: в щели руки, если эта рука у меня
   * веером; у стула, если нет; на сукне — там, куда ляжет, и под тем углом.
   */
  function carryPlace(s: Snapshot, c: Carry, shown: Map<string, { geom: Geom; lay: Laid[] }>): Place | null {
    if (!view) return null;
    const v = view;
    const key = `carry:${c.by}`;
    const onDesk = (at: { x: number; y: number }, angle: number): Place => {
      const p = v.toGlass(at);
      return { key, x: p.x, y: p.y, w: FELT_CARD.w * v.k, h: FELT_CARD.h * v.k, angle: v.rotation + angle, squash: v.squash, face: c.card.face };
    };
    const over = c.over;
    if (over.in === "felt") return onDesk(over, over.angle);
    if (over.in === "deck") return onDesk(deckAt(s.deck.length, s.deck.length + 1), 0);
    const hand = shown.get(over.chair);
    const gap = hand?.lay.find((one) => "gap" in one && one.gap.carry === c.id);
    if (hand && gap) return { key, x: gap.slot.x, y: gap.slot.y, w: hand.geom.w, h: hand.geom.h, angle: gap.slot.angle, squash: 1, face: c.card.face };
    const spot = spots.find((sp) => sp.key === over.chair);
    return spot ? onDesk(spot.seat, 0) : null;
  }

  /** Поза копии карты на стекле: середина, наклон стола, поворот и размер относительно конечного. */
  const poseCss = (p: Place, base: { w: number; h: number }, turn = 1) =>
    `translate(${p.x - base.w / 2}px,${p.y - base.h / 2}px) scale(1,${p.squash}) rotate(${p.angle}deg) scale(${(p.w / base.w) * turn},${p.h / base.h})`;

  const sameFace = (a?: Face, b?: Face) => a?.rank === b?.rank && a?.suit === b?.suit;

  /** ЧУЖИЕ КАРТЫ В РУКАХ — живут в воздухе и едут переходом на длину одного шага потока. */
  function paintCarries(s: Snapshot, places: Map<string, Place>): void {
    const live = new Set<string>();
    for (const c of store.carries) {
      const at = places.get(c.id);
      if (!at) continue;
      live.add(c.id);
      let el = air.querySelector<HTMLElement>(`[data-carry="${c.id}"]`);
      if (!el) {
        el = document.createElement("div");
        el.dataset.carry = c.id;
        air.append(el);
      }
      const ink = inkOf(s, c.by);
      const who = s.people.find((p) => p.key === c.by)?.name ?? "";
      const look = `${Math.round(at.w)}|${c.card.face?.rank}${c.card.face?.suit}|${ink}|${who}`;
      if (el.dataset.look !== look) {
        el.dataset.look = look;
        el.innerHTML = `<div data-g="carried" style="position:absolute;left:0;top:0;width:${at.w}px;height:${at.h}px;border-radius:${at.w * 0.12}px;`
          + `box-shadow:0 0 0 3px ${ink},0 ${Math.round(at.h * 0.12)}px 0 rgba(11,7,4,.45)">${cardHtml(c.card.face, at.w)}</div>`
          + `<span data-g="who" style="position:absolute;left:${at.w * 0.7}px;top:${at.h * 0.85}px;white-space:nowrap;font:400 11px Tiny5,monospace;`
          + `color:${T.black};background:${ink};border-radius:6px;padding:2px 6px;box-shadow:0 0 0 2px ${T.black}">${escape(who)}</span>`;
      }
      el.dataset.at = `${Math.round(at.x)},${Math.round(at.y)}`;
      const card = el.firstElementChild as HTMLElement;
      el.style.cssText = `position:absolute;left:0;top:0;transform:translate(${at.x - at.w / 2}px,${at.y - at.h / 2}px);`
        + `transition:transform ${CARRY_EVERY_MS * 2}ms linear;${flying.has(c.id) ? "visibility:hidden;" : ""}`;
      card.style.transform = `scale(1,${at.squash}) rotate(${at.angle}deg)`;
    }
    for (const el of air.querySelectorAll<HTMLElement>("[data-carry]")) if (!live.has(el.dataset.carry!)) el.remove();
  }

  /** Всё, что сменило место с прошлого кадра, — в полёт. Своя карта в пальце не летит: она под пальцем. */
  function fly(next: Map<string, Place>): boolean {
    let started = false;
    for (const [id, to] of next) {
      const from = prevPlaces.get(id);
      if (!from || from.key === to.key || id === drag?.card.id) continue;
      started = true;
      launch(id, from, to);
    }
    return started;
  }

  function launch(id: string, from: Place, to: Place): void {
    air.querySelector(`[data-flight="${id}"]`)?.remove();
    flying.add(id);
    const el = document.createElement("div");
    el.dataset.flight = id;
    el.style.cssText = `position:absolute;left:0;top:0;width:${to.w}px;height:${to.h}px;transform-origin:50% 50%;transform:${poseCss(from, to)}`;
    // ПЕРЕВОРОТ В ПОЛЁТЕ: откуда вылетела лицом, а ляжет рубашкой (или наоборот) — ребром на полпути.
    const turns = !sameFace(from.face, to.face);
    el.innerHTML = cardHtml(turns ? from.face : to.face, to.w);
    air.append(el);
    const mid: Place = { ...to, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, w: (from.w + to.w) / 2, h: (from.h + to.h) / 2, angle: (from.angle + to.angle) / 2, squash: (from.squash + to.squash) / 2 };
    const frames = turns
      ? [{ transform: poseCss(from, to) }, { transform: poseCss(mid, to, 0.02), offset: 0.5 }, { transform: poseCss(to, to) }]
      : [{ transform: poseCss(from, to) }, { transform: poseCss(to, to) }];
    const run = el.animate(frames, { duration: FLIGHT_MS, easing: "cubic-bezier(.2,.7,.3,1)" });
    if (turns) setTimeout(() => (el.innerHTML = cardHtml(to.face, to.w)), FLIGHT_MS / 2);
    run.onfinish = () => {
      if (el.isConnected) el.remove();
      if (!air.querySelector(`[data-flight="${id}"]`)) flying.delete(id);
      draw();
    };
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
      // Под замком рука стула палец не принимает — карта летит мимо, на сукно.
      if (!spot || closed(s, key)) continue;
      const room = handOf(s, key).length;
      const geom = tipGeom(key, spot, room + 1);
      const box = geom.box!;
      if (x >= box.left && x <= box.left + box.w && y >= box.top && y <= box.top + box.height) {
        return { kind: "hand", which: key, index: slotAt(geom, x, room) };
      }
    }
    const room = handOf(s, mine(s)).length;
    const geom = mineGeom(room + 1);
    // Рука принимает ровно там, где горит её зона: верх карт и поле над ними (`handZoneHtml`).
    const top = geom.slots.reduce((m, sl) => Math.min(m, sl.y - geom.h / 2), Infinity) - geom.h * 0.12;
    if (y >= top && x >= 0 && x <= glass().w) return { kind: "hand", which: mine(s), index: slotAt(geom, x, room) };
    // НА СТУЛ — в руку его стула, в конец. Под локом стул карту не берёт: она вернётся, откуда взята.
    const chair = chairUnder(s, x, y);
    if (chair) return closed(s, chair.key) ? { kind: "back" } : { kind: "chair", which: chair.key };
    // НА СУКНО — туда, где середина несомой карты, а не где палец: за неё и держат.
    const d = drag!;
    return { kind: "felt", at: view!.toDesk({ x: x - d.gx + d.w / 2, y: y - d.gy + d.h / 2 }) };
  }

  const sameAim = (a: Aim, b: Aim) => {
    if (a.kind === "hand" && b.kind === "hand") return a.which === b.which && a.index === b.index;
    if (a.kind === "chair" && b.kind === "chair") return a.which === b.which;
    return a.kind === b.kind && a.kind !== "hand" && a.kind !== "chair";
  };

  /** Что под пальцем на сукне: сверху вниз, и с колоды — только верхняя. */
  function feltPick(x: number, y: number): { card: SeenCard; at: { x: number; y: number }; from: "felt" | "deck"; up: boolean } | null {
    if (!view) return null;
    const s = store.state;
    const { x: ux, y: uy } = view.toDesk({ x, y });
    // Палец — в оси самой карты: у повёрнутой карты попадание считается по её сторонам, а не по рамке.
    const over = (at: { x: number; y: number }, angle = 0) => {
      const t = (-angle * Math.PI) / 180;
      const dx = ux - at.x;
      const dy = uy - at.y;
      const lx = dx * Math.cos(t) - dy * Math.sin(t);
      const ly = dx * Math.sin(t) + dy * Math.cos(t);
      return Math.abs(lx) <= FELT_CARD.w / 2 && Math.abs(ly) <= FELT_CARD.h / 2;
    };
    for (let i = s.felt.length - 1; i >= 0; i -= 1) {
      const one = s.felt[i]!;
      if (over(one, one.angle)) return { card: one, at: one, from: "felt", up: one.up };
    }
    const top = s.deck.at(-1);
    if (top && over(deckAt(s.deck.length - 1, s.deck.length))) return { card: top, at: deckAt(s.deck.length - 1, s.deck.length), from: "deck", up: false };
    return null;
  }

  /** Поднять. Экран снимает карту сразу, намерение уходит следом; отказ вернёт её на место. */
  function lift(card: SeenCard, shown: boolean, box: { left: number; top: number; w: number; h: number }, e: PointerEvent, target: Aim) {
    if (store.state.locks[card.id] && store.state.locks[card.id] !== me()) return;
    const from = whereIs(store.state, card.id);
    if (!from) return;
    drag = {
      from,
      card, shown, w: box.w, h: box.h,
      gx: e.clientX - box.left, gy: e.clientY - box.top, x: e.clientX, y: e.clientY, target,
      hold: window.setInterval(() => store.send({ t: "hold", id: card.id }), HOLD_EVERY_MS),
      toldAt: 0,
    };
    store.send({ t: "grab", id: card.id });
    tellCarry();
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
    if (closed(s, owner)) return;
    const geom = owner === mine(s) ? mineGeom(handOf(s, owner).length) : tipGeom(owner, spots.find((sp) => sp.key === owner)!, handOf(s, owner).length);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const card = handOf(s, owner)[index]!;
    lift(card, card.face !== undefined, { left: cx - geom.w / 2, top: cy - geom.h / 2, w: geom.w, h: geom.h }, e, { kind: "hand", which: owner, index });
    try { el.setPointerCapture?.(e.pointerId); } catch { /* пальца уже нет */ }
  }

  /** Куда ляжет карта, если отпустить сейчас, — место словами контракта. */
  function landing(d: Drag): Where {
    const aim = d.target;
    if (aim.kind === "hand") return { in: "hand", chair: aim.which, i: aim.index };
    if (aim.kind === "chair") return { in: "hand", chair: aim.which, i: handOf(store.state, aim.which).length };
    if (aim.kind === "back") return d.from;
    // На сукно карта ложится так, как её несли: лицом — если её было видно.
    return { in: "felt", x: aim.at.x, y: aim.at.y, up: d.shown, angle: dropAngle() };
  }

  /**
   * СКАЗАТЬ ОСТАЛЬНЫМ, НАД ЧЕМ МОЯ КАРТА, — не чаще `CARRY_EVERY_MS`. Движение, пришедшее в паузу, не
   * теряется: последнее место уходит хвостом, когда пауза кончится.
   */
  let tail = 0;
  function tellCarry(): void {
    if (!drag) return;
    const wait = drag.toldAt + CARRY_EVERY_MS - performance.now();
    if (wait > 0) {
      if (!tail) tail = window.setTimeout(() => ((tail = 0), tellCarry()), wait);
      return;
    }
    drag.toldAt = performance.now();
    store.carry({ id: drag.card.id, over: landing(drag) });
  }

  function moveDrag(e: PointerEvent) {
    steer(e);
    tellCarry();
  }

  function steer(e: PointerEvent) {
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
    if (d.target.kind === "back") {
      returning = {
        id: d.card.id,
        from: { key: "finger", x: d.x - d.gx + d.w / 2, y: d.y - d.gy - d.h * CARRY_CLEAR + d.h / 2, w: d.w, h: d.h, angle: 0, squash: 1, face: d.shown ? d.card.face : undefined },
      };
      store.send({ t: "release", id: d.card.id });
      return draw();
    }
    const to = landing(d);
    const from = whereIs(store.state, d.card.id);
    if (from) {
      const keepsFace = (to.in === "hand" && to.chair === mine()) || (to.in === "felt" && to.up);
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
        const seat = chairOf(store.state, mine());
        if ((RIGHTS as readonly string[]).includes(what)) {
          if (seat) store.send({ t: "flag", chair: seat.id, flag: what as ChairFlag, on: !seat[what as ChairFlag] });
        } else if (what === "flip") store.send({ t: "flip" });
        else local.pose[what as keyof Pose] = !local.pose[what as keyof Pose];
        draw();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-flag]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const chair = chairOf(store.state, el.dataset.chair!);
        const flag = el.dataset.flag as ChairFlag;
        if (chair) store.send({ t: "flag", chair: chair.id, flag, on: !chair[flag] });
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-sit]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = el.dataset.sit!;
        // Сел — окно этого стула больше не чужое: его рука теперь внизу.
        local.tips = local.tips.filter((k) => k !== id);
        store.send({ t: "sit", chair: id });
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

  // ТАП ПО СУКНУ: сперва карта под пальцем, потом — стул (открыть или закрыть его окно), занятый или нет.
  //
  // КОМУ ПАЛЕЦ — РЕШАЕТСЯ ЗДЕСЬ И РАНЬШЕ КАМЕРЫ: слушатель стоит на `stage` в фазе захвата, то есть
  // до холста, на котором слушает камера. Карта, аватар или палец, пришедший, пока другой несёт
  // карту, — не доходят до неё вовсе (`stopPropagation`). Пустое сукно — доходит, и стол едет.
  stage.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target !== canvas) return;
      if (drag) return void e.stopPropagation();
      // Мышь с Ctrl/Cmd или правой кнопкой — всегда камера: карта не берётся, окно не открывается.
      if (orbits(e)) {
        e.preventDefault();
        e.stopPropagation();
        return cam.orbit(e);
      }
      const pick = feltPick(e.clientX, e.clientY);
      if (pick) {
        e.preventDefault();
        e.stopPropagation();
        return grabFromFelt(e, pick);
      }
      // ОКНО ОТКРЫВАЕТСЯ И ЗАКРЫВАЕТСЯ ТАПОМ ПО СТУЛУ — и по аватару, пока он на стуле (`chairUnder`).
      const hit = chairUnder(store.state, e.clientX, e.clientY);
      if (!hit || hit.key === mine()) return;
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
