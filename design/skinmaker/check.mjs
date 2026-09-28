// ПРОВЕРКА КОНСТРУКТОРА: у каждой части свои ракурсы, и выбираются они независимо.
//   python3 design/serve.py 9585 design   (в соседнем окне)
//   node design/skinmaker/check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/package.json", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9585/skinmaker/";
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(base);
await p.waitForTimeout(1500);
const views = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-slot-view]")].map((e) => [e.dataset.slotView, e.dataset.view])));
const turn = async (yaw, elev = 10) => { await p.evaluate(([y, e]) => { const S = window.__skinmaker.S; S.yaw = y; S.elev = e; }, [yaw, elev]); await p.waitForTimeout(250); return views(); };
check("готовые наборы — все фигуры колоды, звери, крестоносец, палка и сборный", (await p.locator("[data-set]").count()) >= 17, await p.locator("[data-set]").count());
check("пёс: спереди — лицо, сбоку — бок, сзади — спина", (await turn(0)).body === "front" && (await turn(95)).body === "right" && (await turn(180)).body === "back", await views());
await p.click('[data-set="mix"]');
const a = await turn(0), c = await turn(140);
check("сборный: голова-шар односторонняя, тело-бочонок в 18 ракурсах — голова стоит, тело крутится", a.head === "front" && c.head === "front" && a.body === "a0" && c.body === "a140", [a, c]);
await p.click('[data-set="crusader"]');
check("крестоносец сверху — макушка, снизу — подбородок", (await turn(0, 80)).head === "top" && (await turn(0, -65)).head === "bottom", await views());
await p.click('[data-stance="stand"]');
await p.waitForTimeout(300);
check("стоит — у фигуры ноги", Boolean((await views()).legs), await views());
check("без ошибок на странице", errors.length === 0, errors);
await b.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`skinmaker ${checks.filter((c) => c.ok).length}/${checks.length}`);
process.exit(checks.some((c) => !c.ok) ? 1 : 0);
