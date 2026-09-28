import { beforeEach, describe, expect, it } from "vitest";
import { SECRET_HEADER } from "./contract.js";
import { forgetRemembered, relayWorker, REWRITE_MS, type RelayDeps, type RelayEnv } from "./relayWorker.js";

const ORIGIN = "https://crossade.acc.workers.dev";
const MAC = "https://tunnel.example";

function world() {
  const kv = new Map<string, string>();
  let writes = 0;
  const env: RelayEnv = { TABLE_SECRET: "s", RELAY: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void (kv.set(k, v), (writes += 1)) } };
  const seen: string[] = [];
  const stored = new Map<string, Response>();
  let now = 1_000_000;
  const deps: RelayDeps = {
    now: () => now,
    fetch: (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      seen.push(url);
      if (url.endsWith("/health")) return new Response("ok");
      if (url === `${MAC}/table/`) return new Response("<html><head><title>стол</title></head></html>");
      if (url.includes("/table/app.js?v=")) return new Response("js", { headers: { "cache-control": "public, max-age=31536000, immutable" } });
      return new Response("{}", { headers: { "cache-control": "no-store" } });
    }) as typeof fetch,
    cache: { match: async (r) => stored.get(r.url)?.clone(), put: async (r, res) => void stored.set(r.url, res) },
  };
  const call = (path: string, init?: RequestInit) => relayWorker(new Request(`${ORIGIN}${path}`, init), env, deps);
  const beacon = (url = MAC, boot = "b1") => call("/relay/table", { method: "POST", headers: { [SECRET_HEADER]: "s", "content-type": "application/json" }, body: JSON.stringify({ url, boot }) });
  return { call, beacon, seen, writes: () => writes, tick: (ms: number) => void (now += ms) };
}

beforeEach(() => forgetRemembered());

describe("реле на Worker: постоянный адрес без своего домена", () => {
  it("маяк без секрета — нельзя; с секретом — стол найден, и адрес в ответе — постоянный, свой", async () => {
    const w = world();
    expect((await w.call("/relay/table", { method: "POST", body: "{}" })).status).toBe(403);
    expect((await (await w.call("/relay/table")).json()).up).toBe(false);
    expect((await w.beacon()).status).toBe(200);
    expect(await (await w.call("/relay/table")).json()).toMatchObject({ up: true, url: ORIGIN, boot: "b1" });
  });

  it("KV пишется, только когда стол переехал или раз в десять минут — бесплатная тысяча записей в сутки не кончится", async () => {
    const w = world();
    for (let i = 0; i < 30; i += 1) { await w.beacon(); w.tick(20_000); }
    expect(w.writes()).toBe(1);
    w.tick(REWRITE_MS);
    await w.beacon();
    expect(w.writes()).toBe(2);
    await w.beacon("https://other.example", "b2");
    expect(w.writes()).toBe(3);
  });

  it("/t/ — страница стола, и всё в ней ведёт на постоянный адрес, а не на туннель", async () => {
    const w = world();
    expect((await w.call("/t/")).status).toBe(503);
    await w.beacon();
    const html = await (await w.call("/t/?tgWebAppStartParam=x")).text();
    expect(html).toContain(`<base href="${ORIGIN}/table/">`);
    expect(html).toContain(`window.__TABLE_HOST__ = "${ORIGIN}"`);
    expect(html).not.toContain(MAC);
  });

  it("остальное — к столу как есть; скрипт по отпечатку второй раз берётся из кэша, API — всегда у стола", async () => {
    const w = world();
    await w.beacon();
    await w.call("/table/app.js?v=abc");
    await w.call("/table/app.js?v=abc");
    expect(w.seen.filter((u) => u.includes("app.js")).length).toBe(1);
    await w.call("/table/rooms?by=x");
    await w.call("/table/rooms?by=x");
    expect(w.seen.filter((u) => u === `${MAC}/table/rooms?by=x`).length).toBe(2);
  });
});
