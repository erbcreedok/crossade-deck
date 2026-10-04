// ПРИЁМКА СТОПКИ В ИГРЕ (стенд `?stand`): три правила стопки работают через общий модуль `pileAccept.ts`.
//   принимает — карту, брошенную на колоду, колода берёт; не принимает — карта ложится рядом; нужен апрув — карта повисает над колодой, колода не берёт.
//   node acc-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "нужен апрув"));
await p.waitForTimeout(1200);
const setPolicy = (label) => p.evaluate((t) => { [...document.querySelectorAll("button")].find((b) => b.textContent === t).click(); }, label);
const deck = () => p.evaluate(() => { const s = window.__t3d.state(); const q = [...s.piles].sort((a, b) => b.cards.length - a.cards.length)[0]; return { n: q.cards.length, top: window.__t3d.screenOf(q.cards.at(-1).id) }; });
const putCard = async () => {
  const id = await p.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, -2.6, 1.6); return c.id; });
  await p.waitForTimeout(900);
  return { id, at: await p.evaluate((i) => window.__t3d.screenOf(i), id) };
};
for (const [policy, label] of [["accept", "принимает"], ["refuse", "не принимает"], ["ask", "нужен апрув"]]) {
  await setPolicy(label);
  const d0 = await deck(), card = await putCard();
  await p.mouse.move(card.at.x, card.at.y); await p.mouse.down(); await p.mouse.move(d0.top.x, d0.top.y + 6, { steps: 10 }); await p.waitForTimeout(250); await p.mouse.up(); await p.waitForTimeout(1200);
  const d1 = await deck();
  const onFelt = await p.evaluate((i) => !!window.__t3d.state().felt.find((c) => c.id === i), card.id);
  if (policy === "accept") check("принимает: колода взяла карту", d1.n === d0.n + 1, { d0: d0.n, d1: d1.n });
  if (policy === "refuse") check("не принимает: колода не взяла, карта на сукне", d1.n === d0.n && onFelt, { d0: d0.n, d1: d1.n, onFelt });
  if (policy === "ask") check("нужен апрув: колода не взяла, карта ждёт на сукне", d1.n === d0.n && onFelt, { d0: d0.n, d1: d1.n, onFelt });
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
