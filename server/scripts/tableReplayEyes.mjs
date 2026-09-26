// ГЛАЗА ЗАПИСИ — ЕДИНЫ. Выбрал игрока — его место внизу, его рука моя, и камера — ЕГО записанная камера
// на это мгновение, как бы ни двигали стол другие. Камеры нет (крупье) — стол стоит с его места, и
// сказано, что камера не записана. Шагами, скачками и после смены глаз — одно и то же.
//   сервер с журналом записи; node scripts/tableReplayEyes.mjs <base> <room> <pass> <from> <to>
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const [base, room, pass, from, to] = process.argv.slice(2);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const lane = `room=${room}&pass=${encodeURIComponent(pass)}&from=${from}&to=${to}`;
const { deeds } = await (await fetch(`${base}/table/journal?${lane}`)).json();

// ОЖИДАНИЕ — своей рукой, не кодом страницы: последняя камера этого игрока до шага, иначе первая его.
const expected = (key, step) => {
  const his = (d) => d.side === "screen" && d.kind === "view" && d.who === key;
  for (let i = step; i >= 0; i -= 1) if (his(deeds[i])) return deeds[i].what;
  return deeds.find(his)?.what ?? null;
};
const norm = (a) => ((Math.round(a) % 360) + 360) % 360;

const browser = await chromium.launch();
const R = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
R.on("pageerror", (e) => errors.push(e.message));
const open = async (eyes, at = 0) => {
  await R.goto(`${base}/table/replay?${lane}${eyes ? `&eyes=${encodeURIComponent(eyes)}` : ""}&at=${at}`);
  await R.waitForSelector("canvas[data-spots]");
  await R.waitForTimeout(1500);
};
const seek = (i) => R.evaluate((i) => { const bar = document.getElementById("bar"); bar.value = String(i); bar.dispatchEvent(new Event("input")); }, i);
const seen = () => R.evaluate(() => {
  const s = JSON.parse(document.querySelector("canvas").dataset.spots);
  const [x, y, zoom, turn, lean] = document.querySelector("canvas").dataset.view.split(",").map(Number);
  return { me: s.me, mine: s.mine, seatAngle: s.seatAngle, middle: s.middle, seat: s.seats.find((one) => one.key === s.mine) ?? null, turn, lean, blind: !document.querySelector("[data-no-camera]").hidden };
});

await open(null);
const people = await R.evaluate(() => [...document.querySelectorAll("#eyes option")].map((o) => ({ key: o.value, text: o.textContent, on: o.selected })));
const croupier = people.find((p) => p.text.includes("крупье"))?.key;
const humans = people.filter((p) => p.key.startsWith("tg:")).map((p) => p.key);
check("по умолчанию — глазами крупье", people.find((p) => p.on)?.key === croupier, people);
const n = deeds.length;
const order = [...Array.from({ length: 40 }, (_, i) => Math.floor((i * n) / 40)), n - 1, 0, Math.floor(n / 2), 5, n - 2, Math.floor(n / 3), 372, 382, 371, 383].filter((i) => i < n);

async function walk(key, label) {
  let bad = [];
  let viewed = 0;
  for (const step of order) {
    await seek(step);
    await R.waitForTimeout(350); // камера должна УСТОЯТЬ, а не только встать: доворот к стулу едет сотни мс
    const got = await seen();
    const want = expected(key, step);
    if (got.me !== key) bad.push({ step, why: "не те глаза", me: got.me });
    if (want) {
      viewed += 1;
      if (norm(got.turn) !== norm(want.turn) || Math.round(got.lean) !== Math.round(want.lean)) bad.push({ step, why: "чужая камера", got: [got.turn, got.lean], want: [want.turn, want.lean] });
      if (got.blind) bad.push({ step, why: "пометка «нет камеры» при записанной" });
    } else {
      if (norm(got.turn) !== norm(got.seatAngle ?? 0) || Math.round(got.lean) !== 0) bad.push({ step, why: "без камеры — не на угол своего стула", got: [got.turn, got.lean], seat: got.seatAngle });
      if (!got.blind) bad.push({ step, why: "нет пометки «камера не записана»" });
      if (got.seat && !(got.seat.y > got.middle.y && Math.abs(got.seat.x - got.middle.x) < 40)) bad.push({ step, why: "своё место не на шести часах", seat: got.seat, middle: got.middle });
    }
  }
  check(`${label}: на ${order.length} мгновениях (шаги, скачки назад и вперёд) — его глаза и его камера${viewed ? ` (записанных: ${viewed})` : ""}`, bad.length === 0, bad.slice(0, 5));
}

await walk(croupier, "крупье");
for (const key of humans) {
  await open(key);
  await walk(key, key);
}
// СМЕНА ГЛАЗ ТУДА И ОБРАТНО — мгновение и камера те же, что до смены.
const [a, b] = humans;
if (a && b) {
  await open(a, 372);
  const before = await seen();
  await R.selectOption("#eyes", b);
  await R.waitForURL(/eyes=/);
  await R.waitForSelector("canvas[data-spots]");
  await R.waitForTimeout(1500);
  const other = await seen();
  await R.selectOption("#eyes", a);
  await R.waitForURL(new RegExp(`eyes=${encodeURIComponent(a)}`));
  await R.waitForSelector("canvas[data-spots]");
  await R.waitForTimeout(1500);
  const back = await seen();
  const step = Number(await R.inputValue("#bar"));
  check("смена глаз: у другого — его глаза и его камера", other.me === b && (expected(b, 372) ? norm(other.turn) === norm(expected(b, 372).turn) : norm(other.turn) === norm(other.seatAngle ?? 0)), other);
  check("возврат: то же мгновение и та же камера, что до смены", step === 372 && back.me === a && norm(back.turn) === norm(before.turn) && back.lean === before.lean, { step, before, back });
}
check("без ошибок страницы", errors.length === 0, errors);
await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
