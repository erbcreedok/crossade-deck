// СТРАНИЦА ХОЗЯИНА — «Детали»: галерея деталей (свои и встроенные, поиск по имени и тегам) → страница детали. У детали
// нет вида (голова, тело…): ширина в единицах стола и теги; картинка ракурса — любая этой стороны. Деталь одна в объёме, крутится
// пальцем, к тебе — нужная сторона (нет её — ближайшая); у каждого ракурса картинка из библиотеки (выбор — по детали
// и стороне) или отражение другого, свои сдвиг и величина; как стоит к камере; сохранить, копия, удалить. Всё — в
// адресе, несохранённое переживает обновление. Деталь — вещь в объёме: каждая сторона — плоскость на своём месте
// (у кубика — на полширины от середины), поворот показывает все стороны сразу. Встроенные — только смотреть и «Сделать своей копией».
//   node scripts/tableAdminDetails.mjs [base] [secret] [shot.png]
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const secret = process.argv[3] ?? "probe";
const shot = process.argv[4];
const tag = `zz${Date.now().toString(36)}`;
const AGY = `${tag}-agy`;
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
  check("галерея деталей: встроенные на месте — голова и тело карты различимы по имени, имён-двойников нет", names.includes("Король треф · голова") && names.includes("Король треф · тело") && new Set(names).size === names.length && names.length >= 10, names.filter((n, i) => names.indexOf(n) !== i));
  check("старая вкладка — «Подгонка», рядом", (await p.locator('[data-tab="parts"]').innerText()) === "Подгонка", null);
  check("полок по виду нет — одно поле поиска", (await p.locator(".dt [data-dk]").count()) === 0 && (await p.locator(".dt [data-dq]").count()) === 1, null);
  await p.fill(".dt [data-dq]", "ноги");
  const legs = await p.locator(".dt [data-detail] i:first-of-type").allTextContents();
  check("поиск по тегу «ноги» — только они, в адресе", legs.length > 0 && legs.every((t) => t.startsWith("ноги")) && hash().get("dq") === "ноги", legs);
  await p.fill(".dt [data-dq]", "");
  // НОВАЯ
  await p.click(".dt [data-new]");
  await p.waitForSelector("[data-detail-page] [data-dname]");
  const made = (await mine()).find((d) => !before.has(d.id));
  check("«+ Новая деталь» — на сервере, без вида: ширина 2.4, тегов нет; открыта её страница", made && !("slot" in made) && made.width === 2.4 && made.tags.length === 0 && hash().get("detail") === made.id, made);
  await p.fill("[data-dname]", `${tag} Лис`);
  // лицо: выбрать из библиотеки — там только головы-лица
  await p.click("[data-dpick]");
  await p.waitForSelector("[data-picker] [data-pref]");
  const offered = await p.locator("[data-picker] [data-pref] i").allTextContents();
  check("выбор картинки: любые картинки этой стороны — и головы, и тела", offered.length > 0 && offered.every((t) => /(лицо|0°)$/.test(t)) && (await p.locator(`[data-picker] [data-pref="${sprite.id}"]`).count()) === 1 && (await p.locator('[data-picker] [data-pref="b:king:body:front"]').count()) === 1 && (await p.locator('[data-picker] [data-pref="b:cube:head:front"]').count()) === 1, offered.slice(0, 5));
  await p.click(`[data-picker] [data-pref="${sprite.id}"]`);
  await p.waitForFunction(() => document.querySelector("[data-plane=front]")?.naturalWidth > 0, null, { timeout: 5000 }).catch(() => {});
  check("лицо поставлено: в клетке стороны и на сцене", (await p.locator('[data-vw="front"] img').count()) === 1 && (await p.getAttribute("[data-dstage]", "data-planes")) === "1" && await p.locator('[data-plane="front"]').isVisible(), await p.getAttribute("[data-dstage]", "data-planes"));
  // сдвиг и величина
  const box0 = await p.locator('[data-plane="front"]').boundingBox();
  await p.fill('[data-dnum="dx"]', "1");
  await p.fill('[data-dnum="scale"]', "2");
  const box1 = await p.locator('[data-plane="front"]').boundingBox();
  check("сдвиг вправо и величина двигают картинку на сцене", box1.width > box0.width * 1.8 && box1.x + box1.width / 2 > box0.x + box0.width / 2 + 5, [box0, box1]);
  // бок: из библиотеки «любая сторона»; левый бок — отражение бока
  await p.click('[data-vw="right"]');
  check("тап по ракурсу — деталь повернулась к тебе этим боком", (await p.getAttribute("[data-dstage]", "data-toward")) === "right", await p.getAttribute("[data-dstage]", "data-toward"));
  check("бока нет — так и сказано; лицо видно сбоку, на своём месте", /этой стороны нет/.test(await p.textContent("[data-dseen]")) && (await p.getAttribute("[data-dstage]", "data-planes")) === "1", await p.textContent("[data-dseen]"));
  await p.click("[data-dpick]");
  await p.click("[data-picker] [data-pside]");
  await p.click(`[data-picker] [data-pref="${sprite.id}"]`);
  await p.click('[data-vw="left"]');
  await p.selectOption("[data-dmirror]", "right");
  check("левый бок — отражением бока", (await p.locator('[data-vw="left"] img.flip').count()) === 1 && (await p.getAttribute('[data-plane="left"]', "data-flip")) === "1", null);
  await p.click('[data-facing="box"]');
  const faceOf = (v) => p.getAttribute(`[data-dbody] [data-plane="${v}"]`, "style");
  check("в объёме: три стороны — три плоскости, каждая повёрнута к своей стороне", (await p.getAttribute("[data-dstage]", "data-planes")) === "3" && /rotateY\(-90deg\)/.test(await faceOf("right")) && /rotateY\(90deg\)/.test(await faceOf("left")) && !/rotate/.test(await faceOf("front")), [await faceOf("right"), await faceOf("left")]);
  check("коробка: стороны на полширины от середины", (await p.getAttribute('[data-dbody] [data-plane="right"]', "data-out")) === "1.2", await p.getAttribute('[data-dbody] [data-plane="right"]', "data-out"));
  await p.fill('[data-dnum="out"]', "0.5");
  check("своё «наружу» у стороны", (await p.getAttribute('[data-dbody] [data-plane="left"]', "data-out")) === "0.5", await p.getAttribute('[data-dbody] [data-plane="left"]', "data-out"));
  await p.click('[data-facing="view"]');
  check("переключатель: плоскость — одна сторона к тебе, в своей плоскости", (await p.getAttribute("[data-dstage]", "data-planes")) === "1" && (await p.getAttribute("[data-dstage]", "data-shown")) === "left" && (await p.locator("[data-dbody] [data-plane]").count()) === 1, await p.getAttribute("[data-dstage]", "data-planes"));
  await p.fill('[data-dnum="out"]', "");
  // крутить пальцем
  await p.locator("[data-dstage]").scrollIntoViewIfNeeded();
  const st = await p.locator("[data-dstage]").boundingBox();
  await p.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
  await p.mouse.down();
  await p.mouse.move(st.x + st.width / 2 + 160, st.y + st.height / 2, { steps: 6 });
  await p.mouse.up();
  check("крутится пальцем — к тебе другая сторона", (await p.getAttribute("[data-dstage]", "data-toward")) !== "left", await p.getAttribute("[data-dstage]", "data-toward"));
  // несохранённое переживает обновление
  await p.click('[data-vw="front"]');
  await p.click('[data-facing="camera"]');
  const cellOf = () => p.evaluate(() => parseFloat(document.querySelector("[data-dcells]").style.backgroundSize));
  const cell0 = await cellOf();
  await p.fill("[data-dwidth]", "4.8");
  const cell1 = await cellOf();
  check("ширина детали в ед. стола: вдвое шире — клетка в 1 ед. вдвое мельче против неё", Math.abs(cell0 / cell1 - 2) < 0.05, [cell0, cell1]);
  await p.fill("[data-dtags]", "снеговик, зима");
  await p.reload();
  await p.waitForSelector("[data-detail-page] [data-dname]");
  check("обновил страницу — та же деталь, тот же ракурс, несохранённое на месте", (await p.inputValue("[data-dname]")) === `${tag} Лис` && (await p.locator('[data-vw="front"].on').count()) === 1 && (await p.inputValue('[data-dnum="dx"]')) === "1" && !(await p.locator("[data-dsave]").isDisabled()), [await p.inputValue("[data-dname]"), hash().get("dv")]);
  await p.click("[data-dsave]", { timeout: 3000 }).catch(() => {});
  await p.waitForFunction(() => /Сохранено/.test(document.querySelector("[data-dact]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  const got = (await mine()).find((d) => d.id === made?.id);
  check("сохранено на сервере: имя, как стоит, ракурсы, сдвиг, величина, отражение", got?.name === `${tag} Лис` && got.facing === "camera" && got.width === 4.8 && got.tags.join() === "снеговик,зима" && got.views.front?.sprite === sprite.id && got.views.front.dx === 1 && got.views.front.scale === 2 && got.views.right?.sprite === sprite.id && got.views.left?.mirror === "right" && !hash().get("dd"), got);
  // РАСЦВЕТКИ: шестнадцать и свои три — на сцене и в ракурсах, в адресе
  const pic0 = await p.getAttribute('[data-plane="front"]', "src");
  await p.click('[data-dpal="5"]');
  const pic5 = await p.getAttribute('[data-plane="front"]', "src");
  check("расцветка перекрашивает деталь, и в адресе", pic5 !== pic0 && hash().get("dp") === "5" && (await p.locator('[data-dpal="5"].on').count()) === 1, null);
  await p.fill('[data-dc="0"]', "#ff00aa");
  check("свои три цвета — на сцене и в клетке ракурса", decodeURIComponent(await p.getAttribute('[data-plane="front"]', "src")).includes("#ff00aa") && decodeURIComponent(await p.getAttribute('[data-vw="front"] img', "src")).includes("#ff00aa") && hash().get("dc")?.startsWith("ff00aa"), null);
  await p.click("[data-dcoff]");
  // PNG не красится — так и сказано
  await p.click('[data-vw="back"]');
  await p.click("[data-dpick]");
  await p.click("[data-picker] [data-pside]");
  await p.click('[data-picker] [data-pref="b:hand:hands:front"]');
  check("PNG в ракурсе — «не красится», сказано какой", /Не красятся \(PNG\): спина/.test(await p.textContent("[data-dpaint]")), await p.textContent("[data-dpaint]"));
  await p.click("[data-dclear]");
  if (shot) await p.screenshot({ path: shot, fullPage: true });
  // ЗАКАЗ У AGY ДЛЯ ДЕТАЛИ: форма помнит деталь, принятое встаёт в её пустые ракурсы
  await p.click("[data-dagy]");
  await p.waitForSelector("[data-agy] [data-for-detail]");
  check("«Заказать у agy» — форма заказа для этой детали", /Лис/.test(await p.textContent("[data-for-detail]")) && hash().get("sub") === "agy", await p.textContent("[data-for-detail]"));
  await p.click('[data-agy] [data-sides="2"]');
  await p.fill('[data-a="brief"]', "лис в очках");
  await p.fill('[data-a="id"]', AGY);
  await p.click("[data-go]");
  const card = p.locator(".job", { hasText: AGY }).first();
  await card.waitFor();
  check("в заказе видно, что он в деталь", /в деталь/.test(await card.innerText()), await card.innerText());
  await card.locator(".badge.good").waitFor({ timeout: 25_000 });
  await card.locator("[data-accept]").click();
  await p.waitForSelector("[data-detail-page]", { timeout: 8000 }).catch(() => {});
  const filled = (await mine()).find((d) => d.id === made?.id);
  const lib = (await (await fetch(`${base}/table/admin/lib`, { headers: H })).json()).sprites;
  const back = lib.find((x) => x.id === filled?.views.back?.sprite);
  check("принято — спина из agy встала в пустой ракурс, заданное лицо не тронуто, открыта деталь", back?.origin === "agy" && filled.views.front?.sprite === sprite.id && filled.views.front.dx === 1 && hash().get("detail") === made.id && hash().get("tab") === "details", filled?.views);
  // БОЧКА: 18 ракурсов по кругу, всегда лицом — к тебе ближайший по углу; коробкой — все 18 в объёме
  await p.click("[data-dback]");
  await p.waitForSelector(".dt [data-detail]");
  await p.locator('.dt [data-detail="b:barrel:body"]').click();
  await p.waitForSelector("[data-detail-page] h2");
  check("бочка: набор — 18 ракурсов по кругу, показ — всегда лицом", (await p.locator("[data-vw]").count()) === 18 && (await p.getAttribute("[data-dstage]", "data-mode")) === "camera", await p.locator("[data-vw]").count());
  await p.click('[data-vw="a100"]');
  await p.waitForFunction(() => document.querySelector("[data-dstage]")?.dataset.planes === "1", null, { timeout: 10_000 }).catch(() => {});
  check("повернул на 100° — к тебе ракурс 100°, одна картинка", (await p.getAttribute("[data-dstage]", "data-shown")) === "a100" && (await p.getAttribute("[data-dstage]", "data-planes")) === "1", await p.getAttribute("[data-dstage]", "data-shown"));
  await p.click('[data-facing="box"]');
  await p.waitForFunction(() => document.querySelector("[data-dstage]")?.dataset.planes === "18", null, { timeout: 15_000 }).catch(() => {});
  check("встроенную можно посмотреть коробкой — все 18 в объёме", (await p.getAttribute("[data-dstage]", "data-planes")) === "18", await p.getAttribute("[data-dstage]", "data-planes"));
  await p.click("[data-dcopy]");
  await p.waitForSelector("[data-detail-page] [data-dname]");
  const barrel = (await mine()).find((d) => d.name === "Бочонок · тело 2");
  check("копия бочки — своя: 18 по кругу, показ — как выбран (коробка)", barrel?.ring === 18 && barrel.facing === "box" && Object.keys(barrel.views).length === 18, barrel && { ring: barrel.ring, facing: barrel.facing });
  await p.click('[data-dset="sides"]');
  check("сменил набор на 6 сторон — картинки на ближайших углах", (await p.locator("[data-vw]").count()) === 6 && (await p.locator('[data-vw="right"] img').count()) === 1 && (await p.locator('[data-vw="top"] img').count()) === 0, await p.locator("[data-vw]").count());
  await p.click("[data-dsave]");
  await p.waitForFunction(() => /Сохранено/.test(document.querySelector("[data-dact]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  const six = (await mine()).find((d) => d.id === barrel?.id);
  check("сохранено: шесть сторон, лицо — 0°, спина — 180°", !six?.ring && six?.views.front?.sprite === "b:barrel:body:a0" && six.views.back?.sprite === "b:barrel:body:a180" && /:a(80|100)$/.test(six.views.right?.sprite ?? ""), six?.views && Object.fromEntries(Object.entries(six.views).map(([k, v]) => [k, v.sprite])));
  await p.click('[data-dset="ring"]');
  await p.fill("[data-dring]", "8");
  await p.dispatchEvent("[data-dring]", "change");
  check("и обратно по кругу, 8 ракурсов", (await p.locator("[data-vw]").count()) === 8 && (await p.locator('[data-vw="a0"] img').count()) === 1 && (await p.locator('[data-vw="a90"] img').count()) === 1, await p.locator("[data-vw]").count());
  // ВСТРОЕННАЯ: только смотреть, копия
  await p.click("[data-dback]");
  await p.waitForSelector(".dt [data-detail]");
  await p.fill(".dt [data-dq]", "Король треф голова");
  await p.locator('.dt [data-detail="b:king:head"]').click();
  await p.waitForSelector("[data-detail-page] h2");
  await p.waitForSelector('[data-vw="back"] img', { timeout: 10_000 }).catch(() => {});
  check("встроенная: ракурсы из каталога, править нельзя", (await p.locator('[data-vw="front"] img').count()) === 1 && (await p.locator('[data-vw="back"] img').count()) === 1 && (await p.locator("[data-dsave]").count()) === 0 && (await p.locator("[data-dpick]").count()) === 0, null);
  await p.click("[data-dcopy]");
  await p.waitForSelector("[data-detail-page] [data-dname]");
  const copy = (await mine()).find((d) => !before.has(d.id) && d.id !== made?.id);
  check("«Сделать своей копией» — своя деталь с теми же картинками и своим именем («… 2»)", copy?.name === "Король треф · голова 2" && copy.views.front?.sprite === "b:king:head:front" && copy.views.back?.sprite === "b:king:head:back", copy);
  // ИМЯ ЗАНЯТО — не сохранить
  await p.fill("[data-dname]", "король треф · ГОЛОВА");
  await p.click("[data-dsave]", { timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(300);
  check("имя другой детали — не сохранить, и сказано почему", /уже у другой детали/.test(await p.textContent("[data-dact]")) && (await mine()).find((d) => d.id === copy?.id)?.name === "Король треф · голова 2", await p.textContent("[data-dact]"));
  check("и сервер не пустит двойника", (await fetch(`${base}/table/admin/details`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ name: "Король треф · голова 2" }) })).status === 409, null);
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
  // заказ agy: рисунки с диска, картинки — через стол, сам заказ — тоже
  await rm(join(ROOT, "design/persona/skins", AGY), { recursive: true, force: true });
  for (const x of (await (await fetch(`${base}/table/admin/lib`, { headers: H })).json()).sprites) if (x.tags.includes(`${tag} Лис`) || x.name.startsWith(`${tag} Лис`)) await fetch(`${base}/table/admin/lib/${x.id}`, { method: "DELETE", headers: H });
  for (const j of (await (await fetch(`${base}/table/admin/sprites`, { headers: H })).json()).jobs ?? []) if (j.id === AGY) await fetch(`${base}/table/admin/sprites/${j.job}`, { method: "DELETE", headers: H });
  await fetch(`${base}/table/admin/lib/${sprite.id}`, { method: "DELETE", headers: H });
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${String(JSON.stringify(c.got)).slice(0, 400)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
