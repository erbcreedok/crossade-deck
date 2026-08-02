import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PIECE_ARG_TYPES } from "./pieceArgs";
import { STACK_ARG_TYPES } from "./stackArgs";
import { CARD_ARGS } from "./cardArgs";

// `name` — НАСТОЯЩЕЕ имя свойства, английское. Русский текст живёт только в `description`.
//
// Правило записано в harness/paramArgs.ts и всё равно нарушалось: подпись, которой нет в коде,
// невозможно найти ни грепом, ни в URL стори, ни в тесте — читать удобно, искать нечем.
//
// Тест нужен потому, что глазами это не ловится: рычаг с русским именем выглядит в панели ЛУЧШЕ
// соседей, и замечают его в последнюю очередь.
const CYRILLIC = /[а-яА-ЯёЁ]/;

const MODULES: Record<string, Record<string, { name?: string; description?: string }>> = {
  pieceArgs: PIECE_ARG_TYPES,
  stackArgs: STACK_ARG_TYPES,
};

describe("имена рычагов", () => {
  it("в `name` нет кириллицы — иначе свойство нельзя найти по его имени", () => {
    for (const [mod, types] of Object.entries(MODULES)) {
      for (const [key, t] of Object.entries(types)) {
        expect(CYRILLIC.test(t.name ?? ""), `${mod}.${key}: name = «${t.name}»`).toBe(false);
      }
    }
  });

  it("у каждого рычага есть человеческое пояснение", () => {
    for (const [mod, types] of Object.entries(MODULES)) {
      for (const [key, t] of Object.entries(types)) {
        expect((t.description ?? "").length, `${mod}.${key}: пустое описание`).toBeGreaterThan(10);
      }
    }
  });

  it("описание не пересказывает имя, а объясняет смысл", () => {
    for (const [mod, types] of Object.entries(MODULES)) {
      for (const [key, t] of Object.entries(types)) {
        const d = (t.description ?? "").trim().toLowerCase();
        expect(d, `${mod}.${key}: описание повторяет имя`).not.toBe((t.name ?? "").toLowerCase());
      }
    }
  });

  it("у карты имя рычага — сам ключ опции: разойтись с `CardOptions` он не может", () => {
    // CARD_ARGS сторожится типом (`satisfies Record<keyof CardOptions, …>`), а имя рычага панель
    // берёт из КЛЮЧА. Проверяем, что ключи английские — тогда и имена английские по построению.
    for (const key of Object.keys(CARD_ARGS)) {
      expect(CYRILLIC.test(key), `CARD_ARGS.${key}`).toBe(false);
    }
  });
});

// Стори объявляют рычаги не только модулями `*Args.ts`, но и литералами прямо в `meta.argTypes`, —
// а нарушали правило как раз там. Модульная проверка выше их не видит вовсе, поэтому имена
// вычитываются ИЗ ИСХОДНИКОВ: так покрыт и тот раздел, который напишут завтра.
describe("имена рычагов во всех стори", () => {
  const dir = join(process.cwd(), "src/stories");

  const files = (function walk(d: string): string[] {
    return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = join(d, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.tsx?$/.test(e.name) ? [p] : [];
    });
  })(dir);

  it("файлы стори вообще нашлись — иначе тест зелен впустую", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("ни одно `name:` в каталоге не написано кириллицей", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bname:\s*"([^"]*)"/g)) {
        if (CYRILLIC.test(m[1]!)) bad.push(`${f.slice(dir.length + 1)}: name = «${m[1]}»`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
