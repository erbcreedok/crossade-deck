// КРУГ ХОДА В 3D: пока несут карту, круг очерчен пунктиром; карта над кругом — круг горит и показан контур места, куда она ляжет; к часам не прилипает.
// Нужен живой стол с кругом (`kind: krest`), страница — с самого сервера (3D собирается в него):
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в server/)
//   node ring-check.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:2599", secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
await fetch(`${base}/table/rooms`, { method: "POST", headers: { "x-table-secret": secret, "content-type": "application/json" }, body: JSON.stringify({ by: "tg:1", home: { kind: "inline", message: "m" }, kind: "krest", room }) });
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`${base}/table/3d?room=${room}&name=A&test`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"), null, { timeout: 15000 });
await p.waitForTimeout(1200);
check("живая комната: экран загрузки ушёл, когда стол собрался", (await p.locator(".crossade-loader3d").count()) === 0, await p.locator(".crossade-loader3d").count());
const st = () => p.evaluate(() => { const s = window.__t3d.state(); return { ring: s.piles.find((x) => x.pose === "ring") ?? null, deck: s.piles.find((x) => x.pose !== "ring" && x.cards.length) ?? null }; });
const { ring, deck } = await st();
check("на столе есть круг", ring !== null, ring);
// Карту из колоды — в руку.
await p.evaluate(() => window.__t3d.fillHand(1));
await p.waitForTimeout(1500);
const hand = await p.evaluate(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).hand.map((c) => c.id); });
check("карта в руке", hand.length > 0, hand);
const from = await p.evaluate((i) => window.__t3d.screenOf(i), hand.at(-1));
const to = await p.evaluate((r) => window.__t3d.feltScreen(r.x + 1.2, r.y + 0.4), ring);
await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x, from.y - 60, { steps: 5 });
const lit0 = await p.evaluate(() => window.__t3d.ringLit());
check("несут карту — круг очерчен пунктиром, но не горит", lit0.length > 0 && lit0.every((x) => x.zone && !x.glow && !x.slot), lit0);
await p.mouse.move(to.x, to.y, { steps: 10 });
await p.waitForTimeout(200);
const lit1 = await p.evaluate(() => window.__t3d.ringLit());
check("карта над кругом — круг горит и показан контур места", lit1.some((x) => x.zone && x.glow && x.slot), lit1);
await p.mouse.up();
await p.waitForTimeout(900);
const lit2 = await p.evaluate(() => window.__t3d.ringLit());
check("отпустили — подсветки нет", lit2.every((x) => !x.zone && !x.glow && !x.slot), lit2);
const after = (await st()).ring;
const turns = after.cards.map((c) => c.turn);
check("карта легла в круг", after.cards.length === ring.cards.length + 1, turns);
const hours = turns.every((t) => t === undefined || Math.abs(t / 30 - Math.round(t / 30)) < 0.02);
check("и легла под палец, а не прилипла к часу", !hours, turns);
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
