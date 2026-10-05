// СТРАНИЦА «СТОПКА — БАЗА»: на столе одна стопка из восьми карт, две сцены (сверху и от первого лица), четыре игрока-цвета, пинг и дрожание, камера включена всегда.
//   (нужны стенд :9588 и dev-сервер игры :9590)   node design/zones/pile-check.mjs [host]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const host = process.argv[2] ?? "localhost";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await browser.newContext({ viewport: { width: 430, height: 1000 } })).newPage();
const errors = [], checks = [];
p.on("pageerror", (e) => errors.push(e.message));
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`http://${host}:9588/pile.html`);
await p.waitForTimeout(3000);
const f = p.frames().find((x) => x.url().includes("pile-scenes"));
await f.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await p.waitForTimeout(2000);
const pile = () => f.evaluate(() => { const s = window.__me.state; return { piles: s.piles.map((x) => x.cards.length), felt: s.felt.length }; });
const topId = () => f.evaluate(() => window.__me.state.piles[0].cards.at(-1).id);
const st = await pile();
check("на столе одна стопка из восьми карт, на сукне ничего", st.piles.length === 1 && st.piles[0] === 8 && st.felt === 0, st);
check("за столом сидят только два наблюдателя-камеры; у четырёх цветов нет ни стула, ни места", await f.evaluate(() => { const s = window.__me.state, colours = ["blue", "red", "green", "yellow"]; return s.chairs.length === 2 && s.chairs.every((c) => c.owner?.startsWith("eye-")) && colours.every((k) => { const pl = s.people.find((x) => x.key === k); return !!pl && !pl.seat; }); }));
check("обе сцены нарисованы (два холста), у каждой кнопка «на весь экран»", await f.evaluate(() => document.querySelectorAll(".stage canvas").length === 2 && !!window.__full?.top && !!window.__full?.first));
check("у четырёх игроков по кнопке-цвету у каждой сцены", await f.evaluate(() => document.querySelectorAll("#who-top [data-k]").length === 4 && document.querySelectorAll("#who-first [data-k]").length === 4));
// камера включена без тумблера: колесо приближает
const depth = async () => f.evaluate(() => window.__top.test.depthOf(window.__me.state.piles[0].cards.at(-1).id));
const box = await f.evaluate(() => { const r = document.getElementById("f-top").getBoundingClientRect(); return { x: r.x, y: r.y }; });
const d0 = await depth();
await p.mouse.move(box.x + 190, box.y + 150); for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(150); } await p.waitForTimeout(400);
check("камера включена без тумблера: колесо приближает", (await depth()) < d0 - 1, { d0, d1: await depth() });
// карту стопки можно взять в любой сцене
for (const [which, scene] of [["top", "__top"], ["first", "__first"]]) {
  const id = await topId();
  const at = await f.evaluate(([s, i]) => window[s].test.screenOf(i), [scene, id]);
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 12, at.y + 8, { steps: 4 }); await p.waitForTimeout(300);
  const drag = await f.evaluate((s) => window[s].test.draggingId(), scene);
  await p.mouse.up(); await p.waitForTimeout(600);
  check(`верхнюю карту стопки можно взять в сцене «${which}»`, !!drag, drag);
}
// цвет свечения у соседней сцены — цвет несущего
{
  const ink = (k) => f.evaluate((kk) => window.__me.state.people.find((x) => x.key === kk).ink.replace("#", "").toLowerCase(), k);
  for (const key of ["red", "green", "yellow", "blue"]) {
    await f.evaluate((k) => document.querySelector(`#who-top [data-k="${k}"]`).click(), key);
    const id = await topId();
    const at = await f.evaluate((i) => window.__top.test.screenOf(i), id);
    await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 14, at.y - 9, { steps: 4 });
    for (let i = 0; i < 8; i++) { await p.mouse.move(at.x + 14 + (i % 2) * 6, at.y - 9, { steps: 2 }); await p.waitForTimeout(60); }
    const h = await f.evaluate((i) => window.__first.test.haloInfo(i), id);
    await p.mouse.up(); await p.waitForTimeout(600);
    check(`несёт ${key} сверху: в сцене от первого лица карта светится ${key}`, h && h.on && h.color === (await ink(key)), { h, want: await ink(key) });
  }
}
// пинг и дрожание
{
  const set = (id, v) => f.evaluate(([i, vv]) => { const e = document.getElementById(i); e.value = String(vv); e.dispatchEvent(new Event("input")); return document.getElementById(i.replace("lag-", "lagv-").replace("jit-", "jitv-")).textContent; }, [id, v]);
  const t1 = await set("lag-top", 500), t2 = await set("jit-top", 100);
  check("ползунки пинга и дрожания двигают задержку сцены и показывают значение", (await f.evaluate(() => window.__lag.lat.top === 500 && window.__lag.jit.top === 100)) && t1 === "500 мс" && t2 === "100 мс", { t1, t2 });
  await set("lag-top", 0); await set("jit-top", 0);
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
