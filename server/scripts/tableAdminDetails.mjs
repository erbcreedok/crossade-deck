// СТРАНИЦА ХОЗЯИНА — «Детали»: галерея деталей (свои и встроенные, поиск по имени и тегам) → страница детали. Деталь —
// список картинок (слоёв): у каждой угол, место, величина, отражение, «когда» (всегда / по углу) и «как стоит» (в своей
// плоскости / лицом / бумажная), порядок — кто ниже, тот поверх. Заготовки показа (коробка, всегда лицом, бумажный,
// плоскость) и углов (6 сторон, по кругу), круг углов (перетащить точку — новый угол), сцена у стола (тянешь — стол,
// Ctrl — двигать, Shift — крутить; С и Ю, дно). Встроенная — первая правка делает свою копию. Всё — в адресе.
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

// картинки в библиотеке: голова-лицо (SVG, красится) и ещё одна — веки поверх лица
const svg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="${fill}"/></svg>`;
const upload = async (name, fill) => (await (await fetch(`${base}/table/admin/lib?name=${name}&slot=head&side=front`, { method: "POST", headers: { ...H, "content-type": "image/svg+xml" }, body: svg(fill) })).json());
const sprite = await upload(`${tag}-лицо`, "#b3221f");
const lids = await upload(`${tag}-веки`, "#1d4f80");
const before = new Set((await mine()).map((d) => d.id));

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
// Адрес — со страницы: Playwright узнаёт о смене якоря (replaceState) с запозданием.
const hash = async () => new URLSearchParams(await p.evaluate(() => location.hash.slice(1)));
const stage = (a) => p.getAttribute("[data-dstage]", a);
const rowIds = () => p.locator("[data-row]").evaluateAll((els) => els.map((e) => e.dataset.row));
const pick = async (ref, anySide = false) => {
  await p.waitForSelector("[data-picker] [data-pref]");
  if (anySide) await p.click("[data-picker] [data-pside]");
  await p.click(`[data-picker] [data-pref="${ref}"]`);
};
const rowAt = (text) => p.locator("[data-row]", { has: p.locator(".rsub", { hasText: new RegExp(`^${text} ·`) }) }).first();
const selectAt = async (text) => rowAt(text).click();
try {
  await p.goto(`${base}/table/admin#key=${encodeURIComponent(secret)}`);
  await p.click('[data-tab="details"]');
  await p.waitForSelector(".dt [data-detail]");
  const names = await p.locator(".dt [data-detail] b").allTextContents();
  check("галерея: встроенные на месте, голова и тело карты различимы, двойников нет", names.includes("Король треф · голова") && names.includes("Король треф · тело") && new Set(names).size === names.length, names.filter((n, i) => names.indexOf(n) !== i));
  await p.fill(".dt [data-dq]", "ноги");
  const legs = await p.locator(".dt [data-detail] i:first-of-type").allTextContents();
  check("поиск по тегу «ноги» — только они", legs.length > 0 && legs.every((t) => t.startsWith("ноги")), legs);
  await p.fill(".dt [data-dq]", "");

  // НОВАЯ: пустая; «+ Картинка» — с угла, откуда смотришь; выбор — картинки этого угла, любые
  await p.click(".dt [data-new]");
  await p.waitForSelector("[data-detail-page] [data-dname]");
  const made = (await mine()).find((d) => !before.has(d.id));
  check("«+ Новая деталь» — на сервере: пустой список картинок, ширина 2.4", made && made.layers.length === 0 && made.width === 2.4 && (await hash()).get("detail") === made.id, made);
  await p.fill("[data-dname]", `${tag} Лис`);
  await p.click("[data-ladd]");
  await p.waitForSelector("[data-picker] [data-pref]");
  const offered = await p.locator("[data-picker] [data-pref] i").allTextContents();
  check("выбор картинки: этого угла (лицо), любые — и головы, и тела", offered.length > 0 && offered.every((t) => /(лицо|0°)$/.test(t)) && (await p.locator('[data-picker] [data-pref="b:king:body:front"]').count()) === 1, offered.slice(0, 4));
  await p.click(`[data-picker] [data-pref="${sprite.id}"]`);
  await p.waitForFunction(() => document.querySelector("[data-dstage] [data-layer] img")?.naturalWidth > 0, null, { timeout: 5000 }).catch(() => {});
  const front = (await rowIds())[0];
  check("картинка встала: строка в списке, на сцене, точка на круге", (await p.locator("[data-row]").count()) === 1 && (await stage("data-planes")) === "1" && (await p.locator(`[data-rdot="${front}"]`).count()) === 1, await stage("data-planes"));
  const plane = () => p.locator(`[data-dstage] [data-layer="${front}"]`);
  const box0 = await plane().boundingBox();
  await p.fill('[data-lnum="dx"]', "1");
  await p.fill('[data-lnum="scale"]', "2");
  const box1 = await plane().boundingBox();
  check("вправо и величина двигают картинку на сцене", box1.width > box0.width * 1.8 && box1.x + box1.width / 2 > box0.x + box0.width / 2 + 5, [box0, box1]);

  // ЗАГОТОВКА УГЛОВ «6 сторон»: к лицу — пять пустых мест
  await p.click('[data-angles="sides"]');
  check("«6 сторон» — шесть строк: лицо с картинкой и пять мест под картинку", (await p.locator("[data-row]").count()) === 6 && (await p.locator("[data-row] .none").count()) === 5, await p.locator("[data-row]").count());
  await selectAt("бок");
  check("выбрал строку бока — деталь повернулась к тебе боком", (await stage("data-toward")) === "90", await stage("data-toward"));
  await p.click("[data-lpick]");
  await pick(sprite.id, true);
  const right = await p.locator("[data-row].on").getAttribute("data-row");
  await selectAt("левый бок");
  await p.click("[data-lpick]");
  await pick(sprite.id, true);
  await p.check("[data-lflip]");
  const left = await p.locator("[data-row].on").getAttribute("data-row");
  check("левый бок — та же картинка, отражённая", /отражена/.test(await p.locator("[data-row].on .rsub").innerText()), await p.locator("[data-row].on .rsub").innerText());

  // ЗАГОТОВКИ ПОКАЗА
  await p.click('[data-preset="box"]');
  const faceOf = (id) => p.getAttribute(`[data-dstage] [data-layer="${id}"]`, "style");
  check("«коробка» — три картинки в объёме, каждая к своей стороне, на полширины", (await stage("data-planes")) === "3" && /rotateY\(-90deg\)/.test(await faceOf(right)) && /rotateY\(90deg\)/.test(await faceOf(left)) && (await p.getAttribute(`[data-dstage] [data-layer="${right}"]`, "data-out")) === "1.2", [await stage("data-planes"), await faceOf(right)]);
  check("отражение — у картинки внутри (плоскость не пропадает со спины)", (await p.getAttribute(`[data-dstage] [data-layer="${left}"]`, "data-flip")) === "1" && /scaleX\(-1\)/.test(await p.getAttribute(`[data-dstage] [data-layer="${left}"] img`, "style")), null);
  await p.click('[data-preset="camera"]');
  await p.click(`[data-row="${front}"]`);
  check("«всегда лицом» — к тебе одна картинка, с ближайшего угла", (await stage("data-planes")) === "1" && (await stage("data-shown")) === front, await stage("data-shown"));
  // СВОЁ: бок — «всегда»; веки — копия лица поверх на том же угле
  await p.click(`[data-row="${right}"]`);
  await p.click('[data-lshow="always"]');
  check("бок «всегда» — заготовка стала «своё»", (await p.locator("[data-preset-own].on").count()) === 1 && (await p.locator("[data-preset].on").count()) === 0, null);
  await p.click(`[data-row="${front}"]`);
  await p.click("[data-ldup]");
  await p.click("[data-lpick]");
  await pick(lids.id, true);
  const lidId = await p.locator("[data-row].on").getAttribute("data-row");
  await p.click(`[data-row="${front}"]`);
  const seenFront = (await stage("data-shown")).split(",");
  check("с лица видно: лицо и веки (на одном угле — вместе, веки ниже в списке — поверх) и бок «всегда»", seenFront.includes(front) && seenFront.includes(lidId) && seenFront.includes(right) && seenFront.indexOf(lidId) > seenFront.indexOf(front), seenFront);
  // ПОРЯДОК: веки — выше в списке (под лицом)
  await p.click(`[data-row="${lidId}"]`);
  await p.click("[data-lup]");
  const order1 = await rowIds();
  check("«выше в списке» — веки перед лицом в списке", order1.indexOf(lidId) < order1.indexOf(front), order1);
  // ПОРЯДОК перетаскиванием за ☰: веки — в самый низ
  const grip = p.locator(`[data-grip="${lidId}"]`);
  await grip.scrollIntoViewIfNeeded();
  const g = await grip.boundingBox(), lastRow = await p.locator("[data-row]").last().boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await p.mouse.down();
  await p.mouse.move(g.x + g.width / 2, lastRow.y + lastRow.height - 2, { steps: 8 });
  await p.mouse.up();
  const order2 = await rowIds();
  check("перетащил ☰ веки вниз — последние в списке (поверх всех)", order2.at(-1) === lidId, order2);
  // КРУГ УГЛОВ: перетащил точку бока — угол сменился
  const ring = p.locator("[data-ring]");
  await ring.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  const rb = await ring.boundingBox(), dotR = await p.locator(`[data-rdot="${right}"]`).boundingBox();
  await p.mouse.move(dotR.x + dotR.width / 2, dotR.y + dotR.height / 2);
  await p.mouse.down();
  // 45° от лица к правому боку: на круге — влево-вниз от середины
  await p.mouse.move(rb.x + rb.width / 2 - rb.width * 0.3, rb.y + rb.height / 2 + rb.height * 0.3, { steps: 8 });
  await p.mouse.up();
  check("точку на круге перетащил — угол картинки 45°", /^45° ·/.test(await p.locator(`[data-row="${right}"] .rsub`).innerText()), await p.locator(`[data-row="${right}"] .rsub`).innerText());

  // У СТОЛА: тянешь — стол; Ctrl — двигать деталь; Shift — крутить её; С и Ю, дно; всё в адресе
  const tst = p.locator("[data-tstage]");
  const tdrag = async (key, ddx, ddy) => {
    // Место стола — перед каждым движением: картинки выше догружаются и сдвигают страницу.
    await tst.scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    const tb = await tst.boundingBox();
    if (key) await p.keyboard.down(key);
    await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await p.mouse.down();
    await p.mouse.move(tb.x + tb.width / 2 + ddx, tb.y + tb.height / 2 + ddy, { steps: 6 });
    await p.mouse.up();
    if (key) await p.keyboard.up(key);
  };
  const persp = await p.evaluate(() => ["[data-dstage]", "[data-tstage]"].map((q) => parseFloat(getComputedStyle(document.querySelector(q)).perspective)));
  check("сцены в перспективе: камера близко (деталь ≤ 400, стол ≤ 300 точек)", persp[0] <= 400 && persp[1] <= 300, persp);
  const at0 = await tst.getAttribute("data-at");
  check("у стола: деталь на месте игрока, нарисована", at0 === "0,7.4,5.5" && Number(await tst.getAttribute("data-planes")) >= 1, [at0, await tst.getAttribute("data-planes")]);
  await tdrag(null, 80, 0);
  check("тянешь — крутится стол, деталь на месте", (await hash()).get("tcy") !== null && (await tst.getAttribute("data-at")) === at0, [(await hash()).get("tcy"), await tst.getAttribute("data-at")]);
  await tdrag("Control", 60, -40);
  const at1 = await tst.getAttribute("data-at");
  check("Ctrl + тянуть — деталь сдвинулась (вправо и вверх по экрану)", at1 !== at0 && Number(at1.split(",")[2]) > 5.5, at1);
  await tdrag("Shift", 50, 0);
  check("Shift + тянуть — деталь повернулась, стоит там же", Number((await hash()).get("tyw")) !== 0 && (await tst.getAttribute("data-at")) === at1, [(await hash()).get("tyw"), await tst.getAttribute("data-at")]);
  check("у стола: подписаны С и Ю, клетка выключена", (await p.locator('[data-tcard="n"]').innerText()) === "С" && (await p.locator('[data-tcard="s"]').innerText()) === "Ю" && (await p.locator("[data-tcells]").isHidden()), null);
  await p.click('[data-tlayer="grid"]');
  check("слой клетки — включён, в адресе", (await p.locator("[data-tcells]").isVisible()) && (await hash()).get("tlg") === "1", null);
  await tdrag(null, 0, -200);
  check("тянешь вверх — камера под столом", (await tst.getAttribute("data-under")) === "1", await tst.getAttribute("data-under"));
  await tdrag(null, 0, 200);
  await p.fill('[data-tnum="h"]', "8");
  check("числом — точно: вверх 8", (await tst.getAttribute("data-at")).endsWith(",8"), await tst.getAttribute("data-at"));

  // РАСЦВЕТКИ
  const frontImg = () => p.getAttribute(`[data-dstage] [data-layer="${front}"] img`, "src");
  await p.click(`[data-row="${front}"]`);
  const pic0 = await frontImg();
  await p.click('[data-dpal="5"]');
  check("расцветка перекрашивает деталь, и в адресе", (await frontImg()) !== pic0 && (await hash()).get("dp") === "5", null);
  await p.fill('[data-dc="0"]', "#ff00aa");
  await p.waitForFunction((id) => decodeURIComponent(document.querySelector(`[data-dstage] [data-layer="${id}"] img`)?.getAttribute("src") ?? "").includes("#ff00aa"), front, { timeout: 3000 }).catch(() => {});
  check("свои три цвета — на сцене", decodeURIComponent(await frontImg()).includes("#ff00aa"), null);
  await p.click("[data-dcoff]");

  // НЕСОХРАНЁННОЕ ПЕРЕЖИВАЕТ ОБНОВЛЕНИЕ
  await p.reload();
  await p.waitForSelector("[data-detail-page] [data-dname]");
  check("обновил — та же деталь, та же выбранная картинка, несохранённое на месте, у стола — там же", (await p.inputValue("[data-dname]")) === `${tag} Лис` && (await p.locator("[data-row]").count()) === 7 && (await p.locator(`[data-row="${front}"].on`).count()) === 1 && !(await p.locator("[data-dsave]").isDisabled()) && (await p.getAttribute("[data-tstage]", "data-at"))?.endsWith(",8"), [await p.inputValue("[data-dname]"), await p.locator("[data-row]").count()]);
  await p.click("[data-dsave]");
  await p.waitForFunction(() => /Сохранено/.test(document.querySelector("[data-dact]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  const got = (await mine()).find((d) => d.id === made?.id);
  const L = (id) => got?.layers.find((l) => l.id === id);
  check("сохранено: имя, порядок, углы, место, «когда» и «как стоит», отражение", got?.name === `${tag} Лис` && got.layers.at(-1)?.id === lidId && L(front)?.dx === 1 && L(front)?.scale === 2 && L(right)?.yaw === 45 && L(right)?.show === "always" && L(front)?.stand === "camera" && L(left)?.flip === true && got.layers.length === 7, got?.layers.map((l) => [l.id, l.yaw, l.show, l.stand, !!l.sprite]));
  if (shot) await p.screenshot({ path: shot, fullPage: true });

  // PNG не красится — сказано
  await selectAt("верх");
  await p.click("[data-lpick]");
  await pick("b:hand:hands:front", true);
  check("PNG в детали — «не красится», сказано какой угол", /Не красятся \(PNG\): верх/.test(await p.textContent("[data-dpaint]")), await p.textContent("[data-dpaint]"));
  await p.click("[data-ldel]");
  await p.click("[data-dsave]");
  await p.waitForFunction(() => /Сохранено/.test(document.querySelector("[data-dact]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});

  // ЗАКАЗ У AGY: нарисованная спина встаёт в пустое место на своём угле, заданное не трогается
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
  const filled = (await mine()).find((d) => d.id === made?.id);
  const lib = (await (await fetch(`${base}/table/admin/lib`, { headers: H })).json()).sprites;
  const back = filled?.layers.find((l) => l.yaw === 180 && l.pitch === 0);
  check("принято: спина agy — в пустое место на 180°, лицо не тронуто, открыта деталь", lib.find((x) => x.id === back?.sprite)?.origin === "agy" && filled.layers.find((l) => l.id === front)?.sprite === sprite.id && (await hash()).get("detail") === made.id && (await hash()).get("tab") === "details", filled?.layers.map((l) => [l.yaw, l.sprite]));

  // ВСТРОЕННАЯ БОЧКА: 18 по кругу, «всегда лицом»; первая правка — своя копия
  await p.click("[data-dback]");
  await p.waitForSelector(".dt [data-detail]");
  await p.locator('.dt [data-detail="b:barrel:body"]').click();
  await p.waitForSelector("[data-detail-page] [data-dname]");
  check("бочка: 18 картинок по кругу, заготовка «всегда лицом»", (await p.locator("[data-row]").count()) === 18 && (await p.locator('[data-preset="camera"].on').count()) === 1, await p.locator("[data-row]").count());
  await selectAt("100°");
  await p.waitForFunction(() => document.querySelector("[data-dstage]")?.dataset.planes === "1", null, { timeout: 10_000 }).catch(() => {});
  check("выбрал 100° — к тебе одна картинка, 100°", /^100° ·/.test(await p.locator("[data-row].on .rsub").innerText()) && (await stage("data-planes")) === "1", await stage("data-planes"));
  const beforeFork = new Set((await mine()).map((d) => d.id));
  await p.click('[data-preset="box"]');
  await p.waitForFunction(() => /сделана твоя копия/.test(document.querySelector("[data-dact]")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  const fork = (await mine()).find((d) => !beforeFork.has(d.id));
  check("правка встроенной — своя копия («… 2»), с правкой, открыта она, и сказано", fork?.name === "Бочонок · тело 2" && fork.layers.length === 18 && fork.layers.every((l) => l.show === "always" && l.stand === "plane") && (await hash()).get("detail") === fork.id && (await p.locator("[data-dsave]").count()) === 1, fork && { name: fork.name, n: fork.layers.length });
  await p.waitForFunction(() => document.querySelector("[data-dstage]")?.dataset.planes === "18", null, { timeout: 15_000 }).catch(() => {});
  check("и копия — коробкой: все 18 в объёме", (await stage("data-planes")) === "18", await stage("data-planes"));
  // ИМЯ ЗАНЯТО
  await p.fill("[data-dname]", "король треф · ГОЛОВА");
  await p.click("[data-dsave]", { timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(300);
  check("имя другой детали — не сохранить, и сказано почему", /уже у другой детали/.test(await p.textContent("[data-dact]")) && (await mine()).find((d) => d.id === fork?.id)?.name === "Бочонок · тело 2", await p.textContent("[data-dact]"));
  check("и сервер не пустит двойника", (await fetch(`${base}/table/admin/details`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ name: "Бочонок · тело 2" }) })).status === 409, null);
  // УДАЛИТЬ
  await p.click("[data-ddrop]");
  await p.waitForSelector(".dt [data-dgrid]");
  check("удалить — нет на сервере, назад к галерее", !(await mine()).some((d) => d.id === fork?.id) && (await p.locator("[data-dlist]").isVisible()), null);
  check("на телефоне без сдвига вбок", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
  check("без ключа детали закрыты", (await fetch(`${base}/table/admin/details`)).status === 403, null);
  check("без ошибок на странице", errors.length === 0, errors);
} finally {
  await browser.close();
  for (const d of await mine()) if (!before.has(d.id)) await fetch(`${base}/table/admin/details/${d.id}`, { method: "DELETE", headers: H });
  // заказ agy: рисунки с диска, картинки — через стол, сам заказ — тоже
  await rm(join(ROOT, "design/persona/skins", AGY), { recursive: true, force: true });
  for (const x of (await (await fetch(`${base}/table/admin/lib`, { headers: H })).json()).sprites) if (x.name.startsWith(tag) || x.tags.includes(`${tag} Лис`)) await fetch(`${base}/table/admin/lib/${x.id}`, { method: "DELETE", headers: H });
  for (const j of (await (await fetch(`${base}/table/admin/sprites`, { headers: H })).json()).jobs ?? []) if (j.id === AGY) await fetch(`${base}/table/admin/sprites/${j.job}`, { method: "DELETE", headers: H });
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${String(JSON.stringify(c.got)).slice(0, 400)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
