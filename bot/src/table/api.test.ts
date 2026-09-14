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

  it("ссылка на стол — постоянный адрес реле, а не текущий адрес мака", () => {
    expect(new TableApi({ secret: "s", relayUrl: "https://fly" }).openUrl("r1")).toBe("https://fly/t/?room=r1");
    expect(new TableApi({ secret: "s", serverUrl: "http://localhost:2590" }).openUrl("r1")).toBe("http://localhost:2590/table/?room=r1");
  });
});
