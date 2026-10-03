import { describe, expect, it } from "vitest";
import { TableApi, tableEnv } from "./api.js";

const answer = (routes: Record<string, unknown>) =>
  (async (url: string | URL | Request) => {
    const hit = Object.entries(routes).find(([k]) => String(url).startsWith(k));
    if (!hit) throw new Error("offline");
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  }) as typeof fetch;

describe("бот ищет сервер стола через реле", () => {
  it("без секрета или без адреса столы выключены целиком", () => {
    expect(tableEnv({ TABLE_RELAY_URL: "https://fly" })).toBeUndefined();
    expect(tableEnv({ TABLE_SECRET: "s" })).toBeUndefined();
  });

  it("реле говорит, где мак; молчащее реле — «не жив», а не исключение", async () => {
    const env = { secret: "s", relayUrl: "https://fly" };
    const up = new TableApi(env, answer({ "https://fly/relay/table": { up: true, url: "https://mac", boot: "b1", seenAt: 1 } }));
    expect(await up.where()).toEqual({ up: true, url: "https://mac", boot: "b1" });
    expect(await new TableApi(env, answer({})).where()).toEqual({ up: false });
    expect(await new TableApi(env, answer({})).list("-1")).toBe("down");
  });

  it("ссылка в приложение — адрес мака снаружи, от реле, даже когда бот ходит к столу локально", async () => {
    const env = { secret: "s", relayUrl: "https://fly", serverUrl: "http://127.0.0.1:2590" };
    const api = new TableApi(env, answer({ "https://fly/relay/table": { up: true, url: "https://mac.trycloudflare.com", boot: "b1", seenAt: 1 } }));
    expect(await api.publicUrl()).toBe("https://mac.trycloudflare.com");
    expect(await new TableApi(env, answer({ "https://fly/relay/table": { up: false, url: null, boot: null, seenAt: null } })).publicUrl()).toBeNull();
  });

  it("ссылка на стол — постоянный адрес реле, а не текущий адрес мака", () => {
    expect(new TableApi({ secret: "s", relayUrl: "https://fly" }).openUrl("r1")).toBe("https://fly/t/?room=r1");
    expect(new TableApi({ secret: "s", serverUrl: "http://localhost:2590" }).openUrl("r1")).toBe("http://localhost:2590/table/?room=r1");
    // «Мои комнаты» — тот же постоянный адрес без комнаты: кнопка меню ведёт на него.
    expect(new TableApi({ secret: "s", relayUrl: "https://fly" }).roomsUrl()).toBe("https://fly/t/");
  });
});

describe("ссылки для людей, когда бот ходит к серверу не по тому адресу, что видит телефон", () => {
  const env = { secret: "s", serverUrl: "http://127.0.0.1:2591", linksUrl: "https://dev.ts.net:8443" };
  const api = new TableApi(env);

  it("все ссылки строятся от адреса для людей и ведут прямо на стол", async () => {
    expect(api.openUrl("r1")).toBe("https://dev.ts.net:8443/table/?room=r1");
    expect(api.openUrl3d("r1")).toBe("https://dev.ts.net:8443/table/3d?room=r1");
    expect(api.roomsUrl()).toBe("https://dev.ts.net:8443/table/");
    expect(api.adminUrl()).toBe("https://dev.ts.net:8443/table/admin");
    expect(await api.publicUrl()).toBe("https://dev.ts.net:8443");
  });

  it("ссылка на «где что запущено» — вкладка «Узлы» страницы хозяина", () => {
    expect(api.healthUrl()).toBe("https://dev.ts.net:8443/table/admin?tab=nodes");
    expect(new TableApi({ secret: "s", relayUrl: "https://fly" }).healthUrl()).toBe("https://fly/t/admin?tab=nodes");
  });

  it("без него — как раньше: через реле `/t/`, без реле `/table/` на сервере", () => {
    expect(new TableApi({ secret: "s", relayUrl: "https://fly" }).openUrl3d("r")).toBe("https://fly/table/3d?room=r");
    expect(new TableApi({ secret: "s", relayUrl: "https://fly" }).adminUrl()).toBe("https://fly/t/admin");
  });

  it("переменная окружения подхватывается и чистится от косой черты", () => {
    expect(tableEnv({ TABLE_SECRET: "s", TABLE_SERVER_URL: "http://x", TABLE_LINKS_URL: "https://dev/" })?.linksUrl).toBe("https://dev");
  });
});

