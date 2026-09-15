// СЛОВА У СТУЛА — диалог через свою клавиатуру. Как палец в воздухе: поток мимо версий и истории стола.
//
// Печатающий шлёт слово целиком после каждой клавиши (`SayOut`), сервер проверяет и пересылает остальным
// (`Say`). Жизнь слова одна у всех и считается здесь: пока слово пишется — висит; законченное (пробел,
// пауза, закрыта клавиатура, лимит букв) висит ещё `WORD_LINGER_MS` и исчезает целиком. У стула — до
// `WORDS_MAX` слов: новое встаёт выше, исчезнувшее нижнее роняет остальные вниз.

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

/** Сколько символов в слове: дописал столько — слово закончено. */
export const WORD_MAX = 16;
/** Сколько слов висит у стула разом. */
export const WORDS_MAX = 3;
/** Замолчал на столько — слово закончено. */
export const WORD_PAUSE_MS = 1500;
/** Законченное слово висит ещё столько. */
export const WORD_LINGER_MS = 2000;

/** Слово в пути: печатающий → сервер. `n` — номер слова у печатающего; `done` — закончено. */
export interface SayOut {
  n: number;
  text: string;
  done?: true;
}
/** Слово в пути: сервер → остальные. */
export interface Say extends SayOut {
  by: string;
}

/** Все символы клавиатуры — только ими и пишут. Эмодзи — как нарисованы на клавише, с селектором. */
export const SYMBOLS: ReadonlySet<string> = new Set([
  ...KEYBOARD_SECTIONS.flatMap((sec) => KEYBOARD[sec].flatMap((row) => graphemes(row))),
  ...EVERYWHERE,
]);

/** Буквы слова как их видно: эмодзи с селектором и ♥️ — одна буква. */
export function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: "grapheme" }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  return [...text];
}

/** Слово с сети: проверено или `null`. Только символы клавиатуры, не длиннее лимита. */
export function cleanSay(raw: unknown): SayOut | null {
  const out = raw as Partial<SayOut> | null;
  if (!out || typeof out.text !== "string" || !Number.isSafeInteger(out.n) || out.n! < 0) return null;
  const letters = graphemes(out.text);
  if (letters.length > WORD_MAX || !letters.every((ch) => SYMBOLS.has(ch))) return null;
  return { n: out.n!, text: out.text, ...(out.done === true ? { done: true as const } : {}) };
}

/** Слово у стула. `doneAt` — когда закончено (часы зрителя). */
export interface Word {
  n: number;
  text: string;
  doneAt?: number;
}

/**
 * СЛОВА У ВСЕХ СТУЛЬЕВ — одна и та же жизнь у печатающего и у зрителей. `hear` — пришло слово, `tick` —
 * убрать отвисевшие. Возвращает, изменилось ли что-то.
 */
export class Words {
  private byWho = new Map<string, Word[]>();

  hear(by: string, say: SayOut, now: number): void {
    const list = this.byWho.get(by) ?? [];
    const i = list.findIndex((w) => w.n === say.n);
    // Законченное слово не переписывается: опоздавшая буква после паузы — уже новое слово.
    if (i >= 0 && list[i]!.doneAt !== undefined) return;
    // Стёртое до пустоты и незаконченное — его нет. Законченное пустым — тоже.
    if (say.text === "") {
      if (i >= 0) list.splice(i, 1);
    } else if (i >= 0) {
      list[i] = { n: say.n, text: say.text, ...(say.done ? { doneAt: now } : {}) };
    } else if (!list.some((w) => w.n > say.n)) {
      list.push({ n: say.n, text: say.text, ...(say.done ? { doneAt: now } : {}) });
      while (list.length > WORDS_MAX) list.shift();
    }
    if (list.length) this.byWho.set(by, list);
    else this.byWho.delete(by);
  }

  tick(now: number): boolean {
    let changed = false;
    for (const [by, list] of this.byWho) {
      const left = list.filter((w) => w.doneAt === undefined || now - w.doneAt < WORD_LINGER_MS);
      if (left.length === list.length) continue;
      changed = true;
      if (left.length) this.byWho.set(by, left);
      else this.byWho.delete(by);
    }
    return changed;
  }

  /** Слова человека снизу вверх: первое — самое старое. */
  of(by: string): readonly Word[] {
    return this.byWho.get(by) ?? [];
  }

  get who(): string[] {
    return [...this.byWho.keys()];
  }
}

/**
 * ПЕЧАТНАЯ МАШИНКА — моя сторона: что нажато, во что это превращается на проводе. Паузу считает
 * вызывающий (`idle`), здесь — только правило.
 */
export class Typer {
  private n = 0;
  private text = "";
  private open = false;

  constructor(private readonly send: (out: SayOut) => void) {}

  /** Символ клавиатуры. Добитый до лимита — слово закончено. */
  key(ch: string): void {
    if (!SYMBOLS.has(ch)) return;
    if (!this.open) {
      this.open = true;
      this.n += 1;
      this.text = "";
    }
    this.text += ch;
    const full = graphemes(this.text).length >= WORD_MAX;
    this.send({ n: this.n, text: this.text, ...(full ? { done: true as const } : {}) });
    if (full) this.open = false;
  }

  /** Стиратель: последняя буква незаконченного слова. Законченное уже не стереть. */
  erase(): void {
    if (!this.open) return;
    this.text = graphemes(this.text).slice(0, -1).join("");
    this.send({ n: this.n, text: this.text });
    if (this.text === "") this.open = false;
  }

  /** Пробел, пауза, закрытая клавиатура — слово закончено. */
  end(): void {
    if (!this.open) return;
    this.open = false;
    this.send({ n: this.n, text: this.text, done: true });
  }

  get typing(): boolean {
    return this.open;
  }
}
