import { describe, it, expect } from "vitest";
import type { Param } from "../../game/ui/controls";
import { argKey, paramsToArgTypes, paramsToArgs, applyArgsToParams } from "./paramArgs";

// Компонент УЖЕ декларирует свои настраиваемые параметры данными (Configurable.params() — тот же
// источник, из которого песочница строит канвасные Stepper/Toggle/Segmented). Сторибук не заводит
// вторую модель, а читает эту: иначе панель и стенд разъедутся, и непонятно, кто из них прав.

function num(label: string, get = () => 3): Param {
  let v = get();
  return { kind: "number", label, min: 1, max: 9, get: () => v, set: (x) => void (v = x) };
}
function bool(label: string, init = false): Param {
  let v = init;
  return { kind: "bool", label, get: () => v, set: (x) => void (v = x) };
}
function choice(label: string, options: string[], init = 0): Param {
  let v = init;
  return { kind: "choice", label, options, get: () => v, set: (x) => void (v = x) };
}

describe("argKey", () => {
  it("транслитерирует русскую метку в пригодный для URL ключ", () => {
    expect(argKey("частица", 0)).toBe("chastitsa");
  });

  it("одинаковые метки не схлопываются в один контрол — к дублю добавляется индекс", () => {
    const ps = [num("шаг"), num("шаг")];
    const keys = Object.keys(paramsToArgTypes(ps));
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it("метка, из которой не осталось ни одного пригодного символа, всё равно даёт ключ", () => {
    expect(argKey("«»— ", 4)).toMatch(/^\w+$/);
  });
});

describe("paramsToArgTypes", () => {
  it("number → range с границами параметра", () => {
    const t = paramsToArgTypes([num("дрожание")]);
    const e = t[argKey("дрожание", 0)];
    expect(e.control).toEqual({ type: "range", min: 1, max: 9, step: 1 });
  });

  it("bool → boolean", () => {
    const t = paramsToArgTypes([bool("мерцание")]);
    expect(t[argKey("мерцание", 0)].control).toEqual({ type: "boolean" });
  });

  it("choice → select СО СТРОКАМИ-вариантами, а не с индексами", () => {
    // В панели должно быть написано «пиксели/символ», а не «0/1» — иначе контрол нечитаем.
    const t = paramsToArgTypes([choice("стиль", ["пиксели", "символ"])]);
    const e = t[argKey("стиль", 0)];
    expect(e.control).toEqual({ type: "select" });
    expect(e.options).toEqual(["пиксели", "символ"]);
  });

  it("русская метка сохраняется как ИМЯ контрола — ключ технический, подпись человеческая", () => {
    const t = paramsToArgTypes([num("частота")]);
    expect(t[argKey("частота", 0)].name).toBe("частота");
  });
});

describe("paramsToArgs", () => {
  it("снимает текущие значения; choice отдаёт МЕТКУ варианта, а не индекс", () => {
    const args = paramsToArgs([num("шаг", () => 5), bool("вкл", true), choice("режим", ["a", "b"], 1)]);
    expect(args[argKey("шаг", 0)]).toBe(5);
    expect(args[argKey("вкл", 1)]).toBe(true);
    expect(args[argKey("режим", 2)]).toBe("b");
  });
});

describe("applyArgsToParams", () => {
  it("зовёт set только на изменившихся — иначе каждый кадр дёргал бы onChange", () => {
    const calls: string[] = [];
    const ps: Param[] = [
      { kind: "number", label: "шаг", min: 0, max: 9, get: () => 3, set: () => void calls.push("шаг") },
      { kind: "bool", label: "вкл", get: () => false, set: () => void calls.push("вкл") },
    ];
    const changed = applyArgsToParams(ps, { [argKey("шаг", 0)]: 3, [argKey("вкл", 1)]: true });
    expect(calls).toEqual(["вкл"]);
    expect(changed).toBe(true);
  });

  it("возвращает false, когда менять нечего", () => {
    const ps = [num("шаг", () => 3)];
    expect(applyArgsToParams(ps, { [argKey("шаг", 0)]: 3 })).toBe(false);
  });

  it("choice принимает метку и кладёт в параметр ИНДЕКС — круг замыкается", () => {
    let v = 0;
    const p: Param = { kind: "choice", label: "режим", options: ["a", "b", "c"], get: () => v, set: (x) => void (v = x) };
    applyArgsToParams([p], { [argKey("режим", 0)]: "c" });
    expect(v).toBe(2);
  });

  it("неизвестная метка варианта игнорируется, а не роняет параметр в -1", () => {
    let v = 1;
    const p: Param = { kind: "choice", label: "режим", options: ["a", "b"], get: () => v, set: (x) => void (v = x) };
    expect(applyArgsToParams([p], { [argKey("режим", 0)]: "нет-такого" })).toBe(false);
    expect(v).toBe(1);
  });

  it("аргумент, которому нет параметра, просто пропускается", () => {
    const ps = [num("шаг")];
    expect(applyArgsToParams(ps, { чужой: 1 })).toBe(false);
  });
});
