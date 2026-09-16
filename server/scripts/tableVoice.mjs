// ГОЛОСОВЫЕ — жест записи (зажать 💬, дотянуть до микрофона, бросить на стол), отмена, лимит и раздел звука.
// Микрофон подменён: страница получает поддельный `getUserMedia` и `MediaRecorder`, чтобы жест проверялся без железа.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableVoice.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const fakeMic = () => {
  // Поддельный микрофон: пишет «звук» и отдаёт его кусок, как настоящий.
  window.__mic = { started: 0, stopped: 0, cancelled: 0 };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
  });
  window.MediaRecorder = class {
    constructor() {
      this.state = "inactive";
      this.mimeType = "audio/webm";
    }
    start() {
      this.state = "recording";
      window.__mic.started += 1;
    }
    stop() {
      this.state = "inactive";
      if (this.onstop) {
        window.__mic.stopped += 1;
        this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])]) });
        this.onstop();
      } else window.__mic.cancelled += 1;
    }
  };
  window.__voices = [];
};
const open = async (name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.route("https://telegram.org/**", (r) => r.abort());
  await p.addInitScript(fakeMic);
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(400);
  return p;
};
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const A = await open("A");
const B = await open("B");
const C = await open("C");
await A.waitForTimeout(400);

const sayAt = async (p) => {
  const b = await p.locator('[data-section="say"]').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// 1. Короткое зажатие — записи не было: случайным касанием не записать.
const say = await sayAt(A);
await A.mouse.move(say.x, say.y);
await A.mouse.down();
await A.waitForTimeout(300);
check("пока держат — подсказка «Держи…»", /держи/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
check("под пальцем — шайба с микрофоном", (await A.getAttribute("[data-mic-puck]", "data-on")) === "false");
check("стол ещё не подсвечен", (await A.$("[data-mic-drop]")) === null);
await A.mouse.up();
await A.waitForTimeout(400);
check("отпустил раньше секунды — запись не начиналась", (await A.evaluate(() => window.__mic.started)) === 0);
check("подсказка убралась", (await A.$("[data-mic-hint]")) === null);
// Короткое зажатие — это тап: он, как и раньше, открывает клавиатуру. Закрываем её касанием мимо.
check("короткое зажатие открыло клавиатуру", (await A.$('[data-g="talk-shield"]:not([hidden])')) !== null);
await A.mouse.click(195, 60);
await A.waitForTimeout(300);
await A.mouse.click(195, 60);
await A.waitForTimeout(400);

// 2. Держит секунду — пошла запись, стол подсвечен как дропзона, остальные кнопки скрыты.
await A.mouse.move(say.x, say.y);
await A.mouse.down();
await A.waitForTimeout(1300);
check("секунда удержания — запись пошла", (await A.evaluate(() => window.__mic.started)) === 1);
check("сукно подсвечено — туда бросать", (await A.$('[data-mic-drop="felt"]')) !== null);
check("стулья тоже зоны — бросок туда сделает голосовое личным", (await A.$$eval('[data-mic-drop="chair"]', (els) => els.length)) >= 1);
check("шайба стала записывающей, с кольцом отсчёта", (await A.getAttribute("[data-mic-puck]", "data-on")) === "true" && (await A.$("[data-mic-count]")) !== null);
check("остальные кнопки HUD скрыты", (await A.$$eval("[data-section]", (els) => els.length)) === 1);
check("подсказка про бросок на стол", /стол/i.test((await A.$$eval("[data-mic-hint]", (e) => e.map((x) => x.textContent).join(""))) ?? ""), await A.$$eval("[data-mic-hint]", (e) => e.map((x) => x.textContent)));
const drop = await A.$$eval('[data-mic-drop="felt"]', (e) => e.map((x) => x.getBoundingClientRect().toJSON()));
// Сукно — круг посреди экрана: сверху и снизу остаётся игровая зона, которая дропзоной НЕ является.
check("подсвечено круглое сукно, а не весь экран", drop[0] && drop[0].y > 40 && drop[0].bottom < 700 && drop[0].width <= 390, drop);
await B.waitForTimeout(350);
check("остальные видят микрофон на его аватаре", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 1);

// 3. Отпустил мимо сукна и стульев (на полосе руки) — отмена.
await A.mouse.up();
await A.waitForTimeout(400);
check("отпустил на полосе — отменено, ничего не ушло", (await A.evaluate(() => window.__mic.cancelled)) === 1 && (await A.evaluate(() => window.__mic.stopped)) === 0);
await B.waitForTimeout(400);
check("микрофон на аватаре погас", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 0);

// 4. Держит секунду и бросает на стол — отправлено.
await A.mouse.move(say.x, say.y);
await A.mouse.down();
await A.waitForTimeout(1300);
await A.mouse.move(195, 300, { steps: 6 });
await A.mouse.up();
await A.waitForTimeout(600);
check("бросок на сукно — запись отправлена", (await A.evaluate(() => window.__mic.stopped)) === 1);
check("подсветка убралась", (await A.$("[data-mic-drop]")) === null);
check("шайбы под пальцем больше нет", (await A.$("[data-mic-puck]")) === null);

// 4b. Бросок на чужой стул — голосовое личное: адресат его получает.
const mineA = (await spots(A)).mine;
const seatB = ((await spots(A)).seats ?? []).find((sp) => sp.key !== mineA);
if (seatB) {
  await A.mouse.move(say.x, say.y);
  await A.mouse.down();
  await A.waitForTimeout(1300);
  await A.mouse.move(seatB.x, seatB.y, { steps: 6 });
  await A.waitForTimeout(250);
  check("над стулом подсказка говорит «лично»", /лично/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
  check("стул под пальцем подсвечен ярче", (await A.getAttribute(`[data-mic-drop="chair"][data-chair="${seatB.key}"]`, "data-on")) === "true");
  // ЛИЧНОЕ СЛЫШИТ ТОЛЬКО АДРЕСАТ. Запись короткая (меньше секунды), поэтому «говорит» ловим частыми
  // пробами сразу после броска, а не одним поздним взглядом.
  const talkSeen = async (p, ms = 1500) => {
    for (let t = 0; t < ms; t += 60) {
      if ((await p.$$eval("[data-mic-mark]", (els) => els.filter((e) => e.dataset.talks === "true").length)) > 0) return true;
      await p.waitForTimeout(60);
    }
    return false;
  };
  const mineB = (await spots(B)).mine;
  const heardBy = seatB.key === mineB ? B : C;
  const missed = heardBy === B ? C : B;
  await A.mouse.up();
  const [gotIt, gotThird] = await Promise.all([talkSeen(heardBy), talkSeen(missed)]);
  check("бросок на стул — запись ушла", (await A.evaluate(() => window.__mic.stopped)) === 2);
  check("личное услышал адресат", gotIt, seatB.key);
  check("третий его не услышал", !gotThird);
}

// 5. Тап по 💬 — по-прежнему клавиатура.
await A.mouse.move(say.x, say.y);
await A.mouse.down();
await A.mouse.up();
await A.waitForTimeout(400);
check("тап по 💬 открывает клавиатуру", (await A.$("[data-keys]")) !== null || (await A.$("[data-key]")) !== null);

// 6. Настройки: три выключателя и два ползунка.
// Клавиатура закрывается касанием мимо неё.
await A.mouse.click(195, 60);
await A.waitForTimeout(300);
await A.mouse.click(195, 60);
await A.waitForTimeout(400);
await A.click("[data-settings]");
await A.waitForSelector("[data-settings-panel]");
check("«Отключить все звуки» есть", (await A.$("[data-look=mute]")) !== null);
check("«Отключить звуки интерфейса» есть", (await A.$("[data-look=uiMute]")) !== null);
check("«Отключить голосовые» есть", (await A.$("[data-look=voiceMute]")) !== null);
check("два ползунка: стол и голосовые", (await A.$$eval("[data-volume]", (els) => els.length)) === 2);
await A.click("[data-look=voiceMute]");
check("выключил голосовые — их ползунок серый, стола — нет",
  (await A.getAttribute('[data-volume-row="voice"]', "data-muted")) === "true" && (await A.getAttribute('[data-volume-row="table"]', "data-muted")) === "false");

await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableVoice ${checks.filter((c) => c.ok).length}/${checks.length}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
