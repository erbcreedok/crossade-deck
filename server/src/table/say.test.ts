import { describe, expect, it } from "vitest";
import { KEYBOARD, SYMBOLS, Typer, WORD_LINGER_MS, WORD_MAX, Words, cleanSay, graphemes, type SayOut } from "./say.js";

describe("слова у стула", () => {
  it("клавиатура: латиница с цифрами, кириллица с казахскими, эмодзи — одним символом", () => {
    for (const ch of "1Q9ZӘІҢҒҮҰҚӨҺЙЁЪ?!") expect(SYMBOLS.has(ch), ch).toBe(true);
    expect(SYMBOLS.has("q")).toBe(false);
    expect(graphemes(KEYBOARD.emoji[1]).includes("❤️")).toBe(true);
    expect(SYMBOLS.has("❤️")).toBe(true);
  });

  it("с сети — только символы клавиатуры и не длиннее лимита", () => {
    expect(cleanSay({ n: 1, text: "ПРИВЕТ😀!" })).toEqual({ n: 1, text: "ПРИВЕТ😀!" });
    expect(cleanSay({ n: 1, text: "привет" })).toBeNull();
    expect(cleanSay({ n: 1, text: "<b>" })).toBeNull();
    expect(cleanSay({ n: 1, text: "A".repeat(WORD_MAX + 1) })).toBeNull();
    expect(cleanSay({ n: -1, text: "A" })).toBeNull();
    expect(cleanSay({ n: 2, text: "A", done: true })).toEqual({ n: 2, text: "A", done: true });
  });

  it("машинка: буквы копятся, стиратель убирает, пробел заканчивает, лимит заканчивает сам", () => {
    const sent: SayOut[] = [];
    const t = new Typer((o) => sent.push(o));
    t.key("Д");
    t.key("А");
    t.key("😀");
    t.erase();
    t.end();
    expect(sent.map((o) => o.text)).toEqual(["Д", "ДА", "ДА😀", "ДА", "ДА"]);
    expect(sent.at(-1)).toEqual({ n: 1, text: "ДА", done: true });
    t.erase();
    expect(sent.length).toBe(5);
    for (let i = 0; i < WORD_MAX; i += 1) t.key("A");
    expect(sent.at(-1)).toEqual({ n: 2, text: "A".repeat(WORD_MAX), done: true });
    t.key("B");
    expect(sent.at(-1)).toEqual({ n: 3, text: "B" });
    t.key("q");
    expect(sent.at(-1)!.text).toBe("B");
  });

  it("жизнь: незаконченное висит, законченное исчезает целиком; не больше трёх, новое сверху", () => {
    const w = new Words();
    w.hear("a", { n: 1, text: "ПРИ" }, 0);
    w.tick(60_000);
    expect(w.of("a").map((x) => x.text)).toEqual(["ПРИ"]);
    w.hear("a", { n: 1, text: "ПРИВЕТ", done: true }, 100);
    w.hear("a", { n: 2, text: "КАК" }, 200);
    expect(w.of("a").map((x) => x.text)).toEqual(["ПРИВЕТ", "КАК"]);
    w.hear("a", { n: 1, text: "ПРИВЕТИК" }, 300);
    expect(w.of("a")[0]!.text).toBe("ПРИВЕТ");
    expect(w.tick(100 + WORD_LINGER_MS)).toBe(true);
    expect(w.of("a").map((x) => x.text)).toEqual(["КАК"]);
    for (const n of [3, 4, 5]) w.hear("a", { n, text: String(n), done: true }, 400);
    expect(w.of("a").map((x) => x.text)).toEqual(["3", "4", "5"]);
    w.hear("a", { n: 6, text: "" }, 500);
    w.hear("a", { n: 5, text: "" }, 500);
    expect(w.of("a").length).toBe(3);
    w.hear("b", { n: 1, text: "Z" }, 0);
    w.hear("b", { n: 1, text: "" }, 0);
    expect(w.who).toEqual(["a"]);
  });
});
