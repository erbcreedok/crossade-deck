// СТРОКИ У СТУЛА — диалог через свою клавиатуру. Как палец в воздухе: поток мимо версий и истории стола.
//
// Печатающий шлёт строку целиком после каждой клавиши (`SayOut`), сервер проверяет и пересылает остальным
// (`Say`). Строка — куски: текст, отметка игрока, отметка карты, стикер. Жизнь строки одна у всех и считается
// здесь: пока строка пишется — висит; законченная (Enter, пауза `LINE_PAUSE_MS`, закрыта клавиатура, строка
// полна) висит ещё `LINE_LINGER_MS` и улетает вверх. У стула — до `LINES_MAX` строк: новая встаёт снизу,
// старые поднимаются, лишняя верхняя улетает сразу.
//
// СТИКЕР — не строка, а выстрел (`Shot`): вылетает от стула сам по себе и тает за `SHOT_MS`. В полёте у
// человека не больше `SHOTS_MAX`: лишний не отправит клиент и не перешлёт сервер — все видят одно и то же.

import { EMOJI } from "./emoji.js";

/** Секции клавиатуры: цифры и латиница, кириллица с казахскими, эмодзи. Буквы — одним регистром. */
export const KEYBOARD = {
  latin: ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"],
  cyrillic: ["ӘІҢҒҮҰҚӨҺ", "ЙЦУКЕНГШЩЗХ", "ФЫВАПРОЛДЖЭ", "ЯЧСМИТЬБЮЪЁ"],
  emoji: ["😀😂😍😎😭😡👍👎", "👏🙏🔥💯❤️💔🤔😱", "🎉🃏♠️♥️♦️♣️👀🤝"],
} as const;
export type KeyboardSection = keyof typeof KEYBOARD;
export const KEYBOARD_SECTIONS = Object.keys(KEYBOARD) as KeyboardSection[];
/** Клавиши, которые есть в каждой секции. Пробел и стиратель — не символы, а действия. */
export const EVERYWHERE = ["?", "!"] as const;

/** Сколько символов в строке. Не влезло — слово обрывается, остальное идёт новой строкой. */
export const LINE_MAX = 24;
/** Сколько строк висит у стула разом. */
export const LINES_MAX = 3;
/** Замолчал на столько — строка закончена. */
export const LINE_PAUSE_MS = 3000;
/** Законченная строка висит ещё столько. */
export const LINE_LINGER_MS = 5000;
/** Сколько кусков может быть в строке с сети — чтобы отметками не набить бесконечную строку. */
export const PIECES_MAX = LINE_MAX;

/**
 * КУСОК СТРОКИ. Отметка игрока — его key, имя и цвет каждый зритель берёт у себя; отметка карты — её id, лицо
 * видно только тому, кто это лицо и так видит.
 */
export type Piece = { t: "text"; text: string } | { t: "who"; key: string } | { t: "card"; id: string };

/** Строка в пути: печатающий → сервер. `n` — номер строки у печатающего; `done` — закончена. */
export interface SayOut {
  n: number;
  pieces: Piece[];
  done?: true;
}
/** Строка в пути: сервер → остальные. */
export interface Say extends SayOut {
  by: string;
}

/** Все символы клавиатуры — только ими и пишут. Эмодзи — как нарисованы на клавише, с селектором. Пробел — тоже. */
export const SYMBOLS: ReadonlySet<string> = new Set([
  ...EMOJI,
  ...KEYBOARD_SECTIONS.flatMap((sec) => KEYBOARD[sec].flatMap((row) => graphemes(row))),
  ...EVERYWHERE,
  " ",
]);

/** Буквы слова как их видно: эмодзи с селектором и ♥️ — одна буква. */
export function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: "grapheme" }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  return [...text];
}

const ID = /^[A-Za-z0-9:_-]{1,64}$/;

/** Строка с сети: проверена или `null`. Текст — только символы клавиатуры и не длиннее строки; отметки — id. */
export function cleanSay(raw: unknown): SayOut | null {
  const out = raw as Partial<SayOut> | null;
  if (!out || !Array.isArray(out.pieces) || !Number.isSafeInteger(out.n) || out.n! < 0 || out.pieces.length > PIECES_MAX) return null;
  const pieces: Piece[] = [];
  let letters = 0;
  for (const raw of out.pieces as unknown[]) {
    const p = raw as Record<string, unknown> | null;
    if (p?.t === "text" && typeof p.text === "string") {
      const chars = graphemes(p.text);
      letters += chars.length;
      if (!chars.length || !chars.every((ch) => SYMBOLS.has(ch))) return null;
      pieces.push({ t: "text", text: p.text });
    } else if (p?.t === "who" && typeof p.key === "string" && ID.test(p.key)) pieces.push({ t: "who", key: p.key });
    else if (p?.t === "card" && typeof p.id === "string" && ID.test(p.id)) pieces.push({ t: "card", id: p.id });
    else return null;
  }
  if (letters > LINE_MAX) return null;
  return { n: out.n!, pieces, ...(out.done === true ? { done: true as const } : {}) };
}

/** Сколько стикер летит и тает. */
export const SHOT_MS = 2000;
/** Сколько стикеров одного человека в полёте разом. */
export const SHOTS_MAX = 3;

/** Выстрел стикером: клиент → сервер. */
export interface ShotOut {
  id: string;
}
/** Выстрел стикером: сервер → остальные. */
export interface Shot extends ShotOut {
  by: string;
}

export function cleanShot(raw: unknown): ShotOut | null {
  const out = raw as Partial<ShotOut> | null;
  return out && typeof out.id === "string" && ID.test(out.id) ? { id: out.id } : null;
}

/**
 * СЛОТЫ ВЫСТРЕЛОВ — у каждого человека `SHOTS_MAX` на `window` мс. Одно правило у клиента (кнопка гаснет) и у
 * сервера (лишнее не пересылается); сервер берёт окно чуть короче — запаздывание сети не съедает честный выстрел.
 */
export class Shots {
  private byWho = new Map<string, number[]>();

  constructor(private readonly window = SHOT_MS) {}

  private live(by: string, now: number): number[] {
    const list = (this.byWho.get(by) ?? []).filter((t) => now - t < this.window);
    this.byWho.set(by, list);
    return list;
  }

  /** Сколько выстрелов ещё можно сейчас. */
  free(by: string, now: number): number {
    return SHOTS_MAX - this.live(by, now).length;
  }

  /** Занять слот: `false` — все заняты, выстрела нет. */
  fire(by: string, now: number): boolean {
    const list = this.live(by, now);
    if (list.length >= SHOTS_MAX) return false;
    list.push(now);
    return true;
  }

  /** Когда освободится ближайший слот (мс с этого `now`), `0` — свободен уже. */
  nextIn(by: string, now: number): number {
    const list = this.live(by, now);
    return list.length < SHOTS_MAX ? 0 : this.window - (now - list[0]!);
  }
}

/** Строка у стула. `doneAt` — когда закончена (часы зрителя). */
export interface Line {
  n: number;
  pieces: Piece[];
  doneAt?: number;
}

/**
 * СТРОКИ У ВСЕХ СТУЛЬЕВ — одна и та же жизнь у печатающего и у зрителей. `hear` — пришла строка, `tick` —
 * убрать отвисевшие. Возвращает, изменилось ли что-то.
 */
export class Lines {
  private byWho = new Map<string, Line[]>();

  hear(by: string, say: SayOut, now: number): void {
    const list = this.byWho.get(by) ?? [];
    const i = list.findIndex((w) => w.n === say.n);
    // Законченная строка не переписывается: опоздавшая буква после паузы — уже новая строка.
    if (i >= 0 && list[i]!.doneAt !== undefined) return;
    const line: Line = { n: say.n, pieces: say.pieces, ...(say.done ? { doneAt: now } : {}) };
    // Стёртая до пустоты — её нет.
    if (say.pieces.length === 0) {
      if (i >= 0) list.splice(i, 1);
    } else if (i >= 0) {
      list[i] = line;
    } else if (!list.some((w) => w.n > say.n)) {
      list.push(line);
      while (list.length > LINES_MAX) list.shift();
    }
    if (list.length) this.byWho.set(by, list);
    else this.byWho.delete(by);
  }

  tick(now: number): boolean {
    let changed = false;
    for (const [by, list] of this.byWho) {
      const left = list.filter((w) => w.doneAt === undefined || now - w.doneAt < LINE_LINGER_MS);
      if (left.length === list.length) continue;
      changed = true;
      if (left.length) this.byWho.set(by, left);
      else this.byWho.delete(by);
    }
    return changed;
  }

  /** Строки человека сверху вниз: первая — самая старая, последняя — внизу. */
  of(by: string): readonly Line[] {
    return this.byWho.get(by) ?? [];
  }

  /** Замолчать человека у себя: его строки убраны. */
  drop(by: string): void {
    this.byWho.delete(by);
  }

  get who(): string[] {
    return [...this.byWho.keys()];
  }
}

/** Сколько места кусок занимает в строке. Длину отметки знает печатающий (имя, «10♥»). */
export type PieceLength = (piece: Piece) => number;

export function lineLength(pieces: readonly Piece[], length: PieceLength): number {
  return pieces.reduce((sum, p) => sum + length(p), 0);
}

/**
 * ПЕЧАТНАЯ МАШИНКА — моя сторона: что нажато, во что это превращается на проводе. Паузу считает
 * вызывающий (`idle`), здесь — только правило строки.
 */
export class Typer {
  private n = 0;
  private pieces: Piece[] = [];
  private open = false;

  constructor(
    private readonly send: (out: SayOut) => void,
    private readonly length: PieceLength = (p) => (p.t === "text" ? graphemes(p.text).length : 1),
  ) {}

  private start(): void {
    this.open = true;
    this.n += 1;
    this.pieces = [];
  }

  private push(): void {
    this.send({ n: this.n, pieces: this.pieces.map((p) => ({ ...p })) });
  }

  /** Сколько символов ещё влезает в строку. */
  get left(): number {
    return LINE_MAX - (this.open ? lineLength(this.pieces, this.length) : 0);
  }

  /** Символ клавиатуры. Не влезает — строка закончена, символ начинает новую (слово просто обрывается). */
  key(ch: string): void {
    if (!SYMBOLS.has(ch)) return;
    if (ch === " " && (!this.open || this.pieces.length === 0)) return;
    if (this.open && this.left < 1) this.end();
    if (ch === " " && !this.open) return;
    if (!this.open) this.start();
    const last = this.pieces.at(-1);
    if (last?.t === "text") last.text += ch;
    else this.pieces.push({ t: "text", text: ch });
    this.push();
    if (this.left < 1) this.end();
  }

  /** Отметка игрока или карты — целиком: не влезает в начатую строку — уходит на новую. */
  mention(piece: Extract<Piece, { t: "who" | "card" }>): void {
    if (this.open && this.pieces.length && this.length(piece) > this.left) this.end();
    if (!this.open) this.start();
    const last = this.pieces.at(-1);
    // Отметка отделена пробелом от текста перед ней.
    if (last && !(last.t === "text" && last.text.endsWith(" ")) && this.left > this.length(piece)) {
      if (last.t === "text") last.text += " ";
      else this.pieces.push({ t: "text", text: " " });
    }
    this.pieces.push(piece);
    if (this.left > 0) this.pieces.push({ t: "text", text: " " });
    this.push();
    if (this.left < 1) this.end();
  }

  /** Стиратель: последняя буква или отметка целиком. Законченную строку уже не стереть. */
  erase(): void {
    if (!this.open) return;
    const last = this.pieces.at(-1);
    if (last?.t === "text") {
      last.text = graphemes(last.text).slice(0, -1).join("");
      if (!last.text) this.pieces.pop();
    } else this.pieces.pop();
    this.push();
    if (this.pieces.length === 0) this.open = false;
  }

  /** Enter, пауза, закрытая клавиатура — строка закончена. */
  end(): void {
    if (!this.open) return;
    this.open = false;
    const last = this.pieces.at(-1);
    if (last?.t === "text" && last.text.trimEnd() !== last.text) {
      last.text = last.text.trimEnd();
      if (!last.text) this.pieces.pop();
    }
    this.send({ n: this.n, pieces: this.pieces.map((p) => ({ ...p })), done: true });
  }

  get typing(): boolean {
    return this.open;
  }
}
