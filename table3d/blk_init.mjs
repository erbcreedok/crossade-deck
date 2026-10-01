// ПРОВЕРКА ПЕСОЧНИЦЫ НА THREE.JS — стол в вкладке с ботами (`?stand`), палец мышью по сцене:
// из стопки на сукно, из руки на сукно, с сукна в руку, двойной тап — перевернуть, облёт камеры.
// С `--net <стол> <ключ>` — ещё и живая комната на том столе (он должен пускать гостей, `TABLE_GUESTS=1`): песочница и
// обычный стол (2D) за одним столом, карта, положенная в 3D, — у соседа в 2D.
//   node check.mjs [base] [shot.png] [--net http://localhost:2611 probe]
//   (сервер песочницы: `npm run dev`, порт 9590; картинки карт — со стола :2590)
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const shot = process.argv[3]?.startsWith("--") ? undefined : process.argv[3];
const netAt = process.argv.indexOf("--net");
const net = netAt > 0 ? { table: process.argv[netAt + 1], secret: process.argv[netAt + 2] } : null;
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const pngChunks = (buf, kind) => { const out = []; for (let i = 8; i < buf.length; ) { const n = buf.readUInt32BE(i); if (buf.toString("latin1", i + 4, i + 8) === kind) out.push(buf.subarray(i + 8, i + 8 + n)); i += 12 + n; } return out; };
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const t = (fn, arg) => p.evaluate(fn, arg);
const tabInfo = () => p.evaluate(() => window.__t3d.tabs()[0]);
const gripBox = async () => { const a = await tabInfo(); return { x: a.x - a.w / 2, y: a.y - a.h / 2, width: a.w, height: a.h }; };
const clickGrip = async () => { const a = await tabInfo(); await p.mouse.click(a.x, a.y); };
const rectOf = (sel) => p.evaluate((q) => { const e = [...document.querySelectorAll(q)].find((x) => !x.closest(".screen.off")); const r = e?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; }, sel);
const frames = () => p.evaluate(() => new Promise((r) => { let k = 0; const f = () => (++k > 40 ? r() : requestAnimationFrame(f)); f(); }));
const drag = async (from, to) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(to.x, to.y, { steps: 10 });
  await p.mouse.up();
  await frames();
};
try {
  {
    // Рука при первой загрузке стоит в границах: её верх не выше золотой линии (62.6% высоты), низ не глубже бара.
    await p.goto(`${base}/?stand&host=http://localhost:9591`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const f = await t(() => window.__t3d.handFrame()), Hs = await p.evaluate(() => document.querySelector(".screen:not(.off)").getBoundingClientRect().height);
    check("рука при первой загрузке не выше золотой линии", f.y >= Hs * 0.626 - 3, { top: f.y, line: Hs * 0.626 });
  }
} finally { await browser.close(); }
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : " — " + JSON.stringify(c.got).slice(0,220)}`);
