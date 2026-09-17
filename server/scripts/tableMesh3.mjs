// СЕТЬ ГОЛОСОВ НА ТРОИХ: каждый говорит на сукно — и его СЛЫШАТ ОБА, а не один.
//
// Связь, которая «сошлась», ещё ничего не значит: речь может идти в одну сторону, и тогда за столом
// выходит мешанина — один слышит всех, другой никого. Поэтому мерится дошедшая звуковая энергия,
// в шести направлениях, а не число связей.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableMesh3.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const open = async (name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.route("https://telegram.org/**", (r) => r.abort());
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(400);
  return { name, p };
};
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const flow = async (p, from) => ((await p.evaluate(() => window.__tableFlow())) ?? {})[from] ?? 0;
const links = (p) => p.evaluate(() => window.__tableLinks());
const sayAt = async (p) => {
  for (let t = 0; t < 15000; t += 200) {
    const b = await p.locator('[data-section="say"]').boundingBox().catch(() => null);
    if (b && b.width > 0) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await p.waitForTimeout(200);
  }
  throw new Error("кнопка 💬 так и не появилась");
};

// Заходят по очереди, как люди.
const all = [await open("Первый"), await open("Второй"), await open("Третий")];
await all[0].p.waitForTimeout(5000);

const wires = (p) => p.evaluate(() => window.__tableWires());
for (const one of all) {
  const state = await links(one.p);
  check(`${one.name}: связь с обоими`, state.length === 2 && state.every((l) => l.state === "connected"), state);
  // МЕСТО ПОД ГОЛОС У ПАРЫ ОДНО, И ОНО ДВУСТОРОННЕЕ. Когда его заводили обе стороны, при одновременном
  // зове линии расходились: место оставалось своим, не связанным с чужим, и речь шла в одну сторону.
  // Это видно прямо здесь — раньше, чем кто-то заговорит, и не зависит от везения.
  const w = await wires(one.p);
  const bad = w.filter((link) => link.dirs.length !== 1 || !link.dirs[0].endsWith(":sendrecv/sendrecv"));
  check(`${one.name}: у каждой пары одно место и оно двустороннее`, bad.length === 0, w.map((l) => ({ who: l.who, dirs: l.dirs })));
}

// ЗОВЁТ РОВНО ОДИН ИЗ ПАРЫ. Когда звали оба, при одновременном зове линии расходились и связь
// получалась односторонней. Здесь это видно прямо: у каждой пары зов идёт только с одной стороны.
const keyOf = async (one) => (await spots(one.p)).me;
const keys = await Promise.all(all.map(keyOf));
const called = await Promise.all(all.map((one) => one.p.evaluate(() => ({ ...window.__tableMesh.called }))));
for (let i = 0; i < all.length; i += 1) {
  for (let j = i + 1; j < all.length; j += 1) {
    const mine = (called[i] ?? {})[keys[j]] ?? 0;
    const his = (called[j] ?? {})[keys[i]] ?? 0;
    const first = keys[i] < keys[j] ? "i" : "j";
    const ok = (first === "i" ? mine > 0 && his === 0 : his > 0 && mine === 0);
    check(`${all[i].name} и ${all[j].name}: зовёт один, и это тот, чей ключ меньше`, ok, { [all[i].name]: mine, [all[j].name]: his, keys: [keys[i], keys[j]] });
  }
}

/** Говорит на сукно — и смотрим, к кому дошла речь. */
for (const talker of all) {
  const key = (await spots(talker.p)).me;
  const others = all.filter((one) => one !== talker);
  const was = await Promise.all(others.map((one) => flow(one.p, key)));
  const say = await sayAt(talker.p);
  await talker.p.mouse.move(say.x, say.y);
  await talker.p.mouse.down();
  await talker.p.mouse.move(say.x + 40, say.y - 60, { steps: 5 });
  await talker.p.waitForTimeout(400);
  await talker.p.mouse.move(195, 300, { steps: 6 });
  await talker.p.waitForTimeout(3500);
  const now = await Promise.all(others.map((one) => flow(one.p, key)));
  await talker.p.mouse.up();
  await talker.p.waitForTimeout(400);
  for (const [i, one] of others.entries()) {
    const ok = now[i] > was[i];
    if (!ok && process.env.WIRES) {
      console.log("--- говорит", talker.name, JSON.stringify(await talker.p.evaluate(() => window.__tableWires()), null, 1));
      console.log("--- не слышит", one.name, JSON.stringify(await one.p.evaluate(() => window.__tableWires()), null, 1));
    }
    check(`${talker.name} говорит на стол — ${one.name} слышит`, ok, { was: was[i], now: now[i] });
  }
}

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
