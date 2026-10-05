// РЕБРО КОЛОДЫ (тело стопки): не убегает, когда стопку несут туда-сюда или когда верхнюю карту уносят — оно всегда сидит на нижней карте и растёт по её нормали, а улетевшие карты в него не входят.
//   node pile-edge-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
// Долгое удержание над стопкой поднимает её; часы стоят, чтобы медленная машина не делала этого сама посреди проверки.
await p.evaluate(() => (window.__t3dScreens ?? []).forEach((s) => s.holdClock(0)));
await p.waitForTimeout(1500);
const pile = await p.evaluate(() => { const s = window.__t3d.state(); const q = [...s.piles].sort((a, b) => b.cards.length - a.cards.length)[0]; return { id: q.id, n: q.cards.length, top: q.cards.at(-1).id }; });
check("у колоды есть тело (ребро)", (await p.evaluate((id) => window.__t3d.bodyInfo(id), pile.id)) !== null);
// 1. Стопку несут за язычок туда-сюда: ребро на нижней карте и по её нормали в каждом кадре.
const tab = await p.evaluate((id) => window.__t3d.tabInfo(id).screen, pile.id);
await p.mouse.move(tab.x, tab.y); await p.mouse.down(); await p.mouse.move(tab.x + 4, tab.y - 30, { steps: 3 });
const bad = [];
for (let i = 0; i < 30; i++) {
  await p.mouse.move(195 + Math.cos(i / 3) * 110, 320 + Math.sin(i / 2) * 70);
  await p.waitForTimeout(40);
  const b = await p.evaluate((id) => window.__t3d.bodyInfo(id), pile.id);
  if (!b || !b.base) { bad.push({ i, b }); continue; }
  const d = Math.abs(dot(b.axis, b.normal)), off = dist(b.at, b.base);
  if (d < 0.97 || off > 0.05) bad.push({ i, d, off });
}
check("несут стопку туда-сюда: ребро в каждом кадре на нижней карте и по её нормали", bad.length === 0, bad.slice(0, 4));
await p.mouse.up(); await p.waitForTimeout(1500);
// 2. Верхнюю карту уносят: её нет в ребре, и оно стоит прямо.
const top = await p.evaluate((id) => window.__t3d.screenOf(id), pile.top);
await p.mouse.move(top.x, top.y); await p.mouse.down(); await p.mouse.move(top.x + 4, top.y - 30, { steps: 4 }); await p.mouse.move(100, 400, { steps: 8 }); await p.waitForTimeout(300);
const during = await p.evaluate((id) => window.__t3d.bodyInfo(id), pile.id);
check("верхнюю карту унесли — ребро без неё", during && during.n === pile.n - 1, during && during.n);
check("и стоит прямо, не тянется за улетевшей", during && Math.abs(during.axis[1]) > 0.95, during && during.axis);
await p.mouse.up();
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
