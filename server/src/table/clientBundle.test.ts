import type { AddressInfo } from "net";
import express from "express";
import { mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clientRoutes } from "./client.js";
import { buildClient, builtSource } from "./clientBundle.js";

// ОДИН КЛИЕНТ — ДВА ИСТОЧНИКА. На маке он собирается на лету, на хосте лежит готовой папкой, и адреса
// у обоих одни: страница, собранная заранее, не должна отличаться от той, что собрана по запросу.

let dir = "";
const bases: Record<"live" | "built", string> = { live: "", built: "" };
const closers: Array<() => void> = [];

async function serve(router: express.Router): Promise<string> {
  const server = express().use(router).listen(0);
  await new Promise((r) => server.once("listening", r));
  closers.push(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "table-client-"));
  await buildClient(dir);
  bases.live = await serve(clientRoutes());
  bases.built = await serve(clientRoutes(builtSource(dir)));
}, 60_000);

afterAll(async () => {
  for (const close of closers) close();
  await rm(dir, { recursive: true, force: true });
});

describe("клиент стола: собранный заранее и собранный на лету", () => {
  it("папка сборки несёт всё, что нужно странице, и ничего из исходников", async () => {
    const files = await readdir(dir);
    expect(files.sort()).toEqual(["admin.html", "app.js", "app.js.map", "bots.html", "cards", "fonts", "index.html", "replay.html", "replay.js", "replay.js.map", "sounds"]);
  });

  for (const kind of ["live", "built"] as const) {
    it(`${kind}: те же адреса отвечают тем же`, async () => {
      const base = bases[kind];
      for (const [path, type] of [
        ["/table/", "text/html"],
        ["/table/replay", "text/html"],
        ["/table/app.js", "javascript"],
        ["/table/replay.js", "javascript"],
        ["/table/app.js.map", "application/json"],
        ["/table/replay.js.map", "application/json"],
        ["/table/sounds/drop-1.m4a", "audio/mp4"],
        ["/table/fonts/tiny5-cyrillic.woff2", "font/woff2"],
        ["/table/cards/classic/spade-A.webp", "image/webp"],
      ] as const) {
        const res = await fetch(`${base}${path}`);
        expect(res.status, path).toBe(200);
        expect(res.headers.get("content-type"), path).toContain(type);
      }
      expect((await fetch(`${base}/table/cards/classic/..%2F..%2Fbacks%2Fplaid.webp`)).status).toBe(404);
      expect((await fetch(`${base}/table/sounds/boom-1.m4a`)).status).toBe(404);
      expect((await fetch(`${base}/table/fonts/..%2Findex.html`)).status).toBe(404);
    });

    it(`${kind}: ссылка на карту исходников ведёт туда, где карта лежит`, async () => {
      for (const script of ["app", "replay"]) {
        const js = await (await fetch(`${bases[kind]}/table/${script}.js`)).text();
        expect(js.trimEnd().split("\n").pop(), script).toBe(`//# sourceMappingURL=${script}.js.map`);
      }
    });
  }

  // СКРИПТ СТОЛА ТЕЛЕФОН ДЕРЖИТ У СЕБЯ: страница зовёт его по отпечатку содержимого, и по нему он хранится
  // год. Без этого 144 КБ ехали через туннель на каждое открытие — у владельца однажды 30 секунд.
  for (const kind of ["live", "built"] as const) {
    it(`${kind}: страница зовёт скрипт по отпечатку, по нему он кэшируется насовсем`, async () => {
      const base = bases[kind];
      for (const [page, script] of [["/table/", "app"], ["/table/replay", "replay"]] as const) {
        const html = await (await fetch(`${base}${page}`)).text();
        const v = new RegExp(`src="${script}\\.js\\?v=([0-9a-f]{12})"`).exec(html)?.[1];
        expect(v, page).toBeTruthy();
        const js = await fetch(`${base}/table/${script}.js?v=${v}`);
        expect(js.headers.get("cache-control"), script).toContain("immutable");
        const stale = await fetch(`${base}/table/${script}.js?v=000000000000`);
        expect(stale.headers.get("cache-control"), `${script} чужой отпечаток`).toContain("no-store");
        expect(await stale.text()).toBe(await js.text());
      }
    });
  }
});

