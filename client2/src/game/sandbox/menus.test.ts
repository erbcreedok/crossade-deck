import { describe, expect, it } from "vitest";
import { sandboxMenus } from "./menus";
import { DEFAULT_SANDBOX_SETTINGS, type SandboxSettings } from "./settings";
import { sandboxBoard } from "./board";

// Меню песочницы — шов SceneMenus: в соло применяет scene.reconfigure, в live отдаёт смену
// настроек НАРУЖУ (session.changeSettings), посадки в live заперты (их раздаёт комната).

describe("sandboxMenus", () => {
  it("onApply: смена настройки уходит наружу, сцена не трогается", () => {
    const applied: SandboxSettings[] = [];
    const menus = sandboxMenus(DEFAULT_SANDBOX_SETTINGS, (s) => sandboxBoard(s), () => null, {
      onApply: (s) => applied.push(s),
    });
    const board = menus.menuFor("board")!;
    board.rows.find((r) => r.key === "shape")!.onSelect();
    expect(applied).toHaveLength(1);
    expect(applied[0]!.shape).toBe("rect");
  });

  it("lockSeats прячет строку «посадки» (места раздаёт комната)", () => {
    const locked = sandboxMenus(DEFAULT_SANDBOX_SETTINGS, (s) => sandboxBoard(s), () => null, { lockSeats: true });
    expect(locked.menuFor("board")!.rows.map((r) => r.key)).not.toContain("seats");
    const solo = sandboxMenus(DEFAULT_SANDBOX_SETTINGS, (s) => sandboxBoard(s), () => null);
    expect(solo.menuFor("board")!.rows.map((r) => r.key)).toContain("seats");
  });

  it("setSettings: чужая правка показывается в строках и продолжается с неё", () => {
    const applied: SandboxSettings[] = [];
    const menus = sandboxMenus(DEFAULT_SANDBOX_SETTINGS, (s) => sandboxBoard(s), () => null, {
      onApply: (s) => applied.push(s),
    });
    menus.setSettings({ ...DEFAULT_SANDBOX_SETTINGS, deck: 52, shape: "rect" });
    expect(menus.menuFor("board")!.rows.find((r) => r.key === "shape")!.value).toBe("квадрат");
    expect(menus.deckExtras!()[0]!.value).toBe("52");
    menus.menuFor("board")!.rows.find((r) => r.key === "shape")!.onSelect();
    expect(applied[0]!.shape).toBe("circle"); // цикл пошёл ОТ чужого значения, не от начального
    expect(applied[0]!.deck).toBe(52);
  });
});
