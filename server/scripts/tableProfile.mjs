// ПРОФИЛЬ СТОЛА — «Мои комнаты» в виде хаба, сверху я; по тапу — профиль: кукла (король или дама), расцветка
// (5 основных и «ещё»), мой цвет; «Привязать Telegram» у гостя приложения. Выбор живёт в профиле стола и
// садится за стол вместе с человеком. Приложение здесь подменено: `__crossadeNative` пишет вызовы входа.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2611 npx tsx src/index.ts
//   node scripts/tableProfile.mjs [base] [shots-dir]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const shots = process.argv[3];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const { key } = await (await fetch(`${base}/table/app/guest`, { method: "POST" })).json();
// Свой стол у гостя есть сразу — в списке будет карточка.
const { room } = await (await fetch(`${base}/table/app/rooms`, { method: "POST", headers: { "content-type": "application/json", "x-crossade-app-key": key }, body: JSON.stringify({ title: "Свой стол" }) })).json();
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.addInitScript(() => {
  window.__logins = [];
  window.__crossadeNative = { version: 1, ar() {}, key() {}, login: (from) => window.__logins.push(from ?? null) };
});
const open = async () => {
  await p.goto(`${base}/table/?rooms&key=${encodeURIComponent(key)}`);
  await p.waitForSelector("[data-rooms] [data-me]");
  await p.waitForFunction(() => !/Профиль/.test(document.querySelector("[data-me]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
};
const openProfile = async () => {
  await p.click("[data-me]");
  await p.waitForSelector("[data-profile]");
  await p.waitForFunction(() => document.querySelectorAll("[data-doll-preview] img").length === 2, null, { timeout: 8000 }).catch(() => {});
};

await open();
check("«Мои комнаты» в виде хаба: сукно под списком, я сверху", (await p.locator('[data-rooms] [data-g="ground"]').count()) === 1 && /Гость \d{4}/.test(await p.locator("[data-me]").innerText()), await p.locator("[data-me]").innerText());
check("в списке — карточка своего стола с «Войти»", (await p.locator(".card [data-room]").count()) === 1, await p.locator("[data-rooms]").innerText());
await p.waitForTimeout(1200); // заставка стола гаснет
if (shots) await p.screenshot({ path: `${shots}/profile-1-rooms.png` });
await openProfile();
check("профиль открылся: кукла крупно — туловище и голова", (await p.locator("[data-doll-preview] img").count()) === 2, await p.locator("[data-doll-preview]").innerHTML());
// Кукла живая: дышит и водит головой — два снимка через полсекунды разные.
const pose = () => p.evaluate(() => ({ head: document.querySelector('[data-doll-preview] [data-part="head"]')?.style.transform, torso: document.querySelector('[data-doll-preview] [data-part="torso"]')?.style.transform }));
const pose1 = await pose();
await p.waitForTimeout(700);
const pose2 = await pose();
check("кукла в профиле живая: дышит (туловище ходит) и водит головой", Boolean(pose1.head) && pose1.head !== pose2.head && pose1.torso !== pose2.torso, [pose1, pose2]);
// Крутится пальцем: вбок на 200 px — кукла спиной (тёмные картинки), столько же обратно — снова лицом.
const box = await p.locator("[data-doll-preview]").boundingBox();
const spin = async (dx) => { await p.mouse.move(box.x + box.width / 2, box.y + 100); await p.mouse.down(); for (let i = 1; i <= 10; i += 1) await p.mouse.move(box.x + box.width / 2 + (dx * i) / 10, box.y + 100); await p.mouse.up(); await p.waitForTimeout(150); };
const side = () => p.evaluate(() => { const b = document.querySelector("[data-doll-preview]"); const t = b.querySelector('[data-part="torso"]'); return { back: b.dataset.back, turn: b.dataset.turn, src: t.getAttribute("src") === t.dataset.back ? "back" : "front" }; });
await spin(200);
const spunBack = await side();
if (shots) await p.screenshot({ path: `${shots}/profile-3-back.png` });
await spin(-200);
const spunFront = await side();
check("кукла крутится пальцем: вбок — спиной, обратно — лицом", spunBack.back === "1" && spunBack.src === "back" && spunFront.back === "0" && spunFront.src === "front", [spunBack, spunFront]);
check("расцветок сразу 5, по «ещё» — 16", (await p.locator("[data-pal]").count()) <= 6, await p.locator("[data-pal]").count());
await p.click("[data-more]");
check("…по «ещё» — все 16", (await p.locator("[data-pal]").count()) === 16, await p.locator("[data-pal]").count());
await p.click('[data-doll="queen"]');
await p.click('[data-pal="12"]');
check("выбрал расцветку — обводка встала её предпочитаемым цветом", await p.evaluate(() => document.querySelector("[data-ink].on")?.dataset.ink) === "#8fb4e0", await p.evaluate(() => document.querySelector("[data-ink].on")?.dataset.ink));
await p.click('[data-ink="#e0483f"]');
await p.waitForTimeout(600);
if (shots) await p.screenshot({ path: `${shots}/profile-2-sheet.png` });
await p.click('[data-tg-link]');
check("«Привязать Telegram» — вход приложения, с ключом гостя", JSON.stringify(await p.evaluate(() => window.__logins)) === JSON.stringify([key]), await p.evaluate(() => window.__logins));

// После перезагрузки — то же: выбор в профиле стола, а не на странице.
await open();
await openProfile();
const on = await p.evaluate(() => ({ doll: document.querySelector("[data-doll].on")?.dataset.doll, pal: document.querySelector("[data-pal].on")?.dataset.pal, ink: document.querySelector("[data-ink].on")?.dataset.ink }));
check("перезагрузил — выбор на месте: дама, расцветка 12, красный", on.doll === "queen" && on.pal === "12" && on.ink === "#e0483f", on);

// За стол — дамой в этой расцветке и своего цвета.
await p.goto(`${base}/table/?room=${room}&key=${encodeURIComponent(key)}`);
await p.waitForSelector("[data-section]", { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(800);
const me = await p.evaluate(() => { const s = window.__tableState?.(); return s?.people.find((x) => x.seat && s.chairs.find((c) => c.id === x.seat)?.owner === x.key && !x.bot && x.door !== "guest" || x.door === "app"); });
check("за столом — дама, расцветка 12, красный", me?.doll === "queen" && me?.palette === 12 && me?.ink === "#e0483f", me);

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got)?.slice(0, 300));
console.log(`tableProfile ${checks.length - bad.length}/${checks.length}`);
await browser.close();
process.exit(bad.length ? 1 : 0);
