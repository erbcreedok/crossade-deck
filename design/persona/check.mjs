// СТЕНД ПЕРСОНАЖЕЙ — кукла держит свой размер в МИРЕ, а не на экране: отъехал камерой — туловище, голова
// и рука мельчают ровно во столько же раз, во сколько мельчает стол.
//   python3 design/serve.py 9584 design/persona   (или `persona-stand` в .claude/launch.json)
//   node design/persona/check.mjs [base] [shots-dir]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/package.json", import.meta.url));
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:9584/";
const shots = process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
page.on("pageerror", (e) => console.log("ERROR", e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const at = async (hash) => {
  await page.goto(`${base}#${hash}`);
  await page.waitForFunction(() => window.__persona?.ready);
  await page.waitForTimeout(250);
  return page.evaluate(() => window.__persona.boxes);
};
const width = (b) => b[2] - b[0];
const height = (b) => b[3] - b[1];

// Анимации стоят (скорость 0) — меряется одна и та же поза.
const near = await at("speed=0&zoom=1");
const far = await at("speed=0&zoom=0.5");
const table = width(far.table) / width(near.table);
check("зум 1 → 0.5: стол правда стал меньше", table < 0.75, { table });
for (const [part, of] of [["туловище короля", "torso2"], ["голова дамы", "head3"], ["голова-шар", "head1"], ["левая рука", "left2"]]) {
  const r = height(far[of]) / height(near[of]);
  check(`зум 1 → 0.5: ${part} мельчает как стол (±12%)`, Math.abs(r / table - 1) < 0.12, { part: r.toFixed(3), table: table.toFixed(3) });
}
if (shots) {
  for (const [name, hash] of [
    ["table", "speed=0"],
    ["far", "speed=0&zoom=0.5"],
    ["vitrina", "speed=0&scene=витрина"],
    ["stand", "speed=0&stance=стоит"],
    ["low", "speed=0&pitch=75&zoom=1.3"],
  ]) {
    await at(hash);
    await page.locator("#phone").screenshot({ path: `${shots}/persona-${name}.png` });
  }
}
// Встал — туловище выше, а низ всё так же под кромкой: верх ушёл вверх, размер не вырос.
const sit = await at("speed=0&a_look=0");
const stand = await at("speed=0&a_look=0&stance=стоит");
check("встал — туловище выше на экране", stand.torso2[1] < sit.torso2[1] - 10, { sit: sit.torso2, stand: stand.torso2 });
check("встал — туловище того же размера", Math.abs(height(stand.torso2) / height(sit.torso2) - 1) < 0.08, { sit: height(sit.torso2), stand: height(stand.torso2) });

// СВЕРХУ ГОЛОВА НАД ТУЛОВИЩЕМ ПО ЕГО МЕСТУ: от туловища к голове — туда, где «от стола наружу» у этого
// места; поворот камеры, хоть вверх ногами, этого не меняет.
const centre = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
for (const yaw of [0, 90, 180]) {
  const top = await at(`speed=0&a_look=0&pitch=0&yaw=${yaw}`);
  for (const [who, i] of [["король", 2], ["дама", 3]]) {
    const h = centre(top[`head${i}`]), b = centre(top[`torso${i}`]), o = top[`out${i}`];
    const v = [h[0] - b[0], h[1] - b[1]];
    const cos = (v[0] * o[0] + v[1] * o[1]) / (Math.hypot(...v) * Math.hypot(...o) || 1);
    const apart = Math.hypot(...v) / Math.hypot(top[`head${i}`][3] - top[`head${i}`][1], 1);
    check(`сверху, поворот ${yaw}°: у ${who === "король" ? "короля" : "дамы"} голова над туловищем от стола наружу`, cos > 0.8 && apart > 0.5, { cos: cos.toFixed(2), apart: apart.toFixed(2) });
  }
}

// ДВА ИГРОКА: оба не трогали камеру — каждый видит другого сверху; тело рисуется у обоих экранов.
const duo = await at("speed=0&scene=два игрока&pitch=0");
check("два игрока: Боря видит голову Ани, Аня — голову Бори", !!duo.head1 && !!duo.head2, Object.keys(duo));
// ОБОШЁЛ СТОЛ: Боря повернул камеру на 180° — его глаз теперь со стороны Ани. У Ани на экране он встал и
// стоит внизу, у её края; сам он видит Аню со спины. В режиме «сидит» — остался на месте.
const D = "speed=0&scene=два игрока&pitch=0";
const went = await at(`${D}&yaw=180&pitch=40`);
check("обошёл стол: у Ани на экране Боря ушёл со стула", went.away2 === 1, went.away2);
check("…и стоит внизу её экрана, у её края", went.head2 && (went.head2[1] + went.head2[3]) / 2 > 422, went.head2);
check("…а сам видит Аню со спины", went.back1 === 1, { back1: went.back1 });
const home = await at(`${D}&pitch=40`);
check("не ходил — Аню видит в лицо", home.back1 === 0, { back1: home.back1 });
const mid = (b) => (b[1] + b[3]) / 2;
check("идёт голова: тело Бори осталось на его стуле, вверху экрана Ани", went.torso2 && mid(went.torso2) < 422, went.torso2);
const whole = await at(`${D}&yaw=180&pitch=40&walk=идёт всё тело`);
check("идёт всё тело: тело Бори тоже внизу, у Ани", whole.torso2 && mid(whole.torso2) > 422, whole.torso2);
const chair = await at(`${D}&duoB=chair`);
check("«голова и стул»: вместо тела нарисован стул", !!chair.torso2 && !!chair.head2, { torso: chair.torso2, head: chair.head2 });
const sat = await at(`${D}&yaw=180&pitch=40&walk=сидит, крутит головой`);
check("режим «сидит»: Боря остался на стуле", sat.away2 === 0 && (sat.head2[1] + sat.head2[3]) / 2 < 422, { away: sat.away2, head: sat.head2 });

if (shots) {
  for (const [name, hash] of [["duo-walk", `${D}&yaw=180&pitch=40`], ["duo-walk-side", `${D}&yaw=90&pitch=30&aPitch=35`], ["duo-chair", `${D}&yaw=120&pitch=35&aPitch=35&duoB=chair&duoA=queen&chairs=1`], ["duo-idle", "speed=0&scene=два игрока&pitch=0"], ["duo-tilt", "speed=0&scene=два игрока&pitch=58"], ["duo-king", "speed=0&scene=два игрока&pitch=0&duoA=king&duoB=queen"]]) {
    await at(hash);
    await page.screenshot({ path: `${shots}/persona-${name}.png`, clip: { x: 0, y: 0, width: 880, height: 880 } });
  }
}

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`persona ${checks.length - bad.length}/${checks.length}`);
await browser.close();
process.exit(bad.length ? 1 : 0);
