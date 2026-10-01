// AR В ПЕСОЧНИЦЕ — стенд на поддельной камере и поддельном датчике: камера включилась и лежит ПОД холстом, глаз встал
// на `DROP` метров над столом в его единицах, выход вернул прежнюю камеру и убрал видео.
//   node ar-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"] })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`${base}/?stand`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(600);
const was = await p.evaluate(() => window.__t3d.cam().mode);
await p.click("[data-ar]");
await p.waitForTimeout(1200);
await p.evaluate(() => dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: 10, beta: 60, gamma: 0 })));
await p.waitForTimeout(400);
const on = await p.evaluate(() => {
  const v = document.querySelector("video[data-ar-camera]"), c = document.querySelector("#stage canvas");
  // Видео — позиционированный элемент: холст без позиции оказался бы под ним (а клики сквозь видео проходят, так что `elementFromPoint` этого не видит).
  return { video: !!v, canvasOnTop: !!c && getComputedStyle(c).position !== "static", cam: window.__t3d.cam() };
});
check("AR включён: камера телефона под холстом сцены", on.video && on.canvasOnTop, on);
check("глаз стоит над столом на 0.35 м (в единицах стола 0.35 / 0.022)", Math.abs(on.cam.pos[1] - 0.35 / 0.022) < 0.2, on.cam.pos);
check("поле зрения — от камеры телефона, а не 50° орбиты", on.cam.fov > 55 && on.cam.fov < 75, on.cam.fov);
await p.click("[data-ar]");
await p.waitForTimeout(500);
const off = await p.evaluate(() => ({ mode: window.__t3d.cam().mode, video: !!document.querySelector("video") }));
check("выход из AR: прежняя камера и нет видео", off.mode === was && !off.video, { was, ...off });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
