// ЧАША ЕДЕТ ЗА ОСЬЮ: при якоре «Кисть» центр чаши, кисть и карты — одна точка, и она двигается, когда двигают кисть или поворачивают голову.
//   python3 design/serve.py 9587 design/bowl &   node design/bowl/check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9587";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?view=head&anchor=hand&style=wire`);
await p.waitForFunction(() => window.__bowl); await p.waitForTimeout(1500);
const probe = () => p.evaluate(() => window.__bowl.probe());
const set = async (k, v) => { await p.evaluate(([k, v]) => { window.__bowl.P[k] = v; }, [k, v]); await p.waitForTimeout(400); };
const drag = async (dx, dy) => { await p.mouse.move(195, 500); await p.mouse.down(); await p.mouse.move(195 + dx, 500 + dy, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(500); };
const near = (b, c) => Math.hypot(b.bowl[0] - c[0], b.bowl[2] - c[2]) < 0.3;
const a = await probe();
check("якорь «Кисть»: центр чаши совпадает с кистью и картами", d(a.centre, a.wrist) < 0.05 && d(a.cards, a.wrist) < 0.5, a);
check("чаша стоит вокруг центра", near(a, a.centre), a);
// Двигаю кисть пальцем (как ты): ручки не трогаю — чаша должна поехать сама.
await set("moveHand", true);
await drag(120, -60);
const b = await probe();
check("сдвинул кисть пальцем — центр, карты и кисть ушли вместе", d(b.centre, a.centre) > 0.8 && d(b.centre, b.wrist) < 0.05, { a: a.centre, b: b.centre });
check("и чаша поехала за кистью, а не осталась на месте", near(b, b.centre) && d(b.bowl, a.bowl) > 0.8, { bowlA: a.bowl, bowlB: b.bowl });
// Верчу головой пальцем: кисть качается — чаша за ней.
await set("moveHand", false);
await drag(160, 0);
const c = await probe();
check("повернул голову пальцем — кисть уехала, чаша за ней", d(c.centre, b.centre) > 0.5 && near(c, c.centre), { b: b.centre, c: c.centre });
await set("ay", 1.5);
const e2 = await probe();
check("якорь выше кисти на 1.5 — чаша выше, а кисть и карты на месте", Math.abs(e2.centre[1] - e2.wrist[1] - 1.5) < 0.05 && d(e2.cards, e2.wrist) < 0.5, e2);
// ДИНАМИЧЕСКАЯ ВЫСОТА (1-е лицо): взгляд вниз — чаша выше, вверх — ниже; плоскость полюса и верх чаши идут вместе.
await set("ay", 0);
await set("pitch", -80);
const lo = await probe();
await set("pitch", -5);
const up = await probe();
const rel = (r) => r.pole - r.spec[1];
check("динамика: взгляд вниз — срез чаши выше (относительно её центра), чем при взгляде вверх", rel(lo) > rel(up) + 0.2, { down: rel(lo), up: rel(up) });
check("и верх нарисованной чаши совпадает с плоскостью полюса", Math.abs(lo.bowl[1] - lo.pole) < 0.1 && Math.abs(up.bowl[1] - up.pole) < 0.1, { lo, up });
await set("dyn", false); await set("cut", 22); await set("pitch", -80);
const s1 = await probe(); await set("pitch", -5); const s2 = await probe();
check("без динамики высота среза от взгляда не зависит", Math.abs(rel(s1) - rel(s2)) < 0.05, { s1: rel(s1), s2: rel(s2) });
// 3-Е ЛИЦО: чаша в совсем другом месте — на столе перед стулом, со своими размерами.
await set("view", "orbit");
const t = await probe();
check("3-е лицо: чаша стоит на столе перед стулом, а не вокруг кисти", Math.abs(t.bowl[0] - 0) < 0.3 && Math.abs(t.bowl[2] - (7.4 - 3.4)) < 0.4 && Math.hypot(t.bowl[0] - t.centre[0], t.bowl[2] - t.centre[2]) > 1, t);
check("3-е лицо: центр чаши — свои числа (вбок, высота, от стула)", Math.abs(t.spec[0] - 0) < 0.01 && Math.abs(t.spec[1] - 3) < 0.01 && Math.abs(t.spec[2] - 4) < 0.01, t.spec);
await set("view", "head");
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
