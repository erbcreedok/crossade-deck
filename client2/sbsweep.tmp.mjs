import { chromium } from "playwright";

const ids = process.argv.slice(2);
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 820 } });
const errs = [];
page.on("console", (m) => {
  if (m.type() === "error") errs.push(m.text());
});
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));

const rows = [];
for (const id of ids) {
  await page.goto(`http://localhost:6006/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: "load" });
  await page.waitForTimeout(1400);
  const r = await page.evaluate(() => {
    const g = globalThis;
    const scene = g.__kit?.scene;
    const h = scene?.testHooks?.();
    const canvases = document.querySelectorAll("canvas").length;
    // Непустой кадр: считаем неполностью-фоновые пиксели по даунскейлу канваса.
    let ink = 0;
    const c = document.querySelector("canvas");
    if (c) {
      const off = document.createElement("canvas");
      off.width = 60;
      off.height = 40;
      const cx = off.getContext("2d");
      cx.drawImage(c, 0, 0, 60, 40);
      const d = cx.getImageData(0, 0, 60, 40).data;
      for (let i = 0; i < d.length; i += 4) {
        // фон стола #2f3d34
        if (Math.abs(d[i] - 0x2f) + Math.abs(d[i + 1] - 0x3d) + Math.abs(d[i + 2] - 0x34) > 24) ink++;
      }
    }
    return {
      created: g.__kit?.pool?.stats?.().created ?? null,
      live: g.__kit?.pool?.stats?.().live ?? null,
      canvases,
      ink,
      elements: h?.elements?.length ?? null,
      zones: h ? Object.keys(h.zones).length : null,
      buttons: h?.buttons?.length ?? null,
      extent: h ? `${Math.round(h.extent.w)}x${Math.round(h.extent.h)}` : null,
      zoom: h ? Number(h.zoom.toFixed(2)) : null,
    };
  });
  rows.push({ id, ...r });
}
console.table(rows);
console.log("errors:", errs.length ? errs : "нет");
await b.close();
