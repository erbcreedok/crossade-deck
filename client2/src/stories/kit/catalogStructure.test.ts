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

  // Ищем ИМЕННО заголовок раздела — «Группа/Имя». Просто `title:` не годится: это же слово носят
  // и внутренние подписи (например заголовок галереи), и тест ловил бы их вместо разделов.
  const sectionTitles = (f: string) => [...src(f).matchAll(/title:\s*"([^"]+)"/g)].map((m) => m[1]!).filter((t) => t.includes("/"));

  it("каждый раздел лежит в одной из трёх групп: примитивы, механики, анимации", () => {
    const bad: string[] = [];
    for (const f of files) {
      const titles = sectionTitles(f);
      if (!titles.length) {
        bad.push(`${short(f)}: нет title раздела`);
        continue;
      }
      for (const t of titles) if (!SECTIONS.some((s) => t.startsWith(s))) bad.push(`${short(f)}: title = «${t}»`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("у каждого файла ОДИН заголовок раздела — два значат два раздела из одного места", () => {
    for (const f of files) {
      expect(sectionTitles(f).length, short(f)).toBe(1);
    }
  });

  // Требование владельца: «в каждом unit story должна быть секция галереи, где в сетку разложены
  // разные виды, для быстрого глядения». Отдельной СТРАНИЦЕЙ: страница раздела принадлежит одной
  // вещи, которую крутят рычагами.
  it("у примитивов стола есть страница «Gallery»", () => {
    const PRIMITIVES = ["Card.stories.tsx", "Button.stories.tsx", "Stacks.stories.tsx", "Pieces.stories.tsx"];
    const bad: string[] = [];
    for (const name of PRIMITIVES) {
      const f = files.find((x) => x.endsWith(name));
      if (!f) {
        bad.push(`${name}: раздела нет вовсе`);
        continue;
      }
      const src0 = src(f);
      if (!/export const Gallery\b/.test(src0)) bad.push(`${name}: нет страницы Gallery`);
      // У галереи рычагов быть не должно: там сравнивают, а не крутят.
      else if (!/controls:\s*\{\s*disable:\s*true/.test(src0)) bad.push(`${name}: у галереи не отключены рычаги`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
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
