import { describe, it, expect } from "vitest";
import { PIECE_ARG_TYPES } from "./pieceArgs";
import { STACK_ARG_TYPES } from "./stackArgs";

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
});
