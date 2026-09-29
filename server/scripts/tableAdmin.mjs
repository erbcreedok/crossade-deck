// СТРАНИЦА ХОЗЯИНА — вкладка «Спрайты»: фигура на сцене, правка части видна сразу (голова выросла — занятое на сцене
// выросло), «Сохранить» кладёт правку на стол (`/table/tunes`), «Как в каталоге» снимает. Без ключа — отказ.
//   node scripts/tableAdmin.mjs [base] [secret] [shot.png]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const secret = process.argv[3] ?? "probe";
const shot = process.argv[4];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/table/admin#key=${encodeURIComponent(secret)}`);
await p.waitForSelector("[data-stage] canvas");
await p.waitForFunction(() => /head:(?!-)/.test(document.querySelector("[data-stage]")?.dataset.views ?? ""), null, { timeout: 8000 });
await p.waitForTimeout(600);

/** Сколько строк сцены заняты рисунком — высота фигуры в пикселях холста. */
const height = () => p.evaluate(() => {
  const cv = document.querySelector("[data-stage] canvas");
  const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  let top = -1, bottom = -1;
  for (let y = 0; y < cv.height; y += 2) {
    let any = false;
    for (let x = 0; x < cv.width; x += 3) if (d[(y * cv.width + x) * 4 + 3] > 200 && d[(y * cv.width + x) * 4] + d[(y * cv.width + x) * 4 + 1] > 120) { any = true; break; }
    if (any) { if (top < 0) top = y; bottom = y; }
  }
  return bottom - top;
});
// сцена крутится сама (дыхание, взгляд) — замер по кадру с остановленным временем не нужен, хватит разницы в разы
const before = await height();
await p.fill('[data-f="scale"]', "2.5");
await p.waitForTimeout(300);
const after = await height();
check("правка величины видна на сцене сразу — фигура выше", after > before * 1.12, { before, after });
check("кнопка «Сохранить» ожила", await p.isEnabled("[data-save]"), null);
await p.fill('[data-f="name"]', "Царь");
await p.click("[data-save]");
await p.waitForFunction(() => /Сохранено/.test(document.querySelector("[data-said]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
const tunes = await (await fetch(`${base}/table/tunes`)).json();
check("правка на столе", tunes.parts["king:head"]?.scale === 2.5 && tunes.parts["king:head"]?.name === "Царь", tunes.parts);
check("в списке частей — новое имя с отметкой правки", (await p.locator('[data-part="king:head"].tuned').innerText()).includes("Царь"), await p.locator('[data-part="king:head"]').innerText());
if (shot) await p.screenshot({ path: shot });
await p.click("[data-reset]");
await p.click("[data-save]");
await p.waitForTimeout(400);
check("«Как в каталоге» + «Сохранить» снимает правку", !(await (await fetch(`${base}/table/tunes`)).json()).parts["king:head"], null);
const denied = await fetch(`${base}/table/admin/tunes/king:head`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
check("без ключа стол не пускает", denied.status === 403, denied.status);
check("без ошибок на странице", errors.length === 0, errors);
await browser.close();

for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
