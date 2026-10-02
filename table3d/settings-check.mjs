// НАСТРОЙКИ 3D: «Полный экран» есть в обычном браузере (Fullscreen API) и работает; высота обзора по умолчанию — на телефоне +3, на десктопе 0.
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
  await phone.locator("[data-settings]:visible").first().click();
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
  const desk = await open({ width: 1280, height: 800 });
  check("десктоп: высота обзора по умолчанию 0", Math.abs(await desk.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow())) < 0.05, await desk.evaluate(() => window.__t3d.cam().pos[1] - window.__t3d.eyeNow()));
  await desk.close();
}
await browser.close();
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
