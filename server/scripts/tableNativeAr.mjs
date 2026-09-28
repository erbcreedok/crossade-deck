// СТОЛ В ПРИЛОЖЕНИИ CROSSADE: страница зовёт камеру приложения, прозрачна насквозь в AR и ставит стол по
// позе ARKit (`arNative.ts`); по ссылке с пропуском входит тем же человеком. Приложение здесь подменено:
// `__crossadeNative` пишет вызовы, позы шлёт прогон.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableNativeAr.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");
const { Client } = require("colyseus.js");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const browser = await chromium.launch();
const page = async (url) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log("ERROR", e.message));
  await p.addInitScript(() => {
    window.__arCalls = [];
    window.__crossadeNative = { version: 1, ar: (on) => window.__arCalls.push(on) };
  });
  await p.goto(url);
  return p;
};

// ── AR на стенде ─────────────────────────────────────────────────────────────────────────────────
const p = await page(`${base}/table/?stand`);
await p.waitForFunction(() => !!document.querySelector("canvas")?.dataset.spots);
await p.locator("[data-ar-enter]").click();
await p.waitForTimeout(250);
check("AR включился — приложение позвали включить камеру", JSON.stringify(await p.evaluate(() => window.__arCalls)) === "[true]", await p.evaluate(() => window.__arCalls));

// Телефон смотрит вниз на 50°, стоит в нуле.
const down = (deg) => [Math.sin((-deg * Math.PI) / 360), 0, 0, Math.cos((deg * Math.PI) / 360)];
const frame = (pos, deg = 50, fov = 62, sure = 1) => p.evaluate(([q, x, fv, t]) => window.__arFrame(q[0], q[1], q[2], q[3], x[0], x[1], x[2], fv, t), [down(deg), pos, fov, sure]);
const look = () => p.evaluate(() => { const s = JSON.parse(document.querySelector("canvas").dataset.spots || "{}"); return { ...s.middle, k: s.k }; });
const before = await look();
// ARKit ещё не поймал комнату: поворот в первых кадрах нулевой (смотрит в горизонт) — по нему стол не ставится.
await frame([0, 0, 0], 0, 62, 0);
await p.waitForTimeout(300);
const unsure = await look();
check("неуверенный кадр ARKit стол не трогает — обычный вид как был", Math.abs(unsure.x - before.x) < 2 && Math.abs(unsure.y - before.y) < 2 && Math.abs(unsure.k - before.k) < 0.01, [before, unsure]);
await frame([0, 0, 0]);
// Переезд: пишем путь середины стола кадр за кадром, пока он не встанет.
const path = await p.evaluate(() => new Promise((done) => {
  const out = [];
  const t0 = performance.now();
  const tick = () => {
    const s = JSON.parse(document.querySelector("canvas").dataset.spots || "{}");
    out.push(s.k);
    if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else done(out);
  };
  tick();
}));
const kinds = new Set(path.map((k) => k.toFixed(2)));
check("вход в AR — переездом: стол проходит через промежуточные размеры, а не прыгает", kinds.size >= 5, [path[0], path[Math.floor(path.length / 2)], path.at(-1), kinds.size]);
await p.waitForTimeout(200);
const bg = await p.evaluate(() => ({
  floor: getComputedStyle(document.querySelector("[data-ar-floor]")).backgroundImage + "|" + getComputedStyle(document.querySelector("[data-ar-floor]")).backgroundColor,
  body: getComputedStyle(document.body).backgroundColor,
  html: getComputedStyle(document.documentElement).backgroundColor,
  grid: document.querySelector("[data-ar-floor] path")?.getAttribute("d") ?? "",
}));
check("в AR страница прозрачна — под ней камера приложения", bg.floor === "none|rgba(0, 0, 0, 0)" && bg.body === "rgba(0, 0, 0, 0)" && bg.html === "rgba(0, 0, 0, 0)", bg);
check("сетки пола нет — пол настоящий", bg.grid === "", bg.grid.slice(0, 40));
// Пиксели: снимок без фона — верх экрана (над столом, под кнопками) прозрачен насквозь.
{
  const png = await p.screenshot({ omitBackground: true, clip: { x: 20, y: 110, width: 350, height: 60 } });
  const [seen, all] = await p.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d");
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1;
    return [n, bmp.width * bmp.height];
  }, png.toString("base64"));
  check("над столом насквозь видно камеру — ни обоев, ни блёсток", seen < all * 0.02, `${seen} непрозрачных из ${all}`);
}
await p.waitForTimeout(2500);
check("кнопки «Включить наклон» нет — датчик не нужен", (await p.locator("[data-ar-ask]").count()) === 0);

// Экран говорит, где у него середина стола и какого он размера (`canvas.dataset.spots`).
const spot = () => p.evaluate(() => { const s = JSON.parse(document.querySelector("canvas").dataset.spots || "{}"); return { ...s.middle, k: s.k }; });
const at0 = await spot();
check("стол встал туда, куда смотрит телефон", Math.abs(at0.x - 195) <= 3 && Math.abs(at0.y - 422) <= 3, at0);
await frame([0, 0, -0.25]);
await p.waitForTimeout(300);
const at1 = await spot();
check("шагнул к столу на 25 см — стол ближе: крупнее и ниже", at1.k > at0.k * 1.1 && at1.y > at0.y + 20, [at0, at1]);
await frame([0, 0, 0], 50, 40);
await p.waitForTimeout(300);
const at2 = await spot();
check("обзор камеры уже — стол крупнее (обзор берётся из приложения)", at2.k > at0.k * 1.2, [at0, at2]);

await p.locator('[data-ar-do="exit"]').click();
await p.waitForTimeout(300);
const after = await p.evaluate(() => ({ calls: window.__arCalls, body: document.body.style.background, floor: document.querySelectorAll("[data-ar-floor]").length }));
check("вышел из AR — камеру выключили, фоны вернулись", JSON.stringify(after.calls) === "[true,false]" && after.body === "" && after.floor === 0, after);

// ── жесты супер-AR: палец двигает стол, два пальца вниз — наклон ─────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const t = await ctx.newPage();
  await t.addInitScript(() => { window.__crossadeNative = { version: 1, ar() {} }; });
  await t.goto(`${base}/table/?stand`);
  await t.waitForFunction(() => !!document.querySelector("canvas")?.dataset.spots);
  const cdp = await ctx.newCDPSession(t);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id: id + 1 })) });
  const h = await t.locator("[data-ar-enter]").boundingBox();
  await touch("touchStart", [[h.x + h.width / 2, h.y + h.height / 2]]);
  await touch("touchEnd", []);
  await t.evaluate(() => window.__arFrame(Math.sin(-50 * Math.PI / 360), 0, 0, Math.cos(50 * Math.PI / 360), 0, 0, 0, 62, 1));
  await t.waitForTimeout(1000);
  const read = () => t.evaluate(() => {
    const s = JSON.parse(document.querySelector("canvas").dataset.spots || "{}");
    const seat = JSON.parse(document.querySelector("[data-ar-seat]")?.dataset.arSeat ?? "{}");
    return { ...s.middle, k: s.k, squash: s.squash, sx: seat.x ?? 0, sy: seat.y ?? 0, tilt: Math.round(seat.tilt ?? 0) };
  });
  const s0 = await read();
  // Пустое сукно правее середины стола — палец вверх на 120 px, по шагам.
  const x = 280, y = 420;
  await touch("touchStart", [[x, y]]);
  for (let i = 1; i <= 6; i += 1) { await touch("touchMove", [[x, y - i * 20]]); await t.waitForTimeout(30); }
  await touch("touchEnd", []);
  await t.waitForTimeout(200);
  const s1 = await read();
  check("палец по пустому сукну — едет САМ СТОЛ (посадка), а не глаз: вверх — от тебя", s0.y - s1.y > 40 && s1.k < s0.k && s1.sy > s0.sy + 1, [s0, s1]);
  // Два пальца вместе вниз — наклон: стол меняет сжатие, а размер (щипок) — нет.
  await touch("touchStart", [[140, 500], [250, 500]]);
  for (let i = 1; i <= 6; i += 1) { await touch("touchMove", [[140, 500 + i * 20], [250, 500 + i * 20]]); await t.waitForTimeout(30); }
  await touch("touchEnd", []);
  await t.waitForTimeout(200);
  const s2 = await read();
  check("два пальца вниз — стол наклонился и остался на экране", Math.abs(s2.squash - s1.squash) > 0.03 && s2.x > 0 && s2.x < 390 && s2.y > 0 && s2.y < 844, [s1, s2]);
  // Очень длинный жест — наклон упирается в предел: стол не встаёт на ребро и не переворачивается.
  const tilts = [];
  for (const dir of [1, -1]) {
    await touch("touchStart", [[140, 420], [250, 420]]);
    for (let i = 1; i <= 20; i += 1) { await touch("touchMove", [[140, 420 + dir * i * 20], [250, 420 + dir * i * 20]]); await t.waitForTimeout(15); }
    await touch("touchEnd", []);
    await t.waitForTimeout(150);
    tilts.push(await read());
  }
  check("наклон с пределом 60°: и туда, и обратно стол виден плашмя, не ребром и не изнанкой", tilts.every((q) => q.squash > 0.25 && Math.abs(q.tilt) === 60), tilts);
  await ctx.close();
}

// ── вход по пропуску ─────────────────────────────────────────────────────────────────────────────
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 7, first_name: "Ye" }) };
const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
const initData = new URLSearchParams({ ...f, hash: createHmac("sha256", createHmac("sha256", "WebAppData").update(TOKEN).digest()).update(sum).digest("hex") }).toString();
const web = await new Client(base.replace(/^http/, "ws")).joinOrCreate("table_room", { room, client: "html", door: "telegram", initData, protocol: 2 });
web.onMessage("*", () => {});
const got = await new Promise((done) => { web.onMessage("app", (one) => done(one)); web.send("hello"); setTimeout(() => web.send("app"), 300); });
const pass = got.pass;
const app = await page(`${base}/table/?room=${room}&pass=${encodeURIComponent(pass)}`);
await app.waitForSelector("[data-section]", { timeout: 15000 }).catch(() => {});
await app.waitForTimeout(800);
const owners = await app.evaluate(() => window.__tableState?.().chairs.filter((c) => c.owner === "tg:7").length ?? -1).catch(() => -1);
check("по ссылке с пропуском страница входит тем же человеком, на тот же стул", owners === 1, owners);
await app.click("[data-settings]");
await app.waitForTimeout(300);
check("в настройках приложения нет раздела «Приложение» — пропуск в самого себя ни к чему", (await app.locator('[data-look="app"]').count()) === 0 && (await app.locator("[data-settings-panel]").count()) === 1);

// ── ключ приложения: «Мои комнаты» → стол → по имени стола назад к списку ────────────────────────
{
  const list = await page(`${base}/table/?rooms&key=${encodeURIComponent(got.key)}`);
  await list.waitForSelector(`[data-room="${room}"]`, { timeout: 15000 }).catch(() => {});
  check("с ключом — «Мои комнаты»: мой стол в списке", (await list.locator(`[data-room="${room}"]`).count()) === 1, await list.locator("[data-rooms]").innerText().catch(() => ""));
  await list.locator(`[data-room="${room}"]`).click().catch(() => {});
  await list.waitForSelector("[data-section]", { timeout: 15000 }).catch(() => {});
  await list.waitForTimeout(800);
  const mine = await list.evaluate(() => window.__tableState?.().chairs.filter((c) => c.owner === "tg:7").length ?? -1).catch(() => -1);
  check("из списка — за стол тем же человеком, ключом", mine === 1 && new URL(list.url()).searchParams.has("key"), [mine, list.url()]);
  const back = list.locator("[data-rooms-back]");
  check("в приложении имя стола — «‹ назад» к списку", (await back.count()) === 1 && (await back.innerText()).startsWith("‹"), await back.count());
  await back.click().catch(() => {});
  await list.waitForSelector(`[data-room="${room}"]`, { timeout: 15000 }).catch(() => {});
  check("тап по имени — снова «Мои комнаты»", (await list.locator(`[data-room="${room}"]`).count()) === 1);
  const refused = await (await fetch(`${base}/table/my`, { headers: { "x-crossade-app-key": got.key.replace(/.$/, (c) => (c === "A" ? "B" : "A")) } })).status;
  check("подделанный ключ — «Мои комнаты» не отдаются (401)", refused === 401, refused);
}
await web.leave();

// ── приложение без ключа: вход гостем, свой стол; вход через Telegram ──────────────────────────────
{
  const g = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await g.addInitScript(() => {
    window.__keys = []; window.__logins = 0;
    window.__crossadeNative = { version: 1, ar() {}, key: (k) => window.__keys.push(k), login: () => { window.__logins += 1; } };
  });
  await g.goto(`${base}/table/?rooms`);
  await g.waitForSelector("[data-guest]", { timeout: 15000 }).catch(() => {});
  check("приложение без ключа — вход: гостем или через Telegram", (await g.locator("[data-guest]").count()) === 1 && (await g.locator("[data-tg-login]").count()) === 1);
  await g.locator("[data-tg-login]").click().catch(() => {});
  check("«Войти через Telegram» зовёт окно входа приложения", (await g.evaluate(() => window.__logins)) === 1);
  // Ключ гостя приложение должно получить ДО перехода на список: после перехода страница другая.
  await g.evaluate(() => { const was = window.__crossadeNative.key; window.__crossadeNative.key = (k) => { sessionStorage.setItem("gotKey", k); was(k); }; });
  await g.locator("[data-guest]").click().catch(() => {});
  await g.waitForSelector("[data-new]", { timeout: 15000 }).catch(() => {});
  const guestKey = await g.evaluate(() => sessionStorage.getItem("gotKey"));
  check("гость: ключ отдан приложению, список — «ты: Гость …»", typeof guestKey === "string" && /Ты: Гость \d{4} · гость/.test(await g.locator("[data-rooms]").innerText()), await g.locator("[data-rooms]").innerText().catch(() => ""));
  await g.locator("[data-new]").click().catch(() => {});
  await g.waitForSelector("[data-section]", { timeout: 15000 }).catch(() => {});
  await g.waitForTimeout(800);
  const owner = await g.evaluate(() => { const s = window.__tableState?.(); return s ? { admin: s.admin, me: s.people.find((p) => p.key.startsWith("dev:"))?.key } : null; }).catch(() => null);
  check("«Новый стол» — стол гостя: он за ним и он хозяин", owner && owner.me && owner.admin === owner.me, owner);
  await g.locator("[data-rooms-back]").click().catch(() => {});
  await g.waitForSelector(".room", { timeout: 15000 }).catch(() => {});
  check("и стол уже в «Моих комнатах» гостя", (await g.locator(".room").count()) === 1);

  // Вход через Telegram: подпись кнопки входа (Login Widget) → ключ на того же человека, что в мини-аппе.
  const fields = { id: 7, first_name: "Ye", auth_date: Math.floor(Date.now() / 1000) };
  const check7 = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const { createHash } = await import("crypto");
  const hash = createHmac("sha256", createHash("sha256").update(TOKEN).digest()).update(check7).digest("hex");
  const login = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login.addInitScript(() => { window.__keys = []; window.__crossadeNative = { version: 1, ar() {}, key: (k) => window.__keys.push(k) }; });
  await login.goto(`${base}/table/?login`);
  await login.waitForSelector("[data-login]", { timeout: 15000 }).catch(() => {});
  check("страница входа — кнопка Telegram на месте", (await login.locator('[data-login-widget] script[data-telegram-login]').count()) === 1);
  await login.evaluate((u) => window.onCrossadeTelegram(u), { ...fields, hash });
  await login.waitForFunction(() => window.__keys.length > 0, null, { timeout: 10000 }).catch(() => {});
  const tgKey = (await login.evaluate(() => window.__keys))[0];
  const myList = tgKey ? await (await fetch(`${base}/table/my`, { headers: { "x-crossade-app-key": tgKey } })).json() : null;
  check("вход через Telegram — ключ на того же человека: в его «Моих комнатах» его стол", !!myList?.rooms?.some((r) => r.room === room), myList?.rooms?.map((r) => r.room));
  const forged = await (await fetch(`${base}/table/app/telegram`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fields, id: 8, hash }) })).status;
  check("подпись Telegram не сходится — ключа нет (401)", forged === 401, forged);
}

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got)}`}`);
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
