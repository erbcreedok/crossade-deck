import { describe, it, expect } from "vitest";
import { kitSceneKey, normalizeKitOptions, parseKitSceneKey } from "./kitSceneKey";
import { SANDBOX_CARD_H } from "./constants";
import { SB_MARGIN } from "./sandboxLayout";

// Главное свойство ключа — ОБРАТИМОСТЬ: пул держит на руках только строку и по ней воссоздаёт
// витрину. Без этого теста ключ уже один раз молча разъехался с разбором (массив вместо объекта), и
// каждая опция стори подменялась дефолтом, не вызывая ни ошибки, ни предупреждения.

describe("ключ пула витрин", () => {
  it("разбирается обратно в те же опции (round-trip)", () => {
    const opts = { cardHeight: 220, padding: 12, fitOnBuild: false, camera: { align: "left" as const, minZoom: 0.2 } };
    expect(kitSceneKey(parseKitSceneKey(kitSceneKey(opts)))).toBe(kitSceneKey(opts));
    expect(normalizeKitOptions(parseKitSceneKey(kitSceneKey(opts)))).toEqual(normalizeKitOptions(opts));
  });

  it("восстанавливает именно ЗНАЧЕНИЯ, а не только форму", () => {
    const back = parseKitSceneKey(kitSceneKey({ cardHeight: 220 }));
    expect(back.cardHeight).toBe(220);
    expect(back.padding).toBe(SB_MARGIN);
    expect(back.fitOnBuild).toBe(true);
  });

  it("пустые опции дают дефолты стенда", () => {
    expect(normalizeKitOptions()).toEqual({ cardHeight: SANDBOX_CARD_H, padding: SB_MARGIN, fitOnBuild: true, camera: null });
  });

  it("разные опции — разные ключи (иначе витрины переиспользовали бы чужой канвас)", () => {
    expect(kitSceneKey({ cardHeight: 118 })).not.toBe(kitSceneKey({ cardHeight: 220 }));
    expect(kitSceneKey({ padding: 10 })).not.toBe(kitSceneKey({ padding: 40 }));
    expect(kitSceneKey({ camera: { align: "left" } })).not.toBe(kitSceneKey({ camera: { align: "center" } }));
  });

  it("одинаковые опции — один ключ, в каком бы порядке ни перечислили поля", () => {
    expect(kitSceneKey({ padding: 10, cardHeight: 118 })).toBe(kitSceneKey({ cardHeight: 118, padding: 10 }));
  });

  it("чужой или битый ключ — дефолты, а не исключение", () => {
    expect(parseKitSceneKey("[118,40,true,null]")).toEqual({ cardHeight: undefined, padding: undefined, fitOnBuild: undefined, camera: undefined });
    expect(parseKitSceneKey("не json")).toEqual({});
    expect(normalizeKitOptions(parseKitSceneKey("null"))).toEqual(normalizeKitOptions());
  });
});
