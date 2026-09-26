// ЗАПИСЬ ИДЁТ В ТОМ ЖЕ ВРЕМЕНИ, В КАКОМ БЫЛА: часы записи идут непрерывно со скоростью стены × скорость,
// и на экране каждое мгновение, до которого часы дошли, — не раньше и не позже. Пошагово — ровный шаг.
// Режим и скорость переживают смену глаз; ряд кнопок помещается в телефон.
//   сервер с журналом записи; node scripts/tableReplayClock.mjs <base> <room> <pass> <from> <to>
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const [base, room, pass, from, to] = process.argv.slice(2);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const lane = `room=${room}&pass=${encodeURIComponent(pass)}&from=${from}&to=${to}`;
const { deeds } = await (await fetch(`${base}/table/journal?${lane}`)).json();
const t0 = deeds[0].at;
const rel = deeds.map((d) => d.at - t0);
const lastAt = (ms) => { let i = 0; while (i + 1 < rel.length && rel[i + 1] <= ms) i += 1; return i; };

// Откуда играть: место, где в ближайшие секунды мгновений много, — там видно, что они встают вовремя.
let start = 0, best = 0;
for (let i = 0; i < rel.length; i += 1) { const n = rel.filter((t) => t > rel[i] && t <= rel[i] + 3000).length; if (n > best) { best = n; start = i; } }

const browser = await chromium.launch();
const R = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
R.on("pageerror", (e) => errors.push(e.message));
const open = async (q) => {
  await R.goto(`${base}/table/replay?${lane}&${q}`);
  await R.waitForSelector("canvas[data-spots]");
  await R.waitForTimeout(1500);
};
const probe = () => R.evaluate(() => ({ t: performance.now(), rec: Number(document.getElementById("now").dataset.recordAt), step: Number(document.getElementById("bar").value) }));

/** Играть `ms` и снимать часы каждые 100 мс. */
async function play(ms) {
  await R.click("#play");
  const out = [];
  for (let k = 0; k < ms / 100; k += 1) { await R.waitForTimeout(100); out.push(await probe()); }
  await R.click("#play");
  return out;
}

for (const speed of [1, 4]) {
  await open(`at=${start}&mode=time&speed=${speed}`);
  const s = await play(3000);
  const rate = (s.at(-1).rec - s[0].rec) / (s.at(-1).t - s[0].t);
  const lag = s.map((one) => ({ ...one, want: lastAt(one.rec) })).filter((one) => one.step !== one.want && Math.abs(rel[one.want] - one.rec) > 60);
  const grows = s.every((one, i) => i === 0 || one.rec > s[i - 1].rec || one.rec >= rel.at(-1));
  check(`реальное время ${speed}×: часы записи идут со скоростью ${speed}× стены (±10%)`, Math.abs(rate - speed) / speed < 0.1, { rate });
  check(`реальное время ${speed}×: часы идут непрерывно, без скачков по мгновениям`, grows, s.map((one) => one.rec));
  check(`реальное время ${speed}×: на экране ровно то мгновение, до которого дошли часы`, lag.length === 0, lag.slice(0, 5));
  check(`реальное время ${speed}×: шаги пошли`, s.at(-1).step > s[0].step, [s[0].step, s.at(-1).step]);
}

await open(`at=0&mode=step&speed=2`);
const st = await play(3000);
const perSec = (st.at(-1).step - st[0].step) / ((st.at(-1).t - st[0].t) / 1000);
check("пошагово 2×: ровный шаг — 2×(1000/600) ≈ 3.3 шага в секунду (±15%)", Math.abs(perSec - 2000 / 600) / (2000 / 600) < 0.15, { perSec });
check("пошагово: часы стоят на времени текущего шага", st.every((one) => one.rec === rel[one.step]), st.slice(0, 5));

// Режим и скорость переживают смену глаз.
const other = await R.evaluate(() => [...document.querySelectorAll("#eyes option")].find((o) => !o.selected)?.value);
await R.selectOption("#eyes", other);
await R.waitForURL(/eyes=/);
await R.waitForSelector("canvas[data-spots]");
await R.waitForTimeout(1200);
check("смена глаз не сбрасывает режим и скорость", (await R.inputValue("#mode")) === "step" && (await R.inputValue("#speed")) === "2", [await R.inputValue("#mode"), await R.inputValue("#speed")]);

// Вёрстка телефона: ряд кнопок в экране, ничего не вылезает вбок.
const lay = await R.evaluate(() => {
  const inside = ["play", "back", "fwd", "mode", "speed", "eyes", "now", "more"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left, r: r.right, b: r.bottom }; });
  return { inside, w: innerWidth, h: innerHeight, scroll: document.documentElement.scrollWidth };
});
check("телефон 390: все кнопки в экране, прокрутки вбок нет", lay.inside.every((one) => one.l >= 0 && one.r <= lay.w && one.b <= lay.h) && lay.scroll <= lay.w, lay);
await R.screenshot({ path: process.env.SHOT ?? "replay-clock.png" });
check("без ошибок страницы", errors.length === 0, errors);
await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got).slice(0, 2000));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
