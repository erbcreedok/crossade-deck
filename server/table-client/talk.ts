// ДИАЛОГ — своя клавиатура вместо руки и строки у стульев.
//
// Клавиатура открывается кнопкой бара и живёт поверх всего. Пока она открыта, стол ничего не делает: касание
// по игроку или карте — отметка в строке, касание мимо — закрыть клавиатуру. Своя рука видна полоской над
// клавишами — по ней тоже отмечают.
//
// Строки — в своём слое, который не пересобирается кадром экрана: буквы появляются по одной, новая строка
// встаёт снизу, старые поднимаются, ушедшая улетает вверх, — это переходы браузера, а пересборка их бы убила.

import { EMOJI } from "../src/table/emoji.js";
import { EVERYWHERE, KEYBOARD, KEYBOARD_SECTIONS, LINE_PAUSE_MS, Lines, SHOT_MS, Shots, Typer, graphemes, type KeyboardSection, type Line, type Piece } from "../src/table/say.js";
import { tableHaptic } from "./haptic.js";
import { tableMotion } from "./motion.js";
import type { TableStore } from "./store.js";

const INK = { black: "#0b0704", ink: "#f5ead0", well: "#1c120b", panel: "#3a2a1d", rim: "#6b4d2c", gold: "#f8d885", goldLo: "#b08a26" };
/** Сколько клавиатура въезжает и уезжает. */
const KEYBOARD_MS = 220;
/** Улёт ушедшей строки вверх. */
const FLY_MS = 420;
type Tab = KeyboardSection | "stickers";
/** Любимые эмодзи: сколько клеток и где на устройстве лежит, какое сколько раз ставили. */
const FAVOURITES = 9;
const USED_KEY = "crossade.table.emojiUsed";
/** Сдвинул палец дальше этого — это прокрутка полосы, а не нажатие. */
const SCROLL_TAP_PX = 8;
const TAB_LABEL: Record<Tab, string> = { latin: "123 ABC", cyrillic: "ӘӨ АБВ", emoji: "😀", stickers: "🖼" };

/** Где у меня сейчас стоят строки человека: точка перед его стулом на стекле, размер буквы, направление к середине стола. */
export interface WordAnchor {
  key: string;
  x: number;
  y: number;
  size: number;
  ink: string;
  dx: number;
  dy: number;
  /** Аватар человека на стекле и сколько пикселей в единице стола (ширина карты) — стикер живёт в масштабе стола. */
  seatX: number;
  seatY: number;
  unit: number;
}

/**
 * Полёт стикера в единицах стола (ширина карты): размер, насколько вперёд от стула — к середине стола, как смотрит
 * сидящий, а не моя камера; разброс угла; с какой доли полёта он начинает таять.
 */
const SHOT_FLIGHT = { size: 1.3, forward: 3, spreadDeg: 9, fadeFrom: 0.7 };

/** Что диалог спрашивает у стола: как видно отметки, что под пальцем, моя рука, кого я не читаю, мои стикеры. */
export interface TalkWorld {
  who(key: string): { name: string; ink: string } | undefined;
  /** Карта как её вижу я: «6♥» в цвете масти, или рубашка, если лица мне не видно. */
  card(id: string): { label: string; ink: string };
  /** Что под пальцем на столе: игрок или карта. */
  pick(x: number, y: number): Extract<Piece, { t: "who" | "card" }> | null;
  hand(): string[];
  muted(key: string): boolean;
  /** Картинка стикера человека; `mine` — мой набор для вкладки. */
  stickerUrl(by: string, id: string): string;
  stickers(): string[];
  /** Контейнер HUD: где стоит рука и полоса — клавиатура встаёт туда же. */
  hud(): { left: number; width: number };
}

export interface Talk {
  readonly open: boolean;
  /** Сколько стекла снизу занимает клавиатура. */
  height(): number;
  toggle(): void;
  close(): void;
  /** Расставить строки по стульям — каждым кадром экрана. */
  place(anchors: WordAnchor[]): void;
  /** Человека замолчали — его строки убраны сразу. */
  muted(key: string): void;
  /** Пришёл мой набор стикеров — перерисовать клавиатуру. */
  refresh(): void;
}

export function mountTalk(stage: HTMLElement, store: TableStore, redraw: () => void, world: TalkWorld): Talk {
  const lines = new Lines();
  const length = (p: Piece) => (p.t === "text" ? graphemes(p.text).length : p.t === "who" ? graphemes(world.who(p.key)?.name ?? "?").length : p.t === "card" ? graphemes(world.card(p.id).label).length : 1);
  const typer = new Typer((out) => {
    lines.hear(store.me.key, out, performance.now());
    store.say(out);
    paint();
    counter();
  }, length);
  let open = false;
  let section: Tab = "latin";

  /** Клавиша на телефоне в портрете. Всё остальное в клавиатуре меряется ею — и ужимается вместе с ней. */
  const KEY_H = 42;
  /**
   * КЛАВИАТУРА НЕ ЗАКРЫВАЕТ СТОЛ. Ей отдаётся столько высоты кадра и ни пикселем больше: в ландшафте
   * телефона места меньше, чем клавиатура просит в портрете, и выбор здесь — либо ужать её всю,
   * либо спрятать стол за ней. Стол важнее: ради него всё и открыто.
   */
  const BOARD_SHARE = 0.62;
  /** Во скольких клавишах умещается клавиатура по высоте: отступы, рука, вкладки и четыре ряда. */
  const BOARD_IN_KEYS = (8 + 30 + 4 + 34 + 4 + 4 * KEY_H + 3 * 4 + 10) / KEY_H;
  /** Ниже этого клавиша не читается и в неё не попасть пальцем: лучше отдать высоту клавиатуре. */
  const MIN_KEY = 24;
  /** Высота клавиши в этом кадре — одна на всю клавиатуру; `px` меряет ею всё прочее. */
  let K = KEY_H;
  const px = (n: number) => Math.max(1, Math.round((n * K) / KEY_H));
  let pause = 0;
  let anchors: WordAnchor[] = [];

  const layer = document.createElement("div");
  layer.dataset.g = "words";
  layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:80;overflow:hidden";
  const shield = document.createElement("div");
  shield.dataset.g = "talk-shield";
  shield.hidden = true;
  shield.style.cssText = "position:absolute;inset:0;z-index:90;touch-action:none";
  const board = document.createElement("div");
  board.dataset.keyboard = "";
  board.hidden = true;
  board.style.cssText = `position:absolute;bottom:0;z-index:95;box-sizing:border-box;`
    + `background:linear-gradient(${INK.panel},${INK.well});touch-action:none;display:flex;flex-direction:column`;
  /**
   * КЛАВИАТУРА СТОИТ В ТОМ ЖЕ КОНТЕЙНЕРЕ, ЧТО РУКА И ПОЛОСА, и выглядит так же: во всю ширину с
   * тенью на телефоне и подносом со скруглённым верхом, когда кадр шире контейнера.
   */
  function fitBoard(): void {
    const hud = world.hud();
    const tray = hud.left > 0;
    const round = px(24);
    board.style.left = `${hud.left}px`;
    board.style.width = `${hud.width}px`;
    board.style.padding = `${px(8)}px ${px(6)}px calc(${px(10)}px + env(safe-area-inset-bottom))`;
    board.style.gap = `${px(6)}px`;
    board.style.borderRadius = tray ? `${round}px ${round}px 0 0` : "0";
    board.style.boxShadow = tray
      ? `inset 0 0 0 3px ${INK.black},inset 0 0 0 5px ${INK.rim}`
      : `inset 0 3px 0 -1px ${INK.black}`;
  }
  const shotLayer = document.createElement("div");
  shotLayer.dataset.g = "shots";
  shotLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:85;overflow:hidden";
  stage.append(layer, shotLayer, shield, board);

  const idle = () => {
    clearTimeout(pause);
    if (typer.typing) pause = window.setTimeout(() => {
      typer.end();
      counter();
    }, LINE_PAUSE_MS);
  };

  // КАСАНИЕ ВНЕ КЛАВИАТУРЫ — отметить игрока или карту под пальцем; мимо них — только закрыть.
  shield.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const piece = world.pick(e.clientX, e.clientY);
    if (!piece) return close();
    typer.mention(piece);
    idle();
  });
  board.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // ПОЛОСА ЭМОДЗИ И СТИКЕРОВ — листается пальцем; нажатие на ней — на отпускании, если палец не ехал.
    const strip = (e.target as Element).closest<HTMLElement>("[data-scroll]");
    if (strip) return scrollStart(strip, e);
    const el = (e.target as Element).closest<HTMLElement>("[data-key],[data-key-act],[data-kb-tab],[data-mention-card],[data-sticker]");
    if (!el) return;
    if (el.dataset.kbTab) {
      section = el.dataset.kbTab as Tab;
      if (section === "stickers") store.askStickers();
      return build();
    }
    const act = el.dataset.keyAct;
    if (act === "close") return close();
    if (act === "space") typer.key(" ");
    else if (act === "enter") typer.end();
    else if (act === "erase") typer.erase();
    else if (el.dataset.mentionCard) typer.mention({ t: "card", id: el.dataset.mentionCard });
    else typer.key(el.dataset.key!);
    pressed(el);
  });

  function pressed(el: HTMLElement): void {
    el.animate([{ transform: "scale(.88)" }, { transform: "none" }], { duration: 120 });
    // ЗАМОЛЧАЛ — строка закончена.
    idle();
    counter();
  }

  /** Нажатие в полосе: эмодзи — в строку и в счёт любимых; стикер — строкой. */
  function stripTap(target: Element): void {
    const el = target.closest<HTMLElement>("[data-key],[data-sticker]");
    if (!el) return;
    if (el.dataset.sticker) {
      if (!mayShoot()) return tableHaptic().buzz("warning");
      tableHaptic().buzz("light");
      shots.fire(store.me.key, performance.now());
      store.shoot({ id: el.dataset.sticker });
      launch(store.me.key, el.dataset.sticker);
      coolStickers();
    } else {
      tableHaptic().buzz("selection");
      const before = typer.left;
      typer.key(el.dataset.key!);
      if (typer.left !== before || !typer.typing) noteUsed(el.dataset.key!);
    }
    pressed(el);
  }

  let scroll: { strip: HTMLElement; id: number; x: number; left: number; moved: boolean; target: Element; v: number; t: number } | null = null;
  function scrollStart(strip: HTMLElement, e: PointerEvent): void {
    strip.getAnimations?.().forEach((a) => a.cancel());
    cancelAnimationFrame(coast);
    scroll = { strip, id: e.pointerId, x: e.clientX, left: strip.scrollLeft, moved: false, target: e.target as Element, v: 0, t: performance.now() };
  }
  let coast = 0;
  addEventListener("pointermove", (e) => {
    if (!scroll || e.pointerId !== scroll.id) return;
    const dx = e.clientX - scroll.x;
    if (!scroll.moved && Math.abs(dx) <= SCROLL_TAP_PX) return;
    scroll.moved = true;
    const now = performance.now();
    const next = scroll.left - dx;
    scroll.v = (scroll.strip.scrollLeft - next) / Math.max(1, now - scroll.t);
    scroll.t = now;
    scroll.strip.scrollLeft = next;
  });
  const scrollEnd = (e: PointerEvent) => {
    if (!scroll || e.pointerId !== scroll.id) return;
    const { strip, moved, target } = scroll;
    let v = -scroll.v;
    scroll = null;
    if (!moved) return stripTap(target);
    // Отпустил на ходу — полоса докатывается и тормозит.
    let last = performance.now();
    const roll = (now: number) => {
      const dt = now - last;
      last = now;
      strip.scrollLeft += v * dt;
      v *= Math.pow(0.994, dt);
      if (Math.abs(v) > 0.02) coast = requestAnimationFrame(roll);
    };
    coast = requestAnimationFrame(roll);
  };
  addEventListener("pointerup", scrollEnd);
  addEventListener("pointercancel", (e) => {
    if (scroll && e.pointerId === scroll.id) scroll = null;
  });

  function usedCounts(): Record<string, number> {
    try {
      const raw = JSON.parse(localStorage.getItem(USED_KEY) ?? "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }
  function noteUsed(ch: string): void {
    const used = usedCounts();
    used[ch] = (used[ch] ?? 0) + 1;
    try {
      localStorage.setItem(USED_KEY, JSON.stringify(used));
    } catch {
      // Нет хранилища — любимые не копятся.
    }
    const fav = board.querySelector<HTMLElement>("[data-favourites]");
    if (fav) fav.outerHTML = favouritesHtml();
  }
  /** Девять любимых — чаще всего поставленные; пока ничего не ставили — пустые клетки. */
  function favouritesHtml(): string {
    const used = usedCounts();
    const top = Object.entries(used).filter(([ch]) => EMOJI.includes(ch)).sort((a, b) => b[1] - a[1]).slice(0, FAVOURITES).map(([ch]) => ch);
    const cells = Array.from({ length: FAVOURITES }, (_, i) => top[i]);
    return `<div data-favourites style="flex:none;display:grid;grid-template-columns:repeat(3,${px(42)}px);grid-template-rows:repeat(3,${px(50)}px);gap:${px(4)}px;align-content:center;padding-right:${px(8)}px;margin-right:${px(8)}px;box-shadow:2px 0 0 ${INK.rim}">`
      + cells.map((ch) => ch
        ? `<button data-key="${ch}" data-favourite style="border:0;padding:0;border-radius:${px(8)}px;cursor:pointer;font:400 ${px(24)}px system-ui,sans-serif;background:linear-gradient(#25321f,#16210f);box-shadow:inset 0 0 0 2px ${INK.black},inset 0 0 0 3px ${INK.gold}">${ch}</button>`
        : `<span data-favourite-empty style="border-radius:8px;box-shadow:inset 0 0 0 2px ${INK.rim};opacity:.5"></span>`).join("")
      + `</div>`;
  }
  board.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  const stripH = () => px(4 * 42 + 3 * 6);
  const strip = (html: string, data: string) =>
    `<div data-scroll ${data} style="height:${stripH()}px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;touch-action:none;overscroll-behavior:contain;display:flex;align-items:stretch">${html}</div>`;

  // СТИКЕРЫ ВЫСТРЕЛОМ — свои слоты считаются здесь же: занято три — кнопки стикеров гаснут до первого освободившегося.
  const shots = new Shots();
  const mayShoot = () => shots.free(store.me.key, performance.now()) > 0;
  let cooling = 0;
  function coolStickers(): void {
    const off = !mayShoot();
    for (const b of board.querySelectorAll<HTMLElement>("[data-sticker]")) {
      b.dataset.cooling = String(off);
      b.style.opacity = off ? "0.35" : "1";
    }
    clearTimeout(cooling);
    if (off) cooling = window.setTimeout(coolStickers, shots.nextIn(store.me.key, performance.now()) + 20);
  }
  /** Сколько выстрелов у человека было — угол каждого следующего чуть другой. */
  const fired = new Map<string, number>();
  store.onShot((shot) => {
    if (world.muted(shot.by)) return;
    launch(shot.by, shot.id);
  });
  function launch(by: string, id: string): void {
    const a = anchors.find((one) => one.key === by);
    if (!a) return;
    const n = (fired.get(by) ?? 0) + 1;
    fired.set(by, n);
    const size = Math.round(SHOT_FLIGHT.size * a.unit);
    // Вперёд от его стула — к середине стола; у меня это вверх, у сидящего напротив — вниз. Каждый выстрел
    // повёрнут на свой угол из пяти.
    const turn = ((((n * 3) % 5) - 2) * SHOT_FLIGHT.spreadDeg * Math.PI) / 180;
    const vx = a.dx * SHOT_FLIGHT.forward * a.unit;
    const vy = a.dy * SHOT_FLIGHT.forward * a.unit;
    const tx = vx * Math.cos(turn) - vy * Math.sin(turn);
    const ty = vx * Math.sin(turn) + vy * Math.cos(turn);
    const el = document.createElement("img");
    el.dataset.shot = id;
    el.dataset.by = by;
    el.dataset.turn = String(Math.round((turn * 180) / Math.PI));
    el.alt = "";
    el.src = world.stickerUrl(by, id);
    el.style.cssText = `position:absolute;left:${a.seatX - size / 2}px;top:${a.seatY - size / 2}px;width:${size}px;height:${size}px;object-fit:contain;pointer-events:none;will-change:transform,opacity,filter`;
    shotLayer.append(el);
    // Движение — с торможением; таяние — по часам: иначе кривая сжала бы и его в начало полёта.
    // «Меньше анимаций» — стикер не летит, только тает у аватара: слот держится те же `SHOT_MS`.
    if (!tableMotion().reduce) el.animate([
      { transform: "translate(0,0) scale(.5)" },
      { transform: `translate(${tx}px,${ty}px) scale(1.25)` },
    ], { duration: SHOT_MS, easing: "cubic-bezier(.1,.75,.3,1)", fill: "forwards" });
    const run = el.animate([
      { opacity: 1, filter: "blur(0)" },
      { opacity: 1, filter: "blur(0)", offset: SHOT_FLIGHT.fadeFrom },
      { opacity: 0, filter: "blur(4px)" },
    ], { duration: SHOT_MS, easing: "linear", fill: "forwards" });
    run.onfinish = () => el.remove();
  }

  store.onSay((say) => {
    if (world.muted(say.by)) return;
    lines.hear(say.by, say, performance.now());
    paint();
  });
  setInterval(() => lines.tick(performance.now()) && paint(), 150);

  const key = (label: string, data: string, grow = 1, font = 17) =>
    `<button ${data} style="flex:${grow} 1 0;min-width:0;height:${px(42)}px;border:0;padding:0;border-radius:${px(8)}px;cursor:pointer;color:${INK.ink};`
    + `font:400 ${px(font)}px Tiny5,system-ui,sans-serif;background:linear-gradient(#25321f,#16210f);box-shadow:inset 0 0 0 2px ${INK.black},inset 0 0 0 3px ${INK.rim}">${label}</button>`;
  const row = (html: string) => `<div style="display:flex;gap:${px(4)}px">${html}</div>`;

  /** Сколько символов осталось в строке — у кнопок вкладок. */
  function counter(): void {
    const el = board.querySelector<HTMLElement>("[data-left]");
    if (!el) return;
    el.textContent = String(typer.left);
    el.dataset.left = String(typer.left);
    el.style.color = typer.left <= 4 ? INK.gold : INK.ink;
  }

  function handRow(): string {
    const ids = world.hand();
    if (!ids.length) return "";
    return `<div data-talk-hand style="display:flex;gap:${px(4)}px;overflow-x:auto;padding-bottom:2px">` + ids.map((id) => {
      const c = world.card(id);
      return `<button data-mention-card="${id}" style="flex:none;min-width:${px(38)}px;height:${px(30)}px;padding:0 ${px(6)}px;border:0;border-radius:${px(6)}px;cursor:pointer;font:400 ${px(14)}px Tiny5,system-ui,sans-serif;`
        + `color:${c.ink};background:#f7f1e6;box-shadow:inset 0 0 0 2px ${INK.black}">${escapeHtml(c.label)}</button>`;
    }).join("") + `</div>`;
  }

  function build(again = false): void {
    if (!again) K = Math.max(MIN_KEY, Math.min(KEY_H, Math.floor((stage.clientHeight * BOARD_SHARE) / BOARD_IN_KEYS)));
    fitBoard();
    const tabs = ([...KEYBOARD_SECTIONS, "stickers"] as Tab[]).map((sec) => {
      const on = sec === section;
      return `<button data-kb-tab="${sec}" aria-pressed="${on}" style="flex:1 1 0;height:${px(34)}px;border:0;border-radius:${px(8)}px;cursor:pointer;font:400 ${px(13)}px Tiny5,system-ui,sans-serif;`
        + (on ? `color:${INK.black};background:linear-gradient(${INK.gold},${INK.goldLo});box-shadow:inset 0 0 0 2px ${INK.black}` : `color:${INK.ink};background:transparent;box-shadow:inset 0 0 0 2px ${INK.rim}`)
        + `">${TAB_LABEL[sec]}</button>`;
    }).join("")
      + `<span data-left="${typer.left}" aria-label="Осталось символов" style="flex:none;width:${px(30)}px;height:${px(34)}px;display:flex;align-items:center;justify-content:center;font:400 ${px(13)}px Tiny5,monospace;color:${INK.ink}">${typer.left}</span>`
      + `<button data-key-act="close" aria-label="Закрыть" style="flex:none;width:${px(40)}px;height:${px(34)}px;border:0;border-radius:${px(8)}px;cursor:pointer;color:${INK.ink};font:400 ${px(16)}px Tiny5,monospace;background:transparent;box-shadow:inset 0 0 0 2px ${INK.rim}">✕</button>`;
    let body: string;
    if (section === "stickers") {
      const mine = world.stickers();
      body = mine.length
        ? strip(`<div data-sticker-grid style="display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,${(stripH() - px(6)) / 2}px);grid-auto-columns:${(stripH() - px(6)) / 2}px;gap:${px(6)}px">`
          + mine.map((id) => `<button data-sticker="${id}" aria-label="Стикер" style="border:0;border-radius:8px;cursor:pointer;background:rgba(0,0,0,.25) url(${world.stickerUrl(store.me.key, id)}) center/contain no-repeat"></button>`).join("") + `</div>`, "data-sticker-strip")
        : `<div style="height:${stripH()}px;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 ${px(16)}px;font:400 ${px(13)}px Tiny5,system-ui,sans-serif;color:${INK.ink}">Стикеров пока нет. Отправь боту /sticker и картинку</div>`;
    } else if (section === "emoji") {
      body = strip(favouritesHtml()
        + `<div data-emoji-grid style="display:grid;grid-auto-flow:column;grid-template-rows:repeat(4,${px(42)}px);grid-auto-columns:${px(42)}px;gap:${px(6)}px ${px(4)}px">`
        + EMOJI.map((ch) => `<button data-key="${ch}" style="border:0;padding:0;border-radius:${px(8)}px;cursor:pointer;font:400 ${px(24)}px system-ui,sans-serif;background:transparent">${ch}</button>`).join("")
        + `</div>`, "data-emoji-strip")
        + row(EVERYWHERE.map((ch) => key(ch, `data-key="${ch}"`)).join("") + key("пробел", 'data-key-act="space"', 4, 13) + key("⌫", 'data-key-act="erase"', 1.4) + key("↵", 'data-key-act="enter" aria-label="Новая строка"', 1.4));
    } else {
      body = KEYBOARD[section].map((line) => row(graphemes(line).map((ch) => key(ch, `data-key="${ch}"`, 1, section === "emoji" ? 22 : 17)).join(""))).join("")
        + row(EVERYWHERE.map((ch) => key(ch, `data-key="${ch}"`)).join("") + key("пробел", 'data-key-act="space"', 4, 13) + key("⌫", 'data-key-act="erase"', 1.4) + key("↵", 'data-key-act="enter" aria-label="Новая строка"', 1.4));
    }
    board.innerHTML = handRow() + row(tabs) + body;
    coolStickers();
    // СЧЁТ ПРОВЕРЯЕТСЯ ЛИНЕЙКОЙ. Ряды разные — с рукой и без, с эмодзи и без, — и подсчёт «во
    // скольких клавишах» врёт на пару процентов. Вышло выше отведённого — ужимаем клавишу по
    // настоящей высоте и собираем ещё раз. Второго промаха не бывает: высота линейна по клавише.
    const room = stage.clientHeight * BOARD_SHARE;
    const got = board.getBoundingClientRect().height;
    if (!again && got > room + 1 && K > MIN_KEY) {
      K = Math.max(MIN_KEY, Math.floor((K * room) / got));
      build(true);
    }
  }

  // Поворот телефона — другой кадр: и контейнер, и размер клавиши пересчитываются.
  addEventListener("resize", () => open && build());
  addEventListener("orientationchange", () => open && build());

  function toggle(): void {
    if (open) return close();
    open = true;
    store.askStickers();
    build();
    board.hidden = false;
    shield.hidden = false;
    if (!tableMotion().reduce) board.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: KEYBOARD_MS, easing: "cubic-bezier(.2,.7,.3,1)" });
    redraw();
  }

  function close(): void {
    if (!open) return;
    open = false;
    clearTimeout(pause);
    typer.end();
    shield.hidden = true;
    // «Меньше анимаций» — клавиатура уходит сразу.
    const out = board.animate([{ transform: "none" }, { transform: "translateY(100%)" }], { duration: tableMotion().reduce ? 0 : KEYBOARD_MS, easing: "ease-in" });
    out.onfinish = () => !open && (board.hidden = true);
    redraw();
  }

  /** Буква — SVG, заглавная, в цвете с чёрной обводкой; эмодзи — как есть. */
  const letter = (ch: string, size: number, ink: string) => {
    if (ch === " ") return `<span style="display:block;width:${Math.round(size * 0.45)}px;height:1px"></span>`;
    const w = Math.round(size * (/\p{Extended_Pictographic}|\p{Regional_Indicator}|[♠♥♦♣]/u.test(ch) ? 1.15 : 0.78));
    return `<svg width="${w}" height="${Math.round(size * 1.2)}" viewBox="0 0 ${w} ${Math.round(size * 1.2)}" style="display:block;overflow:visible">`
      + `<text x="${w / 2}" y="${Math.round(size * 0.95)}" text-anchor="middle" font-family="Tiny5, system-ui, sans-serif" font-size="${size}" fill="${ink}" `
      + `stroke="${INK.black}" stroke-width="${Math.max(2, size * 0.16)}" stroke-linejoin="round" paint-order="stroke">${escapeHtml(ch)}</text></svg>`;
  };

  /** Буквы строки как их вижу я: текст — цветом пишущего, отметка — цветом игрока или карты. */
  function glyphs(line: Line, ink: string): { ch: string; ink: string; mark: string }[] {
    return line.pieces.flatMap((p) => {
      if (p.t === "text") return graphemes(p.text).map((ch) => ({ ch, ink, mark: "" }));
      if (p.t === "who") {
        const w = world.who(p.key);
        return graphemes(w?.name ?? "?").map((ch) => ({ ch, ink: w?.ink ?? ink, mark: `who:${p.key}` }));
      }
      const c = world.card(p.id);
      return graphemes(c.label).map((ch) => ({ ch, ink: c.ink, mark: `card:${p.id}` }));
    });
  }

  /** Строка как текст для прогона: отметки — `[who:key]`, `[card:id]`. */
  const flat = (line: Line) => line.pieces.map((p) => (p.t === "text" ? p.text : `[${p.t}:${p.t === "who" ? p.key : p.id}]`)).join("");

  function paint(): void {
    const live = new Set<string>();
    for (const a of anchors) {
      const list = lines.of(a.key);
      let who = layer.querySelector<HTMLElement>(`[data-words="${CSS.escape(a.key)}"]`);
      if (!list.length && !who) continue;
      live.add(a.key);
      if (!who) {
        who = document.createElement("div");
        who.dataset.words = a.key;
        layer.append(who);
      }
      who.style.cssText = `position:absolute;left:${a.x}px;top:${a.y}px;width:0;height:0`;
      const lineH = Math.round(a.size * 1.35);
      const alive = new Set(list.map((w) => String(w.n)));
      // УШЛА — улетает вверх и растворяется.
      for (const el of who.querySelectorAll<HTMLElement>("[data-line]")) {
        if (alive.has(el.dataset.line!) || el.dataset.gone) continue;
        el.dataset.gone = "1";
        const from = el.style.transform;
        const run = el.animate([{ transform: from, opacity: 1 }, { transform: `${from} translateY(${-lineH * 2}px)`, opacity: 0 }], { duration: tableMotion().reduce ? 0 : FLY_MS, easing: "ease-in", fill: "forwards" });
        run.onfinish = () => el.remove();
      }
      // Снизу вверх: последняя строка — внизу, над ней — старее.
      let lift = 0;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const w = list[i]!;
        let el = who.querySelector<HTMLElement>(`[data-line="${w.n}"]:not([data-gone])`);
        const fresh = !el;
        if (!el) {
          el = document.createElement("div");
          el.dataset.line = String(w.n);
          who.append(el);
        }
        el.dataset.text = flat(w);
        el.dataset.done = String(w.doneAt !== undefined);
        const h = lineH;
        el.dataset.lift = String(lift);
        el.style.cssText = `position:absolute;left:0;bottom:0;display:flex;align-items:flex-end;white-space:nowrap;`
          + `transform:translate(-50%,${-lift}px);transition:transform .26s cubic-bezier(.3,1.3,.5,1);opacity:1`;
        if (fresh) el.animate([{ opacity: 0, transform: `translate(-50%,${-lift + 8}px)` }, { opacity: 1, transform: `translate(-50%,${-lift}px)` }], { duration: 160 });
        lift += h;
        const want = glyphs(w, a.ink);
        const shown = [...el.children] as HTMLElement[];
        const size = String(a.size);
        // Буквы, которые уже стоят, не трогаются — появляется только новая, как на машинке.
        let same = 0;
        while (same < shown.length && same < want.length && shown[same]!.dataset.ch === want[same]!.ch && shown[same]!.dataset.ink === want[same]!.ink && shown[same]!.dataset.mark === want[same]!.mark && shown[same]!.dataset.size === size) same += 1;
        for (const extra of shown.slice(same)) extra.remove();
        for (const g of want.slice(same)) {
          const span = document.createElement("span");
          span.dataset.ch = g.ch;
          span.dataset.ink = g.ink;
          span.dataset.mark = g.mark;
          span.dataset.size = size;
          // Отметка — на тёмной подложке, чтобы отличалась от текста.
          if (g.mark) span.style.cssText = `background:rgba(11,7,4,.55);box-shadow:0 ${Math.round(a.size * 0.12)}px 0 ${g.ink}`;
          span.innerHTML = letter(g.ch, a.size, g.ink);
          el.append(span);
          span.animate([{ transform: "translateY(-35%) scale(1.4)", opacity: 0.2 }, { transform: "none", opacity: 1 }], { duration: 130, easing: "ease-out" });
        }
      }
      // Строка не вылезает за край экрана.
      const W = stage.clientWidth;
      for (const el of who.querySelectorAll<HTMLElement>("[data-line]:not([data-gone])")) {
        const half = el.offsetWidth / 2;
        const shift = Math.max(8 + half - a.x, Math.min(0, W - 8 - half - a.x));
        el.style.marginLeft = `${Math.round(shift)}px`;
      }
    }
    for (const el of layer.querySelectorAll<HTMLElement>("[data-words]")) if (!live.has(el.dataset.words!) && !el.querySelector("[data-line]")) el.remove();
  }

  return {
    get open() {
      return open;
    },
    height: () => (open ? board.getBoundingClientRect().height || 0 : 0),
    toggle,
    close,
    place(next) {
      anchors = next;
      paint();
    },
    refresh() {
      if (open) build();
    },
    muted(key) {
      lines.drop(key);
      paint();
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
