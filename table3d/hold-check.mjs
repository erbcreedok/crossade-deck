// ПОЛЗУНКИ ЗА КНОПКАМИ РЕЙКИ: тап «Сидя/Стоя» меняет позу, зажатая — вместо рейки ползунок высоты обзора (тот же палец тянет, отпустил — рейка вернулась);
// тап «Пересесть» открывает вид сверху (стул тянут по кругу и от стола), зажатая — ползунок посадки.
//   node hold-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`${base}/?stand&cam=head`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1000);
const box = async (sel) => (await p.locator(`${sel}:visible`).first().boundingBox());
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const stance = () => p.evaluate(() => (document.querySelector("[data-stance-toggle]")?.textContent ?? "").trim());
const holdOn = () => p.evaluate(() => { const e = document.querySelector("[data-hold-slider]"); return e && e.style.display !== "none" ? e.querySelector(".tt").textContent : null; });
const railOn = async () => (await p.locator(".c-rail [data-gyro]:visible").count()) > 0;
check("слайдеров посадки и высоты на экране нет, пока кнопки не зажаты", !(await holdOn()) && (await p.locator("[data-zoom-slider]:visible").count()) === 0, null);
// ТАП «Сидя» → стоя → сидя.
const s0 = await stance();
await p.locator("[data-stance-toggle]:visible").first().click();
await p.waitForTimeout(500);
const s1 = await stance();
check("тап «Сидя/Стоя» меняет позу", s0 !== s1, { s0, s1 });
await p.locator("[data-stance-toggle]:visible").first().click();
await p.waitForTimeout(500);
check("и обратно", (await stance()) === s0, await stance());
// ЗАЖАТЬ «Сидя» — ползунок высоты вместо рейки.
{
  const c = centre(await box("[data-stance-toggle]"));
  const h0 = await p.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow());
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(650);
  check("зажали «Сидя» — появился ползунок «Высота»", (await holdOn()) === "Высота", await holdOn());
  check("…а кнопки рейки (гиро, голова, пересесть) скрылись", !(await railOn()), null);
  const tr = await p.evaluate(() => { const r = document.querySelector("[data-hold-slider] .track").getBoundingClientRect(); return { x: r.x + r.width / 2, top: r.top, h: r.height }; });
  await p.mouse.move(tr.x, tr.top + tr.h * 0.5, { steps: 4 });
  await p.mouse.move(tr.x, tr.top + tr.h * 0.1, { steps: 6 });
  const h1 = await p.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow());
  check("тот же палец тянет вверх — высота обзора растёт", h1 > h0 + 2, { h0, h1 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  check("отпустили — рейка вернулась, ползунка нет", (await railOn()) && !(await holdOn()), null);
  check("и поза не поменялась (отпускание — не тап)", (await stance()) === s0, await stance());
  await p.evaluate(() => window.__t3d.setViewHeight(3 / 13));
}
// ЗАЖАТЬ «Пересесть» — ползунок посадки; вниз — дальше от стола.
{
  const c = centre(await box("[data-reseat]"));
  const a0 = await p.evaluate(() => window.__t3d.seatNow());
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(650);
  check("зажали «Пересесть» — ползунок «Посадка»", (await holdOn()) === "Посадка", await holdOn());
  const tr = await p.evaluate(() => { const r = document.querySelector("[data-hold-slider] .track").getBoundingClientRect(); return { x: r.x + r.width / 2, top: r.top, h: r.height }; });
  await p.mouse.move(tr.x, tr.top + tr.h * 0.3, { steps: 4 });
  await p.mouse.move(tr.x, tr.top + tr.h * 0.9, { steps: 6 });
  const a1 = await p.evaluate(() => window.__t3d.seatNow());
  check("тянем вниз — стул отодвигается от стола", a1 < a0 - 1, { a0, a1 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  check("после отпускания вид сверху не открылся", !(await p.evaluate(() => window.__t3d.reseatInfo().on)), null);
  await p.evaluate(() => window.__t3d.seatBy(5));
}
// ТАП «Пересесть» — вид сверху; стул тянут и по кругу, и от стола.
{
  await p.locator("[data-reseat]:visible").first().click();
  await p.waitForTimeout(900);
  check("тап «Пересесть» открывает вид сверху", await p.evaluate(() => window.__t3d.reseatInfo().on), null);
  const me = await p.evaluate(() => { const c = window.__t3d.state().chairs.find((x) => x.owner === window.__t3d.me()); return { id: c.id, angle: c.angle }; });
  const ch = await p.evaluate((id) => window.__t3d.chairs().find((c) => c.id === id), me.id);
  const d0 = await p.evaluate((id) => window.__t3d.chairAt(id), me.id);
  await p.mouse.move(ch.x, ch.y); await p.mouse.down(); await p.mouse.move(ch.x, ch.y + 38, { steps: 8 });
  const d1 = await p.evaluate((id) => window.__t3d.chairAt(id), me.id);
  check("тянем стул от середины — он отъезжает от стола", Math.hypot(d1[0], d1[2]) > Math.hypot(d0[0], d0[2]) + 0.8, { d0, d1 });
  await p.mouse.up();
  await p.locator("[data-reseat-ok]:visible").click();
  await p.waitForTimeout(700);
  check("«Готово» — посадка осталась (стул отодвинут)", (await p.evaluate(() => window.__t3d.seatNow())) < -0.5, await p.evaluate(() => window.__t3d.seatNow()));
}
// БЕЗ ЛУПЫ И ЗУМА СТРАНИЦЫ: на кнопках худа нет выделения и меню зажатия, двойной тап не зумит страницу (как на сцене).
{
  const st = await p.evaluate(() => { const b = document.querySelector("[data-stance-toggle]"), c = document.querySelector("#stage canvas"), i = document.querySelector("input, textarea"), cs = (e) => (e ? getComputedStyle(e) : null); const g = (e, k) => cs(e)?.getPropertyValue(k) ?? null; return { btn: { sel: g(b, "user-select"), touch: g(b, "touch-action"), callout: g(b, "-webkit-touch-callout") }, canvas: { touch: g(c, "touch-action") }, input: i ? g(i, "user-select") : "none-found" }; });
  check("кнопки худа: без выделения (нет лупы), без меню зажатия, двойной тап не зумит", st.btn.sel === "none" && st.btn.touch === "manipulation" && (st.btn.callout === "none" || (st.btn.callout === "" && (await (await fetch(`${base}/`)).text()).includes("-webkit-touch-callout: none"))), st);
  check("сцена по-прежнему сама ловит жесты (touch-action: none)", st.canvas.touch === "none", st);
  check("поля ввода выделяются как обычно", st.input === "none-found" || st.input === "text" || st.input === "auto", st.input);
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
