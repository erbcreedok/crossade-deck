import { describe, expect, it } from "vitest";
import { KEYBOARD, LINE_LINGER_MS, LINE_MAX, LINES_MAX, Lines, SHOT_MS, SHOTS_MAX, SYMBOLS, Shots, Typer, cleanSay, cleanShot, graphemes, type Piece, type SayOut } from "./say.js";

const text = (out: SayOut) => out.pieces.map((p) => (p.t === "text" ? p.text : `<${p.t}:${"key" in p ? p.key : p.id}>`)).join("");
const say = (n: number, t: string, done?: true): SayOut => ({ n, pieces: t ? [{ t: "text", text: t }] : [], ...(done ? { done } : {}) });

describe("строки у стула", () => {
  it("клавиатура: латиница с цифрами, кириллица с казахскими, эмодзи — одним символом, пробел", () => {
    for (const ch of "1Q9ZӘІҢҒҮҰҚӨҺЙЁЪ?! ") expect(SYMBOLS.has(ch), ch).toBe(true);
    expect(SYMBOLS.has("q")).toBe(false);
    expect(graphemes(KEYBOARD.emoji[1]).includes("❤️")).toBe(true);
  });

  it("с сети — символы клавиатуры, не длиннее строки, отметки по id; стикер — не кусок строки", () => {
    expect(cleanSay(say(1, "ПРИВЕТ 😀!"))).toEqual(say(1, "ПРИВЕТ 😀!"));
    expect(cleanSay(say(1, "привет"))).toBeNull();
    expect(cleanSay(say(1, "<b>"))).toBeNull();
    expect(cleanSay(say(1, "A".repeat(LINE_MAX + 1)))).toBeNull();
    expect(cleanSay({ n: -1, pieces: [] })).toBeNull();
    expect(cleanSay({ n: 1, text: "A" })).toBeNull();
    const mixed: Piece[] = [{ t: "text", text: "ЙОО " }, { t: "who", key: "tg:42" }, { t: "text", text: " ПОДНИМИ " }, { t: "card", id: "h6" }];
    expect(cleanSay({ n: 2, pieces: mixed, done: true })).toEqual({ n: 2, pieces: mixed, done: true });
    expect(cleanSay({ n: 2, pieces: [{ t: "who", key: "<script>" }] })).toBeNull();
    expect(cleanSay({ n: 2, pieces: [{ t: "sticker", id: "s1" }], done: true })).toBeNull();
    expect(cleanShot({ id: "s1" })).toEqual({ id: "s1" });
    expect(cleanShot({ id: "<x>" })).toBeNull();
  });

  it("машинка: буквы и пробелы копятся в строку, стиратель убирает, Enter заканчивает", () => {
    const sent: SayOut[] = [];
    const t = new Typer((o) => sent.push(o));
    for (const ch of ["Д", "А", " ", "😀"]) t.key(ch);
    t.erase();
    expect(sent.map(text)).toEqual(["Д", "ДА", "ДА ", "ДА 😀", "ДА "]);
    expect(t.left).toBe(LINE_MAX - 3);
    t.end();
    expect(sent.at(-1)).toEqual({ n: 1, pieces: [{ t: "text", text: "ДА" }], done: true });
    t.erase();
    t.key(" ");
    expect(sent.length).toBe(6);
    t.key("q");
    expect(sent.length).toBe(6);
  });

  it("строка полна — слово обрывается, следующая буква — новая строка", () => {
    const sent: SayOut[] = [];
    const t = new Typer((o) => sent.push(o));
    for (let i = 0; i < LINE_MAX; i += 1) t.key("A");
    expect(sent.at(-1)).toEqual({ n: 1, pieces: [{ t: "text", text: "A".repeat(LINE_MAX) }], done: true });
    t.key("B");
    expect(sent.at(-1)).toEqual({ n: 2, pieces: [{ t: "text", text: "B" }] });
  });

  it("отметка — целиком, по своей длине; не влезла — уходит на новую строку; стирается целиком", () => {
    const sent: SayOut[] = [];
    const length = (p: Piece) => (p.t === "who" ? 11 : p.t === "card" ? 2 : graphemes((p as { text: string }).text).length);
    const t = new Typer((o) => sent.push(o), length);
    for (const ch of "ЙОО") t.key(ch);
    t.mention({ t: "who", key: "tg:1" });
    expect(text(sent.at(-1)!)).toBe("ЙОО <who:tg:1> ");
    for (const ch of "ПОДНИМИ") t.key(ch);
    expect(t.left).toBe(LINE_MAX - 4 - 11 - 1 - 7);
    t.mention({ t: "who", key: "tg:2" });
    expect(sent.at(-2)!.done).toBe(true);
    expect(text(sent.at(-2)!)).toBe("ЙОО <who:tg:1> ПОДНИМИ");
    expect(sent.at(-1)).toMatchObject({ n: 2 });
    expect(text(sent.at(-1)!)).toBe("<who:tg:2> ");
    t.erase();
    t.erase();
    expect(sent.at(-1)!.pieces).toEqual([]);
  });

  it("выстрелы: не больше трёх в полёте у человека, слот освобождается, когда стикер дотаял", () => {
    const s = new Shots();
    for (let i = 0; i < SHOTS_MAX; i += 1) expect(s.fire("a", 100 * i)).toBe(true);
    expect(s.fire("a", 300)).toBe(false);
    expect(s.free("a", 300)).toBe(0);
    expect(s.fire("b", 300)).toBe(true);
    expect(s.nextIn("a", 500)).toBe(SHOT_MS - 500);
    expect(s.fire("a", SHOT_MS - 1)).toBe(false);
    expect(s.fire("a", SHOT_MS)).toBe(true);
    expect(s.free("a", SHOT_MS)).toBe(0);
    expect(s.free("a", SHOT_MS + 100)).toBe(1);
  });

  it("жизнь: незаконченная висит, законченная улетает по таймеру; не больше трёх, новая снизу", () => {
    const w = new Lines();
    const shown = (by: string) => w.of(by).map((l) => text({ n: l.n, pieces: l.pieces }));
    w.hear("a", say(1, "ПРИ"), 0);
    w.tick(60_000);
    expect(shown("a")).toEqual(["ПРИ"]);
    w.hear("a", say(1, "ПРИВЕТ", true), 100);
    w.hear("a", say(2, "КАК"), 200);
    expect(shown("a")).toEqual(["ПРИВЕТ", "КАК"]);
    w.hear("a", say(1, "ПРИВЕТИК"), 300);
    expect(shown("a")[0]).toBe("ПРИВЕТ");
    expect(w.tick(100 + LINE_LINGER_MS)).toBe(true);
    expect(shown("a")).toEqual(["КАК"]);
    for (const n of [3, 4, 5]) w.hear("a", say(n, String(n), true), 400);
    expect(shown("a")).toEqual(["3", "4", "5"]);
    expect(w.of("a").length).toBe(LINES_MAX);
    w.hear("b", say(1, "Z"), 0);
    w.hear("b", say(1, ""), 0);
    expect(w.who).toEqual(["a"]);
    w.drop("a");
    expect(w.who).toEqual([]);
  });
});
