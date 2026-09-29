// СТРАНИЦА ХОЗЯИНА — «Детали»: галерея деталей (свои и встроенные) → страница детали. Деталь одна в объёме, крутится
// пальцем, к тебе — нужная сторона (нет её — ближайшая); у каждого ракурса картинка из библиотеки (выбор — по детали
// и стороне) или отражение другого, свои сдвиг и величина; как стоит к камере; сохранить, копия, удалить. Всё — в
// адресе, несохранённое переживает обновление. Встроенные — только смотреть и «Сделать своей копией».
//   node scripts/tableAdminDetails.mjs [base] [secret] [shot.png]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const secret = process.argv[3] ?? "probe";
const shot = process.argv[4];
const tag = `zz${Date.now().toString(36)}`;
const H = { "x-table-secret": secret };
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const mine = async () => (await (await fetch(`${base}/table/admin/details`, { headers: H })).json()).details;

// картинка в библиотеке: голова, лицо
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#b3221f"/></svg>`;
const sprite = await (await fetch(`${base}/table/admin/lib?name=${tag}-лицо&slot=head&side=front`, { method: "POST", headers: { ...H, "content-type": "image/svg+xml" }, body: svg })).json();
const before = new Set((await mine()).map((d) => d.id));

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
const hash = () => new URLSearchParams(new URL(p.url()).hash.slice(1));
try {
  await p.goto(`${base}/table/admin#key=${encodeURIComponent(secret)}`);
  await p.click('[data-tab="details"]');
  await p.waitForSelector(".dt [data-detail]");
  const names = await p.locator(".dt [data-detail] b").allTextContents();
  check("галерея деталей: встроенные на месте", names.includes("Король треф") && names.length >= 10, names.slice(0, 6));
  check("старая вкладка — «Подгонка», рядом", (await p.locator('[data-tab="parts"]').innerText()) === "Подгонка", null);
  await p.click('.dt [data-dk="legs"]');
  const legs = await p.locator(".dt [data-detail] i:first-of-type").allTextContents();
  check("полка «Ноги» — только ноги, в адресе", legs.length > 0 && legs.every((t) => t.startsWith("ноги")) && hash().get("dk") === "legs", legs);
  await p.click('.dt [data-dk="head"]');
  // НОВАЯ
  await p.click(".dt [data-new]");
  await p.waitForSelector("[data-detail-page] [data-dname]");
  const made = (await mine()).find((d) => !before.has(d.id));
  check("«+ Новая деталь» — на сервере, вид с полки, открыта её страница", made?.slot === "head" && hash().get("detail") === made.id, made);
  await p.fill("[data-dname]", `${tag} Лис`);
  // лицо: выбрать из библиотеки — там только головы-лица
  await p.click("[data-dpick]");
  await p.waitForSelector("[data-picker] [data-pref]");
  const offered = await p.locator("[data-picker] [data-pref] i").allTextContents();
  check("выбор картинки: библиотека по детали и стороне", offered.length > 0 && offered.every((t) => /лицо$/.test(t)) && (await p.locator(`[data-picker] [data-pref="${sprite.id}"]`).count()) === 1, offered.slice(0, 5));
  await p.click(`[data-picker] [data-pref="${sprite.id}"]`);
  await p.waitForFunction(() => document.querySelector("[data-dpic]")?.naturalWidth > 0, null, { timeout: 5000 }).catch(() => {});
  check("лицо поставлено: в клетке ракурса и на сцене", (await p.locator('[data-vw="front"] img').count()) === 1 && (await p.getAttribute("[data-dstage]", "data-seen")) === "front" && await p.locator("[data-dpic]").isVisible(), await p.getAttribute("[data-dstage]", "data-seen"));
  // сдвиг и величина
  const box0 = await p.locator("[data-dpic]").boundingBox();
  await p.fill('[data-dnum="dx"]', "1");
  await p.fill('[data-dnum="scale"]', "2");
  const box1 = await p.locator("[data-dpic]").boundingBox();
  check("сдвиг вправо и величина двигают картинку на сцене", box1.width > box0.width * 1.8 && box1.x + box1.width / 2 > box0.x + box0.width / 2 + 5, [box0, box1]);
  // бок: из библиотеки «любая сторона»; левый бок — отражение бока
  await p.click('[data-vw="right"]');
  check("тап по ракурсу — деталь повернулась к тебе этим боком", (await p.getAttribute("[data-dstage]", "data-toward")) === "right", await p.getAttribute("[data-dstage]", "data-toward"));
  check("бока нет — видно ближайшее, и так и сказано", (await p.getAttribute("[data-dstage]", "data-seen")) === "front" && /его нет/.test(await p.textContent("[data-dseen]")), await p.textContent("[data-dseen]"));
  await p.click("[data-dpick]");
  await p.click("[data-picker] [data-pside]");
  await p.click(`[data-picker] [data-pref="${sprite.id}"]`);
  await p.click('[data-vw="left"]');
  await p.selectOption("[data-dmirror]", "right");
  check("левый бок — отражением бока", (await p.locator('[data-vw="left"] img.flip').count()) === 1 && (await p.getAttribute("[data-dpic]", "data-flip")) === "1", null);
  // крутить пальцем
  const st = await p.locator("[data-dstage]").boundingBox();
  await p.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
  await p.mouse.down();
  await p.mouse.move(st.x + st.width / 2 + 160, st.y + st.height / 2, { steps: 6 });
  await p.mouse.up();
  check("крутится пальцем — к тебе другая сторона", (await p.getAttribute("[data-dstage]", "data-toward")) !== "left", await p.getAttribute("[data-dstage]", "data-toward"));
  // несохранённое переживает обновление
  await p.click('[data-vw="front"]');
  await p.click('[data-facing="camera"]');
  await p.reload();
  await p.waitForSelector("[data-detail-page] [data-dname]");
  check("обновил страницу — та же деталь, тот же ракурс, несохранённое на месте", (await p.inputValue("[data-dname]")) === `${tag} Лис` && (await p.locator('[data-vw="front"].on').count()) === 1 && (await p.inputValue('[data-dnum="dx"]')) === "1" && !(await p.locator("[data-dsave]").isDisabled()), [await p.inputValue("[data-dname]"), hash().get("dv")]);
  await p.click("[data-dsave]", { timeout: 3000 }).catch(() => {});
  await p.waitForFunction(() => /Сохранено/.test(document.querySelector("[data-dact]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  const got = (await mine()).find((d) => d.id === made?.id);
  check("сохранено на сервере: имя, как стоит, ракурсы, сдвиг, величина, отражение", got?.name === `${tag} Лис` && got.facing === "camera" && got.views.front?.sprite === sprite.id && got.views.front.dx === 1 && got.views.front.scale === 2 && got.views.right?.sprite === sprite.id && got.views.left?.mirror === "right" && !hash().get("dd"), got);
  if (shot) await p.screenshot({ path: shot, fullPage: true });
  // ВСТРОЕННАЯ: только смотреть, копия
  await p.click("[data-dback]");
  await p.waitForSelector(".dt [data-detail]");
  await p.fill(".dt [data-dq]", "Король треф");
  await p.locator('.dt [data-detail="b:king:head"]').click();
  await p.waitForSelector("[data-detail-page] h2");
  check("встроенная: ракурсы из каталога, править нельзя", (await p.locator('[data-vw="front"] img').count()) === 1 && (await p.locator('[data-vw="back"] img').count()) === 1 && (await p.locator("[data-dsave]").count()) === 0 && (await p.locator("[data-dpick]").count()) === 0, null);
  await p.click("[data-dcopy]");
  await p.waitForSelector("[data-detail-page] [data-dname]");
  const copy = (await mine()).find((d) => !before.has(d.id) && d.id !== made?.id);
  check("«Сделать своей копией» — своя деталь с теми же картинками", copy?.name === "Король треф" && copy.views.front?.sprite === "b:king:head:front" && copy.views.back?.sprite === "b:king:head:back", copy);
  // УДАЛИТЬ
  await p.click("[data-ddrop]");
  await p.waitForSelector(".dt [data-dgrid]");
  check("удалить — нет на сервере, назад к галерее", !(await mine()).some((d) => d.id === copy?.id) && (await p.locator("[data-dlist]").isVisible()), null);
  check("на телефоне без сдвига вбок", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
  check("без ключа детали закрыты", (await fetch(`${base}/table/admin/details`)).status === 403, null);
  check("без ошибок на странице", errors.length === 0, errors);
} finally {
  await browser.close();
  for (const d of await mine()) if (!before.has(d.id)) await fetch(`${base}/table/admin/details/${d.id}`, { method: "DELETE", headers: H });
  await fetch(`${base}/table/admin/lib/${sprite.id}`, { method: "DELETE", headers: H });
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got).slice(0, 400)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
