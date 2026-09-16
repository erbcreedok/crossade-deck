// ЭКРАН СТОЛА — холст со столом, моя рука внизу, чужие руки в тултипах и палец, который всё это носит.
//
// Экран не хранит стол: он спрашивает хранилище (`TableStore`) и держит только то, что есть лишь у
// него, — что сейчас в воздухе, какие окна открыты, как сложена моя рука. Всё, что меняет стол,
// уходит намерением; пока ответ не пришёл, экран показывает ожидаемое (`pending`), а отказ просто
// возвращает настоящий снимок.

import { CARRY_EVERY_MS, DEFAULT_POSE, HOLD_EVERY_MS, type Arrange, type DeckDo, type Carry, type Chair, type ChairFlag, type Face, type Intent, type Person, type Pile, type GatherSide, MAIN_PILE, DEFAULT_SPOT, type SeenCard, type Snapshot, type Where } from "../src/table/contract.js";
import { applyPatch } from "../src/table/patch.js";
import { arranged, samePack, shuffled } from "../src/table/arrange.js";
import { CARD as FELT_CARD, HAND_SCALE, SEAT_REACH, SUITS, drawFelt, type FeltView, type Pose, type Seat, type Spot } from "./felt.js";
import { orbits, tableCamera } from "./camera.js";
import { deckArt, readLook, settled, writeLook, type DeckLook } from "./deckArt.js";
import { tableHaptic, type Haptic } from "./haptic.js";
import { tableMotion } from "./motion.js";
import { EYES_IN_PANEL, EYES_ON_TABLE, eyesAt, type Eye, type Spot as EyeSpot } from "../src/table/eyes.js";
import { VOICE_MAX_MS } from "../src/table/voice.js";
import { tableVoice, type Recording, type VoiceClip } from "./voice.js";
import { mountSettings } from "./settings.js";
import { tableSound } from "./sound.js";
import { cuesBetween, spots as cueSpots, type CueAt, type CueKind, type Spot as CueSpot } from "../src/table/cues.js";
import { mountTalk, type WordAnchor } from "./talk.js";
import { LINE_MAX, LINES_MAX } from "../src/table/say.js";
import { FELT_REACH } from "../src/table/table.js";
import type { TableStore } from "./store.js";
import { HOST } from "./host.js";

/** Цвет отметки карты в строке — светлые версии красок колоды: буквы строки стоят на сукне с чёрной обводкой. */
const MENTION_INK = { red: "#e5483f", black: "#e8e0d0", back: "#9fb3cf", four: { s: "#4f95dc", h: "#e5483f", d: "#f0902e", c: "#e8e0d0" } };
const MUTED_KEY = "crossade.table.muted";
/** Голос этого человека не слушаю — отдельно от «не читать»: слова и голос глушатся порознь. */
const VOICE_MUTED_KEY = "crossade.table.mutedVoice";
function readMuted(key = MUTED_KEY): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}
function writeMuted(keys: Iterable<string>, key = MUTED_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify([...keys]));
  } catch {
    // Нет хранилища — живёт, пока открыт экран.
  }
}

const T = {
  black: "#0b0704", ink: "#f5ead0", inkDim: "#cdb98f", gold: "#f2c14e",
  well: "#1c120b", panel: "#3a2a1d", panelLight: "#4a3627", wood: "#6b4d2c",
};
const BAR_LOOK = { plateHi: "#25321f", plateLo: "#16210f", rim: "#6b4d2c", goldHi: "#f8d885", goldLo: "#b08a26" };

/** НИЖНИЙ БАР И ПОЛОСА РУКИ — числа продукта. Единица HUD — доля стекла, а не единица сукна. */
const BAR = { size: 0.6, gap: 0.08, margin: 0.22, pad: 0.11, radius: 0.11, tuck: 0.24, fade: 1 };
const HUD_FAN = { radius: 7, apart: 1.06, edge: 0.1 };
const HUD_CARDS = 6, HUD_GAP = 0.06, HUD_MARGIN = 0.14, HAND_PAD = 0.16, TUCK_TIP = 0.45;
/** Скрытая рука в окне стула: какая доля высоты карты торчит над краем. */
const TIP_TUCK = 0.28;
/** На сколько несомая карта висит выше того места, куда летит — доля её высоты. */
const CARRY_CLEAR = 0.32;
const HAND_ROOM = 0.6 / 4 + 0.06;
const HUD_UNIT_FRACTION = 0.25;
const CARD = { w: 1, h: 1.4 };

/** Флаги стула в нижнем HUD и в окне стула — одни и те же кнопки, одни и те же значки. */
const RIGHTS = ["lock", "hide", "forever"] as const satisfies readonly ChairFlag[];
const FOLDS = ["fan", "shrink", "tuck"] as const;
const ORDERS = ["suit", "rank", "reverse", "shuffle"] as const satisfies readonly Arrange[];
/**
 * СЕКЦИИ НИЖНЕГО БАРА. Сначала в баре только кнопки секций; нажатая уезжает влево и горит, остальные
 * улетают, прилетают кнопки секции. Та же кнопка ещё раз — секция закрыта.
 */
/**
 * ЛАССО — секция-режим: пока она открыта, касания стола и карт выделяют, а не берут. В баре три раздела:
 * инструмент (курсор или лассо), вид грэба (одним кликом по кругу) и сторона при сборке в стопку (по кругу).
 */
const LASSO = ["cursor", "lasso", "grab", "side"] as const;
const SECTIONS = ["pose", "chair", "order", "lasso", "say"] as const;
type Section = (typeof SECTIONS)[number];
type BarKey = (typeof RIGHTS)[number] | (typeof FOLDS)[number] | (typeof ORDERS)[number] | (typeof LASSO)[number] | "leave";
/** Вид грэба выделенного: стянуть к пальцу (карта под пальцем сверху) или нести, как лежат. */
type GrabMode = "collect" | "keep";
/** «Диалог» — не секция кнопок: он открывает клавиатуру вместо руки (`talk.ts`). */
const SUBS: Record<Section, readonly BarKey[]> = { pose: FOLDS, chair: [...RIGHTS, "leave"], order: ORDERS, lasso: LASSO, say: [] };
/** Сколько идёт смена секций в баре. */
const SECTION_MS = 240;
const GLYPH: Record<BarKey | `sec-${Section}` | "back" | "deck" | "pin" | "eye" | "mic" | "shut" | "seal" | `grab-${GrabMode}` | `side-${GatherSide}`, string> = {
  /** Курсор-хват — ладонь. */
  cursor: '<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10"/><path d="M11 9.5V4a1.5 1.5 0 0 1 3 0v6"/><path d="M14 9.5V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M17 10a1.5 1.5 0 0 1 3 0v3.5a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L4 14.6a1.5 1.5 0 0 1 2.3-1.9L8 14.5V9a1.5 1.5 0 0 1 3 0"/>',
  lasso: '<ellipse cx="13" cy="9" rx="8" ry="5.5" stroke-dasharray="3 2.4"/><path d="M8 13.5c-2 1.5-2.5 4 0 5.5 1.5 1 3 .5 3.5-.5"/>',
  grab: "",
  side: "",
  /** Стянуть к пальцу — четыре стрелки в точку. */
  "grab-collect": '<path d="M4 4l5 5"/><path d="M9 5v4H5"/><path d="M20 4l-5 5"/><path d="M15 5v4h4"/><path d="M4 20l5-5"/><path d="M5 15h4v4"/><path d="M20 20l-5-5"/><path d="M19 15h-4v4"/>',
  /** Как лежат — три карты врозь со стрелкой переноса. */
  "grab-keep": '<rect x="3" y="3" width="6" height="8" rx="1"/><rect x="14" y="6" width="6" height="8" rx="1"/><rect x="7" y="14" width="6" height="7" rx="1" transform="rotate(-8 10 17)"/>',
  /** Сторона как лежала — карта наполовину лицом, наполовину рубашкой. */
  "side-keep": '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 12h12"/><path d="M9 6.5l1.5 2.5L12 6.5l1.5 2.5L15 6.5"/>',
  /** Все рубашкой вверх — плетёнка. */
  "side-down": '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M8 7l8 10"/><path d="M16 7L8 17"/><path d="M8 12h8"/>',
  /** Все лицом вверх — масть. */
  "side-up": '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 8c-1.5 2-3 3-3 4.5a1.5 1.5 0 0 0 3 .3 1.5 1.5 0 0 0 3-.3C15 11 13.5 10 12 8z"/>',
  "sec-lasso": '<ellipse cx="12" cy="9" rx="8" ry="5.5"/><path d="M7 13c-2 1.5-2.5 4 0 5.5 1.5 1 3 .5 3.5-.5"/><path d="M15 15l4 6"/>',
  lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3"/><path d="M5 11h14v10H5z"/>',
  hide: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9 9 0 0 1 22 12s-1.5 2.6-4.3 4.5"/><path d="M6.4 7.6C3.9 9.3 2 12 2 12s4 7 10 7c1.5 0 2.9-.3 4.1-.9"/>',
  forever: '<path d="M6.5 8.5C3.5 8.5 2 10.2 2 12s1.5 3.5 4.5 3.5C10 15.5 14 8.5 17.5 8.5 20.5 8.5 22 10.2 22 12s-1.5 3.5-4.5 3.5C14 15.5 10 8.5 6.5 8.5z"/>',
  reverse: '<rect x="7.5" y="4" width="9" height="16" rx="1.5"/><path d="M4 9.5A9 9 0 0 1 8.2 4.4"/><path d="M8.6 2.2 8.2 4.4l2.2.5"/><path d="M20 14.5A9 9 0 0 1 15.8 19.6"/><path d="M15.4 21.8l.4-2.2-2.2-.5"/>',
  fan: '<rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(-28 12 20)"/><rect x="9" y="5" width="6" height="12" rx="1"/><rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(28 12 20)"/>',
  shrink: '<rect x="8" y="5" width="8" height="14" rx="1"/><path d="M2 12h4"/><path d="M4 9.5 6.5 12 4 14.5"/><path d="M22 12h-4"/><path d="M20 9.5 17.5 12l2.5 2.5"/>',
  tuck: '<rect x="8" y="3" width="8" height="11" rx="1"/><path d="M3 18h18"/><path d="M12 14v-4"/><path d="M9.5 12.5 12 15l2.5-2.5"/>',
  leave: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  suit: '<path d="M7 4c-2 2.5-4 4-4 6a2 2 0 0 0 4 .5 2 2 0 0 0 4-.5c0-2-2-3.5-4-6z"/><path d="M7 11v3"/><path d="M17 20c2-2.5 4-4 4-6a2 2 0 0 0-4-.5 2 2 0 0 0-4 .5c0 2 2 3.5 4 6z"/>',
  rank: '<path d="M4 7h3v10"/><path d="M4 17h6"/><path d="M14 7h4a2 2 0 0 1 0 4h-2a2 2 0 0 0-2 2v4h6"/>',
  shuffle: '<path d="M3 7h4l10 10h4"/><path d="M3 17h4l3-3"/><path d="M14 10l3-3h4"/><path d="M18.5 4.5 21 7l-2.5 2.5"/><path d="M18.5 14.5 21 17l-2.5 2.5"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  pin: '<path d="M9 3h6l-1 6h2l1 5H7l1-5h2L9 3z"/><path d="M12 14v7"/>',
  /** Микрофон — зона записи голосового и значок на аватаре пишущего. */
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  /** Глаз наблюдателя — у кого открыто это окно. */
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
  /** Приёмка закрыта — лоток, над ним стрелка вниз, перечёркнуто. */
  shut: '<path d="M4 14h4l1 3h6l1-3h4v6H4z"/><path d="M12 3v8"/><path d="M9 8l3 3 3-3"/><path d="M3 3l18 18"/>',
  /** Мерж закрыт — две стопки, между ними перечёркнутая стрелка. */
  seal: '<rect x="2" y="7" width="7" height="10" rx="1"/><rect x="15" y="7" width="7" height="10" rx="1"/><path d="M10.5 12h3"/><path d="M12 9.5 14 12l-2 2.5"/><path d="M9.5 18.5l5-13"/>',
  /** Индикатор колоды — три карты веером. */
  deck: '<rect x="3" y="4" width="9" height="12" rx="1.5" transform="rotate(-14 7 10)"/><rect x="8" y="4" width="9" height="12" rx="1.5"/><rect x="12" y="4" width="9" height="12" rx="1.5" transform="rotate(14 17 10)"/>',
  "sec-pose": '<rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(-20 12 20)"/><rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(20 12 20)"/><path d="M5 21h14"/>',
  "sec-chair": '<path d="M7 3v9h10V3"/><path d="M6 12h12v3H6z"/><path d="M7 15v6"/><path d="M17 15v6"/>',
  "sec-order": '<path d="M4 6h10"/><path d="M4 12h7"/><path d="M4 18h4"/><path d="M18 5v14"/><path d="M15 16l3 3 3-3"/>',
  "sec-say": '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 10.5h.01"/><path d="M12 10.5h.01"/><path d="M16 10.5h.01"/>',
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
  | { kind: "deck"; pile: string }
  /** В открытый тултип стопки, на место `index` снизу. */
  | { kind: "deckAt"; pile: string; index: number }
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

/** Индикатор колоды: высота — не больше этой доли высоты карты на экране. */
const GRIP = { most: 0.5 };

/** Двойной тап: второй тап по той же карте не позже этого после первого. */
const DOUBLE_TAP_MS = 320;
/** Сколько карта переворачивается. */
const TURN_MS = 320;

/** Тап, а не хват: палец отпустили раньше этого и сдвинули не дальше `TAP_PX`. */
const TAP_MS = 350;
const TAP_PX = 8;
/** Перемена кадра в пределах стольких мс после моего касания — моя. */
const MINE_MS = 700;
declare const __TABLE_BUILD__: string | undefined;
/** Номер сборки стола — подставляет сервер, собирая клиент. */
const TABLE_BUILD = typeof __TABLE_BUILD__ === "string" ? __TABLE_BUILD__ : "dev";
/** Вибрация на перемену стола. */
const CUE_HAPTIC: Record<Exclude<CueKind, "shuffle">, Haptic> = { drop: "soft", turn: "rigid", hand: "light", out: "soft", merge: "medium", gather: "medium" };
const SHUFFLE_TICK_MS = 120;

/** Сколько догадка ждёт ответа сервера, прежде чем уступить столу. */
const GUESS_MS = 4000;

/** Сколько летит карта из места в место. */
const FLIGHT_MS = 260;
/** Шафл стопки: круг веера и задержка последней из восьми карт. */
const SHUFFLE_MS = 1300, SHUFFLE_STAGGER_MS = 18, SHUFFLE_CARDS = 8;

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
  /** Где и когда палец нажал, и ушёл ли дальше порога тапа. */
  sx: number;
  sy: number;
  t0: number;
  moved: boolean;
  /** Несут выделенное лассо: карта под пальцем ведёт за собой всё моё выделение. */
  mass?: boolean;
}

/** Экран стола. `ready` — когда всё, что он рисует, пришло: колода стола, лица сидящих и шрифт. */
export function mountScreen(stage: HTMLElement, store: TableStore): { ready: Promise<void> } {
  const canvas = stage.querySelector("canvas")!;
  const over = stage.querySelector<HTMLElement>("#over")!;
  const images: Record<string, HTMLImageElement> = {};
  /** Личный вид колоды: четыре цвета и кириллица — у каждого свой, на его устройстве. */
  const look: DeckLook = readLook();
  const art = deckArt(() => draw(), () => look);
  const sound = tableSound();
  const haptic = tableHaptic();
  /** Личная скорость анимаций и «меньше анимаций». */
  const motion = tableMotion();
  motion.onChange(() => draw());
  const settings = mountSettings(document.body, {
    sound, haptic, motion, look,
    lookChanged: () => {
      writeLook(look);
      art.warm(store.state.rules);
      draw();
    },
    footer: () => [`build ${TABLE_BUILD}`, haptic.client].filter(Boolean).join(" · "),
    changed: () => draw(),
  });
  // ── ГОЛОСОВЫЕ ──────────────────────────────────────────────────────────────────────────────────
  const voice = tableVoice(sound);
  voice.onChange(() => draw());
  /** У кого сейчас горит микрофон — свой и чужие. */
  const recording = new Set<string>();
  store.onMic((m) => {
    if (m.on) recording.add(m.by);
    else recording.delete(m.by);
    draw();
  });
  // ГОЛОС ЗАГЛУШЁННОГО НЕ ЗВУЧИТ И НЕ ДЫШИТ: его запись у меня просто не играется.
  store.onVoice((clip) => {
    if (voiceMuted.has(clip.by)) return;
    voice.play(clip as VoiceClip, () => chairPlace(clip.by), false);
  });

  /** Где сидит автор записи — в долях от середины экрана, как у звуков стола. */
  function chairPlace(by: string): { x: number; z: number } {
    const s = seen();
    const chair = s.chairs.find((c) => c.owner === by);
    const spot = chair && spots.find((sp) => sp.key === chair.id);
    if (!spot || !view) return { x: 0, z: 0 };
    const at = view.toGlass(spot.seat);
    const g = glass();
    return { x: (at.x - g.w / 2) / (g.w / 2), z: (at.y - g.h / 2) / (g.h / 2) };
  }

  /** Когда я последний раз касался экрана: перемена кадра вскоре после касания — моя, звучит громче. */
  let touchedAt = -Infinity;
  /** Последнее место каждой карты, какое было видно: из кадра её вынимают, пока держат. */
  const knownSpots = new Map<string, CueSpot>();
  addEventListener("pointerdown", () => (touchedAt = performance.now()), { capture: true });
  addEventListener("pointerup", () => (touchedAt = performance.now()), { capture: true });
  /** Кого я не читаю — ключи людей, на моём устройстве. */
  const muted = new Set<string>(readMuted());
  /** Чей голос я не слушаю — своим списком, на моём устройстве. */
  const voiceMuted = new Set<string>(readMuted(VOICE_MUTED_KEY));
  const talk = mountTalk(stage, store, () => draw(), {
    who: (key) => {
      const p = store.state.people.find((one) => one.key === key);
      return p && { name: p.name, ink: p.ink };
    },
    card: (id) => cardMention(seen(), id),
    pick: (x, y) => {
      // Окна стульев — DOM поверх холста: карта в чужом окне под пальцем.
      const dom = document.elementsFromPoint(x, y).find((el) => el instanceof HTMLElement && el.closest("#over [data-card]"));
      const domCard = (dom as HTMLElement | undefined)?.closest<HTMLElement>("[data-card]")?.dataset.card;
      if (domCard) return { t: "card", id: domCard };
      const s = seen();
      const card = feltPick(x, y);
      if (card) return { t: "card", id: card.card.id };
      const chair = chairUnder(s, x, y);
      const owner = chair && chairOf(s, chair.key)?.owner;
      return owner ? { t: "who", key: owner } : null;
    },
    hand: () => handOf(seen(), mine(seen())).map((c) => c.id),
    muted: (key) => muted.has(key),
    stickerUrl: (by, id) => `${HOST}/table/stickers/${encodeURIComponent(by)}/${encodeURIComponent(id)}`,
    stickers: () => myStickers,
  });
  let myStickers: string[] = [];
  store.onStickers((ids) => {
    myStickers = ids;
    talk.refresh();
  });

  /** Только то, что есть у этого экрана и больше нигде. */
  const local = {
    /** Открытая секция нижнего бара, прошлая и когда сменилась — для перелёта кнопок. */
    section: null as Section | null,
    sectionFrom: null as Section | null,
    sectionAt: -Infinity,
    /** Открыт вопрос «Покинуть стул?». */
    confirmLeave: false,
    /** Открытые окна стульев — id стульев, по порядку открытия. */
    tips: [] as string[],
    /** Открытый тултип стопки — id стопки. */
    deckTip: null as string | null,
    /** Окно раздачи крупье: серия вопросов тому, кто нажал «Раздать». */
    deal: null as null | { rule: "each" | "durak" | "krest" | "belka"; n: number; all: boolean; skipEmpty: boolean },
    /** Жест голосового: зажата кнопка 💬 — куда доехал палец и что с записью. */
    mic: null as null | { phase: "hold" | "recording" | "full"; x: number; y: number; rec: Recording | null; began: number },
    /** Лассо: инструмент, вид грэба и сторона сборки — живут, пока открыт экран. */
    tool: "cursor" as "cursor" | "lasso",
    grab: "collect" as GrabMode,
    side: "keep" as GatherSide,
  };
  /**
   * ИНДИКАТОР КОЛОДЫ ПОД ПАЛЬЦЕМ. Тап — тултип колоды, двойной тап — перевернуть колоду, тяга — колода едет по
   * сукну за пальцем и встаёт, где отпустили. `off` — палец от места колоды на стекле: колода не прыгает
   * под палец и висит над индикатором, как её взяли. `at` — где колода сейчас, пока её тянут.
   */
  let gripPress: { pile: string; target?: Aim; pid: number; sx: number; sy: number; t0: number; moved: boolean; off: { x: number; y: number }; at?: { x: number; y: number } } | null = null;
  let lastGripTap = 0;
  let drag: Drag | null = null;
  /**
   * ВОЗДУХ — слой поверх экрана, который НЕ пересобирается на каждом кадре: в нём чужие карты в руках и
   * перелёты. Их движение — переходы и анимации браузера, а `over` переписывается целиком и убил бы их.
   */
  const air = document.createElement("div");
  air.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:70;overflow:hidden";
  stage.append(air);
  /**
   * ВОЗДУХ ПОД БАРОМ — перелёты в мою руку и из неё. Рука живёт под нижним баром, и карта, переставленная в
   * ней, не должна перелетать поверх бара: слой обрезан по его верхнему краю (`draw`).
   */
  const airUnder = document.createElement("div");
  airUnder.style.cssText = "position:absolute;left:0;right:0;top:0;height:100%;pointer-events:none;z-index:70;overflow:hidden";
  stage.append(airUnder);
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
  let pendings: { id: string; to: Where; card: SeenCard; from: Where; sawLock: boolean }[] = [];
  /**
   * ТУЛТИП КАРТЫ — что за карта, откуда пришла и кто её двигал. Открывается тапом по карте на сукне или по
   * колоде (там — верхняя), лежит на столе у карты. Не крышка: всё вокруг работает, как будто его нет.
   * `key` — место, где карта была, когда его открыли: карта уехала — тултип закрыт.
   */
  let cardTip: { id: string; key: string } | null = null;
  /** Прошлый тап по карте — для двойного. */
  let lastTap: { id: string; at: number } | null = null;
  /**
   * ПЕРЕВОРОТЫ. Сторона каждой карты прошлым кадром — и где карта лежала: сменилась сторона на том же месте —
   * карта переворачивается (своя, чужая, догадка или ответ сервера — всё равно). Сменилось место — это перенос.
   */
  const sides = new Map<string, { where: string; up: boolean; face?: Face }>();
  /**
   * `wait` — карта переворачивается лицом, которого я ещё не знаю (догадка раньше ответа сервера): переворот доходит
   * до ребра и ждёт там лица, а пришло — доворачивается.
   */
  const turns = new Map<string, { t0: number; up: boolean; face?: Face; wait?: boolean }>();
  let turnFrame = false;
  /**
   * ДОГАДКИ — нажатое в баре и в окне стула показывается сразу, не дожидаясь сервера: поза, флаг, порядок
   * руки. Сервер считает то же самое (порядок — тем же `arrange.ts`, шафл — присланный), и его ответ ложится
   * на уже нарисованное без перелёта. Одна догадка на одно место (`key`): новое нажатие заменяет прежнее.
   * Уходит, когда стол с сервера стал таким же (`settled`), когда намерение отказано (откат) или по сроку.
   */
  let guesses: { key: string; intent: Intent; v: number; at: number; apply(s: Snapshot): Snapshot; settled(s: Snapshot): boolean }[] = [];
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
  /** Стол с сервера и мои догадки поверх. */
  function truth(): Snapshot {
    let s = store.state;
    for (const g of guesses) s = g.apply(s);
    return s;
  }

  const withChair = (s: Snapshot, id: string, change: (c: Chair) => Chair): Snapshot =>
    ({ ...s, chairs: s.chairs.map((c) => (c.id === id ? change(c) : c)) });

  function guess(key: string, intent: Intent, apply: (s: Snapshot) => Snapshot, settled: (s: Snapshot) => boolean): void {
    guesses = [...guesses.filter((g) => g.key !== key), { key, intent, v: store.state.v, at: performance.now(), apply, settled }];
    store.send(intent);
    draw();
  }

  function guessPose(chair: string, k: keyof Pose, on: boolean): void {
    guess(`pose:${chair}:${k}`, { t: "pose", chair, pose: { [k]: on } },
      (s) => withChair(s, chair, (c) => ({ ...c, pose: { ...c.pose, [k]: on } })),
      (s) => chairOf(s, chair)?.pose[k] === on);
  }

  function guessFlag(chair: string, flag: ChairFlag, on: boolean): void {
    guess(`flag:${chair}:${flag}`, { t: "flag", chair, flag, on },
      (s) => withChair(s, chair, (c) => ({ ...c, [flag]: on })),
      (s) => chairOf(s, chair)?.[flag] === on);
  }

  const withPile = (s: Snapshot, id: string, change: (p: Pile) => Pile): Snapshot =>
    ({ ...s, piles: s.piles.map((p) => (p.id === id ? change(p) : p)) });

  /** Стопка встаёт сразу, где отпущена, и поверх остальных; сервер прижмёт к кромке так же (`FELT_REACH`). */
  function guessDeckMove(pile: string, x: number, y: number, angle: number): void {
    const far = Math.hypot(x, y);
    const k = far > FELT_REACH ? FELT_REACH / far : 1;
    const at = { x: x * k, y: y * k };
    guess(`deck:${pile}:move`, { t: "deckMove", pile, x: at.x, y: at.y, angle },
      (st) => {
        const one = pileOf(st, pile);
        return one ? { ...st, piles: [...st.piles.filter((p) => p !== one), { ...one, ...at, angle, below: st.felt.map((c) => c.id) }] } : st;
      },
      (st) => {
        const one = pileOf(st, pile);
        return !one || (Math.abs(one.x - at.x) < 1e-6 && Math.abs(one.y - at.y) < 1e-6);
      });
  }

  function guessDeckFlag(pile: string, flag: "pin" | "lock" | "shut" | "seal" | "forever", on: boolean): void {
    const intent: Intent = flag === "pin" ? { t: "deckPin", pile, on } : flag === "forever" ? { t: "deckForever", pile, on } : { t: "deckGuard", pile, guard: flag, on };
    guess(`deck:${pile}:${flag}`, intent,
      (st) => withPile(st, pile, (p) => ({ ...p, [flag]: on })),
      (st) => !pileOf(st, pile) || pileOf(st, pile)![flag] === on);
  }

  /** Открыт режим лассо. */
  const lassoOn = () => local.section === "lasso";

  /** Выделить или снять выделение — сразу, сервер ответит тем же или откажет. */
  function guessPick(ids: string[], on: boolean): void {
    if (ids.length === 0) return;
    const key = me();
    guess(`pick:${ids.join(",")}`, { t: "pick", ids, on },
      (st) => {
        const picks = { ...(st.picks ?? {}) };
        for (const id of ids) {
          if (on && picks[id] === undefined) picks[id] = key;
          else if (!on && picks[id] === key) delete picks[id];
        }
        return { ...st, picks };
      },
      (st) => ids.every((id) => (st.picks?.[id] === key) === on || (on && st.picks?.[id] !== undefined)));
  }

  function unpickAll(): void {
    const key = me();
    const mine = Object.entries(truth().picks ?? {}).filter(([, by]) => by === key).map(([id]) => id);
    if (mine.length === 0) return;
    guess("pick:all", { t: "unpick" },
      (st) => ({ ...st, picks: Object.fromEntries(Object.entries(st.picks ?? {}).filter(([, by]) => by !== key)) }),
      (st) => !Object.values(st.picks ?? {}).includes(key));
  }

  /** Тап по карте в режиме лассо: выделить, а по выделенной — снять. Чужую выделенную не трогает. */
  function togglePick(id: string): void {
    const by = truth().picks?.[id];
    if (by !== undefined && by !== me()) return;
    guessPick([id], by === undefined);
  }

  /** Кто выделил карту — цвет его чернил; `undefined` — никто. */
  const pickInk = (s: Snapshot, id: string): string | undefined => {
    const by = s.picks?.[id];
    return by === undefined ? undefined : inkOf(s, by);
  };

  /** Сторона карты, где бы она ни лежала. */
  function sideIn(s: Snapshot, id: string): { where: string; up: boolean; face?: Face } | null {
    const felt = s.felt.find((c) => c.id === id);
    if (felt) return { where: "felt", up: felt.up, face: felt.face };
    for (const pile of s.piles) {
      const card = pile.cards.find((c) => c.id === id);
      if (card) return { where: `deck:${pile.id}`, up: card.up === true, face: card.face };
    }
    for (const chair of s.chairs) {
      const card = chair.hand.find((c) => c.id === id);
      if (card) return { where: `hand:${chair.id}`, up: card.up === true, face: card.face };
    }
    return null;
  }

  /**
   * ПЕРЕВЕРНУТЬ — двойной тап. Сразу, если новая сторона уже известна: в руке — всегда (лицо не пропадает, а
   * прячется), на сукне и в колоде — только рубашкой вверх. Лицо, которого я не знаю, приходит с сервером:
   * тогда и переворот играется по его ответу.
   */
  function turnCard(id: string): void {
    const now = sideIn(truth(), id);
    if (!now) return;
    const up = !now.up;
    // ПЕРЕВОРОТ СРАЗУ. Лицо, которого я не знаю, приходит с сервером: до него карта стоит на ребре (`turns.wait`).
    guess(`turn:${id}`, { t: "turn", id }, (s) => flipIn(s, id, up), (s) => (sideIn(s, id)?.up ?? up) === up);
  }

  /**
   * ПАЧКОЙ — СРАЗУ. Сборка в стопку, мерж стопок, перенос и переворот выделенного показываются, не дожидаясь сервера:
   * догадка раскладывает карты так, как их разложит сервер (те же правила сторон и обрушения стопки из одной карты).
   * Уходит, когда хоть одна карта пачки на столе сдвинулась или перевернулась (ответ пришёл), по отказу или по сроку.
   */
  let batchSeq = 0;
  function guessBatch(intent: Extract<Intent, { t: "gather" | "moveMany" | "turnMany" | "pileDrop" }>): void {
    const before = store.state;
    const ids = intent.t === "gather" || intent.t === "turnMany" ? intent.ids : intent.t === "moveMany" ? intent.moves.map((m) => m.id) : (pileOf(before, intent.pile)?.cards.map((c) => c.id) ?? []);
    const was = new Map(ids.map((id) => [id, JSON.stringify([whereIs(before, id), sideIn(before, id)?.up])]));
    batchSeq += 1;
    guess(`batch:${batchSeq}`, intent, (st) => predict(st, intent),
      (st) => ids.some((id) => JSON.stringify([whereIs(st, id), sideIn(st, id)?.up]) !== was.get(id)));
  }

  /** Сторона, которой карта видна мне сейчас: на сукне и в стопке — как лежит, в руке — лицом, если его видно. */
  const shownUp = (s: Snapshot, id: string): boolean => {
    const side = sideIn(s, id);
    if (!side) return false;
    if (side.where.startsWith("hand:")) return side.face !== undefined && !side.up;
    return side.up;
  };

  /** Переложить карту на месте догадки: лицо — только если его видно мне и ляжет оно вверх. */
  function relocate(s: Snapshot, id: string, to: Where, up: boolean): Snapshot {
    const from = whereIs(s, id);
    if (!from) return s;
    const face = sideIn(s, id)?.face;
    const card: SeenCard = to.in === "hand"
      ? (to.chair === mine(s) && face ? { id, face } : { id })
      : { id, ...(up && face ? { face } : {}), ...(to.in === "deck" && up ? { up: true } : {}) };
    return applyPatch(s, { v: s.v, ops: [{ t: "move", card, from, to: to.in === "felt" ? { ...to, up } : to }] });
  }

  /** Невечная стопка из одной карты рушится на сукно, пустая — уходит (как `Table.sweepPile`). */
  function collapse(s: Snapshot, pile: string): Snapshot {
    const one = pileOf(s, pile);
    if (!one || one.forever || one.cards.length > 1) return s;
    const last = one.cards[0];
    if (last) s = relocate(s, last.id, { in: "felt", x: one.x, y: one.y, up: last.up === true, angle: one.angle }, last.up === true);
    return { ...s, piles: s.piles.filter((p) => p.id !== pile) };
  }

  /** Может ли моя рука тронуть карту: не чужая в пальце, не чужое выделение. */
  const touchable = (s: Snapshot, id: string) => (!s.locks[id] || s.locks[id] === me()) && (!s.picks?.[id] || s.picks[id] === me());

  function predict(st: Snapshot, intent: Extract<Intent, { t: "gather" | "moveMany" | "turnMany" | "pileDrop" }>): Snapshot {
    let s = st;
    if (intent.t === "turnMany") {
      for (const id of intent.ids) if (touchable(s, id)) s = flipIn(s, id, !sideIn(s, id)?.up);
      return s;
    }
    if (intent.t === "moveMany") {
      for (const m of intent.moves) if (touchable(s, m.id)) s = relocate(s, m.id, m.to, m.to.in === "felt" ? shownUp(s, m.id) : shownUp(s, m.id));
      return s;
    }
    if (intent.t === "gather") {
      let pile = "pile" in intent.to ? intent.to.pile : "guess";
      if (!("pile" in intent.to)) {
        const at = intent.to;
        s = { ...s, piles: [...s.piles, { ...DEFAULT_SPOT, id: pile, x: at.x, y: at.y, angle: at.angle, forever: false, below: s.felt.map((c) => c.id), cards: [], shuffles: 0 }] };
      } else if (pileOf(s, pile)?.shut) return st;
      const sources = new Set<string>();
      for (const id of intent.ids) {
        const from = whereIs(s, id);
        if (!from || !touchable(s, id) || (from.in === "deck" && (from.pile === pile || pileOf(s, from.pile)?.shut))) continue;
        if (from.in === "deck") sources.add(from.pile);
        const up = intent.side === "up" ? true : intent.side === "down" ? false : shownUp(s, id);
        s = relocate(s, id, { in: "deck", pile }, up);
      }
      for (const one of sources) s = collapse(s, one);
      return collapse(s, pile);
    }
    const source = pileOf(s, intent.pile);
    const into = intent.to.in === "deck" ? pileOf(s, intent.to.pile) : undefined;
    if (!source || source.pin || source.shut || source.seal || into?.shut || into?.seal || !source.cards.every((c) => touchable(s, c.id))) return st;
    // В стопку одной стороной — её стороной; вперемешку или пустую — как лежали.
    const pack = into?.cards.map((c) => c.up === true) ?? [];
    const even = pack.length > 0 && pack.every((up) => up === pack[0]) ? pack[0] : undefined;
    let i = intent.to.i;
    for (const c of source.cards) {
      const to: Where = intent.to.in === "hand" ? { in: "hand", chair: intent.to.chair, i: i ?? 0 } : { in: "deck", pile: intent.to.pile, ...(i !== undefined && !into?.lock ? { i } : {}) };
      s = relocate(s, c.id, to, even ?? c.up === true);
      if (i !== undefined) i += 1;
    }
    return { ...s, piles: s.piles.filter((p) => p.id !== intent.pile) };
  }

  /** Карта `id` другой стороной, где бы ни лежала. Лицо, которое уходит от меня, прячется. */
  function flipIn(s: Snapshot, id: string, up: boolean): Snapshot {
    const flip = (c: SeenCard): SeenCard => {
      if (c.id !== id) return c;
      const { up: _was, ...rest } = c;
      return up ? { ...rest, up: true } : rest;
    };
    return {
      ...s,
      felt: s.felt.map((c) => (c.id === id ? { ...c, up } : c)),
      piles: s.piles.map((p) => (p.cards.some((card) => card.id === id) ? { ...p, cards: p.cards.map(flip) } : p)),
      chairs: s.chairs.map((c) => (c.hand.some((card) => card.id === id) ? { ...c, hand: c.hand.map(flip) } : c)),
    };
  }

  /** Порядок своей руки: считается здесь, летит сразу. Лица какой-то карты не знаем — просто просим сервер. */
  function guessOrder(how: Arrange): void {
    const s = truth();
    const chair = chairOf(s, mine(s));
    if (!chair) return;
    const ids = chair.hand.map((c) => c.id);
    const faces = new Map(chair.hand.map((c) => [c.id, c.face]));
    const next = how === "shuffle" ? shuffled(ids) : arranged(ids, how, (id) => faces.get(id));
    if (!next) return store.send({ t: "arrange", how });
    guess(`order:${chair.id}`, { t: "arrange", how, ...(how === "shuffle" ? { ids: next } : {}) },
      (st) => withChair(st, chair.id, (c) => {
        const byId = new Map(c.hand.map((card) => [card.id, card]));
        return samePack(next, [...byId.keys()]) ? { ...c, hand: next.map((id) => byId.get(id)!) } : c;
      }),
      (st) => {
        const hand = chairOf(st, chair.id)?.hand.map((c) => c.id) ?? [];
        // Рука сменилась под догадкой (карту взяли или положили) — гадать больше не о чем.
        return hand.join() === next.join() || !samePack(hand, next);
      });
  }

  function seen(): Snapshot {
    let s = truth();
    // Карты, положенные подряд быстрее ответа сервера, — все на своих новых местах, по порядку.
    for (const one of pendings) {
      const from = whereIs(s, one.id);
      if (from) s = applyPatch(s, { v: s.v, ops: [{ t: "move", card: one.card, from, to: one.to }] });
    }
    // В ВОЗДУХЕ — МОЯ КАРТА И ЧУЖИЕ: со своего места они сняты, пока их несут.
    const up = new Set(store.carries.flatMap((c) => [c.id, ...(c.with ?? []).map((w) => w.card.id)]));
    if (drag) up.add(drag.card.id);
    for (const id of massFlock()) up.add(id);
    if (up.size === 0) return s;
    const chairs = s.chairs.map((c) => ({ ...c, hand: c.hand.filter((card) => !up.has(card.id)) }));
    return { ...s, chairs, piles: s.piles.map((p) => ({ ...p, cards: p.cards.filter((c) => !up.has(c.id)) })), felt: s.felt.filter((c) => !up.has(c.id)) };
  }

  /**
   * СТЯНУТОЕ К МОЕМУ ПАЛЬЦУ — выделенные карты, которые летят за картой хвата (`drag.mass`, вид «стянуть»). Они сняты
   * со своих мест, пока их несут; после дропа их сразу раскладывает догадка (`guessBatch`).
   */
  function massFlock(): string[] {
    if (!drag?.mass || local.grab !== "collect") return [];
    const key = me();
    return Object.entries(store.state.picks ?? {}).filter(([id, by]) => by === key && id !== drag!.card.id).map(([id]) => id);
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
  /** Поза руки стула — с сервера; без стула — поза по умолчанию. */
  const poseOf = (s: Snapshot, chair: string): Pose => chairOf(s, chair)?.pose ?? DEFAULT_POSE;
  /** Поза, как она нарисована сейчас — с догадками. */
  const poseNow = (chair: string): Pose => poseOf(guesses.length ? truth() : store.state, chair);
  const inkOf = (s: Snapshot, key: string) => s.people.find((p) => p.key === key)?.ink ?? T.inkDim;
  const heldByOthers = (s: Snapshot): Record<string, string> =>
    Object.fromEntries(Object.entries(s.locks).filter(([, by]) => by !== me()).map(([id, by]) => [id, inkOf(s, by)]));

  const pileOf = (s: Snapshot, id: string): Pile | undefined => s.piles.find((p) => p.id === id);

  function whereIs(s: Snapshot, id: string): Where | null {
    const pile = s.piles.find((p) => p.cards.some((c) => c.id === id));
    if (pile) return { in: "deck", pile: pile.id };
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
    // СЖАТЫ — все карты стопкой за верхней: видна одна.
    if (pose.shrink) return Array.from({ length: n }, () => ({ x: 0, y: 0, angle: 0 }));
    const apart = HUD_FAN.apart * w;
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
    const pose = poseNow(mine());
    const plan = handPlan(pose, count, CARD.w, CARD.h, wide);
    const drop = plan.reduce((m, p) => Math.max(m, p.y), 0);
    const high = CARD.h + drop + 2 * HAND_PAD + HAND_ROOM;
    const barTop = g.h - barHeight() * u;
    const shown = pose.tuck ? TUCK_TIP : Math.max(0, (high - HAND_ROOM) * scale - BAR.tuck);
    const cardsBottom = barTop + BAR.tuck * u + (pose.tuck ? Math.max(0, (high - HAND_ROOM) * scale * u - TUCK_TIP * u) : 0);
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
  /**
   * ПОЛОСА СВЕРХУ — шестерёнка и плашка с именем стола. Окна под неё не лезут: у верхнего края своя
   * граница, и в неё же входит безопасная зона Telegram (чёлка и его собственная шапка).
   */
  function hudTop(): number {
    const css = getComputedStyle(document.documentElement);
    const inset = (name: string) => parseFloat(css.getPropertyValue(name)) || 0;
    return 12 + inset("--tg-safe-area-inset-top") + inset("--tg-content-safe-area-inset-top") + 40 + 8;
  }

  function tipBox(spot: Spot, taken: readonly TipBox[]): TipBox {
    const frame = lastFrame;
    const EDGE = 8, GAP = 12;
    const TOP = Math.max(EDGE, hudTop());
    const w = Math.min(frame.w - 2 * EDGE, 292);
    const cw = 46, ch = Math.round(cw * 1.4);
    const rowH = ch + 24;
    const height = 12 + 30 + 8 + 16 + rowH + 12;
    const k = view?.k ?? 1;
    const middle = view ? view.toGlass(pileOf(store.state, MAIN_PILE) ?? { x: 0, y: 0 }) : { x: frame.w / 2, y: frame.h / 2 };
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
        top: Math.max(TOP, Math.min(frame.h - height - EDGE, c.y - height / 2)),
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
    const plan = handPlan(poseNow(key), count, 1, 1.4, box.inner / box.cw);
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

  /** Сравнить стороны карт с прошлым кадром: перевёрнутые на месте — в `turns`. Пока кто-то вертится — кадр за кадром. */
  function noteTurns(s: Snapshot): void {
    const now = performance.now();
    const seenIds = new Set<string>();
    const note = (id: string, where: string, up: boolean, face?: Face) => {
      seenIds.add(id);
      const was = sides.get(id);
      // Ждать лица есть смысл только на сукне и в стопке: лицом вверх его видят все. В чужой руке его может не быть вовсе.
      const showsFace = (where === "felt" || where.startsWith("deck:")) && up;
      if (was && was.where === where && was.up !== up) turns.set(id, { t0: now, up: was.up, face: was.face ?? face, ...(showsFace && !face ? { wait: true } : {}) });
      // Лицо пришло к карте, застывшей на ребре, — доворот со второй половины.
      const t = turns.get(id);
      if (t?.wait && face) turns.set(id, { ...t, t0: Math.min(t.t0, now - turnMs() / 2), wait: false });
      sides.set(id, { where, up, face: face ?? (was?.where === where ? was.face : undefined) });
    };
    for (const c of s.felt) note(c.id, "felt", c.up, c.face);
    for (const pile of s.piles) for (const c of pile.cards) note(c.id, `deck:${pile.id}`, c.up === true, c.face);
    for (const chair of s.chairs) for (const c of chair.hand) note(c.id, `hand:${chair.id}`, c.up === true, c.face);
    // Карты, которой нет в кадре (она в пальце — тап и есть хват), прошлая сторона не стирается: иначе переворот
    // после второго тапа не с чем было бы сравнить. Стирается, когда ушла из колоды целиком (перемешали).
    if (sides.size > 4 * (seenIds.size + 60)) for (const id of sides.keys()) if (!seenIds.has(id)) sides.delete(id);
    for (const [id, t] of turns) if (now - t.t0 >= (t.wait ? GUESS_MS : turnMs())) turns.delete(id);
    if (turns.size && !turnFrame) {
      turnFrame = true;
      requestAnimationFrame(() => {
        turnFrame = false;
        draw();
      });
    }
  }

  /** Переворот у меня: по скорости; «меньше анимаций» — мгновенно (1 мс, чтобы доля пути считалась). */
  function turnMs(): number {
    return Math.max(1, motion.ms(TURN_MS));
  }

  function turning(id: string): { p: number; up: boolean; face?: Face } | undefined {
    const t = turns.get(id);
    return t && { p: Math.min(t.wait ? 0.5 : 1, (performance.now() - t.t0) / turnMs()), up: t.up, face: t.face };
  }

  function cardHtml(face: Face | undefined, w: number): string {
    // КАРТИНКА НАБОРА СТОЛА; под ней, пока она грузится, — бумажная карта. Ранг и масть — в `aria-label`.
    const rules = store.state.rules;
    const label = face ? ` role="img" aria-label="${escape(face.rank)}${SUITS[face.suit][0]}"` : ` role="img" aria-label="рубашка"`;
    const ready = art.image(rules, face) !== undefined;
    return `<span${label} style="position:absolute;inset:0">${ready ? "" : paperHtml(face, w)}`
      + `<span data-g="art" style="position:absolute;inset:0;border-radius:${w * 0.12}px;background:url(${art.url(rules, face)}) center/100% 100% no-repeat;`
      + `box-shadow:inset 0 0 0 ${Math.max(2, w * 0.05)}px ${T.black},0 2px 0 rgba(11,7,4,.55)"></span></span>`;
  }

  function paperHtml(face: Face | undefined, w: number): string {
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

  /**
   * КНОПКА БАРА. Кнопки секций — круглые и не заливаются: открытая секция — золотое кольцо и «назад», чтобы
   * её не спутать с включённым флагом или позой (квадрат, залитый золотом).
   */
  function barButton(what: BarKey | `sec-${Section}`, lit: boolean, px: number, left = 0, motion = ""): string {
    // Разделы лассо, которые переключаются по кругу, рисуют значок того, что стоит сейчас.
    const glyphOf = what === "grab" ? GLYPH[`grab-${local.grab}`] : what === "side" ? GLYPH[`side-${local.side}`] : undefined;
    const mode = what === "grab" ? ` data-mode="${local.grab}"` : what === "side" ? ` data-mode="${local.side}"` : "";
    const side = Math.round(px);
    const section = what.startsWith("sec-");
    const data = section ? `data-section="${what.slice(4)}"` : `data-bar="${what}"${mode}`;
    const look = section
      ? `border-radius:50%;background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});`
        + (lit ? `box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 5px ${BAR_LOOK.goldHi},0 0 0 2px ${T.black};` : `box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim};`)
      : `border-radius:${Math.round((side * BAR.radius) / BAR.size)}px;`
        + (lit
          ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});box-shadow:inset 0 0 0 3px ${T.black};`
          : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim};`);
    const glyph = section && lit ? GLYPH.back : (glyphOf ?? GLYPH[what]);
    const ink = !section && lit ? T.black : section && lit ? BAR_LOOK.goldHi : "white";
    return `<button ${data} aria-pressed="${lit}" style="position:absolute;left:${Math.round(left)}px;top:0;width:${side}px;height:${side}px;border:0;padding:0;${motion}`
      + `cursor:pointer;display:flex;align-items:center;justify-content:center;${look}`
      + `"><svg viewBox="0 0 24 24" width="${Math.round(side * 0.5)}" height="${Math.round(side * 0.5)}" fill="none" `
      + `stroke="${ink}" stroke-width="${section && lit ? 2.6 : 2}" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></button>`;
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
      + `transform:scale(1,${squash}) rotate(${+angle.toFixed(3)}deg);z-index:${z};pointer-events:none;border-radius:${w * 0.12}px;border:${line}px dashed ${ink};opacity:.9;`
      + `box-shadow:0 0 0 ${Math.max(1, line * 0.6)}px ${T.black}, inset 0 0 0 ${Math.max(1, line * 0.6)}px ${T.black};`
      + `"></div>`;
  }

  /** Карта в гнезде. Взятую другим пальцем не берут: она в его цвете и не ловит касание. */
  /**
   * Карта в гнезде — лицом, если лицо пришло (стол сам решил, видно ли её мне). Взятую другим пальцем и
   * карту под чужим замком не берут: первая в цвете держащего, вторая приглушена, и обе не ловят касание.
   */
  function slotCard(c: SeenCard, geom: Geom, slot: Slot, z: number, owner: string, held?: string, shut = false, under = false): string {
    return `<div data-card="${c.id}" data-owner="${owner}"${pickAttr(c.id)} style="position:absolute;width:${geom.w}px;height:${geom.h}px;${pickCss(c.id, geom.w)}`
      + `left:${slot.x - geom.w / 2}px;top:${slot.y - geom.h / 2}px;transform:rotate(${slot.angle}deg);z-index:${z};touch-action:none;`
      // СЖАТАЯ РУКА: касание ловит только верхняя карта — остальные под ней.
      + (under ? "pointer-events:none;" : "")
      + (held ? `pointer-events:none;filter:brightness(.6);outline:3px solid ${held};border-radius:${geom.w * 0.12}px;` : shut ? "pointer-events:none;filter:brightness(.7);" : "cursor:grab;")
      + (flying.has(c.id) ? "visibility:hidden;" : "")
      + `transition:left ${motion.ms(160)}ms ease-out, top ${motion.ms(160)}ms ease-out, transform ${motion.ms(160)}ms ease-out">${turnHtml(c, geom.w)}</div>`;
  }

  /** Снимок, по которому рисуется этот кадр: разметка спрашивает его много раз, а собирать его дорого. */
  let drawnSnap: Snapshot | null = null;
  const frame = () => drawnSnap ?? seen();

  /** Выделение карты в разметке: кто выделил — атрибутом (его читает прогон), рамка — в его цвете. */
  function pickAttr(id: string): string {
    const by = frame().picks?.[id];
    return by === undefined ? "" : ` data-picked="${by === me() ? "me" : escape(by)}"`;
  }

  /** Рамка выделенной карты; чужую выделенную не берут и не выделяют. */
  function pickCss(id: string, w: number): string {
    const s = frame();
    const ink = pickInk(s, id);
    if (!ink) return "";
    return `box-shadow:0 0 0 ${Math.max(2, w * 0.06)}px ${ink},0 0 0 ${Math.max(3, w * 0.1)}px ${T.black};border-radius:${w * 0.12}px;`
      + (s.picks![id] !== me() ? "pointer-events:none;" : "");
  }

  /**
   * КАРТА В ХУДЕ — лицом, если не перевёрнута (перевёрнутая смотрит лицом наружу, на стол). Переворот — две
   * стороны: прежняя сжимается, новая разжимается; отставание от начала — отрицательной задержкой, чтобы
   * пересборка разметки не начинала его заново.
   */
  function turnHtml(c: SeenCard, w: number): string {
    const face = c.up ? undefined : c.face;
    const turn = turns.get(c.id);
    if (!turn) return cardHtml(face, w);
    const late = -Math.min(turnMs(), performance.now() - turn.t0);
    const side = (name: string, html: string) =>
      `<span data-g="turn" style="position:absolute;inset:0;animation:${name} ${turnMs()}ms linear ${late}ms both">${html}</span>`;
    // Лица ещё нет — только первая половина: карта стоит на ребре.
    if (turn.wait) return side("card-turn-out", cardHtml(turn.up ? undefined : turn.face, w));
    return side("card-turn-out", cardHtml(turn.up ? undefined : turn.face, w)) + side("card-turn-in", cardHtml(face, w));
  }

  /**
   * ЩЕЛИ В РУКЕ СТУЛА — под мою карту в воздухе и под чужие, которые держат над этой рукой. Их видят все,
   * у кого эта рука на экране: хозяин внизу, остальные — в окне стула.
   */
  function gapsIn(s: Snapshot, chair: string): Gap[] {
    const out: Gap[] = [];
    const aim = aiming();
    if (aim?.kind === "hand" && aim.which === chair) out.push({ index: aim.index, ink: T.ink });
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
    const shrunk = poseNow(owner).shrink;
    const top = cards.at(-1)?.id;
    return laid(geom, cards, gaps, owner)
      .map((one) =>
        "gap" in one
          ? markHtml(geom.w, geom.h, one.slot.angle, one.slot.x, one.slot.y, one.z, 1, one.gap.ink)
          : slotCard(one.card, geom, one.slot, one.z, owner, held[one.card.id], shut, shrunk && one.card.id !== top),
      )
      .join("");
  }

  /** ЗОНА РУКИ, КОТОРАЯ ЗАГОРАЕТСЯ, ПОКА КАРТА В ВОЗДУХЕ. Под картами (`z-index: 0`), не крышка. */
  function handZoneHtml(geom: Geom): string {
    const aim = aiming();
    if (!aim) return "";
    const pad = geom.h * 0.12;
    const left = geom.slots.reduce((m, s) => Math.min(m, s.x - geom.w / 2), Infinity) - pad;
    const right = geom.slots.reduce((m, s) => Math.max(m, s.x + geom.w / 2), -Infinity) + pad;
    const top = geom.slots.reduce((m, s) => Math.min(m, s.y - geom.h / 2), Infinity) - pad;
    const bottom = geom.barTop!;
    const here = aim.kind === "hand" && aim.which === mine();
    const line = here ? T.gold : T.inkDim;
    return `<div data-g="zone" style="position:absolute;left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;`
      + `z-index:0;pointer-events:none;border-radius:${Math.round(geom.w * 0.16)}px;border:2px dashed ${line};`
      + `background:${here ? "rgba(242,193,78,.16)" : "rgba(245,234,208,.07)"};opacity:${here ? 1 : 0.75};`
      + `transition:opacity .12s ease-out,background .12s ease-out,border-color .12s ease-out;display:flex;align-items:flex-start;justify-content:center">`
      + `<span style="margin-top:${Math.max(1, Math.round(pad * 0.16))}px;font:400 ${Math.round(pad * 0.9)}px Tiny5,monospace;`
      + `letter-spacing:.14em;color:${line};text-shadow:0 1px 0 ${T.black}">В РУКУ</span></div>`;
  }

  function hudHtml(s: Snapshot): string {
    // ОТКРЫТ ДИАЛОГ — вместо руки и бара клавиатура.
    if (talk.open) return "";
    const g = glass();
    const cards = handOf(s, mine(s));
    const gaps = gapsIn(s, mine(s));
    const aim = aiming();
    const mark = aim?.kind === "hand" && aim.which === mine(s) ? aim.index : null;
    const geom = mineGeom(cards.length + gaps.length);
    const u = hudUnit();
    const most = 1 + Math.max(...SECTIONS.map((sec) => SUBS[sec].length));
    const need = most * BAR.size + (most - 1) * BAR.gap + 2 * BAR.margin;
    const fit = g.w / u > 0 && need > g.w / u ? Math.max(0.5, g.w / u / need) : 1;
    const side = BAR.size * u * fit;
    const step = side + BAR.gap * u * fit;
    const margin = BAR.margin * u * fit;
    return `<div style="position:absolute;left:0;right:0;top:${geom.barTop! - BAR.fade * u}px;height:${BAR.fade * u}px;`
      + `background:linear-gradient(to top, rgba(11,7,4,.85), rgba(11,7,4,0));pointer-events:none"></div>`
      + handZoneHtml(mark === null && cards.length === 0 ? mineGeom(1) : geom)
      // СВОИ КАРТЫ Я ВИЖУ ВСЕГДА, КАК ДЕРЖУ: «скрыть» — про то, что видят другие, а не я.
      + layHand(geom, cards, gaps, mine(s), heldByOthers(s))
      // ПОЛОСА — ПОВЕРХ КАРТ: карты уходят под её край на `BAR.tuck`.
      + `<div data-g="bar" style="position:absolute;left:0;right:0;top:${geom.barTop}px;height:${barHeight() * u}px;z-index:${cards.length + 10};`
      + `background:linear-gradient(${T.panel},${T.well});box-shadow:inset 0 3px 0 -1px ${T.black}">`
      + `<div style="position:absolute;left:${margin}px;right:${margin}px;top:${(barHeight() * u - side) / 2}px;height:${side}px">`
      + barRow(s, side, step) + `</div>`
      // СВОЙ СТУЛ — глаза на своей полосе: над столом их не видно, зато здесь их помещается больше.
      + (watchedByMe(`chair:${mine(s)}` as EyeSpot) ? "" : (() => {
        const row = eyeRowHtml(s, `chair:${mine(s)}` as EyeSpot, EYES_IN_PANEL, 18);
        return row ? `<div style="position:absolute;right:${margin}px;top:${-24}px;z-index:2;pointer-events:none">${row}</div>` : "";
      })())
      + `</div>`
      + leaveHtml(geom.barTop!, margin, side, step)
      + micHtml(geom.barTop!);
  }

  /** Горит ли кнопка секции: поза и флаги — как стоят, «покинуть» — пока открыт вопрос. */
  function barLit(s: Snapshot, what: BarKey): boolean {
    const seat = chairOf(s, mine(s));
    if ((FOLDS as readonly string[]).includes(what)) return poseOf(s, mine(s))[what as keyof Pose];
    if ((RIGHTS as readonly string[]).includes(what)) return seat?.[what as ChairFlag] === true;
    if (what === "cursor" || what === "lasso") return local.tool === what;
    return what === "leave" && local.confirmLeave;
  }

  /**
   * РЯД БАРА. Разметка пересобирается каждым кадром, поэтому перелёт — анимация с отрицательной задержкой:
   * кадр, пришедший посреди перелёта, продолжает его с того же места, а не начинает заново.
   */
  function barRow(s: Snapshot, side: number, step: number): string {
    // ИДЁТ ЗАПИСЬ: кнопки уходят, остаётся 💬 — чтобы было видно, что палец ведёт именно её. Пока кнопку
    // просто держат (до секунды), бар не меняется вовсе: с виду это обычное касание.
    if (local.mic && local.mic.phase !== "hold") return barButton("sec-say", true, side, 0);
    const since = performance.now() - local.sectionAt;
    const moving = since < SECTION_MS + 120;
    const anim = (name: string, delay = 0, from = 0) =>
      moving ? `--from:${Math.round(from)}px;animation:${name} ${SECTION_MS}ms ease-out ${Math.round(delay - since)}ms both;` : "";
    const ghost = (html: string) => html.replace("<button ", '<button data-g="ghost" tabindex="-1" ').replace("position:absolute;", "position:absolute;pointer-events:none;");
    const open = local.section;
    let row = "";
    if (open) {
      const at = SECTIONS.indexOf(open);
      row += barButton(`sec-${open}`, true, side, 0, anim("bar-slide", 0, at * step));
      // Черта между кнопкой секции и её кнопками.
      row += `<span data-g="divider" style="position:absolute;left:${Math.round(side + (step - side) / 2 - 1)}px;top:${Math.round(side * 0.15)}px;width:2px;height:${Math.round(side * 0.7)}px;`
        + `border-radius:1px;background:${BAR_LOOK.rim};${anim("bar-in", 20)}"></span>`;
      SUBS[open].forEach((what, j) => (row += barButton(what, barLit(s, what), side, (j + 1) * step, anim("bar-in", 40 + j * 30))));
      if (moving && !local.sectionFrom) {
        SECTIONS.forEach((sec, j) => sec !== open && (row += ghost(barButton(`sec-${sec}`, false, side, j * step, anim("bar-out")))));
      }
    } else {
      const from = local.sectionFrom;
      SECTIONS.forEach((sec, j) =>
        (row += barButton(`sec-${sec}`, false, side, j * step, sec === from ? anim("bar-slide", 0, -j * step) : from ? anim("bar-in", 40 + j * 30) : "")));
      if (moving && from) SUBS[from].forEach((what, j) => (row += ghost(barButton(what, barLit(s, what), side, (j + 1) * step, anim("bar-out")))));
    }
    return row;
  }

  /** Сколько держать кнопку, чтобы пошла запись: отпустил раньше — ничего не было. */
  const MIC_HOLD_MS = 1000;

  /** Кнопку держат секунду — пошла запись; всем видно, что я пишу. */
  async function beginMic(): Promise<void> {
    const m = local.mic;
    if (!m || m.phase !== "hold") return;
    m.phase = "recording";
    haptic.buzz("medium");
    const rec = await voice.start();
    if (!local.mic) return void rec?.cancel();
    if (!rec) {
      // Микрофона нет или не дали — жест кончается ничем, как отмена.
      local.mic = null;
      draw();
      return;
    }
    local.mic.rec = rec;
    local.mic.began = performance.now();
    recording.add(me());
    store.mic(true);
    draw();
    // Кольцо двигается само, кадр за кадром, и трогает ровно один атрибут — перерисовывать стол незачем.
    const tick = () => {
      if (local.mic?.rec !== rec) return;
      const ring = over.querySelector<SVGCircleElement>("[data-mic-count]");
      if (ring) {
        const circle = 2 * Math.PI * 27;
        ring.setAttribute("stroke-dashoffset", (circle * micGone()).toFixed(1));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // ШЕСТЬ СЕКУНД — предел: запись встаёт и ждёт броска или отпускания.
    setTimeout(() => {
      if (local.mic?.rec === rec && local.mic.phase === "recording") {
        local.mic.phase = "full";
        haptic.buzz("warning");
        draw();
      }
    }, VOICE_MAX_MS);
  }

  /** Отпустил: на сукне — всем, на стуле — лично ему, мимо — отменено. Тап без жеста открывает клавиатуру. */
  async function endMic(x: number, y: number, tap: boolean): Promise<void> {
    const m = local.mic;
    local.mic = null;
    if (!m) return;
    const where = m.rec ? micTarget(x, y) : null;
    if (m.rec) {
      recording.delete(me());
      store.mic(false);
      if (where) {
        const got = await m.rec.stop();
        if (got) {
          const to = where.kind === "chair" ? where.to : undefined;
          store.voice({ ...got, ...(to && to !== me() ? { to } : {}) });
          voice.play({ by: me(), ...got }, () => chairPlace(me()), true);
          haptic.buzz("success");
        }
      } else m.rec.cancel();
    }
    if (tap) talk.toggle();
    draw();
  }

  /** Сколько записи прошло, 0…1 — по нему тает кольцо отсчёта. */
  function micGone(): number {
    const m = local.mic;
    if (!m || m.phase === "hold") return 0;
    if (m.phase === "full") return 1;
    return Math.max(0, Math.min(1, (performance.now() - m.began) / VOICE_MAX_MS));
  }

  /** Куда упадёт голосовое: сукно — всем за столом, стул — лично тому, кто на нём сидит. */
  function micTarget(x: number, y: number): { kind: "felt" } | { kind: "chair"; chair: string; to: string; name: string } | null {
    const s2 = seen();
    const chair = chairUnder(s2, x, y);
    if (chair) {
      const row = chairOf(s2, chair.key);
      const sitter = row && sitterOf(s2, row);
      if (row?.owner && sitter) return { kind: "chair", chair: row.id, to: row.owner, name: sitter.name };
      return null;
    }
    // СТОЛ — САМО СУКНО, а не весь экран: бросок мимо сукна ничего не отправляет.
    const at = view?.toDesk({ x, y });
    return at && Math.hypot(at.x, at.y) <= FELT_REACH ? { kind: "felt" } : null;
  }

  /**
   * ЖЕСТ ГОЛОСОВОГО: зажать 💬 и держать. Секунда — пошла запись; отпустил раньше — её не было вовсе.
   * Дальше под пальцем едет шайба с микрофоном, а бросить её можно на сукно (услышат все) или на стул
   * (услышит только он). Кольцо на шайбе отсчитывает шесть секунд.
   */
  function micHtml(barTop: number): string {
    const m = local.mic;
    // ДО СЕКУНДЫ НЕ ПОКАЗЫВАЕМ НИЧЕГО: панель записи появляется вместе с самой записью, не раньше.
    if (!m || m.phase === "hold") return "";
    const target = micTarget(m.x, m.y);
    const hint = m.phase === "full"
      ? "Шесть секунд — брось на стол или на стул"
      : target?.kind === "chair"
        ? `Лично: ${escape(target.name)}`
        : target
          ? "Всем за столом"
          : "Брось на стол или на стул · отпустишь мимо — прервётся";

    // ПОДСВЕЧЕННОЕ СУКНО — круг стола в его же осях, поэтому с наклоном камеры он сжимается вместе со столом.
    let zones = "";
    if (view) {
      const mid = view.toGlass({ x: 0, y: 0 });
      const rx = FELT_REACH * view.k;
      const ry = rx * view.squash;
      const lit = target?.kind === "felt";
      zones += `<div data-mic-drop="felt" data-on="${lit}" style="position:absolute;left:${Math.round(mid.x - rx)}px;top:${Math.round(mid.y - ry)}px;`
        + `width:${Math.round(2 * rx)}px;height:${Math.round(2 * ry)}px;border-radius:50%;box-sizing:border-box;z-index:58;pointer-events:none;`
        + `border:3px dashed ${T.gold};background:color-mix(in srgb, ${T.gold} ${lit ? 18 : 8}%, transparent);`
        + (motion.reduce ? "" : "animation:mic-drop 1200ms ease-in-out infinite;") + `"></div>`;
      // СТУЛЬЯ — тоже зоны: бросок туда делает голосовое личным.
      for (const sp of spots) {
        const row = chairOf(seen(), sp.key);
        if (!row?.owner) continue;
        const at = view.toGlass(sp.seat);
        const cr = SEAT_REACH * view.k;
        const here = target?.kind === "chair" && target.chair === row.id;
        zones += `<div data-mic-drop="chair" data-chair="${row.id}" data-on="${here}" style="position:absolute;left:${Math.round(at.x - cr)}px;top:${Math.round(at.y - cr * view.squash)}px;`
          + `width:${Math.round(2 * cr)}px;height:${Math.round(2 * cr * view.squash)}px;border-radius:50%;box-sizing:border-box;z-index:59;pointer-events:none;`
          + `border:2px dashed ${inkOf(seen(), row.owner)};background:color-mix(in srgb, ${inkOf(seen(), row.owner)} ${here ? 26 : 8}%, transparent)"></div>`;
      }
    }

    // ШАЙБА ПОД ПАЛЬЦЕМ — её и бросают. Кольцо вокруг тает за шесть секунд: видно, сколько осталось.
    // КОЛЬЦО ОТСЧЁТА — от ВРЕМЕНИ ЗАПИСИ, а не анимацией CSS: разметка пересобирается каждым кадром, и
    // анимация начиналась бы заново от каждого движения пальца. Плавность даёт `micTick` (`beginMic`).
    const size = 64, r = 27, circle = 2 * Math.PI * r;
    const ring = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="position:absolute;inset:0;transform:rotate(-90deg)">`
        + `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${T.black}" stroke-width="4" opacity=".5"/>`
        + `<circle data-mic-count cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${T.gold}" stroke-width="4" stroke-linecap="round"`
        + ` stroke-dasharray="${circle.toFixed(1)}" stroke-dashoffset="${(circle * micGone()).toFixed(1)}"/></svg>`;
    const puck = `<div data-mic-puck data-on="true" style="position:absolute;left:${Math.round(m.x)}px;top:${Math.round(m.y)}px;width:${size}px;height:${size}px;`
      + `transform:translate(-50%,-50%);z-index:63;pointer-events:none;border-radius:50%;display:flex;align-items:center;justify-content:center;`
      + `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});box-shadow:inset 0 0 0 3px ${T.black},0 4px 0 rgba(11,7,4,.5)`
      + `">${ring}<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${T.black}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.mic}</svg></div>`;

    return zones + puck
      + `<div data-mic-hint style="position:absolute;left:8px;right:8px;top:${Math.round(barTop - 34)}px;z-index:62;pointer-events:none;text-align:center;`
      + `font:400 12px Tiny5,monospace;color:${T.ink};text-shadow:0 2px 0 ${T.black}">${hint}</div>`;
  }

  /** ВОПРОС «ПОКИНУТЬ СТУЛ?» — над кнопкой: встать можно только отсюда. Любое другое касание его закрывает. */
  function leaveHtml(barTop: number, margin: number, side: number, step: number): string {
    if (!local.confirmLeave || local.section !== "chair") return "";
    const w = 176, h = 64;
    const centre = margin + SUBS.chair.indexOf("leave") * step + step + side / 2;
    const left = Math.max(8, Math.min(glass().w - w - 8, centre - w / 2));
    const arrow = Math.max(12, Math.min(w - 12, centre - left));
    return `<div data-confirm style="position:absolute;left:${left}px;top:${barTop - h - 12}px;width:${w}px;height:${h}px;box-sizing:border-box;z-index:59;`
      + `background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px;padding:10px 12px;`
      + `display:flex;flex-direction:column;gap:6px;user-select:none;-webkit-user-select:none">`
      + `<span style="font:400 12px Tiny5,monospace;color:${T.ink}">Покинуть стул?</span>`
      + `<button data-stand style="align-self:flex-start;border:0;cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:5px 10px;`
      + `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});color:${T.black}">Встать</button>`
      + `<span style="position:absolute;left:${arrow - 7}px;bottom:-7px;width:14px;height:14px;background:${T.well};transform:rotate(45deg);`
      + `box-shadow:3px 3px 0 0 ${T.black}"></span></div>`;
  }

  /** Значок флага в окне стула: кнопка, если право есть, и только статус — если нет. */
  function poseChip(chair: Chair, k: keyof Pose): string {
    const on = chair.pose[k];
    const look = on
      ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});box-shadow:inset 0 0 0 2px ${T.black};`
      : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim};`;
    return `<button data-pose="${k}" data-chair="${chair.id}" aria-pressed="${on}" style="width:30px;height:30px;border:0;padding:0;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;${look}">`
      + `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${on ? T.black : "white"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[k]}</svg></button>`;
  }

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
  /**
   * ОКНО КРУПЬЕ. HUD не меняется ни у кого — вся разница здесь: админ видит кнопки («собрать», «колода на стол»,
   * «раздать»), игрок — только то, что админ ему оставил, то есть состояние руки.
   */
  function croupierActsHtml(s: Snapshot, chair: Chair, box: { left: number; top: number; w: number; height: number }): string {
    if (!chair.croupier || s.admin !== me()) return "";
    const act = (what: string, label: string) =>
      `<button data-croupier="${what}" style="border:0;cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;`
      + `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});color:${T.black}">${label}</button>`;
    return `<div data-croupier-acts style="position:absolute;left:${box.left}px;top:${box.top + box.height + 8}px;width:${box.w}px;box-sizing:border-box;z-index:41;`
      + `background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px;padding:10px;`
      + `display:flex;flex-wrap:wrap;gap:6px">`
      + act("collect", "Собрать карты") + act("shuffle", "Перемешать") + act("deal", "Раздать")
      + act("remove", "Увести крупье") + `</div>`;
  }

  /**
   * ОКНО РАЗДАЧИ — отдельным окном тому, кто нажал «Раздать» у крупье: пресет, по сколько карт и считать ли
   * покинутые стулья. Раздаёт сам крупье: его курсор, его метки.
   */
  function dealHtml(): string {
    const d = local.deal;
    if (!d) return "";
    const g = glass();
    const w = Math.min(320, g.w - 32);
    const chip = (on: boolean, data: string, label: string) =>
      `<button ${data} aria-pressed="${on}" style="border:0;cursor:pointer;font:400 12px Tiny5,monospace;border-radius:8px;padding:7px 10px;`
      + (on ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});color:${T.black}` : `background:transparent;color:${T.ink};box-shadow:inset 0 0 0 2px ${T.wood}`)
      + `">${label}</button>`;
    const row = (title: string, inner: string) =>
      `<div style="display:flex;flex-direction:column;gap:6px"><span style="font:400 11px Tiny5,monospace;color:${T.inkDim}">${title}</span>`
      + `<div style="display:flex;flex-wrap:wrap;gap:6px">${inner}</div></div>`;
    const rules: [typeof d.rule, string][] = [["each", "По N"], ["durak", "Дурак"], ["krest", "Крестовый"], ["belka", "Белка"]];
    return `<div data-deal-panel role="dialog" aria-label="Раздача" style="position:absolute;left:${Math.round((g.w - w) / 2)}px;top:${Math.round(Math.max(24, g.h * 0.18))}px;width:${w}px;`
      + `box-sizing:border-box;z-index:70;background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 8px 0 rgba(11,7,4,.5);`
      + `border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px">`
      + `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span style="font:400 15px Tiny5,monospace;color:${T.ink}">Раздача</span>`
      + `<button data-deal-shut style="border:0;cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;box-shadow:inset 0 0 0 2px ${T.wood};color:${T.inkDim};background:transparent">Закрыть</button></div>`
      + row("По пресету", rules.map(([r, label]) => chip(d.rule === r, `data-deal-rule="${r}"`, label)).join(""))
      + (d.rule === "each" || d.rule === "durak"
        ? row("Сколько карт", [1, 2, 3, 5, 6, 8, 10].map((n) => chip(!d.all && d.n === n, `data-deal-n="${n}"`, String(n))).join("") + chip(d.all, "data-deal-all", "Все по одной"))
        : "")
      + row("Кому", chip(!d.skipEmpty, "data-deal-empty", d.skipEmpty ? "Только сидящим" : "Всем стульям"))
      + `<button data-deal-go style="border:0;cursor:pointer;font:400 13px Tiny5,monospace;border-radius:8px;padding:9px 10px;`
      + `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});color:${T.black}">Раздать</button>`
      + `<span style="font:400 10px Tiny5,monospace;color:${T.inkDim}">Раздаёт крупье: его курсор и его метки. Себе не раздаёт.</span></div>`;
  }

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
    // ПОЗУ ЧУЖОЙ РУКИ МЕНЯЕТ ТОЛЬКО АДМИН — здесь же, у самой руки.
    const poses = s.admin === me() && chair.owner !== me()
      ? `<span style="width:2px;height:22px;background:${T.wood};margin:0 2px"></span>` + FOLDS.map((k) => poseChip(chair, k)).join("")
      : "";
    const shell = `<div data-g="tip" data-tip="${chair.id}" style="position:absolute;left:${box.left}px;top:${box.top}px;width:${box.w}px;box-sizing:border-box;z-index:40;`
      + `background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px;padding:12px">`
      + `<div style="display:flex;align-items:center;gap:9px;height:30px;padding-bottom:8px">${head}`
      // НЕ ЧИТАТЬ — личное: строки и стикеры этого человека у меня не появляются.
      + (sitter && sitter.key !== me()
        ? `<span data-mute="${escape(sitter.key)}" role="button" aria-pressed="${muted.has(sitter.key)}" aria-label="${muted.has(sitter.key) ? "Читать" : "Не читать"}" style="cursor:pointer;flex:none;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;`
          + (muted.has(sitter.key) ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});` : `box-shadow:inset 0 0 0 2px ${T.wood};`) + `">`
          + `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${muted.has(sitter.key) ? T.black : T.inkDim}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`
          + `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>${muted.has(sitter.key) ? '<path d="M3 3l18 18"/>' : ""}</svg></span>`
          // НЕ СЛУШАТЬ — отдельно от «не читать»: голос этого человека глушится сам по себе.
          + `<span data-voice-mute="${escape(sitter.key)}" role="button" aria-pressed="${voiceMuted.has(sitter.key)}" aria-label="${voiceMuted.has(sitter.key) ? "Слушать" : "Не слушать"}" style="cursor:pointer;flex:none;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;`
          + (voiceMuted.has(sitter.key) ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});` : `box-shadow:inset 0 0 0 2px ${T.wood};`) + `">`
          + `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${voiceMuted.has(sitter.key) ? T.black : T.inkDim}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`
          + `${GLYPH.mic}${voiceMuted.has(sitter.key) ? '<path d="M3 3l18 18"/>' : ""}</svg></span>`
        : "")
      + eyeRowHtml(s, `chair:${chair.id}`, EYES_IN_PANEL, 20)
      + `<span data-shut="${chair.id}" role="button" style="cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;`
      + `box-shadow:inset 0 0 0 2px ${T.wood};color:${T.inkDim}">Закрыть</span></div>`
      + `<div style="display:flex;align-items:center;gap:6px;height:16px">`
      + `<span style="flex:1"></span>${flags}${poses}</div>`

      + `<div style="position:relative;height:${box.rowH}px"></div></div>`;
    // Карты веера — рядом с коробкой, не внутри: их вытаскивают на стол, и край не должен их резать.
    // СКРЫТЫ — рука за краем окна: видно и можно тянуть только то, что торчит.
    const curtain = chair.pose.tuck
      ? `<div data-g="curtain" style="position:absolute;left:${box.left + 5}px;width:${box.w - 10}px;top:${box.rowTop + 8 + box.ch * TIP_TUCK}px;`
        + `height:${box.top + box.height - 5 - (box.rowTop + 8 + box.ch * TIP_TUCK)}px;z-index:${42 + cards.length + gaps.length};background:${T.well};`
        + `border-radius:0 0 8px 8px;box-shadow:inset 0 3px 0 -1px ${T.black}"></div>`
      : "";
    return { shell: shell + croupierActsHtml(s, chair, box), cards: layHand(geom, cards, gaps, chair.id, heldByOthers(s), closed(s, chair.id)) + curtain };
  }

  /**
   * УГОЛ, ПОД КОТОРЫМ КАРТА ЛЯЖЕТ НА СУКНО, — в осях стола. Карта в воздухе стоит ровно к экрану, и
   * ложится так же: против поворота камеры. Смотришь на стол боком — карта ляжет боком к столу и ровно
   * к тебе.
   */
  // ПРИВЕДЁН К (-180, 180], КАК НА СЕРВЕРЕ: камера, прокрученная за полоборота, иначе ждала бы угол
  // -540, сервер вернул бы 180, и совпавшее место прочиталось бы переездом — с перелётом через оборот.
  const dropAngle = () => {
    const d = ((((-(view?.rotation ?? 0) + 180) % 360) + 360) % 360) - 180;
    return d === -180 ? 180 : d;
  };

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
  // ── ГЛАЗА ЗРИТЕЛЕЙ ─────────────────────────────────────────────────────────────────────────────
  //
  // Что открыто у меня — серверу; что открыто у других — мне на стол. Свой глаз не показывается никогда,
  // а если то же окно открыто и у меня, глаза висят в окне, а не на столе: там их видно крупнее и больше.

  /** Места, на которые смотрю я: открытые окна стульев и стопки. */
  const mySpots = (): EyeSpot[] => [...local.tips.map((k) => `chair:${k}` as EyeSpot), ...(local.deckTip === null ? [] : [`pile:${local.deckTip}` as EyeSpot])];
  let toldSpots = "";
  function tellWatch(): void {
    const now = mySpots().join("|");
    if (now === toldSpots) return;
    toldSpots = now;
    store.watch(mySpots());
  }

  const watchedByMe = (spot: EyeSpot) => mySpots().includes(spot);

  /** Глаза одного места: до предела, дальше — знак «+» цветом первого. */
  function eyesHtml(s: Snapshot, spot: EyeSpot, limit: number, size: number): string {
    const { eyes, more } = eyesAt(store.eyes as Eye[], spot, me(), limit);
    if (eyes.length === 0) return "";
    const one = (ink: string, text?: string) =>
      `<span data-eye style="flex:none;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;`
      + `background:${ink};box-shadow:inset 0 0 0 ${Math.max(1.5, size * 0.08)}px ${T.black};animation:eye-in 180ms ease-out">`
      + (text
        ? `<span style="font:400 ${Math.round(size * 0.52)}px Tiny5,monospace;color:${T.black}">${text}</span>`
        : `<svg viewBox="0 0 24 24" width="${Math.round(size * 0.66)}" height="${Math.round(size * 0.66)}" fill="none" stroke="${T.black}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.eye}</svg>`)
      + `</span>`;
    return eyes.map((e) => one(inkOf(s, e.by))).join("") + (more ? one(inkOf(s, eyes[0]!.by), "+") : "");
  }

  /** Кластер глаз над стулом или у грипа — строкой, чтобы встать в чужую разметку. */
  function eyeRowHtml(s: Snapshot, spot: EyeSpot, limit: number, size: number): string {
    const inner = eyesHtml(s, spot, limit, size);
    return inner ? `<span data-eyes="${escape(spot)}" style="display:flex;align-items:center;gap:${Math.round(size * 0.14)}px">${inner}</span>` : "";
  }

  /**
   * ПИШЕТ — микрофон у самого аватара, сбоку от него, и пульсирует, пока идёт запись. Отправленное
   * голосовое значка не имеет вовсе: пока оно звучит, дышит сам аватар (`Seat.speaking`).
   */
  function micMarksHtml(s: Snapshot): string {
    if (!view) return "";
    let html = "";
    for (const chair of s.chairs) {
      const owner = chair.owner;
      if (!owner) continue;
      if (!recording.has(owner)) continue;
      const spot = spots.find((sp) => sp.key === chair.id);
      if (!spot) continue;
      const size = Math.max(16, Math.round(0.3 * view.k));
      const ink = inkOf(s, owner);
      // У САМОГО АВАТАРА: верхний правый край диска, как значок на плече, а не флажок за стулом.
      const left = Math.round(spot.x + spot.r * 0.72);
      const top = Math.round(spot.y - spot.r * 0.72);
      html += `<div data-mic-mark="${escape(owner)}" data-talks="false" style="position:absolute;left:${left}px;top:${top}px;`
        + `transform:translate(-50%,-50%);z-index:27;pointer-events:none;width:${size}px;height:${size}px;border-radius:50%;`
        + `display:flex;align-items:center;justify-content:center;background:${ink};box-shadow:inset 0 0 0 2px ${T.black};`
        + (motion.reduce ? "" : "animation:mic-pulse 900ms ease-in-out infinite;")
        + `"><svg viewBox="0 0 24 24" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" fill="none" stroke="${T.black}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.mic}</svg></div>`;
    }
    return html;
  }

  /** Глаза над аватарами стульев: только там, где то же окно у меня не открыто. */
  function chairEyesHtml(s: Snapshot): string {
    if (!view) return "";
    let html = "";
    for (const chair of s.chairs) {
      const spot: EyeSpot = `chair:${chair.id}`;
      // Свой стул — на своём худе, а не на столе; открытое у меня окно забирает глаза себе.
      if (chair.id === mine(s) || watchedByMe(spot)) continue;
      const row = eyeRowHtml(s, spot, EYES_ON_TABLE, Math.max(14, Math.round(0.3 * view.k)));
      if (!row) continue;
      const at = view.toGlass(spots.find((sp) => sp.key === chair.id)?.seat ?? { x: 0, y: 0 });
      html += `<div style="position:absolute;left:${Math.round(at.x)}px;top:${Math.round(at.y - SEAT_REACH * view.k * view.squash - 10)}px;`
        + `transform:translate(-50%,-100%);z-index:26;pointer-events:none">${row}</div>`;
    }
    return html;
  }

  function chairZonesHtml(s: Snapshot): string {
    if (!view) return "";
    const lit = new Map<string, { ink: string; here: boolean }>();
    for (const c of store.carries) {
      if (c.over.in === "hand" && !closed(s, c.over.chair)) lit.set(c.over.chair, { ink: inkOf(s, c.by), here: true });
    }
    const aim = aiming();
    if (aim) {
      for (const chair of s.chairs) {
        if (closed(s, chair.id) || lit.has(chair.id)) continue;
        const here = aim.kind === "chair" && aim.which === chair.id;
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

  /** Место карты словами — сменилось, значит карта переехала. В руке — только чья рука: перестановка не переезд. */
  function tipKeyOf(s: Snapshot, id: string): string | null {
    const f = s.felt.find((c) => c.id === id);
    if (f) return `felt:${f.x},${f.y},${f.angle},${f.up}`;
    const pile = s.piles.find((p) => p.cards.at(-1)?.id === id);
    if (pile) return `deck:${pile.id}`;
    const chair = s.chairs.find((c) => c.hand.some((card) => card.id === id));
    return chair ? `hand:${chair.id}` : null;
  }

  function agoText(at: number): string {
    const sec = Math.max(0, Math.floor((store.now() - at) / 1000));
    if (sec < 5) return "только что";
    if (sec < 60) return `${sec} сек назад`;
    if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`;
    return `${Math.floor(sec / 3600)} ч назад`;
  }

  /** Строки тултипа в единицах `k` — ширины карты в пикселях. Лицо — только если оно мне видно. */
  function tipLines(s: Snapshot, id: string, face: Face | undefined, inDeck: boolean, k: number): string {
    const trail = s.trails?.[id];
    const title = face
      ? `<span style="color:${SUITS[face.suit][1] === "#1b1b1b" ? T.ink : "#e0645c"}">${escape(face.rank)} ${SUITS[face.suit][0]}</span>`
      : `<span style="color:${T.inkDim}">Рубашкой вверх</span>`;
    const from = !trail ? "" : trail.from === "deck" ? "из колоды" : trail.from === "hand" ? (trail.hand ? `из руки ${escape(trail.hand)}` : "из руки") : "со стола";
    return [
      `<div data-g="tip-name" style="font-size:${0.3 * k}px;line-height:1.15;margin-bottom:${0.06 * k}px">${title}</div>`,
      from && `<div data-g="tip-from" style="color:${T.inkDim}">${from}</div>`,
      trail && `<div data-g="tip-by">двигал <span style="color:${inkOf(s, trail.by) === T.inkDim ? T.ink : inkOf(s, trail.by)}">${escape(trail.byName)}</span> ${agoText(trail.at)}</div>`,
      !trail && inDeck && `<div data-g="tip-from" style="color:${T.inkDim}">в колоде</div>`,
    ].filter(Boolean).join("");
  }

  const tipShell = (k: number) =>
    `box-sizing:border-box;padding:${0.14 * k}px ${0.18 * k}px;border-radius:${0.14 * k}px;background:${T.well};`
    + `box-shadow:inset 0 0 0 ${Math.max(1, 0.04 * k)}px ${T.black},inset 0 0 0 ${Math.max(1.5, 0.07 * k)}px ${T.wood},0 ${0.06 * k}px 0 rgba(11,7,4,.5);`
    + `font:400 ${0.19 * k}px/1.3 Tiny5,monospace;color:${T.ink};-webkit-user-select:none;user-select:none`;

  /** Размер тултипа карты в руке — как у стола при ширине карты в столько пикселей: читается без зума. */
  const HAND_TIP_K = 56;

  /**
   * ТУЛТИП КАРТЫ. На столе размер — от карты (`view.k`): к нему приближаются, чтобы прочитать. Стоит ровно
   * к экрану, но сжат наклоном, как всё на сукне. Сбоку от карты со стрелкой к ней: справа, а если справа
   * не влезает в кадр — слева. Лицо — только у карты лицом вверх, кто бы её ни положил.
   *
   * В руке — внизу или в окне стула — это уже стекло, а не стол: размер постоянный, над картой, стрелкой
   * вниз к ней, и поверх окон. Лицо — если его видно мне: своя рука всегда, чужая — если не скрыта.
   */
  function cardTipHtml(s: Snapshot): string {
    if (!cardTip || !view) return "";
    const v = view;
    const tip = cardTip;
    if (store.carries.some((c) => c.id === tip.id) || drag?.card.id === tip.id || flying.has(tip.id)) return "";
    const key = tipKeyOf(s, tip.id);
    if (key !== tip.key) {
      cardTip = null;
      return "";
    }
    if (key.startsWith("hand:")) {
      const hand = handsShown(s).get(key.slice(5));
      const one = hand?.lay.find((l) => "card" in l && l.card.id === tip.id);
      if (!hand || !one || !("card" in one)) {
        cardTip = null;
        return "";
      }
      const k = HAND_TIP_K;
      const w = 2.4 * k, arrow = 0.13 * k, EDGE = 8;
      const g = glass();
      const left = Math.max(EDGE, Math.min(g.w - w - EDGE, one.slot.x - w / 2));
      const bottom = one.slot.y - hand.geom.h / 2 - arrow - 4;
      return `<div data-g="card-tip" data-card="${tip.id}" data-side="up" style="position:absolute;left:${left}px;top:${bottom}px;width:${w}px;`
        + `transform:translateY(-100%);z-index:58;${tipShell(k)}">`
        + `<span style="position:absolute;bottom:${-arrow}px;left:${one.slot.x - left - arrow}px;width:${2 * arrow}px;height:${2 * arrow}px;transform:rotate(45deg);`
        + `background:${T.wood};z-index:-1"></span>${tipLines(s, tip.id, one.card.up ? undefined : one.card.face, false, k)}</div>`;
    }
    const felt = s.felt.find((c) => c.id === tip.id);
    const pile = felt ? undefined : pileOf(s, key.slice(5));
    const at = felt ? (v.feltAt(felt.id) ?? felt) : v.deckAt(pile?.id ?? "", (pile?.cards.length ?? 1) - 1, pile?.cards.length ?? 1);
    const a = ((felt ? felt.angle : (pile?.angle ?? 0)) * Math.PI) / 180;
    const xs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => {
      const lx = (dx! * FELT_CARD.w) / 2, ly = (dy! * FELT_CARD.h) / 2;
      return v.toGlass({ x: at.x + lx * Math.cos(a) - ly * Math.sin(a), y: at.y + lx * Math.sin(a) + ly * Math.cos(a) }).x;
    });
    const mid = v.toGlass(at);
    const k = v.k;
    const w = 2.4 * k, gap = 0.2 * k, arrow = 0.13 * k;
    const right = Math.max(...xs) + gap;
    const onLeft = right + w > glass().w && Math.min(...xs) - gap - w >= 0;
    const left = onLeft ? Math.min(...xs) - gap - w : right;
    const side = onLeft ? `right:${-arrow}px` : `left:${-arrow}px`;
    return `<div data-g="card-tip" data-card="${tip.id}" data-side="${onLeft ? "left" : "right"}" style="position:absolute;left:${left}px;top:${mid.y}px;width:${w}px;`
      + `transform-origin:${onLeft ? "100%" : "0"} 50%;transform:translateY(-50%) scale(1,${v.squash});z-index:0;${tipShell(k)}">`
      + `<span style="position:absolute;top:50%;${side};width:${2 * arrow}px;height:${2 * arrow}px;margin-top:${-arrow}px;transform:rotate(45deg);`
      + `background:${T.wood};z-index:-1"></span>${tipLines(s, tip.id, felt ? (felt.up ? felt.face : undefined) : pile?.cards.at(-1)?.up ? pile.cards.at(-1)!.face : undefined, felt === undefined, k)}</div>`;
  }

  /** СТОРОНА, КОТОРОЙ КАРТА ЛЯЖЕТ В СТОПКУ: стороной стопки, если все её карты лежат одинаково, иначе — как несли. */
  function deckSide(s: Snapshot, pile: string, id: string, shown: boolean): boolean {
    const pack = (pileOf(s, pile)?.cards ?? []).filter((c) => c.id !== id).map((c) => c.up === true);
    return pack.length > 0 && pack.every((up) => up === pack[0]) ? pack[0]! : shown;
  }

  /** Углы карты стопки на стекле: стопка повёрнута на свой угол (`DeckSpot.angle`). */
  function deckCorners(pile: Pile, c: { x: number; y: number }): { x: number; y: number }[] {
    const v = view!;
    const a = (pile.angle * Math.PI) / 180;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => {
      const lx = (dx! * FELT_CARD.w) / 2, ly = (dy! * FELT_CARD.h) / 2;
      return v.toGlass({ x: c.x + lx * Math.cos(a) - ly * Math.sin(a), y: c.y + lx * Math.sin(a) + ly * Math.cos(a) });
    });
  }

  /** Стопку несут: где она у меня на стекле — середина, размер, и куда ляжет (`at`, в осях стола). */
  function deckCarry(s: Snapshot, pile: string): { x: number; y: number; w: number; h: number; at: { x: number; y: number }; n: number } | null {
    const one = pileOf(s, pile);
    if (!gripPress?.at || gripPress.pile !== pile || !view || !one) return null;
    const w = FELT_CARD.w * view.k, h = FELT_CARD.h * view.k;
    const home = view.toGlass(gripPress.at);
    return { x: home.x, y: home.y - h * CARRY_CLEAR, w, h, at: gripPress.at, n: one.cards.length };
  }

  /** Зона приёмки стопки на стекле — рамка всей стопки с полем. */
  function deckZone(pile: Pile): { left: number; top: number; right: number; bottom: number } | null {
    if (!view) return null;
    const v = view;
    const n = Math.max(1, pile.cards.length);
    const pts = [v.deckAt(pile.id, 0, n), v.deckAt(pile.id, n - 1, n)].flatMap((c) => deckCorners(pile, c));
    const pad = 0.12 * FELT_CARD.w * v.k;
    return {
      left: Math.min(...pts.map((p) => p.x)) - pad, right: Math.max(...pts.map((p) => p.x)) + pad,
      top: Math.min(...pts.map((p) => p.y)) - pad, bottom: Math.max(...pts.map((p) => p.y)) + pad,
    };
  }

  /**
   * ЗОНЫ ПРИЁМКИ СТОПОК — пунктир под каждой стопкой, пока карту несут: «сюда можно». Карта над стопкой — её зона
   * горит золотом. Чужую карту над стопкой видно всем: зона горит в цвете того, кто несёт.
   */
  function deckZoneHtml(s: Snapshot): string {
    const aim = aiming();
    if (!aim && !store.carries.some((c) => c.over.in === "deck")) return "";
    return s.piles.map((pile) => {
      const zone = deckZone(pile);
      if (!zone || pile.shut || deckCarry(s, pile.id)) return "";
      const other = store.carries.find((c) => c.over.in === "deck" && c.over.pile === pile.id);
      if (!aim && !other) return "";
      const here = aim ? aim.kind === "deck" && aim.pile === pile.id : true;
      const ink = aim ? (here ? T.gold : T.inkDim) : inkOf(s, other!.by);
      const r = Math.round(0.16 * FELT_CARD.w * (view?.k ?? 40));
      return `<div data-g="deck-zone" data-pile="${pile.id}" data-here="${here}" style="position:absolute;left:${zone.left}px;top:${zone.top}px;width:${zone.right - zone.left}px;height:${zone.bottom - zone.top}px;`
        + `box-sizing:border-box;z-index:1;pointer-events:none;border-radius:${r}px;border:2px dashed ${ink};`
        + `background:${here ? `color-mix(in srgb, ${ink} 22%, transparent)` : "rgba(245,234,208,.06)"};`
        + (here ? `box-shadow:0 0 ${r * 1.5}px ${r * 0.5}px color-mix(in srgb, ${ink} 55%, transparent);` : "opacity:.75;")
        + `"></div>`;
    }).join("");
  }

  /** Где индикатор стопки на стекле: под нижней картой стопки, по середине. `null` — стопки нет. */
  function gripAt(s: Snapshot, id: string): { x: number; y: number } | null {
    const pile = pileOf(s, id);
    if (!view || !pile) return null;
    const v = view;
    // НЕСУТ — индикатор под стопкой в воздухе: стопка висит на нём.
    const carry = deckCarry(s, id);
    if (carry) return { x: carry.x, y: carry.y + carry.h / 2 + 2 };
    const n = Math.max(1, pile.cards.length);
    const low = v.deckAt(id, 0, n);
    const high = v.deckAt(id, n - 1, n);
    const ys = deckCorners(pile, low).map((p) => p.y);
    const mid = v.toGlass({ x: (low.x + high.x) / 2, y: (low.y + high.y) / 2 });
    return { x: mid.x, y: Math.max(...ys) };
  }

  /**
   * ИНДИКАТОР СТОПКИ — ручка: сколько в ней карт, и за него стопку тянут. Горит, пока открыт её тултип или
   * её несут. Колода и стопки игроков — одним видом; стопка игрока на столе ниже колоды по z.
   */
  function gripHtml(s: Snapshot): string {
    return s.piles.map((pile, z) => {
      const at = gripAt(s, pile.id);
      if (!at) return "";
      const lit = local.deckTip === pile.id || (gripPress?.pile === pile.id && gripPress.moved);
      // НЕ КРУПНЕЕ СТОПКИ: на мелком зуме индикатор жмётся вместе с картой, выше `GRIP.most` её высоты не бывает.
      const h = 24;
      const scale = Math.min(1, (GRIP.most * FELT_CARD.h * view!.k) / h);
      return `<div data-g="deck-grip" data-pile="${pile.id}" data-count="${pile.cards.length}" data-forever="${pile.forever}" data-pin="${pile.pin}" role="button" aria-label="${pile.id === MAIN_PILE ? "Колода" : "Стопка"}" style="position:absolute;left:${Math.round(at.x)}px;top:${Math.round(at.y + 2 * scale)}px;`
        + `transform:translateX(-50%) scale(${scale.toFixed(3)});transform-origin:50% 0;height:${h}px;box-sizing:border-box;display:flex;align-items:center;gap:3px;padding:0 7px 0 5px;border-radius:${h / 2}px;white-space:nowrap;`
        + `touch-action:none;cursor:${pile.pin ? "pointer" : "grab"};z-index:${deckCarry(s, pile.id) ? 61 : 20 + Math.min(z, 4)};user-select:none;-webkit-user-select:none;`
        + (lit ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});box-shadow:inset 0 0 0 2px ${T.black},0 2px 0 rgba(11,7,4,.6);`
               : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 4px ${BAR_LOOK.rim},0 2px 0 rgba(11,7,4,.6);`)
        + `"><svg viewBox="0 0 24 20" width="22" height="17" fill="none" stroke="${T.black}" stroke-width="1.6" stroke-linejoin="round">`
        + `<g fill="${lit ? T.ink : BAR_LOOK.goldHi}">${GLYPH.deck}</g></svg>`
        + `<span style="font:400 12px Tiny5,monospace;color:${lit ? T.black : T.ink}">${pile.cards.length}</span>`
        + pickBadges(s, pile)
        + (local.deckTip === pile.id ? "" : eyeRowHtml(s, `pile:${pile.id}`, EYES_ON_TABLE, 16))
        + (pile.pin ? `<svg data-g="deck-pinned" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="${lit ? T.black : BAR_LOOK.goldHi}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${GLYPH.pin}</svg>` : "")
        + `</div>`;
    }).join("");
  }

  /** Сколько карт стопки выделено — у каждого выделившего своя плашка в его цвете. */
  function pickBadges(s: Snapshot, pile: Pile): string {
    const count = new Map<string, number>();
    for (const c of pile.cards) {
      const by = s.picks?.[c.id];
      if (by !== undefined) count.set(by, (count.get(by) ?? 0) + 1);
    }
    return [...count].map(([by, n]) => `<span data-g="pile-picks" data-by="${by === me() ? "me" : escape(by)}" data-n="${n}" style="margin-left:2px;min-width:14px;height:16px;padding:0 3px;box-sizing:border-box;border-radius:8px;`
      + `background:${inkOf(s, by)};box-shadow:0 0 0 2px ${T.black};font:400 11px/16px Tiny5,monospace;color:${T.black};text-align:center">${n}</span>`).join("");
  }

  /**
   * СТОПКА В ВОЗДУХЕ — поднята над сукном и стоит ровно к экрану, как карта в пальце; под ней — контур,
   * как она ляжет: ровно к камере, сжатый наклоном стола.
   */
  function deckCarryHtml(s: Snapshot): string {
    const pile = gripPress && pileOf(s, gripPress.pile);
    const c = pile && deckCarry(s, pile.id);
    if (!pile || !c || !view) return "";
    const top = pile.cards.at(-1);
    const layers = Math.min(Math.max(1, c.n), 6);
    const cards = Array.from({ length: layers }, (_, i) => {
      const d = layers - 1 - i;
      const face = i === layers - 1 && top?.up ? top.face : undefined;
      return `<div style="position:absolute;left:${-d * 1.5}px;top:${d * 2}px;width:${c.w}px;height:${c.h}px">${cardHtml(face, c.w)}</div>`;
    }).join("");
    const mark = view.toGlass(c.at);
    // Над рукой или стопкой контура на сукне нет: там горит своя зона.
    const onFelt = !gripPress?.target || gripPress.target.kind === "felt";
    return (onFelt ? markHtml(c.w, c.h, view.rotation + dropAngle(), mark.x, mark.y, 30, view.squash).replace('data-g="mark"', 'data-g="deck-mark"') : "")
      + `<div data-g="deck-carry" data-pile="${pile.id}" data-aim="${gripPress?.target ? `${gripPress.target.kind}${"pile" in gripPress.target ? `:${gripPress.target.pile}` : ""}` : "felt"}" style="position:absolute;left:${c.x - c.w / 2}px;top:${c.y - c.h / 2}px;width:${c.w}px;height:${c.h}px;z-index:60;pointer-events:none;`
      + `filter:drop-shadow(0 ${Math.round(c.h * 0.12)}px 0 rgba(11,7,4,.45))">${cards}</div>`;
  }

  /** Кнопка тултипа стопки: как флаг в окне стула. */
  function deckChip(data: string, glyph: string, label: string, on = false): string {
    const look = on
      ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});box-shadow:inset 0 0 0 2px ${T.black};`
      : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim};`;
    return `<button ${data} aria-label="${label}" aria-pressed="${on}" style="width:26px;height:26px;border:0;padding:0;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;${look}">`
      + `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${on ? T.black : "white"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></button>`;
  }

  /** Окно открытой стопки и гнёзда его веера на `count` мест — карты и щель под карту в воздухе. */
  function deckTipGeom(s: Snapshot, count: number): { pile: Pile; box: TipBox; slots: Slot[] } | null {
    const pile = local.deckTip === null ? undefined : pileOf(s, local.deckTip);
    const at = pile && gripAt(s, pile.id);
    if (!pile || !at || !view) return null;
    const k = view.k;
    const spot: Spot = { key: `deck:${pile.id}`, x: at.x, y: at.y - (FELT_CARD.h / 2) * k * view.squash, r: (FELT_CARD.h / 2) * k * view.squash, seat: pile, puff: 1 };
    const box = tipBox(spot, [...placedTips.values()]);
    const plan = handPlan({ fan: true, shrink: false, tuck: false }, count, 1, 1.4, box.inner / box.cw);
    return { pile, box, slots: plan.map((p) => ({ x: box.left + 12 + box.inner / 2 + p.x * box.cw, y: box.rowTop + 8 + box.ch / 2 + p.y * box.cw, angle: p.angle })) };
  }

  /** Щели в открытой стопке: под мою карту в воздухе и под чужие, которые держат над её окном. */
  function deckGaps(s: Snapshot): Gap[] {
    const out: Gap[] = [];
    const aim = aiming();
    if (aim?.kind === "deckAt" && aim.pile === local.deckTip) out.push({ index: aim.index, ink: T.ink });
    for (const c of store.carries) if (c.over.in === "deck" && c.over.pile === local.deckTip && c.over.i !== undefined) out.push({ index: c.over.i, ink: inkOf(s, c.by), carry: c.id });
    return out.sort((a, b) => a.index - b.index);
  }

  /**
   * ТУЛТИП СТОПКИ — стопка картами, как чужая рука в окне стула: какой стороной лежит, такой и видно. Карты
   * тянут, переставляют и переворачивают, как в окне руки; под локом — только верхнюю, а карта, брошенная в
   * окно, встаёт наверх. Кнопки — перемешать, отсортировать, перевернуть; пин, лок, приёмка и вечность — значками.
   */
  function deckTipHtml(s: Snapshot): string {
    if (local.deckTip === null) return "";
    const gaps = deckGaps(s);
    const geom = deckTipGeom(s, (pileOf(s, local.deckTip)?.cards.length ?? 0) + gaps.length);
    if (!geom) {
      local.deckTip = null;
      return "";
    }
    const { box, slots, pile } = geom;
    const cards = pile.cards;
    const admin = s.admin === me();
    const list: (SeenCard | Gap)[] = [...cards];
    for (const gap of gaps) list.splice(Math.max(0, Math.min(list.length, gap.index)), 0, gap);
    const held = heldByOthers(s);
    const top = cards.at(-1)?.id;
    const laidCards = list.map((one, i) => {
      const slot = slots[i]!;
      if ("index" in one) return markHtml(box.cw, box.ch, slot.angle, slot.x, slot.y, 42 + i, 1, one.ink);
      const shut = pile.shut || (pile.lock && one.id !== top);
      const hand = held[one.id];
      return `<div data-card="${one.id}" data-owner="deck" data-pile="${pile.id}"${pickAttr(one.id)} style="position:absolute;width:${box.cw}px;height:${box.ch}px;left:${slot.x - box.cw / 2}px;top:${slot.y - box.ch / 2}px;${pickCss(one.id, box.cw)}`
        + `transform:rotate(${slot.angle}deg);z-index:${42 + i};touch-action:none;`
        + (hand ? `pointer-events:none;filter:brightness(.6);outline:3px solid ${hand};border-radius:${box.cw * 0.12}px;` : shut ? "pointer-events:none;" : "cursor:grab;")
        + (flying.has(one.id) ? "visibility:hidden;" : "")
        + `transition:left ${motion.ms(160)}ms ease-out, top ${motion.ms(160)}ms ease-out, transform ${motion.ms(160)}ms ease-out">${cardHtml(one.up ? one.face : undefined, box.cw)}</div>`;
    }).join("");
    const acts: [DeckDo, string, string][] = [["shuffle", GLYPH.shuffle, "Перемешать"], ["sort", GLYPH.suit, "Отсортировать"], ["flip", GLYPH.reverse, "Перевернуть"]];
    /** Кнопка, если можно; значок состояния, если нельзя. */
    const chip = (may: boolean, data: string, glyph: string, label: string, on: boolean) =>
      may ? deckChip(data, glyph, label, on) : deckChip(`${data}-status disabled`, glyph, label, on).replace("cursor:pointer", `cursor:default;opacity:${on ? 0.8 : 0.4}`);
    return `<div data-g="deck-tip" data-pile="${pile.id}" data-lock="${pile.lock}" data-shut="${pile.shut}" style="position:absolute;left:${box.left}px;top:${box.top}px;width:${box.w}px;height:${box.height}px;box-sizing:border-box;z-index:40;`
      + `background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 6px 0 rgba(11,7,4,.5);border-radius:12px;padding:12px">`
      + `<div style="display:flex;align-items:center;gap:9px;height:30px;padding-bottom:8px">`
      + `<span style="font:400 14px Tiny5,monospace;color:${T.ink};flex:1">${pile.id === MAIN_PILE ? "Колода" : "Стопка"} · ${cards.length}</span>`
      + eyeRowHtml(s, `pile:${pile.id}`, EYES_IN_PANEL, 20)
      + `<span data-deck-shut role="button" style="cursor:pointer;font:400 11px Tiny5,monospace;border-radius:8px;padding:6px 10px;box-shadow:inset 0 0 0 2px ${T.wood};color:${T.inkDim}">Закрыть</span></div>`
      + `<div style="display:flex;align-items:center;gap:4px;height:16px">`
      + acts.map(([how, glyph, label]) => (pile.lock ? chip(false, "data-deck-do", glyph, label, false).replace("data-deck-do-status", `data-deck-do-status="${how}"`) : deckChip(`data-deck-do="${how}"`, glyph, label))).join("")
      + `<span style="flex:1"></span>`
      // ПИН: приколоть — любой, открепить — только админ. ЛОК И ПРИЁМКА — только админ.
      + chip(!pile.pin || admin, "data-deck-pin", GLYPH.pin, "Приколоть", pile.pin)
      + chip(admin, "data-deck-lock", GLYPH.lock, "Лок", pile.lock)
      + chip(admin, "data-deck-accept", GLYPH.shut, "Приёмка закрыта", pile.shut)
      + chip(admin, "data-deck-seal", GLYPH.seal, "Мерж закрыт", pile.seal)
      + `${deckChip("data-deck-forever", GLYPH.forever, "Вечная", pile.forever)}</div>`
      + `</div>` + laidCards;
  }

  function carryHtml(): string {
    if (!drag) return "";
    // МАССА В ПАЛЬЦЕ: стянутая к пальцу — стопкой под картой хвата и числом; как лежат — одна карта, а где лягут
    // остальные, показывают контуры на сукне (`massMarksHtml`).
    const s = frame();
    // Считать по столу, а не по кадру: в кадре стянутых к пальцу уже нет на местах.
    const rest = drag.mass ? myPicks(truth()).filter((id) => id !== drag!.card.id) : [];
    const stack = drag.mass && local.grab === "collect" ? Math.min(rest.length, 4) : 0;
    const under = Array.from({ length: stack }, (_, i) => {
      const d = stack - i;
      return `<div style="position:absolute;left:${-d * 3}px;top:${d * 3}px;width:${drag!.w}px;height:${drag!.h}px">${cardHtml(undefined, drag!.w)}</div>`;
    }).join("");
    const badge = drag.mass ? `<span data-g="mass-count" data-n="${rest.length + 1}" style="position:absolute;right:${-8}px;top:${-8}px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:10px;`
      + `background:${inkOf(s, me())};box-shadow:0 0 0 2px ${T.black};font:400 12px/20px Tiny5,monospace;color:${T.black};text-align:center;z-index:2">${rest.length + 1}</span>` : "";
    return `<div data-g="carry"${drag.mass ? ` data-mass="${local.grab}"` : ""} style="position:fixed;width:${drag.w}px;height:${drag.h}px;left:${drag.x - drag.gx}px;`
      + `top:${drag.y - drag.gy - drag.h * CARRY_CLEAR}px;z-index:60;pointer-events:none;filter:drop-shadow(0 ${Math.round(drag.h * 0.12)}px 0 rgba(11,7,4,.45))">`
      + under + `<div style="position:absolute;inset:0">${cardHtml(drag.shown ? drag.card.face : undefined, drag.w)}</div>` + badge + `</div>`;
  }

  /**
   * ДЕЙСТВИЯ С ВЫДЕЛЕННЫМ — полоса над рукой, пока открыто лассо: снять выделение, перевернуть, в руку, собрать в
   * стопку. Без выделения кнопки погашены.
   */
  const LASSO_ACTS = [
    ["cancel", "Отменить", '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'],
    ["flip", "Перевернуть", GLYPH.reverse],
    ["hand", "В руку", '<path d="M12 3v11"/><path d="M7.5 9.5 12 14l4.5-4.5"/><path d="M4 20h16"/>'],
    ["gather", "Собрать", GLYPH.deck],
  ] as const;

  function lassoActsHtml(s: Snapshot): string {
    if (!lassoOn() || talk.open) return "";
    const n = myPicks(s).length;
    const g = glass();
    const w = Math.min(g.w - 16, 360);
    const top = g.h - hudFloor(handOf(s, mine(s)).length) - 50;
    return `<div data-g="lasso-acts" data-n="${n}" style="position:absolute;left:${(g.w - w) / 2}px;top:${top}px;width:${w}px;height:42px;z-index:57;display:flex;gap:6px;`
      + `box-sizing:border-box;padding:4px;border-radius:12px;background:${T.well};box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 4px ${T.wood},0 4px 0 rgba(11,7,4,.5)">`
      + LASSO_ACTS.map(([act, label, glyph]) => `<button data-lasso-act="${act}" aria-disabled="${n === 0}" style="flex:1 1 0;min-width:0;border:0;border-radius:8px;cursor:${n ? "pointer" : "default"};`
        + `display:flex;align-items:center;justify-content:center;gap:4px;padding:0 4px;opacity:${n ? 1 : 0.45};color:${T.ink};font:400 11px Tiny5,monospace;white-space:nowrap;`
        + `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim}">`
        + `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${glyph}</svg>`
        + `<span style="overflow:hidden;text-overflow:ellipsis">${label}</span></button>`).join("")
      + `</div>`;
  }

  /** Нажата кнопка полосы лассо. После «в руку» и «собрать» выделение снято, режим остаётся. */
  function lassoAct(act: (typeof LASSO_ACTS)[number][0]): void {
    const s = truth();
    const ids = myPicks(s);
    if (act === "cancel") return unpickAll();
    if (ids.length === 0) return;
    if (act === "flip") return guessBatch({ t: "turnMany", ids });
    if (act === "hand") {
      const chair = mine(s);
      if (!chair) return;
      const staying = handOf(s, chair).filter((c) => !ids.includes(c.id)).length;
      guessBatch({ t: "moveMany", moves: ids.map((id, k) => ({ id, to: { in: "hand" as const, chair, i: staying + k } })) });
      return unpickAll();
    }
    // СОБРАТЬ — в середину выделенных карт сукна; если их нет — под середину моего экрана.
    const felt = s.felt.filter((f) => ids.includes(f.id));
    const at = felt.length
      ? { x: felt.reduce((m, f) => m + f.x, 0) / felt.length, y: felt.reduce((m, f) => m + f.y, 0) / felt.length }
      : (view?.toDesk({ x: lastFrame.w / 2, y: lastFrame.h / 2 }) ?? { x: 0, y: 0 });
    guessBatch({ t: "gather", ids, side: local.side, to: { ...at, angle: dropAngle() } });
    unpickAll();
  }

  /** Моё выделение — id карт, которые ещё есть на столе. */
  function myPicks(s: Snapshot): string[] {
    const key = me();
    return Object.entries(s.picks ?? {}).filter(([id, by]) => by === key && whereIs(s, id) !== null).map(([id]) => id);
  }

  /** Как лежат: сдвиг массы на сукне — от места карты хвата до того, куда она ляжет. */
  function massShift(d: Drag): { dx: number; dy: number } | null {
    if (!d.mass || local.grab !== "keep" || d.target.kind !== "felt" || d.from.in !== "felt") return null;
    return { dx: d.target.at.x - d.from.x, dy: d.target.at.y - d.from.y };
  }

  /** КОНТУРЫ МАССЫ «КАК ЛЕЖАТ» — где лягут остальные выделенные карты сукна, каждая своим углом. */
  function massMarksHtml(s: Snapshot): string {
    const shift = drag && massShift(drag);
    if (!shift || !view) return "";
    const v = view;
    return s.felt.filter((f) => f.id !== drag!.card.id && s.picks?.[f.id] === me()).map((f) => {
      const at = v.toGlass({ x: f.x + shift.dx, y: f.y + shift.dy });
      return markHtml(FELT_CARD.w * v.k, FELT_CARD.h * v.k, v.rotation + f.angle, at.x, at.y, 30, v.squash).replace('data-g="mark"', 'data-g="mass-mark"');
    }).join("");
  }

  /**
   * ОТПУСТИЛИ МАССУ. Как лежат и над сукном — выделенные карты сукна едут на тот же сдвиг, каждая со своим углом;
   * карты в руках и стопках стоят. Иначе — стянутые к пальцу: в руку — подряд, карта хвата последней; в стопку или на
   * сукно — сборка в стопку стороной из бара, карта хвата сверху. Как лежат, но не над сукном — то же, только карты сукна.
   */
  function dropMass(d: Drag): void {
    const s = truth();
    const shift = massShift(d);
    const feltPicks = s.felt.filter((f) => s.picks?.[f.id] === me());
    if (shift) {
      guessBatch({ t: "moveMany", moves: feltPicks.map((f) => ({ id: f.id, to: { in: "felt" as const, x: f.x + shift.dx, y: f.y + shift.dy, up: f.up, angle: f.angle } })) });
      return;
    }
    const pool = local.grab === "keep" ? feltPicks.map((f) => f.id) : myPicks(s);
    const ids = [...pool.filter((id) => id !== d.card.id), d.card.id];
    const aim = d.target;
    if (aim.kind === "hand" || aim.kind === "chair") {
      const chair = aim.which;
      const start = aim.kind === "hand" ? aim.index : handOf(s, chair).length;
      // Свои карты этой руки уходят из неё раньше, чем встают: индекс считается без них.
      const staying = handOf(s, chair).filter((c) => !ids.includes(c.id)).length;
      const base = Math.min(start, staying);
      guessBatch({ t: "moveMany", moves: ids.map((id, k) => ({ id, to: { in: "hand" as const, chair, i: base + k } })) });
      return;
    }
    const to = aim.kind === "deck" || aim.kind === "deckAt" ? { pile: aim.pile } : aim.kind === "felt" ? { ...aim.at, angle: dropAngle() } : null;
    if (to) guessBatch({ t: "gather", ids, side: local.side, to });
  }

  // ── РИСОВАНИЕ ───────────────────────────────────────────────────────────────────────────────

  function draw(): void {
    const g = glass();
    const s = seen();
    if (drawnSnap && drawnSnap !== s) soundCues(drawnSnap, s, g);
    drawnSnap = s;
    for (const pile of store.state.piles) {
      const was = seenShuffles.get(pile.id);
      if (was !== undefined && was !== pile.shuffles) {
        queueMicrotask(() => playShuffle(store.state, pile.id));
        if (local.deckTip === pile.id) shuffledInTip = true;
      }
      seenShuffles.set(pile.id, pile.shuffles);
    }
    const seat = mine(s);
    const floor = talk.open ? talk.height() : hudFloor(handOf(s, seat).length);
    aimCamera(s);
    const seats: Seat[] = s.chairs.map((c) => {
      const sitter = sitterOf(s, c);
      return {
        key: c.id,
        angle: c.angle,
        mine: c.id === seat,
        ...(c.croupier ? { croupier: true } : {}),
        ...(sitter && voice.speaking === sitter.key ? { speaking: voice.loudness } : {}),
        // Своя рука — внизу, на стекле; в своём стуле карт не рисуем.
        pose: c.pose,
        cards: c.id === seat ? 0 : c.hand.filter((card) => !flying.has(card.id)).length + gapsIn(s, c.id).filter((gap) => gap.carry).length,
        // На стуле лицом наружу — перевёрнутые.
        hand: c.id === seat ? [] : c.hand.filter((card) => !flying.has(card.id)).map((card) => ({ id: card.id, ...(card.up && card.face ? { face: card.face } : {}) })),
        ...(sitter ? { name: sitter.name, ink: sitter.ink } : {}),
        ...(sitter?.photo ? { face: face(sitter) } : {}),
      };
    });
    noteTurns(s);
    lastFrame = { w: g.w, h: g.h - floor };
    syncCamera();
    art.warm(s.rules);
    view = drawFelt(canvas, {
      W: g.w, H: g.h, people: seats, images, art: (face) => art.image(s.rules, face), turning, piles: s.piles.filter((p) => !deckCarry(s, p.id)), felt: s.felt, held: heldByOthers(s), picked: Object.fromEntries(Object.keys(s.picks ?? {}).map((id) => [id, pickInk(s, id)!])), hidden: flying,
      view: cam.camera.transform(), k: cam.camera.pixelsPerUnit, squash: cam.camera.squash, rotation: cam.camera.rotation,
      rise: cam.camera.maxPitch > 0 ? cam.camera.pitch / cam.camera.maxPitch : 0,
    });
    spots = view.spots;
    talk.place(wordAnchors(s));
    // Взгляд — на холсте атрибутом: его видно в инспекторе и его читает прогон жестов.
    const c = cam.camera;
    canvas.dataset.view = `${c.target.x.toFixed(2)},${c.target.y.toFixed(2)},${c.zoom.toFixed(3)},${c.rotation.toFixed(1)},${c.pitch.toFixed(1)}`;
    const middle = view.toGlass({ x: 0, y: 0 });
    canvas.dataset.spots = JSON.stringify({
      frame: lastFrame,
      k: view.k,
      middle: { x: Math.round(middle.x), y: Math.round(middle.y) },
      felt: s.felt.map((f) => {
        const at = view!.toGlass(view!.feltAt(f.id) ?? f);
        const bare = view!.toGlass(f);
        return { id: f.id, angle: f.angle, x: Math.round(at.x), y: Math.round(at.y), rise: +(bare.y - at.y).toFixed(1), up: f.up, face: f.up ? (f.face?.rank ?? null) : null };
      }),
      // КОЛОДА — прежними ключами; все стопки, колода с ними, — в `piles`.
      ...pileSpots(s, MAIN_PILE, "deck"),
      piles: s.piles.map((p) => ({ id: p.id, ...pileSpots(s, p.id, "pile") })),
      turning: [...turns.keys()],
      mine: seat,
      // Кто сейчас звучит и насколько громко дышит его аватар — прогон жестов читает это отсюда.
      speaking: voice.speaking,
      loudness: +voice.loudness.toFixed(2),
      admin: s.admin,
      me: me(),
      picks: s.picks ?? {},
      seatAngle: chairOf(s, seat)?.angle ?? null,
      seats: spots.map((sp) => {
        const c = chairOf(s, sp.key);
        return { key: sp.key, open: c ? c.hand.filter((card) => card.up && card.face).map((card) => card.id) : [], who: c && sitterOf(s, c)?.name, ...(c?.croupier ? { croupier: true } : {}), x: Math.round(sp.x), y: Math.round(sp.y), r: Math.round(sp.r), puff: sp.puff, ...(sp.plate ? { plate: sp.plate } : {}), chair: Math.round(SEAT_REACH * view!.k) };
      }),
    });
    local.tips = local.tips.filter((id) => id !== seat && chairOf(s, id) !== undefined);
    tellWatch();
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
    over.innerHTML = deckZoneHtml(s) + cardTipHtml(s) + deckCarryHtml(s) + gripHtml(s) + hudHtml(s) + open.map((t) => t.shell).join("") + open.map((t) => t.cards).join("") + deckTipHtml(s) + chairZonesHtml(s) + chairEyesHtml(s) + micMarksHtml(s) + feltMarkHtml() + massMarksHtml(s) + carryHtml() + homeHtml(s) + lassoHtml(s) + lassoActsHtml(s) + dealHtml() + settingsHtml();
    wire();
    airUnder.style.height = `${mineGeom(handOf(s, mine(s)).length).barTop}px`;

    // ПЕРЕЕХАВШЕЕ — ЛЕТИТ. Запущенный перелёт прячет карту на месте, поэтому кадр рисуется ещё раз;
    // во втором проходе места те же, и нового перелёта не будет.
    const places = placesOf(s);
    let started = fly(places);
    // ПЕРЕМЕШИВАНИЕ В ОКНЕ КОЛОДЫ. У карт новые id, и перелёту не с чем сравнить: каждая карта прилетает на своё
    // место из чужого гнезда, как будто колоду перетасовали на глазах.
    if (shuffledInTip) {
      shuffledInTip = false;
      const inTip = [...places].filter(([, p]) => p.key.startsWith("deck:") && p.squash === 1);
      const order = shuffled(inTip.map((_, i) => String(i))).map(Number);
      inTip.forEach(([id, to], i) => launch(id, { ...inTip[order[i]!]![1], key: "shuffle" }, to));
      started ||= inTip.length > 0;
    }
    if (returning && places.has(returning.id)) {
      launch(returning.id, returning.from, places.get(returning.id)!);
      started = true;
    }
    returning = null;
    prevPlaces = places;
    paintCarries(s, places);
    if (started) draw();
  }

  /** Стопка для прогона жестов: сколько карт, где индикатор и верхняя, какие id и какие лицом. */
  function pileSpots(s: Snapshot, id: string, as: "deck" | "pile"): Record<string, unknown> {
    const pile = pileOf(s, id);
    const cards = pile?.cards ?? [];
    const round = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });
    const top = cards.length && view ? round(deckCarry(s, id) ?? view.toGlass(view.deckAt(id, cards.length - 1, cards.length))) : null;
    const out = {
      count: cards.length,
      spot: pile ? (({ id: _id, cards: _cards, shuffles: _shuffles, ...spot }) => spot)(pile) : null,
      grip: round(gripAt(s, id) ?? { x: -1, y: -1 }),
      face: cards.at(-1)?.up ? (cards.at(-1)!.face?.rank ?? null) : null,
      top,
      air: Boolean(deckCarry(s, id)),
      ids: cards.map((c) => c.id),
      up: cards.filter((c) => c.up).map((c) => c.id),
    };
    if (as === "pile") return out;
    return { deck: out.count, spot: out.spot, grip: out.grip, deckFace: out.face, deckTop: out.top, deckAir: out.air, deckIds: out.ids, deckUp: out.up };
  }

  /**
   * ГДЕ СТОЯТ СЛОВА — перед стулом, на стороне стола: точка между стулом и серединой, ровно к камере.
   * Размер — от зума, но читается и издалека.
   */
  function wordAnchors(s: Snapshot): WordAnchor[] {
    if (!view) return [];
    const v = view;
    return spots.flatMap((sp) => {
      const chair = chairOf(s, sp.key);
      const sitter = chair && sitterOf(s, chair);
      if (!sitter) return [];
      const middle = v.toGlass({ x: 0, y: 0 });
      const len = Math.hypot(middle.x - sp.x, middle.y - sp.y) || 1;
      const dir = { x: (middle.x - sp.x) / len, y: (middle.y - sp.y) / len };
      // Строка в LINE_MAX букв укладывается в ширину экрана.
      const size = Math.round(Math.max(12, Math.min(20, v.k * 0.32, (glass().w * 0.9) / (LINE_MAX * 0.78))));
      // Стопка растёт вверх: у стула, от которого середина ниже, низ стопки опущен на все её строки — иначе
      // слова легли бы на лицо.
      const reach = sp.r + 10 + Math.max(0, dir.y) * LINES_MAX * size * 1.35;
      return [{ key: sitter.key, x: sp.x + dir.x * reach, y: sp.y + dir.y * reach, size, ink: sitter.ink, dx: dir.x, dy: dir.y, seatX: sp.x, seatY: sp.y, unit: v.k }];
    });
  }

  // ── КАМЕРА И МОЙ СТУЛ ──────────────────────────────────────────────────────────────────────

  /**
   * СВОЙ СТУЛ — ВНИЗУ, И ЭТО ДЕЛАЕТ КАМЕРА, А НЕ РИСОВАНИЕ. Стол, стулья и карты у всех в одних осях
   * стола; у каждого зрителя камера по умолчанию повёрнута на угол его стула. Сел впервые — камера
   * встаёт сразу; пересел (или стул сдвинули) — доворачивается плавно, и то, что игрок накрутил сам,
   * до тех пор не трогается.
   */
  let aimedAt: { chair: string; angle: number } | null = null;
  function aimCamera(s: Snapshot): void {
    const chair = chairOf(s, mine(s));
    if (!chair) return;
    if (aimedAt && aimedAt.chair === chair.id && aimedAt.angle === chair.angle) return;
    if (!aimedAt) cam.camera.turnTo(chair.angle);
    else {
      cam.camera.glideTurnTo(chair.angle);
      redraw();
    }
    aimedAt = { chair: chair.id, angle: chair.angle };
  }

  /** Насколько камера ушла от своего стула — поворот коротким путём, в градусах. */
  function offSeat(s: Snapshot): number {
    const chair = chairOf(s, mine(s));
    if (!chair) return 0;
    const d = (((cam.camera.rotation - chair.angle) % 360) + 540) % 360 - 180;
    return Math.max(Math.abs(d), cam.camera.pitch);
  }

  /** КНОПКА «К СВОЕМУ СТУЛУ» — в правом верхнем углу кадра, только пока камера от него ушла. Стрелка смотрит на стул. */
  function homeHtml(s: Snapshot): string {
    const chair = chairOf(s, mine(s));
    if (!chair || offSeat(s) < 1.5) return "";
    const turn = chair.angle - cam.camera.rotation;
    return `<button data-home aria-label="К своему стулу" style="position:absolute;right:12px;top:calc(12px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px));width:40px;height:40px;border:0;padding:0;z-index:45;`
      + `border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;`
      + `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim}">`
      + `<svg viewBox="0 0 24 24" width="22" height="22" style="transform:rotate(${turn}deg)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`
      + `<path d="M12 4v14"/><path d="M6.5 12.5 12 18l5.5-5.5"/><path d="M8 21h8"/></svg></button>`;
  }

  /** ЗВУК ПО МЕСТУ — что поменялось между нарисованными кадрами, там, где это на экране. */
  function soundCues(prev: Snapshot, next: Snapshot, g: { w: number; h: number }): void {
    if (!view) return;
    const v = view;
    const own = performance.now() - touchedAt < MINE_MS;
    const seat = mine(next);
    const glassOf = (at: CueAt): { x: number; y: number } | null => {
      if ("felt" in at) return v.toGlass(at.felt);
      if ("pile" in at) {
        const p = pileOf(next, at.pile) ?? pileOf(prev, at.pile);
        return p ? v.toGlass(p) : null;
      }
      if (at.chair === seat) return { x: g.w / 2, y: g.h };
      const spot = spots.find((sp) => sp.key === at.chair);
      return spot ? { x: spot.x, y: spot.y } : null;
    };
    for (const [id, spot] of cueSpots(prev)) knownSpots.set(id, spot);
    for (const cue of cuesBetween(prev, next, knownSpots)) {
      const p = glassOf(cue.at);
      // Мерж и шафл звучат, пока идёт их анимация: перелёт карт в стопку, веер шафла.
      const cut = cue.kind === "merge" ? Math.max(60, motion.ms(FLIGHT_MS)) : cue.kind === "shuffle" ? SHUFFLE_MS + (SHUFFLE_CARDS - 1) * SHUFFLE_STAGGER_MS : undefined;
      if (p) sound.play(cue.kind, (p.x - g.w / 2) / (g.w / 2), (p.y - g.h / 2) / (g.h / 2), own, cut);
      // Вибрация — только своё: моё действие или что-то в моей руке, на моём стуле.
      if (own || ("chair" in cue.at && cue.at.chair === seat)) buzzCue(cue.kind, cut);
    }
  }

  function buzzCue(kind: CueKind, cut?: number): void {
    if (kind === "shuffle") {
      // Шафл — серия лёгких тиков, пока идёт веер.
      for (let t = 0; t < (cut ?? 0); t += SHUFFLE_TICK_MS) window.setTimeout(() => haptic.buzz("light"), t);
      return;
    }
    haptic.buzz(CUE_HAPTIC[kind]);
  }

  /** Карта в строке, как её вижу я: лицо — только если я его вижу, в цвете масти моего вида колоды. */
  function cardMention(s: Snapshot, id: string): { label: string; ink: string } {
    const all = [...s.felt, ...s.piles.flatMap((p) => p.cards), ...s.chairs.flatMap((c) => c.hand)];
    const card = all.find((c) => c.id === id);
    const mineHand = handOf(s, mine(s)).some((c) => c.id === id);
    const face = card?.face && (card.up || mineHand) ? card.face : undefined;
    if (!face) return { label: "🂠", ink: MENTION_INK.back };
    if (face.rank === "JK") return { label: look.cyrillic ? "ДЖ" : "JK", ink: face.suit === "b" ? MENTION_INK.black : MENTION_INK.red };
    const rank = look.cyrillic ? ({ J: "В", Q: "Д", K: "К", A: "Т" } as Record<string, string>)[face.rank] ?? face.rank : face.rank;
    const suit = face.suit as "s" | "h" | "d" | "c";
    const ink = look.fourColour ? MENTION_INK.four[suit] : suit === "h" || suit === "d" ? MENTION_INK.red : MENTION_INK.black;
    return { label: `${rank}${SUITS[suit][0]}`, ink };
  }

  /** НАСТРОЙКИ — шестерёнка сверху; окно — своим слоем (`settings.ts`). */
  function settingsHtml(): string {
    const plate = `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim}`;
    const gear = `<button data-settings aria-label="Настройки" aria-expanded="${settings.open}" style="position:absolute;left:12px;top:calc(12px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px));width:40px;height:40px;border:0;padding:0;z-index:61;`
      + `border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;${plate}">`
      + `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`
      + `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>`;
    // ПЛАШКА С ИМЕНЕМ КОМНАТЫ — шапку Telegram не поменять, она из BotFather; имя стола висит своей плашкой.
    const name = `<div data-table-name style="position:absolute;left:60px;right:12px;top:calc(12px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px));height:40px;z-index:60;`
      + `display:flex;align-items:center;justify-content:center;pointer-events:none"><span style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`
      + `padding:0 12px;border-radius:12px;font:400 13px Tiny5,monospace;color:${T.ink};line-height:28px;${plate}">${escape(store.title)}</span></div>`;
    return gear + name;
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
    // КАРТА СТОПКИ — своё место в стопке (`deck:стопка:i`): переставили, отсортировали, перевернули — место сменилось,
    // и она летит. В открытом окне стопки — там, в веере; окно открыли или закрыли — это не переезд, ключ тот же.
    const tipGaps = deckGaps(s);
    const openPile = local.deckTip === null ? undefined : pileOf(s, local.deckTip);
    const tipGeom = openPile ? deckTipGeom(s, openPile.cards.length + tipGaps.length) : null;
    for (const pile of s.piles) {
      // Место карты в веере окна — среди карт и щелей, как их раскладывает окно.
      const row: (SeenCard | Gap)[] = [...pile.cards];
      if (tipGeom?.pile.id === pile.id) for (const gap of tipGaps) row.splice(Math.max(0, Math.min(row.length, gap.index)), 0, gap);
      pile.cards.forEach((c, i) => {
        const face = c.up ? c.face : undefined;
        const key = `deck:${pile.id}:${i}`;
        if (tipGeom?.pile.id !== pile.id) return out.set(c.id, onDesk(key, v.deckAt(pile.id, i, pile.cards.length), 1, pile.angle, face));
        const slot = tipGeom.slots[row.indexOf(c)]!;
        out.set(c.id, { key, x: slot.x, y: slot.y, w: tipGeom.box.cw, h: tipGeom.box.ch, angle: slot.angle, squash: 1, face });
      });
    }
    for (const f of s.felt) out.set(f.id, onDesk(`felt:${f.x.toFixed(2)},${f.y.toFixed(2)},${f.angle}`, v.feltAt(f.id) ?? f, 1, f.angle, f.up ? f.face : undefined));
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
      if (!at) continue;
      out.set(c.id, at);
      // Стянутые к чужому пальцу — под ведущей картой: сюда они летят со своих мест.
      (c.with ?? []).forEach((w, i) => out.set(w.card.id, { ...at, x: at.x - (i + 1) * 3, y: at.y + (i + 1) * 3, face: undefined }));
    }
    // Стянутые к моему пальцу — туда, где висит карта хвата.
    if (drag) {
      const d = drag;
      const finger: Place = { key: "finger", x: d.x - d.gx + d.w / 2, y: d.y - d.gy - d.h * CARRY_CLEAR + d.h / 2, w: d.w, h: d.h, angle: 0, squash: 1 };
      massFlock().forEach((id, i) => out.set(id, { ...finger, x: finger.x - (i + 1) * 3, y: finger.y + (i + 1) * 3 }));
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
    if (over.in === "deck") {
      const n = pileOf(s, over.pile)?.cards.length ?? 0;
      return onDesk(v.deckAt(over.pile, n, n + 1), 0);
    }
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
      const person = s.people.find((p) => p.key === c.by);
      const who = person?.name ?? "";
      const flock = Math.min(c.with?.length ?? 0, 4);
      const look = `${Math.round(at.w)}|${c.card.face?.rank}${c.card.face?.suit}|${ink}|${who}|${person?.photo ? 1 : 0}|${c.with?.length ?? 0}`;
      if (el.dataset.look !== look) {
        el.dataset.look = look;
        el.dataset.flock = String(c.with?.length ?? 0);
        el.innerHTML = Array.from({ length: flock }, (_, i) => `<div data-g="carried-flock" style="position:absolute;left:${-(flock - i) * 3}px;top:${(flock - i) * 3}px;width:${at.w}px;height:${at.h}px">${cardHtml(undefined, at.w)}</div>`).join("")
          + `<div data-g="carried" style="position:absolute;left:0;top:0;width:${at.w}px;height:${at.h}px;border-radius:${at.w * 0.12}px;`
          + `box-shadow:0 0 0 3px ${ink},0 ${Math.round(at.h * 0.12)}px 0 rgba(11,7,4,.45)">${cardHtml(c.card.face, at.w)}</div>`
          // КУРСОР ТОГО, КТО НЕСЁТ: стрелка в его цвете, рядом — лицо и имя. У бота — его аватар.
          + `<svg data-g="pointer" width="18" height="18" viewBox="0 0 18 18" style="position:absolute;left:${at.w * 0.55}px;top:${at.h * 0.6}px">`
          + `<path d="M2 1 L2 15 L6 11 L9 17 L11.5 16 L8.5 10 L14 10 Z" fill="${ink}" stroke="${T.black}" stroke-width="1.5" stroke-linejoin="round"/></svg>`
          + `<span style="position:absolute;left:${at.w * 0.55 + 14}px;top:${at.h * 0.6 + 14}px;display:flex;align-items:center;gap:4px;white-space:nowrap">`
          + (person?.photo ? `<img data-g="who-face" src="${escape(person.photo)}" alt="" style="width:18px;height:18px;border-radius:50%;box-shadow:0 0 0 2px ${ink},0 0 0 3px ${T.black}">` : "")
          + `<span data-g="who" style="font:400 11px Tiny5,monospace;color:${T.black};background:${ink};border-radius:6px;padding:2px 6px;box-shadow:0 0 0 2px ${T.black}">${escape(who)}</span></span>`;
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
    // «Меньше анимаций» — карта сразу на месте.
    const flightMs = motion.ms(FLIGHT_MS);
    if (flightMs === 0) return;
    // ПОВОРОТ КОРОТКИМ ПУТЁМ: 170° и -190° — одна поза, и лететь между ними нечего крутить.
    from = { ...from, angle: to.angle + (((((from.angle - to.angle) % 360) + 540) % 360) - 180) };
    const layer = [from.key, to.key].some((key) => key.startsWith(`hand:${mine()}:`)) ? airUnder : air;
    for (const one of [air, airUnder]) one.querySelector(`[data-flight="${id}"]`)?.remove();
    flying.add(id);
    const el = document.createElement("div");
    el.dataset.flight = id;
    el.style.cssText = `position:absolute;left:0;top:0;width:${to.w}px;height:${to.h}px;transform-origin:50% 50%;transform:${poseCss(from, to)}`;
    // ПЕРЕВОРОТ В ПОЛЁТЕ: откуда вылетела лицом, а ляжет рубашкой (или наоборот) — ребром на полпути.
    const turns = !sameFace(from.face, to.face);
    el.innerHTML = cardHtml(turns ? from.face : to.face, to.w);
    layer.append(el);
    const mid: Place = { ...to, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, w: (from.w + to.w) / 2, h: (from.h + to.h) / 2, angle: (from.angle + to.angle) / 2, squash: (from.squash + to.squash) / 2 };
    const frames = turns
      ? [{ transform: poseCss(from, to) }, { transform: poseCss(mid, to, 0.02), offset: 0.5 }, { transform: poseCss(to, to) }]
      : [{ transform: poseCss(from, to) }, { transform: poseCss(to, to) }];
    const run = el.animate(frames, { duration: flightMs, easing: "cubic-bezier(.2,.7,.3,1)" });
    if (turns) setTimeout(() => (el.innerHTML = cardHtml(to.face, to.w)), flightMs / 2);
    run.onfinish = () => {
      if (el.isConnected) el.remove();
      if (!air.querySelector(`[data-flight="${id}"]`) && !airUnder.querySelector(`[data-flight="${id}"]`)) flying.delete(id);
      draw();
    };
  }

  /**
   * ПЕРЕМЕШИВАНИЕ У ЗРИТЕЛЯ — колода расходится двумя половинками и сходится обратно, несколько раз. Это
   * картинка, а не ход: колода на сервере уже перемешана, у всех карт новые id.
   */
  const seenShuffles = new Map<string, number>();
  /** Перемешали при открытом окне колоды: в следующем кадре карты в нём разлетаются по новым местам. */
  let shuffledInTip = false;
  function playShuffle(s: Snapshot, id: string): void {
    const n = pileOf(s, id)?.cards.length ?? 0;
    // Веер — только картинка: колода на сервере уже перемешана. «Меньше анимаций» — без него.
    if (!view || n === 0 || motion.reduce) return;
    const at = view.toGlass(view.deckAt(id, n - 1, n));
    const w = FELT_CARD.w * view.k, h = FELT_CARD.h * view.k;
    for (let i = 0; i < SHUFFLE_CARDS; i += 1) {
      const el = document.createElement("div");
      el.dataset.shuffle = String(i);
      const side = i % 2 === 0 ? -1 : 1;
      const out = `translate(${at.x - w / 2 + side * w * 0.62}px,${at.y - h / 2 - i * 1.2}px) scale(1,${view.squash}) rotate(${side * 8}deg)`;
      const home = `translate(${at.x - w / 2}px,${at.y - h / 2 - i * 0.6}px) scale(1,${view.squash})`;
      el.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform:${home}`;
      el.innerHTML = cardHtml(undefined, w);
      air.append(el);
      const run = el.animate([{ transform: home }, { transform: out, offset: 0.25 }, { transform: home, offset: 0.5 }, { transform: out, offset: 0.75 }, { transform: home }], {
        duration: SHUFFLE_MS,
        delay: i * SHUFFLE_STAGGER_MS,
        easing: "ease-in-out",
      });
      run.onfinish = () => el.remove();
    }
  }

  function face(p: Person): string {
    if (!images[p.key]) {
      // Ждать загрузки не нужно: `ready` ждёт лица тех, кто был за столом при входе.
      const img = new Image();
      img.onload = () => draw();
      img.src = p.photo!;
      images[p.key] = img;
    }
    return p.key;
  }

  // ── ЖЕСТ ────────────────────────────────────────────────────────────────────────────────────

  /** Куда целится то, что сейчас в воздухе: карта в пальце или стопка за индикатором. */
  function aiming(): Aim | null {
    return drag ? drag.target : (gripPress?.moved && gripPress.target) || null;
  }

  /**
   * `mid` — середина несомого на стекле (для стопки — стопка в воздухе); `skip` — несомая стопка: в саму себя не
   * целятся. Без них — карта в пальце.
   */
  function aimAt(x: number, y: number, mid?: { x: number; y: number }, skip?: string): Aim {
    const s = seen();
    // В ОКНО СТОПКИ — место по пальцу, как в окне руки; под локом — наверх; приёмка закрыта — назад.
    const tipPile = local.deckTip === null ? undefined : pileOf(s, local.deckTip);
    const deckTipBox = tipPile && deckTipGeom(s, tipPile.cards.length + 1);
    if (deckTipBox && deckTipBox.pile.id !== skip) {
      const b = deckTipBox.box;
      const pile = deckTipBox.pile;
      if (x >= b.left && x <= b.left + b.w && y >= b.top && y <= b.top + b.height) {
        if (pile.shut) return { kind: "back" };
        const room = pile.cards.length;
        return { kind: "deckAt", pile: pile.id, index: pile.lock ? room : Math.max(0, Math.min(room, deckTipBox.slots.filter((sl) => sl.x < x).length)) };
      }
    }
    for (const key of local.tips) {
      const spot = spots.find((sp) => sp.key === key);
      // Под замком рука стула палец не принимает — карта летит мимо, на сукно.
      if (!spot || closed(s, key)) continue;
      const room = handOf(s, key).length;
      const geom = tipGeom(key, spot, room + 1);
      const box = geom.box!;
      if (x >= box.left && x <= box.left + box.w && y >= box.top && y <= box.top + box.height) {
        return { kind: "hand", which: key, index: poseOf(s, key).shrink ? room : slotAt(geom, x, room) };
      }
    }
    const room = handOf(s, mine(s)).length;
    const geom = mineGeom(room + 1);
    // Рука принимает ровно там, где горит её зона: верх карт и поле над ними (`handZoneHtml`).
    const top = geom.slots.reduce((m, sl) => Math.min(m, sl.y - geom.h / 2), Infinity) - geom.h * 0.12;
    if (y >= top && x >= 0 && x <= glass().w) return { kind: "hand", which: mine(s), index: poseOf(s, mine(s)).shrink ? room : slotAt(geom, x, room) };
    // В СТОПКУ — если середина несомой карты над её зоной. Раньше стула: колода, придвинутая к стулу, лежит
    // перед ним, и целятся в неё. Одиночная карта на сукне карту не принимает.
    const d = drag;
    const centre = mid ?? { x: x - d!.gx + d!.w / 2, y: y - d!.gy - d!.h * CARRY_CLEAR + d!.h / 2 };
    // Стопки сверху вниз: верхняя из накрывающих друг друга принимает первой.
    for (const pile of [...s.piles].reverse()) {
      if (pile.id === skip) continue;
      const zone = deckZone(pile);
      if (zone && centre.x >= zone.left && centre.x <= zone.right && centre.y >= zone.top && centre.y <= zone.bottom) return pile.shut ? { kind: "back" } : { kind: "deck", pile: pile.id };
    }
    // НА СТУЛ — в руку его стула, в конец. Под локом стул карту не берёт: она вернётся, откуда взята.
    const chair = chairUnder(s, x, y);
    if (chair) return closed(s, chair.key) ? { kind: "back" } : { kind: "chair", which: chair.key };
    // НА СУКНО — туда, где середина несомой карты, а не где палец: за неё и держат.
    return { kind: "felt", at: d ? view!.toDesk({ x: x - d.gx + d.w / 2, y: y - d.gy + d.h / 2 }) : view!.toDesk(centre) };
  }

  const sameAim = (a: Aim, b: Aim) => {
    if (a.kind === "hand" && b.kind === "hand") return a.which === b.which && a.index === b.index;
    if (a.kind === "chair" && b.kind === "chair") return a.which === b.which;
    if (a.kind === "deckAt" && b.kind === "deckAt") return a.pile === b.pile && a.index === b.index;
    if (a.kind === "deck" && b.kind === "deck") return a.pile === b.pile;
    return a.kind === b.kind && a.kind !== "hand" && a.kind !== "chair" && a.kind !== "deck" && a.kind !== "deckAt";
  };

  /** Что под пальцем на сукне: сверху вниз, и с колоды — только верхняя. */
  function feltPick(x: number, y: number): { card: SeenCard; at: { x: number; y: number }; up: boolean; pile?: string } | null {
    if (!view) return null;
    // ПАЛЕЦ БЕРЁТ ТО, ЧТО НАРИСОВАНО: положенная, но ещё не подтверждённая карта уже не на колоде — под ней следующая.
    const s = seen();
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
    const below = new Set(s.piles.flatMap((p) => p.below));
    for (let i = s.felt.length - 1; i >= 0; i -= 1) {
      const one = s.felt[i]!;
      const at = view.feltAt(one.id) ?? one;
      if (!one.under && !below.has(one.id) && over(at, one.angle)) return { card: one, at, up: one.up };
    }
    for (const pile of [...s.piles].reverse()) {
      const top = pile.cards.at(-1);
      const deckTop = view.deckAt(pile.id, pile.cards.length - 1, pile.cards.length);
      // Приёмка закрыта — из стопки не взять и верхнюю: палец по ней не берёт, но и сукно под ней не отдаёт.
      if (top && over(deckTop, pile.angle)) return pile.shut ? null : { card: top, at: deckTop, up: top.up === true, pile: pile.id };
    }
    // Под стопкой — только там, где стопка её не накрывает.
    for (let i = s.felt.length - 1; i >= 0; i -= 1) {
      const one = s.felt[i]!;
      const at = view.feltAt(one.id) ?? one;
      if ((one.under || below.has(one.id)) && over(at, one.angle)) return { card: one, at, up: one.up };
    }
    return null;
  }

  /** Поднять. Экран снимает карту сразу, намерение уходит следом; отказ вернёт её на место. */
  function lift(card: SeenCard, shown: boolean, box: { left: number; top: number; w: number; h: number }, e: PointerEvent, target: Aim) {
    if (store.state.locks[card.id] && store.state.locks[card.id] !== me()) return;
    const picked = truth().picks?.[card.id];
    if (picked !== undefined && picked !== me()) return;
    // Своя карта, брошенная и ещё не подтверждённая, взятая снова, — с того места, где нарисована.
    const from = whereIs(seen(), card.id) ?? whereIs(store.state, card.id);
    if (!from) return;
    drag = {
      from,
      card, shown, w: box.w, h: box.h,
      gx: e.clientX - box.left, gy: e.clientY - box.top, x: e.clientX, y: e.clientY, target,
      hold: window.setInterval(() => store.send({ t: "hold", id: card.id }), HOLD_EVERY_MS),
      toldAt: 0,
      sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false,
    };
    // КУРСОР ЛАССО ПО ВЫДЕЛЕННОЙ КАРТЕ — хват всей массы.
    if (lassoOn() && local.tool === "cursor" && truth().picks?.[card.id] === me() && myPicks(truth()).length > 1) drag.mass = true;
    liftedBy = e.pointerId;
    haptic.buzz("light");
    store.send({ t: "grab", id: card.id });
    tellCarry();
    draw();
  }

  /**
   * КАСАНИЕ В ИНСТРУМЕНТЕ ЛАССО. Тап по карте — выделить или снять; протяжка — петля по сукну: всё, что внутри,
   * выделяется. `pts` — точки петли на стекле; `card` — карта под пальцем в начале (для тапа).
   */
  let press: { pid: number; sx: number; sy: number; t0: number; card?: string; fromFelt?: boolean; pts: { x: number; y: number }[] } | null = null;

  /** Одиночные карты на сукне, чья середина внутри петли: стопки не выделяются вовсе. */
  function insideLasso(s: Snapshot, pts: { x: number; y: number }[]): string[] {
    if (!view || pts.length < 3) return [];
    const v = view;
    const inside = (p: { x: number; y: number }) => {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i]!, b = pts[j]!;
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    };
    return s.felt.filter((f) => inside(v.toGlass(v.feltAt(f.id) ?? f))).map((f) => f.id);
  }

  /** Петля лассо на экране — пунктир в моём цвете, замкнутый. */
  function lassoHtml(s: Snapshot): string {
    if (!press || press.pts.length < 2) return "";
    const ink = inkOf(s, me());
    const path = press.pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ");
    return `<svg data-g="lasso" style="position:absolute;inset:0;width:100%;height:100%;z-index:65;pointer-events:none">`
      + `<polygon points="${path}" fill="color-mix(in srgb, ${ink} 14%, transparent)" stroke="${T.black}" stroke-width="5" stroke-linejoin="round"/>`
      + `<polygon points="${path}" fill="none" stroke="${ink}" stroke-width="2.5" stroke-dasharray="7 5" stroke-linejoin="round"/></svg>`;
  }

  addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.pid) return;
    if (press.pts.length === 0 && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) <= TAP_PX) return;
    // Петлю рисуют только с сукна: палец, начавший на карте руки или окна, петлю не тянет.
    if (press.card !== undefined && press.pts.length === 0 && !press.fromFelt) return;
    if (press.pts.length === 0) press.pts.push({ x: press.sx, y: press.sy });
    press.pts.push({ x: e.clientX, y: e.clientY });
    draw();
  }, { passive: true });
  const endPress = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pid) return;
    const was = press;
    press = null;
    if (e.type === "pointercancel") return draw();
    if (was.pts.length >= 3) {
      const s = truth();
      const ids = insideLasso(seen(), was.pts).filter((id) => s.picks?.[id] === undefined && (!s.locks[id] || s.locks[id] === me()));
      guessPick(ids, true);
    } else if (was.card !== undefined && was.pts.length === 0 && performance.now() - was.t0 < TAP_MS) togglePick(was.card);
    draw();
  };
  addEventListener("pointerup", endPress);
  addEventListener("pointercancel", endPress);

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
    const s = seen();
    // ИНСТРУМЕНТ ЛАССО не берёт карты: касание карты — только тап-выделение.
    if (lassoOn() && local.tool === "lasso") {
      press = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, t0: performance.now(), card: id, pts: [] };
      return;
    }
    if (owner === "deck") {
      const pile = pileOf(s, el.dataset.pile ?? "");
      const index = pile ? pile.cards.findIndex((c) => c.id === id) : -1;
      const geom = pile && local.deckTip === pile.id ? deckTipGeom(s, pile.cards.length) : null;
      if (!pile || index < 0 || !geom || pile.shut || (pile.lock && index !== pile.cards.length - 1)) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const card = pile.cards[index]!;
      // Из стопки — как лежит: рубашкой вытянута, рубашкой и ляжет; лицом к хозяину её повернёт только рука.
      lift(card, card.up === true && card.face !== undefined, { left: cx - geom.box.cw / 2, top: cy - geom.box.ch / 2, w: geom.box.cw, h: geom.box.ch }, e, { kind: "deckAt", pile: pile.id, index });
      try { el.setPointerCapture?.(e.pointerId); } catch { /* пальца уже нет */ }
      return;
    }
    const index = handOf(s, owner).findIndex((c) => c.id === id);
    if (index < 0) return;
    // РАЗМЕР — У ГЕОМЕТРИИ, СЕРЕДИНА — У ЭЛЕМЕНТА: рамка повёрнутой карты шире её самой.
    if (closed(s, owner)) return;
    const geom = owner === mine(s) ? mineGeom(handOf(s, owner).length) : tipGeom(owner, spots.find((sp) => sp.key === owner)!, handOf(s, owner).length);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const card = handOf(s, owner)[index]!;
    lift(card, card.face !== undefined && !card.up, { left: cx - geom.w / 2, top: cy - geom.h / 2, w: geom.w, h: geom.h }, e, { kind: "hand", which: owner, index });
    try { el.setPointerCapture?.(e.pointerId); } catch { /* пальца уже нет */ }
  }

  /** Куда ляжет карта, если отпустить сейчас, — место словами контракта. */
  function landing(d: Drag): Where {
    const aim = d.target;
    if (aim.kind === "hand") return { in: "hand", chair: aim.which, i: aim.index };
    if (aim.kind === "chair") return { in: "hand", chair: aim.which, i: handOf(store.state, aim.which).length };
    if (aim.kind === "back") return d.from;
    if (aim.kind === "deck") return { in: "deck", pile: aim.pile };
    if (aim.kind === "deckAt") return { in: "deck", pile: aim.pile, i: aim.index };
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
    const flock = massFlock();
    store.carry({ id: drag.card.id, over: landing(drag), ...(flock.length ? { with: flock } : {}) });
  }

  function moveDrag(e: PointerEvent) {
    if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > TAP_PX) drag.moved = true;
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
    if (aim.kind === "felt" && mark && drag.markKind === "felt" && view && !massShift(drag)) {
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
    // ТАП ПО КАРТЕ — НА СТОЛЕ, В КОЛОДЕ ИЛИ В РУКЕ — не ход: карта отпускается, где лежала, и открывается её тултип.
    // Тап по той же карте, чей тултип был открыт, его только закрывает.
    if (!d.moved && performance.now() - d.t0 < TAP_MS) {
      store.send({ t: "release", id: d.card.id });
      // В ЛАССО тап выделяет, а не открывает тултип и не переворачивает.
      if (lassoOn()) {
        togglePick(d.card.id);
        return draw();
      }
      // ДВОЙНОЙ ТАП — переворот. Первый тап уже открыл тултип; второй его не трогает.
      const at = performance.now();
      if (lastTap?.id === d.card.id && at - lastTap.at < DOUBLE_TAP_MS) {
        lastTap = null;
        turnCard(d.card.id);
        return draw();
      }
      lastTap = { id: d.card.id, at };
      const key = tipKeyOf(store.state, d.card.id);
      if (tipAtDown !== d.card.id && key) cardTip = { id: d.card.id, key };
      return draw();
    }
    if (d.target.kind === "back") {
      returning = {
        id: d.card.id,
        from: { key: "finger", x: d.x - d.gx + d.w / 2, y: d.y - d.gy - d.h * CARRY_CLEAR + d.h / 2, w: d.w, h: d.h, angle: 0, squash: 1, face: d.shown ? d.card.face : undefined },
      };
      store.send({ t: "release", id: d.card.id });
      return draw();
    }
    if (d.mass) {
      dropMass(d);
      return draw();
    }
    const to = landing(d);
    const from = whereIs(store.state, d.card.id);
    if (from) {
      const keepsFace = (to.in === "hand" && to.chair === mine()) || (to.in === "felt" && to.up) || (to.in === "deck" && deckSide(store.state, to.pile, d.card.id, d.shown));
      const card: SeenCard = keepsFace && d.card.face ? { id: d.card.id, face: d.card.face, ...(to.in === "deck" ? { up: true } : {}) } : { id: d.card.id };
      pendings = [...pendings.filter((one) => one.id !== d.card.id), { id: d.card.id, from, to, card, sawLock: store.state.locks[d.card.id] === me() }];
      store.send({ t: "drop", id: d.card.id, to });
    }
    draw();
  }

  /**
   * СВАЙП ВНИЗ НЕ ЗАКРЫВАЕТ MINI APP, И КОГДА ТЯНУТ КАРТУ ИЗ РУКИ ИЛИ ОКНА. Нажатие перерисовывает `over`, и
   * элемент под пальцем отрывается от документа ещё до первого касания: все касания дальше приходят в
   * оторванное поддерево и до слушателя документа (`main.ts`) не всплывают. Поэтому отмена висит на
   * каждом верхнем элементе разметки — оторванный уносит её с собой.
   */
  const keepPage = (e: Event) => e.preventDefault();

  function wire() {
    for (const el of over.querySelectorAll<HTMLElement>("[data-home]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const chair = chairOf(store.state, mine());
        if (!chair) return;
        cam.camera.glideTurnTo(chair.angle);
        cam.camera.glideTiltTo(0);
        redraw();
      };
    }
    for (const el of over.children) {
      el.addEventListener("touchmove", keepPage, { passive: false });
    }
    // 💬 — ЗАЖАЛ И ПОВЁЛ: жест голосового. Тап по ней (без жеста) по-прежнему открывает клавиатуру.
    for (const el of over.querySelectorAll<HTMLElement>('[data-section="say"]')) {
      el.onpointerdown = (e) => {
        if (!chairOf(truth(), mine(truth()))) return;
        e.stopPropagation();
        local.mic = { phase: "hold", x: e.clientX, y: e.clientY, rec: null, began: performance.now() };
        // СЕКУНДА УДЕРЖАНИЯ — и пошла запись. Палец ушёл раньше — таймер снимается, записи не было.
        const held = setTimeout(() => void beginMic(), MIC_HOLD_MS);
        // ПАЛЕЦ СЛУШАЕТ ОКНО, А НЕ КНОПКУ: разметка пересобирается каждым кадром, и кнопка под пальцем уже не та.
        const move = (ev: PointerEvent) => {
          const m = local.mic;
          if (!m) return;
          m.x = ev.clientX;
          m.y = ev.clientY;
          draw();
        };
        const up = (ev: PointerEvent) => {
          clearTimeout(held);
          removeEventListener("pointermove", move);
          removeEventListener("pointerup", up);
          removeEventListener("pointercancel", up);
          const m = local.mic;
          if (!m) return;
          // Тап — короткое касание без записи: открывает клавиатуру, как раньше.
          const tap = m.phase === "hold" && performance.now() - m.began < MIC_HOLD_MS;
          void endMic(ev.clientX, ev.clientY, tap);
        };
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
        addEventListener("pointercancel", up);
        draw();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-section]")) {
      el.onclick = (e) => {
        e.stopPropagation();
        const sec = el.dataset.section as Section;
        if (sec === "say") return;
        local.sectionFrom = local.section;
        local.section = local.section === sec ? null : sec;
        // ВХОД В ЛАССО — инструментом лассо. ВЫХОД — выделение снято.
        if (local.section === "lasso" && local.sectionFrom !== "lasso") local.tool = "lasso";
        if (local.sectionFrom === "lasso" && local.section !== "lasso") unpickAll();
        local.sectionAt = performance.now();
        local.confirmLeave = false;
        draw();
        // Перелёт кнопок — анимация браузера; кадр в конце убирает улетевшие копии.
        setTimeout(redraw, SECTION_MS + 150);
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-bar]")) {
      el.onclick = (e) => {
        e.stopPropagation();
        const what = el.dataset.bar as BarKey;
        const s = truth();
        const seat = chairOf(s, mine(s));
        if (what === "cursor" || what === "lasso") local.tool = what;
        else if (what === "grab") local.grab = local.grab === "collect" ? "keep" : "collect";
        else if (what === "side") local.side = local.side === "keep" ? "down" : local.side === "down" ? "up" : "keep";
        else if (what === "leave") local.confirmLeave = !local.confirmLeave;
        else if (!seat) return;
        else if ((RIGHTS as readonly string[]).includes(what)) return guessFlag(seat.id, what as ChairFlag, !seat[what as ChairFlag]);
        else if ((FOLDS as readonly string[]).includes(what)) return guessPose(seat.id, what as keyof Pose, !seat.pose[what as keyof Pose]);
        else return guessOrder(what as Arrange);
        draw();
      };
    }
    // КНОПКИ КРУПЬЕ — команда столу, как из бота; «раздать» открывает своё окно.
    for (const el of over.querySelectorAll<HTMLElement>("[data-croupier]")) {
      el.onclick = (e) => {
        e.stopPropagation();
        const what = el.dataset.croupier;
        if (what === "deal") local.deal = { rule: "each", n: 6, all: false, skipEmpty: false };
        else if (what === "collect") store.command({ t: "collect" });
        else if (what === "shuffle") store.command({ t: "shuffle" });
        else if (what === "remove") store.command({ t: "croupier", on: false });
        draw();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-deal-panel] button")) {
      el.onclick = (e) => {
        e.stopPropagation();
        const d = local.deal;
        if (!d) return;
        const { dealRule, dealN } = el.dataset;
        if (el.dataset.dealShut !== undefined) local.deal = null;
        else if (dealRule) d.rule = dealRule as typeof d.rule;
        else if (dealN) {
          d.n = Number(dealN);
          d.all = false;
        } else if (el.dataset.dealAll !== undefined) d.all = !d.all;
        else if (el.dataset.dealEmpty !== undefined) d.skipEmpty = !d.skipEmpty;
        else if (el.dataset.dealGo !== undefined) {
          // «Все по одной» — это раздача по одной карте до конца колоды: правило `each` без числа.
          store.command({
            t: "deal",
            rule: d.rule,
            ...(d.rule === "each" || d.rule === "durak" ? (d.all ? { n: 1 } : { n: d.n }) : {}),
            ...(d.skipEmpty ? { skipEmpty: true } : {}),
            force: true,
          });
          local.deal = null;
        }
        draw();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-lasso-act]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        lassoAct(el.dataset.lassoAct as (typeof LASSO_ACTS)[number][0]);
        draw();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-settings]")) {
      el.onclick = (e) => {
        e.stopPropagation();
        settings.show();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-stand]")) {
      el.onclick = (e) => {
        e.stopPropagation();
        local.confirmLeave = false;
        store.send({ t: "stand" });
        draw();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-pose]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const chair = chairOf(truth(), el.dataset.chair!);
        const k = el.dataset.pose as keyof Pose;
        if (chair) guessPose(chair.id, k, !chair.pose[k]);
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-flag]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const chair = chairOf(truth(), el.dataset.chair!);
        const flag = el.dataset.flag as ChairFlag;
        if (chair) guessFlag(chair.id, flag, !chair[flag]);
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
    for (const el of over.querySelectorAll<HTMLElement>("[data-mute]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const key = el.dataset.mute!;
        if (muted.has(key)) muted.delete(key);
        else {
          muted.add(key);
          talk.muted(key);
        }
        writeMuted(muted);
        draw();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-voice-mute]")) {
      el.onclick = (e) => {
        e.stopPropagation();
        const key = el.dataset.voiceMute!;
        if (voiceMuted.has(key)) voiceMuted.delete(key);
        else voiceMuted.add(key);
        writeMuted(voiceMuted, VOICE_MUTED_KEY);
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
    for (const el of over.querySelectorAll<HTMLElement>('[data-g="deck-grip"]')) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pile = pileOf(store.state, el.dataset.pile ?? "");
        if (!view || !pile || drag || gripPress) return;
        const home = view.toGlass(pile);
        gripPress = { pile: pile.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false, off: { x: e.clientX - home.x, y: e.clientY - home.y } };
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-deck-do]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (local.deckTip !== null) store.send({ t: "deckDo", pile: local.deckTip, how: el.dataset.deckDo as DeckDo });
      };
    }
    for (const [sel, guard] of [["[data-deck-lock]", "lock"], ["[data-deck-accept]", "shut"], ["[data-deck-seal]", "seal"]] as const) {
      for (const el of over.querySelectorAll<HTMLElement>(sel)) {
        el.onpointerdown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const pile = local.deckTip === null ? undefined : pileOf(truth(), local.deckTip);
          if (pile) guessDeckFlag(pile.id, guard, !pile[guard]);
        };
      }
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-deck-lock-status],[data-deck-accept-status],[data-deck-seal-status],[data-deck-do-status]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-deck-pin]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pile = local.deckTip === null ? undefined : pileOf(truth(), local.deckTip);
        if (pile) guessDeckFlag(pile.id, "pin", !pile.pin);
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-deck-pin-status]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-deck-forever]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pile = local.deckTip === null ? undefined : pileOf(truth(), local.deckTip);
        if (pile) guessDeckFlag(pile.id, "forever", !pile.forever);
      };
    }
    for (const el of over.querySelectorAll<HTMLElement>("[data-deck-shut]")) {
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        local.deckTip = null;
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
    const now = performance.now();
    guesses = guesses.filter((g) => now - g.at < GUESS_MS && !(store.state.v > g.v && g.settled(store.state)));
    pendings = pendings.filter((one) => {
      if (store.state.locks[one.id] === me()) one.sawLock = true;
      else if (one.sawLock) return false;
      return true;
    });
    // ВЗЯТОЕ У МЕНЯ ИЗ-ПОД ПАЛЬЦА: блокировка истекла и карту взял другой — отпускаю.
    if (drag && store.state.locks[drag.card.id] && store.state.locks[drag.card.id] !== me()) {
      clearInterval(drag.hold);
      drag = null;
    }
    draw();
  });

  store.onRefused((intent: Intent) => {
    // ОТКАЗ — догадка снимается, и нарисованное возвращается к тому, что на столе.
    // Узнаётся по виду намерения и стулу, а не по тексту целиком: сервер возвращает то, что до него дошло.
    const chairOfIntent = (i: Intent) => ("chair" in i ? i.chair : "pile" in i ? i.pile : undefined);
    guesses = guesses.filter((g) => g.intent.t !== intent.t || chairOfIntent(g.intent) !== chairOfIntent(intent));
    if (intent.t === "grab" && drag?.card.id === intent.id) {
      clearInterval(drag.hold);
      drag = null;
    }
    if (intent.t === "drop") pendings = pendings.filter((one) => one.id !== intent.id);
    draw();
  });

  /**
   * ТУЛТИП КАРТЫ ПЕРЕЖИВАЕТ ТОЛЬКО КАМЕРУ. Любое другое касание — тап по сукну, стулу, кнопке, самому
   * тултипу, хват карты — закрывает его, когда палец отпущен. Слушатели в фазе захвата у окна: они
   * срабатывают раньше всего остального и ничего не отменяют — касание делает то, что сделало бы без тултипа.
   */
  let tipAtDown: string | null = null;
  let liftedBy: number | null = null;
  const presses = new Map<number, { x: number; y: number; onFelt: boolean; moved: boolean }>();
  let manyFingers = false;
  addEventListener("pointerdown", (e) => {
    if (presses.size === 0) {
      tipAtDown = cardTip?.id ?? null;
      manyFingers = false;
    } else manyFingers = true;
    if (liftedBy === e.pointerId) liftedBy = null;
    presses.set(e.pointerId, { x: e.clientX, y: e.clientY, onFelt: e.target === canvas, moved: false });
  }, { capture: true });
  addEventListener("pointermove", (e) => {
    const p = presses.get(e.pointerId);
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX) p.moved = true;
  }, { capture: true, passive: true });
  const unpress = (e: PointerEvent) => {
    const p = presses.get(e.pointerId);
    presses.delete(e.pointerId);
    if (!p || !cardTip) return;
    const camera = p.onFelt && liftedBy !== e.pointerId && (p.moved || manyFingers || orbits(e));
    if (camera) return;
    cardTip = null;
    // Перерисовка — в следующем кадре: `click` кнопки приходит после `pointerup`, и пересобранная сейчас
    // разметка съела бы его — касание не сделало бы того, что сделало бы без тултипа.
    redraw();
  };
  addEventListener("pointerup", unpress, { capture: true });
  addEventListener("pointerup", (e) => {
    if (!local.confirmLeave) return;
    const at = e.target instanceof Element ? e.target : null;
    if (at?.closest("[data-confirm],[data-bar=leave]")) return;
    local.confirmLeave = false;
    redraw();
  }, { capture: true });
  addEventListener("pointercancel", unpress, { capture: true });
  // «10 сек назад» идёт, пока тултип открыт.
  setInterval(() => cardTip && draw(), 1000);

  addEventListener("pointermove", (e) => {
    if (!gripPress || e.pointerId !== gripPress.pid || !view) return;
    if (!gripPress.moved && Math.hypot(e.clientX - gripPress.sx, e.clientY - gripPress.sy) <= TAP_PX) return;
    gripPress.moved = true;
    // ПРИКОЛОТА — не едет: палец увёл — это уже не тап, но и не перенос.
    if (pileOf(truth(), gripPress.pile)?.pin) return;
    gripPress.at = view.toDesk({ x: e.clientX - gripPress.off.x, y: e.clientY - gripPress.off.y });
    // КУДА ЛЯЖЕТ СТОПКА — как карта: в руку, в окно стула, на стул, в другую стопку или её окно; иначе на сукно.
    // Цель — место под стопкой, куда встал бы её контур на сукне, а не поднятая над ним стопка.
    const aim = aimAt(e.clientX, e.clientY, view.toGlass(gripPress.at), gripPress.pile);
    // МЕРЖ ЗАКРЫТ у несомой или у стопки под ней — ни в руку, ни в стопку: отпущенная вернётся на место.
    const s = truth();
    const sealed = aim.kind !== "felt" && aim.kind !== "back" && (pileOf(s, gripPress.pile)?.seal || ((aim.kind === "deck" || aim.kind === "deckAt") && pileOf(s, aim.pile)?.seal));
    gripPress.target = sealed ? { kind: "back" } : aim;
    draw();
  }, { passive: true });
  const endGrip = (e: PointerEvent) => {
    if (!gripPress || e.pointerId !== gripPress.pid) return;
    const press = gripPress;
    gripPress = null;
    if (e.type === "pointercancel") return draw();
    // ТЯГА — стопка ложится туда, куда целилась: в руку и в стопку — целиком, картами; на сукно — встаёт, где отпустили.
    if (press.moved) {
      const aim = press.target;
      const s = store.state;
      if (aim?.kind === "back") return draw();
      if (aim?.kind === "hand" || aim?.kind === "chair") {
        guessBatch({ t: "pileDrop", pile: press.pile, to: { in: "hand", chair: aim.which, i: aim.kind === "hand" ? aim.index : handOf(s, aim.which).length } });
        return draw();
      }
      if (aim?.kind === "deck" || aim?.kind === "deckAt") {
        guessBatch({ t: "pileDrop", pile: press.pile, to: { in: "deck", pile: aim.pile, ...(aim.kind === "deckAt" ? { i: aim.index } : {}) } });
        return draw();
      }
      if (press.at) return guessDeckMove(press.pile, press.at.x, press.at.y, dropAngle());
      return draw();
    }
    if (performance.now() - press.t0 >= TAP_MS) return draw();
    // ДВОЙНОЙ ТАП — перевернуть колоду. Первый тап уже открыл тултип; второй его не трогает.
    const now = performance.now();
    if (now - lastGripTap < DOUBLE_TAP_MS) {
      lastGripTap = 0;
      const pile = pileOf(truth(), press.pile);
      if (pile && !pile.lock) store.send({ t: "deckDo", pile: pile.id, how: "flip" });
      return draw();
    }
    lastGripTap = now;
    local.deckTip = local.deckTip === press.pile ? null : press.pile;
    draw();
  };
  addEventListener("pointerup", endGrip);
  addEventListener("pointercancel", endGrip);
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
      // ИНСТРУМЕНТ ЛАССО: касание сукна — петля или тап-выделение; ни карта, ни стул, ни камера его не получают.
      if (lassoOn() && local.tool === "lasso" && !drag && !gripPress) {
        e.preventDefault();
        e.stopPropagation();
        const under = feltPick(e.clientX, e.clientY);
        press = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, t0: performance.now(), card: under && !under.pile ? under.card.id : undefined, fromFelt: true, pts: [] };
        return;
      }
      const pick = feltPick(e.clientX, e.clientY);
      // В ЛАССО СТОПКИ НЕ ВЫДЕЛЯЮТСЯ — с сукна только одиночные карты; их карты выделяют в окне стопки.
      if (pick && !(lassoOn() && pick.pile)) {
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

  const keyframes = document.createElement("style");
  keyframes.textContent = "@keyframes bar-slide{from{transform:translateX(var(--from))}to{transform:none}}"
    + "@keyframes card-turn-out{0%{transform:scaleX(1)}50%,100%{transform:scaleX(0)}}"
    + "@keyframes card-turn-in{0%,50%{transform:scaleX(0)}100%{transform:scaleX(1)}}"
    + "@keyframes bar-in{from{opacity:0;transform:translateY(70%) scale(.6)}to{opacity:1;transform:none}}"
    + "@keyframes bar-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(70%) scale(.6)}}"
    + "@media (prefers-reduced-motion:reduce){[data-bar],[data-section]{animation:none!important}}"
    + "@keyframes mic-drop{0%,100%{opacity:.75}50%{opacity:1}}"
    + "@keyframes mic-pulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.18)}}"
    + "@keyframes eye-in{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}"
    + "@media (prefers-reduced-motion:reduce){[data-bar],[data-section],[data-eye]{animation:none!important}}"
    + ":root[data-reduce-motion] [data-bar],:root[data-reduce-motion] [data-section],:root[data-reduce-motion] [data-eye]{animation:none!important}";
  document.head.append(keyframes);

  addEventListener("resize", draw);
  addEventListener("orientationchange", draw);
  void document.fonts?.ready.then(draw);
  draw();

  // ГОТОВ, КОГДА ВСЁ НА МЕСТЕ: пока нет — поверх висит лоадер (`main.ts`), и старой колоды никто не видит.
  const photos = store.state.people.filter((p) => p.photo).map((p) => {
    face(p);
    return settled(images[p.key]!);
  });
  return { ready: Promise.all([art.warm(store.state.rules), document.fonts?.ready, ...photos]).then(() => {}) };
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
