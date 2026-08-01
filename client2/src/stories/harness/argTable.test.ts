import { describe, it, expect } from "vitest";
import { fillDefaults, fillTypes, type ArgTypeRow } from "./argTable";

// Колонки Default и «тип» в таблице рычагов. Оба правила высказаны владельцем после того, как
// таблица соврала: дефолт был пуст ВЕЗДЕ, а тип печатался выведенным из значения — `string` под
// списком из четырёх вариантов.

describe("fillDefaults", () => {
  it("дефолт берётся из начальных аргументов стори — второго источника правды нет", () => {
    const at: Record<string, ArgTypeRow> = { size: {}, faceUp: {} };
    fillDefaults({ argTypes: at, initialArgs: { size: 1.2, faceUp: true } });
    expect(at.size!.table!.defaultValue).toEqual({ summary: "1.2" });
    expect(at.faceUp!.table!.defaultValue).toEqual({ summary: "true" });
  });

  it("строка печатается как есть, без кавычек — в колонке они читались бы как часть значения", () => {
    const at: Record<string, ArgTypeRow> = { back: {} };
    fillDefaults({ argTypes: at, initialArgs: { back: "ruby" } });
    expect(at.back!.table!.defaultValue).toEqual({ summary: "ruby" });
  });

  it("заданный вручную дефолт не перетирается", () => {
    const at: Record<string, ArgTypeRow> = { size: { table: { defaultValue: { summary: "своё" } } } };
    fillDefaults({ argTypes: at, initialArgs: { size: 1 } });
    expect(at.size!.table!.defaultValue).toEqual({ summary: "своё" });
  });

  it("рычаг без начального аргумента остаётся без дефолта — выдумывать его нечем", () => {
    const at: Record<string, ArgTypeRow> = { ghost: {} };
    fillDefaults({ argTypes: at, initialArgs: {} });
    expect(at.ghost!.table?.defaultValue).toBeUndefined();
  });

  it("соседние поля таблицы переживают заполнение", () => {
    const at: Record<string, ArgTypeRow> = { size: { table: { type: { summary: "number" } } } };
    fillDefaults({ argTypes: at, initialArgs: { size: 1 } });
    expect(at.size!.table!.type).toEqual({ summary: "number" });
  });
});

describe("fillTypes", () => {
  it("у списка выбора — НАСТОЯЩИЙ союз, а не выведенный из значения `string`", () => {
    const at: Record<string, ArgTypeRow> = { pose: { options: ["rest", "lifted", "held"] } };
    fillTypes({ argTypes: at });
    expect(at.pose!.table!.type).toEqual({ summary: '"rest" | "lifted" | "held"' });
  });

  it("у тумблера и слайдера тип снят: он не сообщает ничего сверх самого контрола", () => {
    const at: Record<string, ArgTypeRow> = { faceUp: { type: { name: "boolean" } }, size: { type: { name: "number" } } };
    fillTypes({ argTypes: at });
    // Таблица печатает `table.type || type` — ложны оба, значит плашки нет.
    expect(at.faceUp!.table!.type).toBeNull();
    expect(at.faceUp!.type).toBeNull();
    expect(at.size!.table!.type).toBeNull();
  });

  it("именно null, а не удаление ключа: удалённое штатный вывод типов ставит обратно", () => {
    const at: Record<string, ArgTypeRow> = { card: { type: { name: "string" } } };
    fillTypes({ argTypes: at });
    expect("type" in at.card!).toBe(true);
    expect(at.card!.type).toBeNull();
  });

  it("дефолт при этом не теряется — колонки независимы", () => {
    const at: Record<string, ArgTypeRow> = { size: { table: { defaultValue: { summary: "1" } } } };
    fillTypes({ argTypes: at });
    expect(at.size!.table!.defaultValue).toEqual({ summary: "1" });
  });

  it("идёт вторым проходом — иначе штатный вывод типов вернёт снятое", () => {
    expect((fillTypes as unknown as { secondPass?: boolean }).secondPass).toBe(true);
  });
});
