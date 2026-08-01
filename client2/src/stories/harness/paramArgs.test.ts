import { describe, it, expect } from "vitest";
import type { Param } from "../../game/ui/controls";
import { paramsToArgTypes, paramsToArgs, applyArgsToParams } from "./paramArgs";

// Компонент УЖЕ декларирует свои настраиваемые параметры данными (Configurable.params() — тот же
// источник, из которого песочница строит канвасные Stepper/Toggle/Segmented). Сторибук не заводит
// вторую модель, а читает эту: иначе панель и стенд разъедутся, и непонятно, кто из них прав.
//
// У параметра ДВА имени, и разделение принципиально: `id` — настоящее английское имя (ключ стори,
// ключ теста, то, что написано в коде), `label` — человеческая русская подпись. Раньше id не было,
// ключ выводился из подписи транслитерацией, и это давало сразу две беды: кириллические ключи в
// таблице перевода и молчаливую смену ключа стори при правке подписи.

function num(id: string, label = id, get = () => 3): Param {
  let v = get();
  return { kind: "number", id, label, min: 1, max: 9, get: () => v, set: (x) => void (v = x) };
}
function bool(id: string, label = id, init = false): Param {
  let v = init;
  return { kind: "bool", id, label, get: () => v, set: (x) => void (v = x) };
}
function choice(id: string, options: string[], label = id, init = 0): Param {
  let v = init;
  return { kind: "choice", id, label, options, get: () => v, set: (x) => void (v = x) };
}

describe("ключи аргументов", () => {
  it("ключ — это ИМЯ параметра, без преобразований: он же стоит в URL стори и в коде теста", () => {
    expect(Object.keys(paramsToArgTypes([num("jitterAmp")]))).toEqual(["jitterAmp"]);
  });

  it("русская подпись на ключ не влияет — её правка не должна менять адрес стори", () => {
    const a = Object.keys(paramsToArgTypes([num("block", "частица")]));
    const b = Object.keys(paramsToArgTypes([num("block", "размер точки")]));
    expect(a).toEqual(b);
  });

  it("разные параметры дают разные ключи, даже если подписи совпали", () => {
    const keys = Object.keys(paramsToArgTypes([num("colsMin", "шаг"), num("rowsMin", "шаг")]));
    expect(new Set(keys).size).toBe(2);
  });
});

describe("paramsToArgTypes", () => {
  it("number → range с границами параметра", () => {
    expect(paramsToArgTypes([num("jitterAmp")]).jitterAmp!.control).toEqual({ type: "range", min: 1, max: 9, step: 1 });
  });

  it("bool → boolean", () => {
    expect(paramsToArgTypes([bool("flicker")]).flicker!.control).toEqual({ type: "boolean" });
  });

  it("choice → select СО СТРОКАМИ-вариантами, а не с индексами", () => {
    // В панели должно быть написано «пиксели/символ», а не «0/1» — иначе контрол нечитаем.
    const e = paramsToArgTypes([choice("faceStyle", ["пиксели", "символ"])]).faceStyle!;
    expect(e.control).toEqual({ type: "select" });
    expect(e.options).toEqual(["пиксели", "символ"]);
  });

  it("name — настоящее имя параметра, русский текст уходит в description", () => {
    const e = paramsToArgTypes([num("jitterFreq", "частота")]).jitterFreq!;
    expect(e.name).toBe("jitterFreq");
    expect(e.description).toBe("частота");
  });
});

describe("paramsToArgs", () => {
  it("снимает текущие значения; choice отдаёт МЕТКУ варианта, а не индекс", () => {
    const args = paramsToArgs([num("step", "шаг", () => 5), bool("on", "вкл", true), choice("mode", ["a", "b"], "режим", 1)]);
    expect(args).toEqual({ step: 5, on: true, mode: "b" });
  });
});

describe("applyArgsToParams", () => {
  it("зовёт set только на изменившихся — иначе каждый кадр дёргал бы onChange", () => {
    const calls: string[] = [];
    const ps: Param[] = [
      { kind: "number", id: "step", label: "шаг", min: 0, max: 9, get: () => 3, set: () => void calls.push("step") },
      { kind: "bool", id: "on", label: "вкл", get: () => false, set: () => void calls.push("on") },
    ];
    expect(applyArgsToParams(ps, { step: 3, on: true })).toBe(true);
    expect(calls).toEqual(["on"]);
  });

  it("возвращает false, когда менять нечего", () => {
    expect(applyArgsToParams([num("step", "шаг", () => 3)], { step: 3 })).toBe(false);
  });

  it("choice принимает метку и кладёт в параметр ИНДЕКС — круг замыкается", () => {
    let v = 0;
    const p: Param = { kind: "choice", id: "mode", label: "режим", options: ["a", "b", "c"], get: () => v, set: (x) => void (v = x) };
    applyArgsToParams([p], { mode: "c" });
    expect(v).toBe(2);
  });

  it("неизвестная метка варианта игнорируется, а не роняет параметр в -1", () => {
    let v = 1;
    const p: Param = { kind: "choice", id: "mode", label: "режим", options: ["a", "b"], get: () => v, set: (x) => void (v = x) };
    expect(applyArgsToParams([p], { mode: "нет-такого" })).toBe(false);
    expect(v).toBe(1);
  });

  it("аргумент, которому нет параметра, просто пропускается", () => {
    expect(applyArgsToParams([num("step")], { unknownKey: 1 })).toBe(false);
  });
});
