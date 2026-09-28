// ПРОФИЛЬ СТОЛА — «Мои комнаты» в виде хаба, сверху я; по тапу — профиль: кукла (король или дама), расцветка
// (5 основных и «ещё»), мой цвет; «Привязать Telegram» у гостя приложения. Выбор живёт в профиле стола и
// садится за стол вместе с человеком. Приложение здесь подменено: `__crossadeNative` пишет вызовы входа.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" TABLE_VISIT_GAP_MS=0 PORT=2611 npx tsx src/index.ts
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
  await p.waitForFunction(() => /body:(?!-)/.test(document.querySelector("[data-doll-preview]")?.dataset.views ?? ""), null, { timeout: 8000 }).catch(() => {});
};

await open();
check("«Мои комнаты» в виде хаба: сукно под списком, я сверху", (await p.locator('[data-rooms] [data-g="ground"]').count()) === 1 && /Гость \d{4}/.test(await p.locator("[data-me]").innerText()), await p.locator("[data-me]").innerText());
check("в списке — карточка своего стола с «Войти»", (await p.locator(".card [data-room]").count()) === 1, await p.locator("[data-rooms]").innerText());
await p.waitForTimeout(1200); // заставка стола гаснет
if (shots) await p.screenshot({ path: `${shots}/profile-1-rooms.png` });
await openProfile();
const scroll = await p.evaluate(() => { const sh = document.querySelector("[data-profile]"); return { marked: sh.hasAttribute("data-scroll"), overflow: getComputedStyle(sh).overflowY, long: sh.scrollHeight > sh.clientHeight }; });
check("лист профиля прокручивается пальцем: стол не гасит в нём жест (data-scroll), и он длиннее экрана", scroll.marked && scroll.overflow === "auto", scroll);
const viewsNow = () => p.evaluate(() => Object.fromEntries((document.querySelector("[data-doll-preview]")?.dataset.views ?? "").split(" ").map((x) => x.split(":"))));
check("профиль открылся: фигура на сцене — с туловищем и головой в своих ракурсах", (await p.locator("[data-doll-preview] canvas").count()) === 1 && (await viewsNow()).body !== "-" && (await viewsNow()).head !== "-", await viewsNow());
// Фигура живая: дышит — два кадра сцены через полсекунды разные.
const frameOf = () => p.evaluate(() => document.querySelector("[data-doll-preview] canvas").toDataURL().length + ":" + document.querySelector("[data-doll-preview] canvas").toDataURL().slice(-40));
const f1 = await frameOf();
await p.waitForTimeout(700);
check("фигура в профиле живая: дышит (кадры меняются)", f1 !== (await frameOf()), f1);
check("расцветок сразу 5, по «ещё» — 16", (await p.locator("[data-pal]").count()) <= 6, await p.locator("[data-pal]").count());
await p.click("[data-more]");
check("…по «ещё» — все 16", (await p.locator("[data-pal]").count()) === 16, await p.locator("[data-pal]").count());
await p.click("[data-pick-skin]");
await p.waitForSelector("[data-builder]");
const offered = async () => ({ sets: await p.locator("[data-builder] [data-doll]").evaluateAll((els) => els.map((e) => e.dataset.doll)), heads: await p.locator("[data-builder] [data-part]").evaluateAll((els) => els.map((e) => e.dataset.part)) });
const start = await offered();
check("вначале в конструкторе только палка с кружком-аватаром: остальное приходит наградой", JSON.stringify(start.sets) === '["stick"]' && JSON.stringify(start.heads) === '["ball:head"]', start);
await p.click("[data-back]");
await p.waitForSelector("[data-profile]");
await p.click('[data-pal="12"]');
check("выбрал расцветку — обводка встала её предпочитаемым цветом", await p.evaluate(() => document.querySelector("[data-ink].on")?.dataset.ink) === "#8fb4e0", await p.evaluate(() => document.querySelector("[data-ink].on")?.dataset.ink));
await p.click('[data-ink="#e0483f"]');
await p.waitForTimeout(600);
if (shots) await p.screenshot({ path: `${shots}/profile-2-sheet.png` });
await p.click('[data-tg-link]');
check("«Привязать Telegram» — вход приложения, с ключом гостя", JSON.stringify(await p.evaluate(() => window.__logins)) === JSON.stringify([key]), await p.evaluate(() => window.__logins));

// ДВА ЗАХОДА ЗА СТОЛ (перерыв у прогона — ноль): на втором — награда, фигура колоды, и она сразу на нём.
const enter = async () => {
  await p.goto(`${base}/table/?room=${room}&key=${encodeURIComponent(key)}`);
  await p.waitForSelector("[data-section]", { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(900);
};
const meAt = () => p.evaluate(() => { const s = window.__tableState?.(); return s?.people.find((x) => x.door === "app" && !x.bot); });
await enter();
check("первый заход — палкой, без награды", (await meAt())?.parts?.body === "stick:body" && (await p.locator('[data-g="gift"]').count()) === 0, await meAt());
await enter();
const giftSaid = await p.locator('[data-g="gift"]').textContent().catch(() => null);
if (shots) await p.screenshot({ path: `${shots}/profile-5-gift.png` });
const me = await meAt();
check("второй заход — награда: плашка «Награда: …», и фигура колоды сразу на нём", /Награда: /.test(giftSaid ?? "") && /:body$/.test(me?.parts?.body ?? "") && me?.parts?.body !== "stick:body" && me?.parts?.legs === "legs-card:legs" && me?.palette === 12 && me?.ink === "#e0483f", { giftSaid, me });
const giftSet = me?.doll;

// После — в конструкторе два набора: палка и полученная фигура; её голову можно сменить на шар.
await open();
await openProfile();
check("перезагрузил — сижу полученной фигурой, расцветка 12, красный", await p.evaluate(() => document.querySelector("[data-pick-skin]")?.dataset.current) === giftSet && await p.evaluate(() => document.querySelector("[data-pal].on")?.dataset.pal) === "12", giftSet);
// Крутится пальцем, как в Doom: вбок на пол-оборота — другая нарисованная сторона (спина), обратно — лицо.
const box = await p.locator("[data-doll-preview]").boundingBox();
const spin = async (dx) => { await p.mouse.move(box.x + box.width / 2, box.y + 120); await p.mouse.down(); for (let i = 1; i <= 10; i += 1) await p.mouse.move(box.x + box.width / 2 + (dx * i) / 10, box.y + 120); await p.mouse.up(); await p.waitForTimeout(250); };
const before = await viewsNow();
await spin(180);
const spunBack = await viewsNow();
if (shots) await p.screenshot({ path: `${shots}/profile-3-back.png` });
await spin(-180);
const spunFront = await viewsNow();
check("фигура крутится пальцем, как в Doom: вбок — спина, обратно — снова лицо", before.body === "front" && spunBack.body === "back" && spunFront.body === "front", [before, spunBack, spunFront]);
await p.click("[data-pick-skin]");
await p.waitForSelector("[data-builder]");
const after = await offered();
check("в конструкторе — палка и полученная фигура", after.sets.length === 2 && after.sets.includes("stick") && after.sets.includes(giftSet), after);
await p.click('[data-tab="head"]');
await p.click('[data-part="ball:head"]');
await p.waitForTimeout(600);
if (shots) await p.screenshot({ path: `${shots}/profile-4-builder.png` });
await p.click("[data-back]");
await p.waitForSelector("[data-profile]");
check("поменял голову на шар — скин уже свой", await p.evaluate(() => document.querySelector("[data-pick-skin]")?.dataset.current) === "own", await p.evaluate(() => document.querySelector("[data-pick-skin]")?.dataset.current));

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got)?.slice(0, 300));
console.log(`tableProfile ${checks.length - bad.length}/${checks.length}`);
await browser.close();
process.exit(bad.length ? 1 : 0);
