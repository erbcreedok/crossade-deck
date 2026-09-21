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
import { allowed } from "./access.js";
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
    const ask = { face: () => undefined, pile: () => [], hand: () => [], admin: () => false, croupier: () => false };
    for (const key of ["hand.take", "pile.drop", "card.cover", "pile.grip"] as const) {
      expect(allowed(SANDBOX.says(ask, key, { by: "me" })), `песочница молчит про ${key}`).toBe(true);
    }
  });

  it("СТОЛ ДЕЙСТВИТЕЛЬНО СПРАШИВАЕТ ИГРУ — и на всех путях, которыми ходит карта", () => {
    const text = readFileSync(join(HERE, "table.ts"), "utf8");
    expect(text, "вопрос игре задаётся").toContain("this.desk.says(");
    for (const key of ["hand.take", "pile.take", "hand.drop", "pile.drop", "card.cover", "pile.grip"]) {
      expect(text, `ключ ${key} игре не задают ни разу`).toContain(`"${key}"`);
    }
  });

  it("у игры один вопрос, а не набор своих методов", () => {
    const rules = readFileSync(join(HERE, "rules.ts"), "utf8");
    const own = [...rules.matchAll(/^\s{2}(may[A-Z]\w*|handMax)\??\(/gm)].map((m) => m[1]);
    expect(own, "новая мысль игры — не новый метод, а ответ на ключ").toEqual([]);
  });
});

describe("комната не знает, какая игра на столе", () => {
  it("room.knows-no-game: ни имён игр, ни их модулей в TableRoom — судью ей даёт каталог", () => {
    const room = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TableRoom.ts"), "utf8");
    expect(room).not.toMatch(/from "\.\/games\//);
    expect(room).not.toMatch(/krest|durak|belka/i);
  });
});
