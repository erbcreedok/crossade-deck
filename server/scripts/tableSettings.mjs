// ОКНО НАСТРОЕК — модальное поверх стола: шестерёнка и пункт «Настройки» в меню Telegram, полный экран, громкость
// лесенкой, «без звука», объёмный звук, скорость анимаций 1x/2x/4x, «меньше анимаций».
// Telegram подменён целиком: его скрипт не грузится, `window.Telegram.WebApp` — журнал вызовов.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableSettings.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const open = async (name, ctx) => {
  ctx ??= await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.route("https://telegram.org/**", (r) => r.abort());
  await p.addInitScript(() => {
    const events = {};
    const log = (window.__tgCalls = []);
    window.Telegram = {
      WebApp: {
        initData: "", initDataUnsafe: {}, platform: "ios", version: "9.6", isFullscreen: false,
        ready() {}, expand() {}, disableVerticalSwipes() {},
        isVersionAtLeast: () => true,
        onEvent(name, fn) { (events[name] ??= []).push(fn); },
        requestFullscreen() { log.push("requestFullscreen"); this.isFullscreen = true; (events.fullscreenChanged ?? []).forEach((f) => f()); },
        exitFullscreen() { log.push("exitFullscreen"); this.isFullscreen = false; (events.fullscreenChanged ?? []).forEach((f) => f()); },
        SettingsButton: { show() { log.push("settingsShow"); }, onClick(fn) { window.__tgSettings = fn; } },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      },
    };
  });
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(700);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const heard = (p) => p.evaluate(() => window.__tableSounds.splice(0));
const drag = async (p, from, to) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await p.mouse.move(to.x, to.y, { steps: 4 });
  await p.mouse.up();
};
const openSettings = async (p) => {
  await p.click("[data-settings]");
  await p.waitForSelector("[data-settings-panel]");
};
const shut = (p) => p.click("[data-settings-close]");
/** Перелёты, которые видит страница: длительность каждого, по порядку. */
const watchFlights = (p) => p.evaluate(() => {
  window.__flights = [];
  new MutationObserver((list) => {
    for (const x of list) for (const n of x.addedNodes) {
      if (n.dataset?.flight) requestAnimationFrame(() => window.__flights.push(n.getAnimations()[0]?.effect.getTiming().duration ?? -1));
      if (n.dataset?.shuffle === "0") window.__flights.push("shuffle");
    }
  }).observe(document.body, { childList: true, subtree: true });
});
const flights = (p) => p.evaluate(() => window.__flights.splice(0));

const A = await open("A");
const B = await open("B");
const { k, middle } = await spots(A);

// 1. Окно: шестерёнка, «закрыть», касание мимо; меню Telegram.
check("пункт «Настройки» в меню Telegram показан", await A.evaluate(() => window.__tgCalls.includes("settingsShow") && typeof window.__tgSettings === "function"));
check("окна нет, пока не открыли", (await A.$("[data-settings-panel]")) === null);
await openSettings(A);
const box = await A.locator("[data-settings-panel]").boundingBox();
check("окно — по центру, поверх стола, с полями", Math.abs(box.x + box.width / 2 - 195) < 2 && box.x >= 16 && box.y >= 16 && box.y + box.height <= 844 - 16, box);
check("есть «закрыть»", (await A.$("[data-settings-close]")) !== null);
await shut(A);
check("«закрыть» закрывает", (await A.$("[data-settings-panel]")) === null);
await openSettings(A);
await A.mouse.click(195, 8);
check("касание мимо окна закрывает", (await A.$("[data-settings-panel]")) === null);
await A.evaluate(() => window.__tgSettings());
await A.waitForTimeout(100);
check("пункт меню Telegram открывает окно", (await A.$("[data-settings-panel]")) !== null);

// 2. Полный экран.
check("тумблер «Полный экран» есть, выключен", (await A.getAttribute("[data-look=fullscreen]", "aria-checked")) === "false");
await A.click("[data-look=fullscreen]");
await A.waitForTimeout(100);
check("включил — просит у Telegram полный экран, тумблер включён", (await A.evaluate(() => window.__tgCalls.includes("requestFullscreen"))) && (await A.getAttribute("[data-look=fullscreen]", "aria-checked")) === "true");
await A.click("[data-look=fullscreen]");
check("выключил — выходит из полного экрана", await A.evaluate(() => window.__tgCalls.includes("exitFullscreen")));
await A.evaluate(() => document.documentElement.style.setProperty("--tg-safe-area-inset-top", "40px"));
await shut(A);
await A.waitForTimeout(100);
const gear = await A.locator("[data-settings]").boundingBox();
check("шестерёнка отступает на безопасную зону сверху (полный экран)", Math.round(gear.y) === 52, gear);
await A.evaluate(() => document.documentElement.style.removeProperty("--tg-safe-area-inset-top"));

// 3. Громкость лесенкой, «без звука», объёмный звук.
await openSettings(A);
const setVolume = (v) => A.$eval('[data-volume="table"]', (el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
await setVolume(40);
check("громкость 40 — четыре ступени залиты, подпись 40%", (await A.textContent('[data-volume-value="table"]')) === "40%" && (await A.$$eval('[data-volume-row="table"] [data-step]', (els) => els.filter((e) => e.style.background !== "transparent").length)) === 4);
await setVolume(43);
check("ползунок — ступенями по 10", (await A.$eval('[data-volume="table"]', (el) => el.value)) === "40");
await shut(A);
await heard(A);
await drag(A, (await spots(A)).deckTop, { x: middle.x - 3 * k, y: middle.y - 1.5 * k });
await A.waitForTimeout(900);
let a = await heard(A);
check("свой дроп при громкости 40 — 0.4", a.some((s) => s.kind === "drop" && s.gain === 0.4), a);
await openSettings(A);
await A.click("[data-look=mute]");
check("«без звука» — громкость серая", (await A.getAttribute('[data-volume-row="table"]', "data-muted")) === "true");
await setVolume(70);
check("…но крутится: 70%", (await A.textContent('[data-volume-value="table"]')) === "70%");
await shut(A);
await heard(A);
await drag(A, (await spots(A)).deckTop, { x: middle.x + 3 * k, y: middle.y - 1.5 * k });
await A.waitForTimeout(900);
check("«без звука» — тишина", (await heard(A)).length === 0);
await openSettings(A);
await A.click("[data-look=mute]");
await A.click("[data-look=spatial]");
await shut(A);
await heard(A);
await drag(A, (await spots(A)).deckTop, { x: middle.x - 2 * k, y: middle.y + 2 * k });
await A.waitForTimeout(900);
a = await heard(A);
check("объёмный выключен — звук посередине, громкость 0.7", a.some((s) => s.kind === "drop" && s.x === 0 && s.z === 0 && s.gain === 0.7), a);

// 4. Скорость анимаций: перелёт карты у зрителя.
await watchFlights(A);
const flyOnce = async () => {
  await flights(A);
  const now = await spots(B);
  const card = now.felt[0];
  await drag(B, card, { x: card.x + 40, y: card.y + 60 });
  await A.waitForTimeout(900);
  return (await flights(A)).filter((d) => typeof d === "number");
};
let f = await flyOnce();
check("1x — перелёт 260 мс", f.length > 0 && f.every((d) => d === 260), f);
await openSettings(A);
check("по умолчанию 1x", (await A.getAttribute('[data-speed="1"]', "aria-pressed")) === "true");
await A.click('[data-speed="2"]');
await shut(A);
f = await flyOnce();
check("2x — 130 мс", f.length > 0 && f.every((d) => d === 130), f);
await openSettings(A);
await A.click('[data-speed="4"]');
await shut(A);
f = await flyOnce();
check("4x — 65 мс", f.length > 0 && f.every((d) => d === 65), f);

// 5. Меньше анимаций: перелётов нет, веера шафла нет; помнится.
await openSettings(A);
check("«меньше анимаций» выключено на быстром экране", (await A.getAttribute("[data-look=reduce]", "aria-checked")) === "false");
await A.click("[data-look=reduce]");
await shut(A);
f = await flyOnce();
check("меньше анимаций — карта без перелёта", f.length === 0, f);
const grip = await B.locator('[data-g="deck-grip"][data-pile="deck"]').boundingBox();
await B.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2);
await B.waitForTimeout(450);
await flights(A);
await B.locator('[data-deck-do="shuffle"]').dispatchEvent("pointerdown");
await A.waitForTimeout(700);
check("меньше анимаций — шафл без веера", !(await flights(A)).includes("shuffle"));
check("меньше анимаций — корень помечен для CSS", await A.evaluate(() => "reduceMotion" in document.documentElement.dataset));
await A.reload();
await A.waitForSelector("[data-settings]");
await openSettings(A);
check("после перезагрузки: 4x, меньше анимаций, громкость 70, объёмный выключен",
  (await A.getAttribute('[data-speed="4"]', "aria-pressed")) === "true" && (await A.getAttribute("[data-look=reduce]", "aria-checked")) === "true"
  && (await A.textContent('[data-volume-value="table"]')) === "70%" && (await A.getAttribute("[data-look=spatial]", "aria-checked")) === "false");

// 6. Энергосбережение — само: кадров 30 в секунду, руками не выбрано.
const slow = await browser.newContext({ viewport: { width: 390, height: 844 } });
await slow.addInitScript(() => {
  // Каждый второй кадр — все ждущие разом: 30 в секунду, как у iOS в энергосбережении.
  const raf = window.requestAnimationFrame.bind(window);
  let queue = [], odd = false;
  const pump = (t) => {
    odd = !odd;
    if (!odd) {
      const run = queue;
      queue = [];
      for (const fn of run) fn(t);
    }
    raf(pump);
  };
  raf(pump);
  window.requestAnimationFrame = (fn) => queue.push(fn);
});
const C = await open("C", slow);
await C.waitForTimeout(2600);
await openSettings(C);
check("30 кадров — «меньше анимаций · авто» включено само", (await C.getAttribute("[data-look=reduce]", "aria-checked")) === "true" && /авто/.test(await C.textContent("[data-look=reduce]")), await C.textContent("[data-look=reduce]"));

// 7. КОРОТКИЙ ЭКРАН — окно не влезает целиком: оно должно прокручиваться пальцем и не вылезать за края.
const short = await browser.newContext({ viewport: { width: 390, height: 420 }, hasTouch: true });
const D = await open("D", short);
await openSettings(D);
const panel = D.locator("[data-settings-panel]");
const size = await panel.evaluate((el) => ({ scroll: el.scrollHeight, seen: el.clientHeight, touch: getComputedStyle(el).touchAction }));
check("на коротком экране окно длиннее экрана", size.scroll > size.seen, size);
check("…и палец его прокручивает (не заблокирован touch-action)", size.touch !== "none", size.touch);
const boxD = await panel.boundingBox();
check("окно не вылезает за края экрана", boxD.y >= 0 && boxD.y + boxD.height <= 420, boxD);
await panel.evaluate((el) => (el.scrollTop = 9999));
const low = await panel.evaluate((el) => ({ at: el.scrollTop, bottom: el.scrollHeight - el.clientHeight }));
check("низ настроек достижим", low.at > 0 && low.at === low.bottom, low);
const footer = await D.locator("[data-client]").boundingBox();
check("нижняя строка видна, когда докрутил", footer.y + footer.height <= 420 + 1, footer);

for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableSettings ${checks.filter((c) => c.ok).length}/${checks.length}`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
