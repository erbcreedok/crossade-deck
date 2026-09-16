// СТОРОЖ НА САМ ЗАКОН — единственный, который проверяет не то, что РАБОТАЕТ, а то, что НЕ НАПИСАНО.
//
// Владелец сказал это прямым текстом: никаких `if (cheatingEnabled)`, никаких `if (game === …)`,
// никаких двух похожих кусков кода в двух ветках. Без сторожа такой закон живёт до первой спешки —
// до ближайшей ночи, когда «одна маленькая ветка» окажется быстрее, чем значение в конфиге.
//
// Проверка сторожа поломкой: вписать в рантайм `if (game === "crossade")` и увидеть падение.

import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { SANDBOX } from "./rules.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Рантайм стола — всё, что исполняется во время игры. Тесты и словарь прав сюда не входят. */
const runtime = (): { name: string; text: string }[] =>
  readdirSync(HERE)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "rules.ts")
    .map((name) => ({ name, text: readFileSync(join(HERE, name), "utf8") }));

/** Строки без комментариев: закон запрещает ВЕТВЛЕНИЯ, а не разговор о них. */
const code = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, ""))
    .filter((line) => line.trim().length > 0);

describe("рантайм стола не знает, какая на нём игра", () => {
  /**
   * Названия игр в коде рантайма. Пресеты (какая колода, какие лица) — данные и живут в контракте;
   * запрещено именно ВЕТВЛЕНИЕ по названию: `if (game === "durak")`.
   */
  it("не ветвится по названию игры", () => {
    const names = ["crossade", "durak", "krest", "belka", "chess", "poker"];
    const guilty: string[] = [];
    for (const file of runtime()) {
      for (const line of code(file.text)) {
        if (!/\b(if|switch|case|\?|&&|\|\|)\b|[?]/.test(line)) continue;
        for (const game of names) {
          if (new RegExp(`["'\`]${game}["'\`]`, "i").test(line)) guilty.push(`${file.name}: ${line.trim()}`);
        }
      }
    }
    expect(guilty, "игра описывается конфигом прав, а не веткой в рантайме").toEqual([]);
  });

  /**
   * Тумблеры правил — мухлёж, переводной, подкидной, строгий. Каждый из них должен быть ЗНАЧЕНИЕМ
   * в правилах рода стола, а не условием в коде: иначе следующая комбинация требует пятого имени.
   */
  it("не ветвится по тумблерам правил", () => {
    const flags = ["cheat", "cheating", "perevod", "podkid", "strict", "mastodon"];
    const guilty: string[] = [];
    for (const file of runtime()) {
      for (const line of code(file.text)) {
        for (const flag of flags) {
          if (new RegExp(`\\b${flag}\\w*\\b`, "i").test(line)) guilty.push(`${file.name}: ${line.trim()}`);
        }
      }
    }
    expect(guilty, "мухлёж — не флаг в коде, а пресет прав").toEqual([]);
  });

  it("песочница — это стол, где разрешено всё, а не стол без правил", () => {
    const ask = { face: () => undefined, pile: () => [], hand: () => [], admin: () => false };
    expect(SANDBOX.mayTake(ask, "x", { in: "felt" }, "me")).toBe(true);
    expect(SANDBOX.mayDrop(ask, "x", { in: "felt" }, "me")).toBe(true);
    expect(SANDBOX.mayCover(ask, "x", "y", "me")).toBe(true);
    expect(SANDBOX.mayGrip(ask, "p1", "me")).toBe(true);
    expect(SANDBOX.handMax(ask, "c1")).toBe(Infinity);
  });

  it("каждый вопрос словаря стол действительно задаёт", () => {
    const text = readFileSync(join(HERE, "table.ts"), "utf8");
    for (const q of ["mayTake", "mayDrop", "mayCover", "handMax", "mayGrip"]) {
      expect(text, `правило ${q} заведено, но стол его не спрашивает`).toContain(`this.desk.${q}(`);
    }
  });
});
