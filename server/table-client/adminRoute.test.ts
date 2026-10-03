import { afterEach, describe, expect, it, vi } from "vitest";

// Модуль при загрузке вешает `popstate` — в окружении теста окна нет.
const at = (search: string, hash: string) => {
  vi.stubGlobal("addEventListener", () => {});
  vi.stubGlobal("location", { search, hash, pathname: "/t/admin" });
};
afterEach(() => vi.unstubAllGlobals());

describe("адрес страницы хозяина", () => {
  it("вкладка читается из якоря, а якорь главнее запроса", async () => {
    at("?tab=nodes", "#tab=parts");
    const { route } = await import("./adminRoute.js");
    expect(route("tab")).toBe("parts");
  });

  it("ссылка из бота `?tab=nodes` открывает «Узлы», даже если Telegram переписал якорь", async () => {
    at("?tab=nodes", "#tgWebAppData=abc&tgWebAppVersion=8");
    const { route, routeOne } = await import("./adminRoute.js");
    expect(route("tab")).toBe("nodes");
    expect(routeOne("tab", ["sprites", "nodes"] as const, "sprites")).toBe("nodes");
  });

  it("нет ни в якоре, ни в запросе — пусто", async () => {
    at("", "");
    const { route } = await import("./adminRoute.js");
    expect(route("tab")).toBeNull();
  });
});
