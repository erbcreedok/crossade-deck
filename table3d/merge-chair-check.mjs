// СЛИЯНИЕ С ЧУЖОЙ РУКОЙ (стопка у пустого стула, без замка): карту держат над ней — легла, горит, мигает, потом рука-стопка со вставленной картой поднимается под палец, как колода.
//   node merge-chair-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1800);
const poll = async (fn, ms = 7000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await p.waitForTimeout(60); } return null; };
const info = () => p.evaluate(() => window.__t3d.holdInfo());
const chair = await p.evaluate(() => { const c = window.__t3d.state().chairs.find((x) => !x.owner && x.hand.length > 0 && !x.croupier); return c ? { id: c.id, n: c.hand.length, up: c.hand.at(-1).up === true, top: c.hand.at(-1).id } : null; });
check("есть пустой стул со стопкой", !!chair, chair);
// карта той же стороны, что у стопки: карта из руки (лицом ко мне) строго не подходит — сперва ложим её на стол и при надобности переворачиваем
const hid = await p.evaluate(() => window.__t3d.state().chairs.find((x) => x.owner === "me").hand[3].id);
await p.evaluate((i) => window.__t3d.dropFeltAt(i, 0.6, 1.2), hid);
await p.waitForTimeout(1200);
const side = await p.evaluate((i) => window.__t3d.state().felt.find((c) => c.id === i)?.up === true, hid);
if (side !== chair.up) { await p.evaluate((i) => window.__t3d.turnCard(i), hid); await p.waitForTimeout(800); }
const A = await p.evaluate((i) => window.__t3d.screenOf(i), hid), S = await p.evaluate((i) => window.__t3d.screenOf(i), chair.top);
await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(A.x - 10, A.y - 8, { steps: 3 }); await p.mouse.move(S.x, S.y, { steps: 10 });
const seated = await poll(async () => { const i = await info(); return i.seated && i.steady && String(i.pile).startsWith("chair:") ? i : null; });
check("над чужой рукой-стопкой: карта легла и горит ровно", !!seated, seated);
const blink = await poll(async () => { const i = await info(); return i.blinking ? i : null; });
check("потом мигает", !!blink, blink);
const lifted = await poll(async () => p.evaluate(() => window.__t3d.gatherNow?.()), 8000);
check("потом вся рука-стопка с вложенной картой поднимается под палец", !!lifted && lifted.n === chair.n + 1, { lifted, want: chair.n + 1 });
await p.mouse.up();
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
