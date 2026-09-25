// ЧУЖИЕ ХОДЫ ПОКАЗЫВАЮТСЯ ПО ОДНОМУ, А НЕ СЛИВАЮТСЯ В ОДИН КАДР.
//
// Стол шлёт ходы так быстро, как они случились. Два хода, разделённые на сервере секундой, приходили
// на экран почти встык: семёрка исчезала, валет появлялся, реплика «беру» приходила после — человек
// видел не партию, а подмену, и не мог сказать, кто что сделал.
//
// Здесь меряется то, что видит ЭКРАН: как менялся круг хода по кадрам. Между двумя чужими ходами
// должен быть различимый промежуток, а свой ход не должен ждать очереди.
//
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableBeat.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const ask = (p, i = {}) => fetch(base + p, { ...i, headers: { "x-table-secret": secret, "content-type": "application/json" } });
function initData(id, name) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...f, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
}

await ask("/table/rooms", { method: "POST", body: JSON.stringify({ by: "tg:7", home: { kind: "inline", message: "m" }, kind: "krest", room }) });

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.addInitScript((d) => {
  const a = {};
  Object.defineProperty(a, "WebApp", { value: { initData: d, initDataUnsafe: {}, ready() {}, expand() {} } });
  Object.defineProperty(window, "Telegram", { value: a });
}, initData(7, "Ye"));
await p.goto(`${base}/table/?room=${room}`);
await p.waitForSelector("[data-section]");
await p.waitForSelector(".crossade-loading", { state: "detached" });
await p.waitForTimeout(600);

const state = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));

// Три машины за стол и раздача.
await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command: { t: "bots", n: 3 } }) });
await p.waitForTimeout(2500);
await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command: { t: "deal", rule: "krest" } }) });
for (let i = 0; i < 120; i += 1) { if ((await state()).play) break; await p.waitForTimeout(300); }
check("партия началась", (await state()).play !== null, null);

// СВОЙ ХОД НЕ ЖДЁТ ОЧЕРЕДИ: кладём карту и смотрим, за сколько она появилась в круге.
for (let i = 0; i < 60; i += 1) { const st = await state(); if (st.play?.turn === st.you?.key || (st.play?.lay ?? []).length > 0) break; await p.waitForTimeout(400); }
const st = await state();
const моя = (st.play?.lay ?? [])[0];
if (моя) {
  const было = (st.piles.find((one) => one.id === "ring")?.cards.length) ?? 0;
  const t0 = Date.now();
  await p.evaluate(([id]) => { window.__tableSend({ t: "grab", id }); window.__tableSend({ t: "drop", id, to: { in: "deck", pile: "ring" } }); }, [моя]);
  let ушло = null;
  for (let i = 0; i < 40; i += 1) {
    const n = (await state()).piles.find((one) => one.id === "ring")?.cards.length ?? 0;
    if (n > было) { ушло = Date.now() - t0; break; }
    await p.waitForTimeout(50);
  }
  check("свой ход показывается сразу, без такта", ушло !== null && ушло < 600, ушло);
} else {
  check("свой ход показывается сразу, без такта", false, "не дождались своей очереди");
}

/**
 * ТРИ ЧУЖИХ ДВИЖЕНИЯ ПОДРЯД, БЕЗ ПАУЗ. Именно так ходы и слипались: сервер шлёт их так быстро, как
 * они случились, — а человек видит подмену вместо партии. Боты сами держат паузу, поэтому слипание
 * ими не воспроизвести: нужен сосед, который двигает карты одну за другой.
 */
const сосед = await browser.newPage({ viewport: { width: 390, height: 844 } });
await сосед.goto(`${base}/table/?room=${room}&name=Боря`);
await сосед.waitForSelector("[data-section]");
await сосед.waitForSelector(".crossade-loading", { state: "detached" });
await сосед.waitForTimeout(600);
const его = await сосед.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));
const егоСтул = его.chairs.find((c) => c.owner === его.you?.key) ?? его.chairs.find((c) => c.hand.length > 0 && !c.croupier);
const трое = (егоСтул?.hand ?? []).slice(0, 3).map((one) => one.id);
check("соседу есть чем двигать", трое.length === 3, трое.length);

/** СЛЕДИМ ГЛАЗАМИ ЭКРАНА: каждые 30 мс — сколько карт на сукне. Меняется — это кадр чужого движения. */
const смотреть = (ms) => p.evaluate((ms) => new Promise((done) => {
  const было = [];
  let прошлое = -1;
  const t = setInterval(() => {
    const круг = window.__tableState().piles.find((one) => one.id === "ring");
    const n = круг ? круг.cards.length : 0;
    if (n !== прошлое) { было.push({ at: Date.now(), n }); прошлое = n; }
  }, 30);
  setTimeout(() => { clearInterval(t); done(было); }, ms);
}), ms);

const следим = смотреть(5000);
await сосед.waitForTimeout(300);
// Три ХОДА одно за другим, без единой паузы: разносятся во времени именно ходы — карта в круг и
// карта из круга. Раздача, уборка и прочее ждать не должны, иначе стол лишь копит опоздание.
await сосед.evaluate((ids) => {
  ids.forEach((id) => {
    window.__tableSend({ t: "grab", id });
    window.__tableSend({ t: "drop", id, to: { in: "deck", pile: "ring" } });
  });
}, трое);
const кадры = await следим;
const начало = кадры.length > 0 ? кадры[0].n : 0;
const шаги = кадры.filter((one) => one.n > начало);
check("чужие движения дошли до экрана", шаги.length >= 3, кадры);
// МЕРЯЕМ ТОЛЬКО ТРИ ХОДА СОСЕДА. Дальше в круг ходят машины — своим темпом, и их зазоры к этому
// закону отношения не имеют.
const трижды = шаги.slice(0, 3);
const зазоры = трижды.slice(1).map((one, i) => one.at - трижды[i].at);
const тесно = зазоры.filter((ms) => ms < 300);
check("и показались ПО ОДНОМУ, а не одним кадром", трижды.length === 3 && тесно.length === 0, { зазоры, тесно });

await browser.close();
for (const one of checks) console.log(one.ok ? "ok  " : "FAIL", one.name, one.ok ? "" : JSON.stringify(one.got));
const bad = checks.filter((one) => !one.ok).length;
console.log(bad === 0 ? `\nвсё сошлось: ${checks.length}` : `\nпровалов: ${bad} из ${checks.length}`);
process.exit(bad === 0 ? 0 : 1);
