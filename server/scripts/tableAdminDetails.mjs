// СТРАНИЦА ХОЗЯИНА — «Детали»: галерея деталей (свои и встроенные, поиск по имени и тегам) → страница детали. Деталь —
// картинки в пространстве (three.js, движок WebGL или CSS3D): у каждой место X/Y/Z, поворот X/Y/Z, от середины,
// величина, отражения ↔ ↕, форма (треугольник…), «когда» и «как стоит». Заготовки формы (куб, d4…d20, призма, ракурсы),
// список с галочками и ×, «Отменить / Вернуть», ручки на сцене, тап — выбрать; у стола — Ctrl двигает, Shift крутит.
// Встроенная — первая правка делает свою копию. Всё — в адресе.
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

const svg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="${fill}"/></svg>`;
const upload = async (name, fill) => (await (await fetch(`${base}/table/admin/lib?name=${name}&slot=head&side=front`, { method: "POST", headers: { ...H, "content-type": "image/svg+xml" }, body: svg(fill) })).json());
const sprite = await upload(`${tag}-лицо`, "#b3221f");
const before = new Set((await mine()).map((d) => d.id));

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
// Адрес — со страницы: Playwright узнаёт о смене якоря (replaceState) с запозданием.
const hash = async () => new URLSearchParams(await p.evaluate(() => location.hash.slice(1)));
const draft = async () => JSON.parse((await hash()).get("dd") ?? "null");
const stage = (a) => p.getAttribute("[data-dstage]", a);
const rows = () => p.locator("[data-row]").count();
const rowIds = () => p.locator("[data-row]").evaluateAll((els) => els.map((e) => e.dataset.row));
const said = () => p.textContent("[data-dact]");
const frame = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const screenOf = (id) => p.evaluate((i) => window.__dstage.screenOf(i), id);
const pick = async (ref) => { await p.waitForSelector("[data-picker] [data-pref]"); await p.click(`[data-picker] [data-pref="${ref}"]`); };
// Тянуть мышью по сцене: сперва сцену в экран, потом — откуда (`from` — функция: точка считается уже после прокрутки);
// адрес камеры пишется, когда она затихла, — подождать.
const drag = async (sel, from, dx, dy, key) => {
  await p.locator(sel).scrollIntoViewIfNeeded();
  const box = await p.locator(sel).boundingBox();
  const at = from ? await from(box) : null;
  const x = at?.x ?? box.x + box.width / 2, y = at?.y ?? box.y + box.height / 2;
  if (key) await p.keyboard.down(key);
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dx, y + dy, { steps: 8 });
  await p.mouse.up();
  if (key) await p.keyboard.up(key);
  await frame();
  await p.waitForTimeout(320);
};
try {
  await p.goto(`${base}/table/admin#key=${encodeURIComponent(secret)}`);
  await p.click('[data-tab="details"]');
  await p.waitForSelector(".dt [data-detail]");
  const names = await p.locator(".dt [data-detail] b").allTextContents();
  check("галерея: встроенные на месте, двойников нет", names.includes("Король треф · голова") && new Set(names).size === names.length, names.filter((n, i) => names.indexOf(n) !== i));
  await p.fill(".dt [data-dq]", "ноги");
  const legs = await p.locator(".dt [data-detail] i:first-of-type").allTextContents();
  check("поиск по тегу «ноги» — только они", legs.length > 0 && legs.every((t) => t.startsWith("ноги")), legs);
  await p.fill(".dt [data-dq]", "");

  // НОВАЯ: пустая; сцена на three.js; «+ Картинка» — все картинки, с этой стороны — первыми
  await p.click(".dt [data-new]");
  await p.waitForSelector("[data-detail-page] [data-dstage] canvas");
  const made = (await mine()).find((d) => !before.has(d.id));
  check("«+ Новая деталь» — на сервере пустая, сцена WebGL", made && made.layers.length === 0 && (await hash()).get("detail") === made.id && (await stage("data-engine")) === "webgl", made);
  await p.fill("[data-dname]", `${tag} Лис`);
  await p.click("[data-ladd]");
  await p.waitForSelector("[data-picker] [data-pref]");
  const cells = await p.locator("[data-picker] [data-pref]").evaluateAll((els) => els.map((e) => [e.dataset.pref, e.classList.contains("same")]));
  const firstOther = cells.findIndex(([, same]) => !same);
  check("выбор картинки: любые (и тела, и спины), с этой стороны — первыми", cells.some(([r]) => r === "b:king:body:back") && firstOther > 0 && cells.slice(firstOther).every(([, same]) => !same), cells.slice(0, 3));
  await pick(sprite.id);
  const front = (await rowIds())[0];
  await p.waitForFunction(() => document.querySelector("[data-dstage]")?.dataset.planes === "1", null, { timeout: 5000 }).catch(() => {});
  check("картинка встала: строка, на сцене, ручки на ней", (await rows()) === 1 && (await stage("data-planes")) === "1" && (await stage("data-grip")) === front, [await stage("data-planes"), await stage("data-grip")]);

  // ЧИСЛА: место, поворот X/Y/Z, от середины, величина, отражения, форма
  const s0 = await screenOf(front);
  await p.fill('[data-lnum="x"]', "1");
  await frame();
  const s1 = await screenOf(front);
  check("X = 1 — картинка вправо на сцене", s1.x > s0.x + 10, [s0, s1]);
  await p.fill('[data-lnum="rx"]', "167");
  await p.fill('[data-lnum="ry"]', "5");
  await p.fill('[data-lnum="rz"]', "217");
  let d = await draft();
  check("поворот X 167, Y 5, Z 217 — как набрал (Z — в −180…180: −143)", d.layers[0].rx === 167 && d.layers[0].ry === 5 && d.layers[0].rz === -143, d.layers[0]);
  await p.fill('[data-lnum="dist"]', "3");
  d = await draft();
  check("от середины 3 — по тому же направлению (X был 1 → 3)", d.layers[0].x === 3 && d.layers[0].z === 0 && (await p.inputValue('[data-lnum="x"]')) === "3", d.layers[0]);
  await p.fill('[data-lnum="scale"]', "1.5");
  await p.check('[data-lflip="flipX"]');
  await p.check('[data-lflip="flipY"]');
  await p.click('[data-lshape="tri"]');
  d = await draft();
  check("величина, отражение ↔ и ↕, форма «треугольник»", d.layers[0].scale === 1.5 && d.layers[0].flipX && d.layers[0].flipY && d.layers[0].shape === "tri", d.layers[0]);

  // ОТМЕНИТЬ / ВЕРНУТЬ
  await p.click("[data-dundo]");
  check("«Отменить» — форма снова как картинка", (await draft()).layers[0].shape === "rect", (await draft()).layers[0].shape);
  await p.click("[data-dredo]");
  check("«Вернуть» — снова треугольник", (await draft()).layers[0].shape === "tri", null);

  // ЗАГОТОВКИ ФОРМЫ: d20 — 20 граней, картинка переехала; 6 → 16 → убрать всё
  await p.click('[data-shape="d20"]');
  check("d20: 20 граней, картинка переехала на ближайшую, сказано", (await rows()) === 20 && (await draft()).layers.filter((l) => l.sprite).length === 1 && /граней — 20; картинок переехало — 1/.test(await said()), await said());
  await p.click("[data-lall]");
  await p.click("[data-lpick]");
  await pick("b:king:head:front");
  await p.waitForFunction(() => document.querySelector("[data-dstage]")?.dataset.planes === "20", null, { timeout: 15000 }).catch(() => {});
  check("выбрал все — картинка всем 20 граням, все на сцене", (await draft()).layers.every((l) => l.sprite === "b:king:head:front") && (await stage("data-planes")) === "20", await stage("data-planes"));
  if (shot) await p.locator("[data-dstage]").screenshot({ path: shot.replace(/\.png$/, "-d20.png") });
  await p.click('[data-shape="cube"]');
  await p.fill("[data-dring]", "16");
  await p.click('[data-shape="prism"]');
  check("куб → призма 16: 16 граней", (await rows()) === 16, await rows());
  await p.click("[data-lall]");
  await p.click("[data-ldelsel]");
  check("выбрать все → убрать выбранные: пусто", (await rows()) === 0 && (await draft()).layers.length === 0, await rows());
  await p.click("[data-dundo]");
  check("«Отменить» — все 16 вернулись", (await rows()) === 16, await rows());
  await p.click('[data-shape="cube"]');
  const withPic = (await draft()).layers.filter((l) => l.sprite).length;
  await p.click("[data-ldelempty]");
  check("«убрать пустые» — остались только с картинкой", (await rows()) === withPic && withPic > 0, [withPic, await rows()]);
  const ids = await rowIds();
  await p.click(`[data-lx="${ids[0]}"]`);
  check("× на строке — убрана одна", (await rows()) === withPic - 1 && !(await rowIds()).includes(ids[0]), await rowIds());
  const one = (await rowIds())[0];
  await p.click(`[data-row="${one}"] .rtext`);
  await p.locator("[data-dstage]").click({ position: { x: 5, y: 5 } });
  await p.keyboard.press("Delete");
  check("Delete — убирает выбранную", !(await rowIds()).includes(one), await rowIds());
  await p.keyboard.press("Meta+z");
  check("⌘Z — вернулась", (await rowIds()).includes(one), await rowIds());

  // СЦЕНА: камера, тап — выбор, ручки двигают
  await p.click('[data-shape="plane"]');
  await p.click("[data-lblank]");
  const [plane, blank] = await rowIds();
  await p.fill('[data-lnum="x"]', "1.4");
  await p.click(`[data-row="${plane}"] .rtext`);
  const y0 = await stage("data-yaw");
  await drag("[data-dstage]", (b) => ({ x: b.x + 30, y: b.y + 30 }), 80, 0);
  check("тянешь по пустому — крутится камера, в адресе", (await stage("data-yaw")) !== y0 && (await hash()).get("dry") !== null, [y0, await stage("data-yaw")]);
  await p.evaluate(() => window.__dstage.setView({ yaw: 0, pitch: 0 }));
  await frame();
  await p.locator("[data-dstage]").scrollIntoViewIfNeeded();
  const at = await screenOf(blank);
  await p.mouse.click(at.x, at.y);
  await frame();
  check("тап по картинке на сцене — она выбрана, ручки на ней", (await stage("data-grip")) === blank && (await p.locator(`[data-row="${blank}"].on`).count()) === 1, await stage("data-grip"));
  const x0 = (await draft()).layers.find((l) => l.id === blank).x;
  // За красную стрелку X (в лоб середина — это ручка Z, к камере).
  await drag("[data-dstage]", async () => { const c = await screenOf(blank); return { x: c.x + 38, y: c.y }; }, 60, 0);
  const x1 = (await draft()).layers.find((l) => l.id === blank).x;
  check("ручки: потянул стрелку X — картинка поехала, числа и адрес за ней", x1 > x0 + 0.2 && (await p.inputValue('[data-lnum="x"]')) === String(x1), [x0, x1]);
  await p.click('[data-grip-mode="rotate"]');
  check("ручки «крутить» — в адресе", (await hash()).get("dg") === "rotate", null);
  await p.click('[data-grip-mode="translate"]');

  // РАСЦВЕТКА — в адресе
  await p.click('[data-dpal="5"]');
  check("расцветка — в адресе", (await hash()).get("dp") === "5", null);

  // У СТОЛА
  const tst = p.locator("[data-tstage]");
  await tst.scrollIntoViewIfNeeded();
  const at0 = await tst.getAttribute("data-at");
  check("у стола: деталь на месте игрока, стороны света, клетки нет", at0 === "0,7.4,5.5" && (await tst.getAttribute("data-compass")) === "1" && !(await tst.getAttribute("data-grid")), at0);
  await drag("[data-tstage]", null, 80, 0);
  check("тянешь — камера вокруг стола, деталь на месте", (await hash()).get("tcy") !== null && (await tst.getAttribute("data-at")) === at0, [(await hash()).get("tcy"), await tst.getAttribute("data-at")]);
  await drag("[data-tstage]", null, 60, -40, "Control");
  const at1 = await tst.getAttribute("data-at");
  check("Ctrl + тянуть — деталь сдвинулась (вверх по экрану — выше)", at1 !== at0 && Number(at1.split(",")[2]) > 5.5, at1);
  await drag("[data-tstage]", null, 50, 0, "Shift");
  check("Shift + тянуть — повернулась, стоит там же", Number((await hash()).get("tyw")) !== 0 && (await tst.getAttribute("data-at")) === at1, [(await hash()).get("tyw"), await tst.getAttribute("data-at")]);
  await drag("[data-tstage]", null, 0, -260);
  check("тянешь вверх — камера под столом", (await tst.getAttribute("data-under")) === "1", await tst.getAttribute("data-under"));
  await p.click('[data-tlayer="grid"]');
  check("клетка — включена, в адресе", (await tst.getAttribute("data-grid")) === "1" && (await hash()).get("tlg") === "1", null);
  await p.fill('[data-tnum="h"]', "8");
  await frame();
  check("числом — точно: вверх 8", (await tst.getAttribute("data-at")).endsWith(",8"), await tst.getAttribute("data-at"));

  // ДВИЖОК CSS3D: та же сцена — наши <img>, треугольник вырезан
  await p.click('[data-shape="d20"]');
  await p.click("[data-lall]");
  await p.click("[data-lpick]");
  await pick(sprite.id);
  await p.click('[data-engine="css"]');
  await p.waitForFunction(() => document.querySelector("[data-dstage]")?.dataset.engine === "css" && document.querySelector("[data-dstage]")?.dataset.planes === "20", null, { timeout: 10000 }).catch(() => {});
  const faces = await p.locator("[data-dstage] .d3-face[data-layer]").evaluateAll((els) => els.map((e) => [getComputedStyle(e).clipPath, !!e.querySelector("img")]));
  check("CSS3D: 20 граней — <img>, вырезаны треугольником; в адресе", faces.length === 20 && faces.every(([c, img]) => c.startsWith("polygon(") && img) && (await hash()).get("de") === "css", faces.slice(0, 2));
  check("CSS3D у стола: стороны света — наши подписи", (await p.locator('[data-tstage] [data-tcard="n"]').innerText()) === "С" && (await p.locator('[data-tstage] [data-tcard="s"]').innerText()) === "Ю", null);
  if (shot) await p.locator("[data-dstage]").screenshot({ path: shot.replace(/\.png$/, "-css.png") });

  // НЕСОХРАНЁННОЕ ПЕРЕЖИВАЕТ ОБНОВЛЕНИЕ, СОХРАНИТЬ
  await p.reload();
  await p.waitForSelector("[data-detail-page] [data-dname]");
  check("обновил — та же деталь, несохранённое на месте, движок CSS3D, у стола — там же", (await p.inputValue("[data-dname]")) === `${tag} Лис` && (await rows()) === 20 && !(await p.locator("[data-dsave]").isDisabled()) && (await stage("data-engine")) === "css" && (await p.getAttribute("[data-tstage]", "data-at"))?.endsWith(",8"), [await p.inputValue("[data-dname]"), await rows()]);
  await p.click("[data-dsave]");
  await p.waitForFunction(() => /Сохранено/.test(document.querySelector("[data-dact]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  const got = (await mine()).find((x) => x.id === made?.id);
  check("сохранено: имя, 20 треугольных граней с картинкой, место и повороты", got?.name === `${tag} Лис` && got.layers.length === 20 && got.layers.every((l) => l.shape === "tri" && l.sprite === sprite.id && typeof l.rx === "number") && got.layers.some((l) => Math.abs(l.ry) > 1), got?.layers.slice(0, 2));
  await p.click('[data-engine="webgl"]');

  // ЗАКАЗ У AGY: нарисованное встаёт в пустые места, что смотрят в ту же сторону
  await p.click("[data-lall]");
  await p.click("[data-ldelsel]");
  await p.click('[data-shape="cube"]');
  await p.click("[data-dsave]");
  await p.waitForFunction(() => /Сохранено/.test(document.querySelector("[data-dact]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  await p.click("[data-dagy]");
  await p.waitForSelector("[data-agy] [data-for-detail]");
  await p.click('[data-agy] [data-sides="2"]');
  await p.fill('[data-a="brief"]', "лис в очках");
  await p.fill('[data-a="id"]', AGY);
  await p.click("[data-go]");
  const card = p.locator(".job", { hasText: AGY }).first();
  await card.waitFor();
  await card.locator(".badge.good").waitFor({ timeout: 25_000 });
  await card.locator("[data-accept]").click();
  await p.waitForSelector("[data-detail-page]", { timeout: 8000 }).catch(() => {});
  const filled = (await mine()).find((x) => x.id === made?.id);
  const lib = (await (await fetch(`${base}/table/admin/lib`, { headers: H })).json()).sprites;
  check("принято: куб из 6 мест — нарисованное agy в них, открыта деталь", filled?.layers.length === 6 && filled.layers.filter((l) => l.sprite && lib.find((x) => x.id === l.sprite)?.origin === "agy").length >= 2 && (await hash()).get("detail") === made.id, filled?.layers.map((l) => [l.sprite, l.x, l.z]));

  // ВСТРОЕННАЯ БОЧКА: 18 ракурсов, «лицом к камере»; первая правка — своя копия
  await p.click("[data-dback]");
  await p.waitForSelector(".dt [data-detail]");
  await p.locator('.dt [data-detail="b:barrel:body"]').click();
  await p.waitForSelector("[data-detail-page] [data-dname]");
  await p.waitForFunction(() => document.querySelector("[data-dstage]")?.dataset.planes === "1", null, { timeout: 10000 }).catch(() => {});
  check("бочка: 18 картинок по кругу, к тебе — одна, лицом к камере", (await rows()) === 18 && (await stage("data-planes")) === "1", [await rows(), await stage("data-planes")]);
  const beforeFork = new Set((await mine()).map((x) => x.id));
  await p.click("[data-lall]");
  await p.click('[data-lstand="plane"]');
  await p.waitForFunction(() => /сделана твоя копия/.test(document.querySelector("[data-dact]")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  const fork = (await mine()).find((x) => !beforeFork.has(x.id));
  check("правка встроенной — своя копия («… 2»), с правкой, открыта она", fork?.name === "Бочонок · тело 2" && fork.layers.length === 18 && fork.layers.every((l) => l.stand === "plane") && (await hash()).get("detail") === fork.id, fork && { name: fork.name, n: fork.layers.length });
  await p.fill("[data-dname]", "король треф · ГОЛОВА");
  await p.click("[data-dsave]", { timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(300);
  check("имя другой детали — не сохранить, и сказано почему", /уже у другой детали/.test(await said()) && (await mine()).find((x) => x.id === fork?.id)?.name === "Бочонок · тело 2", await said());
  check("и сервер не пустит двойника", (await fetch(`${base}/table/admin/details`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ name: "Бочонок · тело 2" }) })).status === 409, null);
  await p.click("[data-ddrop]");
  await p.waitForSelector(".dt [data-dgrid]");
  check("удалить — нет на сервере, назад к галерее", !(await mine()).some((x) => x.id === fork?.id) && (await p.locator("[data-dlist]").isVisible()), null);
  check("на телефоне без сдвига вбок", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
  check("без ключа детали закрыты", (await fetch(`${base}/table/admin/details`)).status === 403, null);
  check("без ошибок на странице", errors.length === 0, errors);
} finally {
  await browser.close();
  for (const x of await mine()) if (!before.has(x.id)) await fetch(`${base}/table/admin/details/${x.id}`, { method: "DELETE", headers: H });
  await rm(join(ROOT, "design/persona/skins", AGY), { recursive: true, force: true });
  for (const x of (await (await fetch(`${base}/table/admin/lib`, { headers: H })).json()).sprites) if (x.name.startsWith(tag) || x.tags.includes(`${tag} Лис`)) await fetch(`${base}/table/admin/lib/${x.id}`, { method: "DELETE", headers: H });
  for (const j of (await (await fetch(`${base}/table/admin/sprites`, { headers: H })).json()).jobs ?? []) if (j.id === AGY) await fetch(`${base}/table/admin/sprites/${j.job}`, { method: "DELETE", headers: H });
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${String(JSON.stringify(c.got)).slice(0, 400)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
