// ДИАЛОГ — своя клавиатура вместо руки и слова у стульев.
//
// Клавиатура открывается кнопкой бара и живёт поверх всего: пока она открыта, стол не трогается — ни карты,
// ни стулья, ни камера. Касание вне её только закрывает её (щит), и ничего больше не делает.
//
// Слова — в своём слое, который не пересобирается кадром экрана: буквы появляются по одной, слово падает
// вниз, когда нижнее исчезло, — это переходы браузера, а пересборка их бы убила.

import { EVERYWHERE, KEYBOARD, KEYBOARD_SECTIONS, Typer, WORD_PAUSE_MS, Words, graphemes, type KeyboardSection } from "../src/table/say.js";
import type { TableStore } from "./store.js";

const INK = { black: "#0b0704", ink: "#f5ead0", well: "#1c120b", panel: "#3a2a1d", rim: "#6b4d2c", gold: "#f8d885", goldLo: "#b08a26" };
/** Сколько клавиатура въезжает и уезжает. */
const KEYBOARD_MS = 220;
const TAB_LABEL: Record<KeyboardSection, string> = { latin: "123 ABC", cyrillic: "ӘӨ АБВ", emoji: "😀" };

/** Где у меня сейчас стоят слова человека: точка перед его стулом на стекле и размер буквы. */
export interface WordAnchor {
  key: string;
  x: number;
  y: number;
  size: number;
  ink: string;
}

export interface Talk {
  readonly open: boolean;
  /** Сколько стекла снизу занимает клавиатура. */
  height(): number;
  toggle(): void;
  close(): void;
  /** Расставить слова по стульям — каждым кадром экрана. */
  place(anchors: WordAnchor[]): void;
}

export function mountTalk(stage: HTMLElement, store: TableStore, redraw: () => void): Talk {
  const words = new Words();
  const typer = new Typer((out) => {
    words.hear(store.me.key, out, performance.now());
    store.say(out);
    paint();
  });
  let open = false;
  let section: KeyboardSection = "latin";
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
  board.style.cssText = `position:absolute;left:0;right:0;bottom:0;z-index:95;box-sizing:border-box;padding:8px 6px calc(10px + env(safe-area-inset-bottom));`
    + `background:linear-gradient(${INK.panel},${INK.well});box-shadow:inset 0 3px 0 -1px ${INK.black};touch-action:none;display:flex;flex-direction:column;gap:6px`;
  stage.append(layer, shield, board);

  // КАСАНИЕ ВНЕ КЛАВИАТУРЫ — только закрыть: ни карта, ни стул, ни камера его не получают.
  shield.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  board.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = (e.target as Element).closest<HTMLElement>("[data-key],[data-key-act],[data-kb-tab]");
    if (!el) return;
    if (el.dataset.kbTab) {
      section = el.dataset.kbTab as KeyboardSection;
      return build();
    }
    const act = el.dataset.keyAct;
    if (act === "close") return close();
    if (act === "space") typer.end();
    else if (act === "erase") typer.erase();
    else typer.key(el.dataset.key!);
    el.animate([{ transform: "scale(.88)" }, { transform: "none" }], { duration: 120 });
    // ЗАМОЛЧАЛ — слово закончено.
    clearTimeout(pause);
    if (typer.typing) pause = window.setTimeout(() => typer.end(), WORD_PAUSE_MS);
  });
  board.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  store.onSay((say) => {
    words.hear(say.by, say, performance.now());
    paint();
  });
  setInterval(() => words.tick(performance.now()) && paint(), 150);

  const key = (label: string, data: string, grow = 1, font = 17) =>
    `<button ${data} style="flex:${grow} 1 0;min-width:0;height:42px;border:0;padding:0;border-radius:8px;cursor:pointer;color:${INK.ink};`
    + `font:400 ${font}px Tiny5,system-ui,sans-serif;background:linear-gradient(#25321f,#16210f);box-shadow:inset 0 0 0 2px ${INK.black},inset 0 0 0 3px ${INK.rim}">${label}</button>`;
  const row = (html: string) => `<div style="display:flex;gap:4px">${html}</div>`;

  function build(): void {
    const tabs = KEYBOARD_SECTIONS.map((sec) => {
      const on = sec === section;
      return `<button data-kb-tab="${sec}" aria-pressed="${on}" style="flex:1 1 0;height:34px;border:0;border-radius:8px;cursor:pointer;font:400 13px Tiny5,system-ui,sans-serif;`
        + (on ? `color:${INK.black};background:linear-gradient(${INK.gold},${INK.goldLo});box-shadow:inset 0 0 0 2px ${INK.black}` : `color:${INK.ink};background:transparent;box-shadow:inset 0 0 0 2px ${INK.rim}`)
        + `">${TAB_LABEL[sec]}</button>`;
    }).join("") + `<button data-key-act="close" aria-label="Закрыть" style="flex:none;width:44px;height:34px;border:0;border-radius:8px;cursor:pointer;color:${INK.ink};font:400 16px Tiny5,monospace;background:transparent;box-shadow:inset 0 0 0 2px ${INK.rim}">✕</button>`;
    const rows = KEYBOARD[section].map((line) => row(graphemes(line).map((ch) => key(ch, `data-key="${ch}"`, 1, section === "emoji" ? 22 : 17)).join(""))).join("");
    const bottom = row(EVERYWHERE.map((ch) => key(ch, `data-key="${ch}"`)).join("") + key("пробел", 'data-key-act="space"', 5, 13) + key("⌫", 'data-key-act="erase"', 1.6));
    board.innerHTML = row(tabs) + rows + bottom;
  }

  function toggle(): void {
    if (open) return close();
    open = true;
    build();
    board.hidden = false;
    shield.hidden = false;
    board.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: KEYBOARD_MS, easing: "cubic-bezier(.2,.7,.3,1)" });
    redraw();
  }

  function close(): void {
    if (!open) return;
    open = false;
    clearTimeout(pause);
    typer.end();
    shield.hidden = true;
    const out = board.animate([{ transform: "none" }, { transform: "translateY(100%)" }], { duration: KEYBOARD_MS, easing: "ease-in" });
    out.onfinish = () => !open && (board.hidden = true);
    redraw();
  }

  /** Буква слова — SVG, заглавная, в цвете человека с чёрной обводкой; эмодзи — как есть. */
  const letter = (ch: string, size: number, ink: string) => {
    const w = Math.round(size * (/\p{Extended_Pictographic}/u.test(ch) ? 1.15 : 0.78));
    return `<svg width="${w}" height="${Math.round(size * 1.2)}" viewBox="0 0 ${w} ${Math.round(size * 1.2)}" style="display:block;overflow:visible">`
      + `<text x="${w / 2}" y="${Math.round(size * 0.95)}" text-anchor="middle" font-family="Tiny5, system-ui, sans-serif" font-size="${size}" fill="${ink}" `
      + `stroke="${INK.black}" stroke-width="${Math.max(2, size * 0.16)}" stroke-linejoin="round" paint-order="stroke">${ch}</text></svg>`;
  };

  function paint(): void {
    const live = new Set<string>();
    for (const a of anchors) {
      const list = words.of(a.key);
      if (!list.length) continue;
      live.add(a.key);
      let who = layer.querySelector<HTMLElement>(`[data-words="${CSS.escape(a.key)}"]`);
      if (!who) {
        who = document.createElement("div");
        who.dataset.words = a.key;
        layer.append(who);
      }
      who.style.cssText = `position:absolute;left:${a.x}px;top:${a.y}px;width:0;height:0`;
      const lineH = Math.round(a.size * 1.35);
      const alive = new Set(list.map((w) => String(w.n)));
      // ИСЧЕЗЛО — целиком, коротким растворением.
      for (const el of who.querySelectorAll<HTMLElement>("[data-word]")) {
        if (alive.has(el.dataset.word!) || el.dataset.gone) continue;
        el.dataset.gone = "1";
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 220);
      }
      list.forEach((w, i) => {
        let el = who!.querySelector<HTMLElement>(`[data-word="${w.n}"]:not([data-gone])`);
        const fresh = !el;
        if (!el) {
          el = document.createElement("div");
          el.dataset.word = String(w.n);
          who!.append(el);
        }
        el.dataset.text = w.text;
        el.dataset.done = String(w.doneAt !== undefined);
        // Новое слово встаёт выше; нижнее ушло — остальные падают на его место.
        el.style.cssText = `position:absolute;left:0;bottom:0;display:flex;align-items:flex-end;white-space:nowrap;`
          + `transform:translate(-50%,${-i * lineH}px);transition:transform .22s cubic-bezier(.3,1.4,.5,1),opacity .2s ease-out;opacity:1`;
        if (fresh) el.animate([{ opacity: 0, transform: `translate(-50%,${-i * lineH - 6}px)` }, { opacity: 1, transform: `translate(-50%,${-i * lineH}px)` }], { duration: 140 });
        const letters = graphemes(w.text);
        const shown = [...el.children] as HTMLElement[];
        const size = String(a.size);
        // Буквы, которые уже стоят, не трогаются — появляется только новая, как на машинке.
        let same = 0;
        while (same < shown.length && same < letters.length && shown[same]!.dataset.ch === letters[same] && shown[same]!.dataset.size === size) same += 1;
        for (const extra of shown.slice(same)) extra.remove();
        for (const ch of letters.slice(same)) {
          const span = document.createElement("span");
          span.dataset.ch = ch;
          span.dataset.size = size;
          span.innerHTML = letter(ch, a.size, a.ink);
          el.append(span);
          span.animate([{ transform: "translateY(-35%) scale(1.4)", opacity: 0.2 }, { transform: "none", opacity: 1 }], { duration: 130, easing: "ease-out" });
        }
      });
    }
    for (const el of layer.querySelectorAll<HTMLElement>("[data-words]")) if (!live.has(el.dataset.words!)) el.remove();
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
  };
}
