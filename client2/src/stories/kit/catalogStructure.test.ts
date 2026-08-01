import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// СТРУКТУРА КАТАЛОГА — то, что видно в боковой навигации и что ломается тише всего: раздел
// заводят «пока сюда», и через месяц у каталога три параллельные системы деления.
//
// Проверяется чтением исходников: разделы объявляют себя литералами в `meta`, и никакого реестра,
// который можно было бы импортировать, у сторибука нет.

const dir = join(process.cwd(), "src/stories");

const files = (function walk(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = join(d, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".stories.tsx") ? [p] : [];
  });
})(dir);

const src = (f: string) => readFileSync(f, "utf8");
const short = (f: string) => f.slice(dir.length + 1);

/** Три раздела верхнего уровня — и никаких «прочих». */
const SECTIONS = ["UI-kit/", "Mechanics/", "Animations/"];

describe("структура каталога", () => {
  it("разделы вообще нашлись", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("каждый раздел лежит в одной из трёх групп: примитивы, механики, анимации", () => {
    const bad: string[] = [];
    for (const f of files) {
      const m = src(f).match(/title:\s*"([^"]+)"/);
      if (!m) {
        bad.push(`${short(f)}: нет title`);
        continue;
      }
      if (!SECTIONS.some((s) => m[1]!.startsWith(s))) bad.push(`${short(f)}: title = «${m[1]}»`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("у каждого раздела ОДИН title — два в файле значат два раздела из одного места", () => {
    for (const f of files) {
      expect([...src(f).matchAll(/title:\s*"/g)].length, short(f)).toBe(1);
    }
  });

  it("служебных объектов в панели нет: рычаг — свойство, а не структура внутри компонента", () => {
    // `control: { type: "object" }` — это редактор JSON поверх внутренностей. Пресет адресуется
    // именем, раскладка — функцией из реестра; в панели им место только в таком виде.
    const bad = files.filter((f) => /control:\s*\{\s*type:\s*"object"/.test(src(f))).map(short);
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("русский текст в разделе живёт в описаниях, а не в идентификаторах", () => {
    // Ловим самое частое: кириллица в имени экспортируемой стори и в её `name`.
    const bad: string[] = [];
    for (const f of files) {
      for (const m of src(f).matchAll(/export const ([A-Za-zА-Яа-я_$][\w$А-Яа-я]*)\s*:/g)) {
        if (/[а-яА-ЯёЁ]/.test(m[1]!)) bad.push(`${short(f)}: export ${m[1]}`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
