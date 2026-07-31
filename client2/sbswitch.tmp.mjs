import { chromium } from "playwright";
import crypto from "node:crypto";

const ids = process.argv.slice(2);
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
let reloads = -1;
page.on("load", () => reloads++);

// ОДНА загрузка превью. Дальше — штатная смена стори по каналу Storybook, без перезагрузки: ровно
// тот сценарий, в котором наивный Pixi+Storybook упирается в потолок WebGL-контекстов.
await page.goto(`http://localhost:6006/iframe.html?id=${encodeURIComponent(ids[0])}&viewMode=story`, { waitUntil: "load" });
await page.waitForTimeout(2500);

const rows = [];
for (const id of ids) {
  await page.evaluate((sid) => window.__STORYBOOK_ADDONS_CHANNEL__.emit("setCurrentStory", { storyId: sid, viewMode: "story" }), id);
  await page.waitForTimeout(1700);
  const shot = await page.locator("canvas").first().screenshot();
  const r = await page.evaluate(() => {
    const s = globalThis.__kit?.pool?.stats?.() ?? {};
    return { created: s.created ?? null, live: s.live ?? null, idle: s.idle ?? null, disposed: s.disposed ?? null, canvases: document.querySelectorAll("canvas").length };
  });
  rows.push({ id, ...r, кадр: crypto.createHash("sha1").update(shot).digest("hex").slice(0, 10) });
}
console.table(rows);
console.log(`разных кадров: ${new Set(rows.map((r) => r.кадр)).size} из ${rows.length}; перезагрузок превью: ${reloads}`);
console.log("errors:", errs.length ? errs : "нет");
await b.close();
