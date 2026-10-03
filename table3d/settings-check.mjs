// НАСТРОЙКИ 3D: «Полный экран» есть в обычном браузере (Fullscreen API) и работает; высота обзора сама зависит от ширины обзора (узкий — +3, широкий — 0), а не от устройства.
//   node settings-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const open = async (viewport) => {
  const p = await browser.newPage({ viewport });
  await p.goto(`${base}/?stand`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(800);
  return p;
};
{
  const phone = await open({ width: 390, height: 844 });
  check("телефон: высота обзора по умолчанию +3", Math.abs((await phone.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow())) - 3) < 0.05, await phone.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow()));
  // Стоя высота обзора выше на 6: телефон +3 → +9, десктоп 0 → 6.
  const h0 = await phone.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow());
  await phone.locator("[data-stance-toggle]:visible").first().click();
  await phone.waitForTimeout(700);
  const hs = await phone.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow());
  check("телефон стоя: высота обзора +9 (сидя +3)", Math.abs(hs - 9) < 0.05, { h0, hs });
  // Смена позы возвращает исходную высоту, а не ту, что оставил пользователь: ручное значение сбрасывается.
  const hNow = () => phone.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow());
  await phone.evaluate(() => window.__t3d.setViewHeight(0.1));
  await phone.locator("[data-stance-toggle]:visible").first().click();
  await phone.waitForTimeout(700);
  check("сел после ручной высоты стоя — исходная сидя +3, а не оставленная", Math.abs((await hNow()) - 3) < 0.05, await hNow());
  await phone.evaluate(() => window.__t3d.setViewHeight(1));
  await phone.locator("[data-stance-toggle]:visible").first().click();
  await phone.waitForTimeout(700);
  check("встал после ручной высоты сидя — исходная стоя +9", Math.abs((await hNow()) - 9) < 0.05, await hNow());
  await phone.locator("[data-stance-toggle]:visible").first().click();
  await phone.waitForTimeout(700);
  check("и сидя снова +3", Math.abs((await hNow()) - 3) < 0.05, await hNow());
  await phone.locator("[data-settings]:visible").first().click();
  // DEV-ползунок размера людей — на локальном адресе есть, по умолчанию люди чуть меньше (80%).
  // Умолчания на телефоне: карты в руке 70%, обзор 85 (шкала до 100, низ 65 не тронут).
  await phone.waitForSelector("[data-card-size]");
  check("телефон: карты в руке по умолчанию 70%", (await phone.inputValue("[data-card-size]")) === "70", await phone.inputValue("[data-card-size]"));
  const view = await phone.evaluate(() => { const e = document.querySelector("input[data-view]"); return { v: e.value, min: e.min, max: e.max }; });
  check("телефон: обзор по умолчанию 85, шкала 65…100", view.v === "85" && view.min === "65" && view.max === "100", view);
  // Люди уменьшаются целиком (не только палки): голова опускается, стул уменьшается и поднимается от сукна.
  const big = await phone.evaluate(() => window.__t3d.dollParts());
  await phone.locator("[data-doll-size]").fill("60");
  await phone.waitForTimeout(500);
  const small = await phone.evaluate(() => window.__t3d.dollParts());
  check("люди целиком меньше: голова ниже примерно в 0.75 раза (80% → 60%), стул мельче", big.headY !== null && small.headY < big.headY * 0.85 && small.chairScale < big.chairScale, { big, small });
  await phone.locator("[data-doll-size]").fill("80");
  await phone.waitForSelector("[data-doll-size]");
  check("DEV-ползунок «Размер людей» есть на локальном адресе, по умолчанию 80%", (await phone.inputValue("[data-doll-size]")) === "80", await phone.inputValue("[data-doll-size]"));
  await phone.locator("[data-doll-size]").fill("60");
  await phone.waitForTimeout(200);
  check("ползунок меняет размер людей", Math.abs((await phone.evaluate(() => window.__t3d.dollScaleNow())) - 0.6) < 0.01, await phone.evaluate(() => window.__t3d.dollScaleNow()));
  await phone.waitForSelector("[data-look=fullscreen]");
  check("в настройках есть «Полный экран»", true, null);
  await phone.locator("[data-look=fullscreen]").click();
  await phone.waitForTimeout(500);
  check("тумблер включает полный экран страницы", await phone.evaluate(() => !!document.fullscreenElement), null);
  check("и показывает, что он включён", (await phone.getAttribute("[data-look=fullscreen]", "aria-checked")) === "true", await phone.getAttribute("[data-look=fullscreen]", "aria-checked"));
  await phone.locator("[data-look=fullscreen]").click();
  await phone.waitForTimeout(500);
  check("второй тап выходит из полного экрана", await phone.evaluate(() => !document.fullscreenElement), null);
  await phone.close();
}
{
  // Планшет в портрете (обзор шире телефона, уже десктопа) — высота между; окно сузили/расширили — пересчитывается; тронули ползунок — остаётся.
  const pad = await open({ width: 768, height: 1024 });
  const h = () => pad.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow());
  const mid = await h();
  check("планшет: высота между телефоном и десктопом", mid > 1.2 && mid < 2.8, mid);
  await pad.setViewportSize({ width: 1280, height: 800 });
  await pad.waitForTimeout(600);
  check("окно расширили — высота сама стала 0", Math.abs(await h()) < 0.05, await h());
  await pad.setViewportSize({ width: 390, height: 844 });
  await pad.waitForTimeout(600);
  check("окно сузили — высота сама стала +3", Math.abs((await h()) - 3) < 0.05, await h());
  await pad.evaluate(() => window.__t3d.setViewHeight(3 / 13));
  await pad.setViewportSize({ width: 1280, height: 800 });
  await pad.setViewportSize({ width: 390, height: 844 });
  await pad.waitForTimeout(600);
  check("ползунок тронули — высота остаётся ручной", Math.abs(await h()) < 0.05, await h());
  await pad.close();
}
{
  const desk = await open({ width: 1280, height: 800 });
  const dh = () => desk.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow());
  check("десктоп: высота обзора по умолчанию 0", Math.abs(await dh()) < 0.05, await dh());
  await desk.locator("[data-stance-toggle]:visible").first().click();
  await desk.waitForTimeout(700);
  check("десктоп стоя: высота обзора по умолчанию не ниже предела стоя (7.5)", Math.abs((await dh()) - 7.5) < 0.05, await dh());
  await desk.evaluate(() => window.__t3d.setViewHeight(0));
  await desk.waitForTimeout(300);
  check("стоя: ползунок на минимуме — 7.5", Math.abs((await dh()) - 7.5) < 0.05, await dh());
  await desk.evaluate(() => window.__t3d.setViewHeight(1));
  await desk.waitForTimeout(300);
  check("стоя: ползунок на максимуме — 12", Math.abs((await dh()) - 12) < 0.05, await dh());
  await desk.locator("[data-stance-toggle]:visible").first().click();
  await desk.waitForTimeout(700);
  check("сел: ручное значение сброшено в исходное сидя (десктоп 0)", Math.abs(await dh()) < 0.05, await dh());
  await desk.evaluate(() => window.__t3d.setViewHeight(0));
  await desk.waitForTimeout(300);
  check("сидя: минимум по-прежнему −3", Math.abs((await dh()) + 3) < 0.05, await dh());
  await desk.close();
}
await browser.close();
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
