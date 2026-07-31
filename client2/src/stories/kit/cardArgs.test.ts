import { describe, it, expect } from "vitest";
import { CARD_ARGS, pickArgs } from "./cardArgs";

// Разделение обязанностей, важное для понимания:
//
//  · `satisfies Record<keyof CardOptions, …>` в cardArgs.ts ловит расхождение С КАРТОЙ — новая
//    опция у Card роняет `tsc` с явным «Property … is missing». Проверено вручную на живой правке
//    Card.ts: ошибка появляется. Типы стираются, поэтому в рантайме этого не увидеть в принципе.
//  · Тест ниже сторожит ДРУГОЕ: сам CARD_ARGS. Если его когда-нибудь урежут или приведут через
//    `as`, mapped-тип замолчит, а явный список — нет.
//
// ЕСЛИ ЭТОТ ТЕСТ УПАЛ — набор описанных опций изменился намеренно. Не правьте список молча:
// решите, что опция значит для каталога (контрол или нет, живьём или пересборкой), опишите её в
// CARD_ARGS — и только потом внесите сюда. Ровно это и есть та документация, ради которой каталог
// заводился: «что у карты есть» перестаёт быть знанием, живущим в голове.
const EXPECTED = [
  "id",
  "card",
  "tags",
  "faceUp",
  "hidden",
  "back",
  "faceStyle",
  "fourColor",
  "custom",
  "torn",
  "size",
  "rest",
  "draggable",
  "flippable",
] as const;

describe("CARD_ARGS", () => {
  it("описывает ровно тот набор опций, что есть у Card — ни больше, ни меньше", () => {
    expect(Object.keys(CARD_ARGS).sort()).toEqual([...EXPECTED].sort());
  });

  it("у каждой опции есть человеческое пояснение — иначе каталог не отвечает на «что это»", () => {
    for (const [k, spec] of Object.entries(CARD_ARGS)) {
      expect(spec.hint.length, `пустая подсказка у «${k}»`).toBeGreaterThan(10);
    }
  });

  it("у каждой опции задано, применяется она живьём или пересборкой", () => {
    for (const [k, spec] of Object.entries(CARD_ARGS)) {
      const ok = spec.apply === "rebuild" || typeof spec.apply === "function";
      expect(ok, `не задан apply у «${k}»`).toBe(true);
    }
  });

  it("опции без контрола — только те, что осознанно не крутятся", () => {
    const noControl = Object.entries(CARD_ARGS)
      .filter(([, s]) => s.argType === false)
      .map(([k]) => k);
    // id — ключ адресации, tags — множество строк от игры. Всё остальное обязано быть в панели,
    // иначе каталог показывает не всю карту.
    expect(noControl.sort()).toEqual(["id", "tags"]);
  });
});

describe("pickArgs", () => {
  it("отдаёт только запрошенное подмножество", () => {
    const { argTypes, apply } = pickArgs(["hidden", "back"]);
    expect(Object.keys(argTypes).sort()).toEqual(["back", "hidden"]);
    expect(Object.keys(apply).sort()).toEqual(["back", "hidden"]);
  });

  it("опция без контрола попадает в план применения, но не в панель", () => {
    const { argTypes, apply } = pickArgs(["id", "hidden"]);
    expect(Object.keys(argTypes)).toEqual(["hidden"]);
    expect(Object.keys(apply).sort()).toEqual(["hidden", "id"]); // ← иначе planFor решит, что ключ неизвестен
  });

  it("подпись контрола несёт пояснение — оно и есть шпаргалка прямо в панели", () => {
    const { argTypes } = pickArgs(["hidden"]);
    expect(argTypes.hidden.name).toContain("секретности");
  });

  it("пустой запрос — пустой результат, без падений", () => {
    expect(pickArgs([])).toEqual({ argTypes: {}, apply: {} });
  });
});
