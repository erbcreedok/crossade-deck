import { describe, expect, it } from "vitest";
import { applySetting, DEFAULT_SANDBOX_SETTINGS, settingRows } from "./settings";

describe("настройки песочницы", () => {
  it("дефолт владельца: одиночный режим (1 место), всё круг и динамично", () => {
    const s = DEFAULT_SANDBOX_SETTINGS;
    expect(s.seats).toBe(1);
    expect(s.shape).toBe("circle");
    expect(s.table).toBe("radial");
    expect(s.slots).toBe("dynamic");
  });

  it("строки меню: у борды — форма и посадки; у стола стакинг виден только на фикс-слотах", () => {
    const s = DEFAULT_SANDBOX_SETTINGS;
    expect(settingRows("board", s).map((r) => r.key)).toEqual(["shape", "seats"]);
    expect(settingRows("table", s).map((r) => r.key)).toEqual(["table", "slots"]);
    const fixed = { ...s, slots: 6 as const };
    expect(settingRows("table", fixed).map((r) => r.key)).toEqual(["table", "slots", "stacking"]);
  });

  it("тап циклит значение: shape туда-обратно, slots по ступеням с возвратом в динамику", () => {
    let s = DEFAULT_SANDBOX_SETTINGS;
    s = applySetting(s, "shape");
    expect(s.shape).toBe("rect");
    s = applySetting(applySetting(s, "shape"), "slots");
    expect(s.shape).toBe("circle");
    expect(s.slots).toBe(4);
    for (const want of [6, 8, 12, "dynamic"]) {
      s = applySetting(s, "slots");
      expect(s.slots).toBe(want);
    }
  });
});
