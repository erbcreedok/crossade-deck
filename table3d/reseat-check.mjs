// ПЕРЕСАДКА СВОЕГО СТУЛА: кнопка открывает вид сверху со свободным зумом, без тел, рук, голов и карт в руках — только стол, стулья и карты на столе;
// свой стул тянут по кругу, «Готово» пересаживает, «Отмена» возвращает всё как было.
//   node reseat-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`${base}/?stand&cam=head`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1000);
const info = () => p.evaluate(() => window.__t3d.reseatInfo());
const mine = () => p.evaluate(() => { const c = window.__t3d.state().chairs.find((x) => x.owner === window.__t3d.me()); return { id: c.id, angle: c.angle }; });
const before = await info(), seat0 = await mine();
check("до пересадки: головы и карты в руке на месте", !before.on && before.heads && before.handShown > 0, before);
await p.locator("[data-reseat]:visible").first().click();
await p.waitForTimeout(800);
const on = await info();
check("пересадка: вид сверху, голов нет, карты в руках скрыты, стулья видны", on.on && !on.heads && on.chairs && on.handShown === 0, on);
check("свой стул светится, и только он", on.glow.length === 1 && on.glow[0] === seat0.id, on.glow);
const owners = await p.evaluate(() => window.__t3d.state().chairs.filter((c) => c.owner).map((c) => c.id));
check("над каждым занятым стулом кругляшок аватара", on.tags.length === owners.length && owners.every((id) => on.tags.includes(id)), { tags: on.tags, owners });
const ink = (await p.evaluate(() => window.__t3d.state().people.find((x) => x.key === window.__t3d.me()).ink)).replace("#", "").toLowerCase();
check("цвет моего стула тот же, что в игре, без подкраски; свечение — моего цвета", on.chair && on.chair.color === ink && on.chair.emissive === "000000" && on.chair.halo === ink, { on: on.chair, ink });
const fitOf = () => p.evaluate(() => { const w = innerWidth, h = innerHeight; return window.__t3d.chairs().map((c) => ({ id: c.id, in: c.x > 12 && c.x < w - 12 && c.y > 60 && c.y < h - 80, x: Math.round(c.x), y: Math.round(c.y) })); });
const fit = await fitOf();
check("при входе стол и все стулья влезают в кадр (портрет)", fit.length > 1 && fit.every((c) => c.in), fit);
check("камера смотрит сверху (орбита)", (await p.evaluate(() => window.__t3d.cam().mode)) === "orbit", null);
// Тянем свой стул: его экранное место — из хука `chairs()`.
const chair = await p.evaluate((id) => window.__t3d.chairs().find((c) => c.id === id), seat0.id);
const chair0 = await p.evaluate((id) => { const a = window.__t3d.chairAt(id); return { x: a[0], z: a[2] }; }, seat0.id);
await p.mouse.move(chair.x, chair.y); await p.mouse.down();
await p.mouse.move(chair.x + 120, chair.y - 60, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(400);
const ghost = await p.evaluate(() => window.__t3d.reseatInfo().ghost);
check("пока тянут стул, старое место остаётся пунктиром (след на прежнем месте)", ghost !== null && Math.hypot(ghost.x - chair0.x, ghost.z - chair0.z) < 0.3, { ghost, chair0 });
const chairPos = await p.evaluate((id) => window.__t3d.chairAt(id), seat0.id);
const angle = ((Math.atan2(chairPos[0], chairPos[2]) * 180) / Math.PI + 360) % 360;
check("свой стул уехал по кругу на другой угол", Math.abs(((angle - seat0.angle + 540) % 360) - 180) > 8, { angle, was: seat0.angle });
await p.locator("[data-reseat-no]:visible").click();
await p.waitForTimeout(600);
const off = await info();
check("«Отмена»: всё вернулось, свечения и кругляшков нет, стул на прежнем месте", !off.on && off.heads && off.glow.length === 0 && off.tags.length === 0 && (await mine()).angle === seat0.angle, { off, now: await mine() });
await p.locator("[data-reseat]:visible").first().click();
await p.waitForTimeout(600);
const c2 = await p.evaluate((id) => window.__t3d.chairs().find((c) => c.id === id), seat0.id);
await p.mouse.move(c2.x, c2.y); await p.mouse.down(); await p.mouse.move(c2.x + 120, c2.y - 60, { steps: 8 }); await p.mouse.up();
await p.waitForTimeout(300);
await p.locator("[data-reseat-ok]:visible").click();
await p.waitForTimeout(800);
const seat1 = await mine();
check("«Готово»: стул пересажен на новый угол", seat1.angle !== seat0.angle, { seat0, seat1 });
// СВОЙ СТУЛ — НА ШЕСТИ ЧАСАХ при входе, с какого бы угла я ни сидел (после пересадки снова входим).
await p.locator("[data-reseat]:visible").first().click();
await p.waitForTimeout(900);
const me1 = await p.evaluate((id) => window.__t3d.chairs().find((c) => c.id === id), seat0.id);
check("при входе мой стул внизу кадра по центру (шесть часов), даже сидя не на нулевом угле", Math.abs(me1.x - 195) < 25 && me1.y > 520, { me1, angle: seat1.angle });
// ТО ЖЕ ПАЛЬЦЕМ (касание): тянем стул и подтверждаем — угол меняется.
await p.close();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const t = await ctx.newPage();
await t.goto(`${base}/?stand&cam=head`);
await t.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await t.waitForTimeout(1000);
const cdp = await ctx.newCDPSession(t);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const angleOf = () => t.evaluate(() => window.__t3d.state().chairs.find((x) => x.owner === window.__t3d.me()).angle);
const a0 = await angleOf();
await t.locator("[data-reseat]:visible").first().tap();
await t.waitForTimeout(900);
const ch = await t.evaluate(() => { const c = window.__t3d.state().chairs.find((x) => x.owner === window.__t3d.me()); return window.__t3d.chairs().find((k) => k.id === c.id); });
await touch("touchStart", [[ch.x, ch.y]]);
for (let i = 1; i <= 12; i++) await touch("touchMove", [[ch.x + i * 12, ch.y - i * 6]]);
await touch("touchEnd", []);
await t.waitForTimeout(300);
await t.locator("[data-reseat-ok]:visible").tap();
await t.waitForTimeout(800);
const a1 = await angleOf();
check("пальцем: тянем стул и «Готово» — стул пересажен", a1 !== a0, { a0, a1 });
await ctx.close();
// ВЗГЛЯД ПРИ ПЕРЕСАДКЕ: стул встал на другой угол — смотришь туда же относительно стола (в центр, хоть и повернул голову вбок), а не «теряешься в пространстве».
{
  const c = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await c.goto(`${base}/?stand&cam=head`);
  await c.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await c.waitForTimeout(1000);
  await c.mouse.move(300, 300); await c.mouse.down(); await c.mouse.move(180, 300, { steps: 6 }); await c.mouse.up();
  await c.waitForTimeout(300);
  // Угол между взглядом и направлением в центр стола, градусы (со знаком).
  const off = () => c.evaluate(() => { const k = window.__t3d.cam(), y = ((k.yaw + k.side * 40) * Math.PI) / 180, g = [Math.sin(y), -Math.cos(y)], inw = [-k.pos[0], -k.pos[2]], a = Math.atan2(g[0], -g[1]) - Math.atan2(inw[0], -inw[1]); return { off: ((a * 180) / Math.PI + 540) % 360 - 180, r: Math.hypot(k.pos[0], k.pos[2]) }; });
  const before = await off();
  await c.evaluate(() => window.__t3d.reseatNow(110));
  await c.waitForTimeout(500);
  const after = await off();
  check("пересадка в голове: взгляд относительно центра стола тот же (стол провернулся, а не ты потерялся)", Math.abs(after.off - before.off) < 3 && Math.abs(after.r - before.r) < 0.3, { before, after });
  await c.close();
}
// СТУЛЬЯ НЕ НАПЛЫВАЮТ: тянешь свой стул на чужой — он останавливается у края, на чужое место не встаёт.
{
  const c = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await c.goto(`${base}/?stand&cam=head`);
  await c.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await c.waitForTimeout(1000);
  await c.locator("[data-reseat]:visible").first().click();
  await c.waitForTimeout(900);
  const info = await c.evaluate(() => { const s = window.__t3d.state(); const me = s.chairs.find((x) => x.owner === window.__t3d.me()); const other = s.chairs.find((x) => x.id !== me.id && !x.croupier && x.owner); const sc = window.__t3d.chairs(); return { me: sc.find((k) => k.id === me.id), other: sc.find((k) => k.id === other.id), otherId: other.id, meId: me.id }; });
  await c.mouse.move(info.me.x, info.me.y); await c.mouse.down();
  await c.mouse.move(info.other.x, info.other.y, { steps: 40 });
  const gap = await c.evaluate(([a, b]) => { const p = window.__t3d.chairAt(a), q = window.__t3d.chairAt(b); return Math.hypot(p[0] - q[0], p[2] - q[2]); }, [info.meId, info.otherId]);
  await c.mouse.up();
  check("свой стул, затянутый на чужой, не наплывает: между центрами не меньше ширины сиденья", gap >= 3.4, { gap });
  await c.close();
}
// УДЕРЖИВАЕМАЯ КАРТА И СТОПКА СМОТРЯТ НА МЕНЯ СРАЗУ, как только их подняли (а не поворачиваются при дропе): стол провернули — «лицом ко мне» = угол от моего стула.
{
  const c = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await c.goto(`${base}/?stand&cam=head`);
  await c.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await c.waitForTimeout(1000);
  await c.evaluate(() => window.__t3d.reseatNow(110));
  await c.waitForTimeout(600);
  const facing = await c.evaluate(() => { const ch = window.__t3d.state().chairs.find((x) => x.owner === window.__t3d.me()); return ((-ch.angle % 360) + 360) % 360; });
  await c.evaluate(() => window.__t3d.trimHand(6));
  await c.waitForTimeout(1200);
  // Карта на сукне лежит под другим углом (как её положили раньше).
  const felt = await c.evaluate(() => { const s = window.__t3d.state(); const f = s.felt.at(-1); return { id: f.id, at: window.__t3d.screenOf(f.id) }; });
  await c.mouse.move(felt.at.x, felt.at.y); await c.mouse.down(); await c.mouse.move(felt.at.x + 5, felt.at.y - 45, { steps: 5 });
  const held = await c.evaluate(() => window.__t3d.heldAngle());
  check("карту со стола подняли — она сразу лицом ко мне (угол от моего стула), не со своим старым углом", held !== null && Math.abs(((held - facing + 540) % 360) - 180) < 1, { held, facing });
  await c.mouse.up();
  await c.waitForTimeout(600);
  // Колода: взяли за язычок — угол стопки на столе стал «лицом ко мне» сразу (событием стола).
  const tab = await c.evaluate(() => window.__t3d.tabInfo("deck")?.screen ?? null);
  if (tab) {
    await c.mouse.move(tab.x, tab.y); await c.mouse.down(); await c.mouse.move(tab.x + 12, tab.y - 55, { steps: 6 });
    await c.waitForTimeout(400);
    const ang = await c.evaluate(() => window.__t3d.state().piles.find((q) => q.id === "deck").angle);
    check("колоду взяли — её угол на столе сразу «лицом ко мне», у всех на экранах", Math.abs(((ang - facing + 540) % 360) - 180) < 1, { ang, facing });
    await c.mouse.up();
  }
  await c.close();
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
