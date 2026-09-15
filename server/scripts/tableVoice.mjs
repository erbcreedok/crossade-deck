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
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const A = await open("A");
const B = await open("B");
await A.waitForTimeout(400);

const sayAt = async (p) => {
  const b = await p.locator('[data-section="say"]').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const zoneAt = async (p) => {
  const b = await p.locator("[data-mic-zone]").boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// 1. Зажал 💬 — остальные кнопки ушли, справа появилась зона микрофона.
const say = await sayAt(A);
await A.mouse.move(say.x, say.y);
await A.mouse.down();
await A.waitForTimeout(250);
check("зажал 💬 — есть зона микрофона", (await A.$("[data-mic-zone]")) !== null);
check("остальные кнопки HUD скрыты", (await A.$$eval("[data-section]", (els) => els.length)) === 1);
check("подсказка зовёт к микрофону", /микрофон/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));

// 2. Довёл до зоны — пошла запись, и её видно всем.
const zone = await zoneAt(A);
await A.mouse.move(zone.x, zone.y, { steps: 6 });
await A.waitForTimeout(350);
check("запись пошла", (await A.evaluate(() => window.__mic.started)) === 1);
check("подсказка про бросок и отпускание", /стол/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
await B.waitForTimeout(350);
check("остальные видят микрофон на его аватаре", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 1);

// 3. Отпустил не на столе — отмена: ничего не ушло, значок погас.
await A.mouse.move(zone.x, zone.y + 4);
await A.mouse.up();
await A.waitForTimeout(400);
check("отпустил у полосы — отменено, запись не отправлена", (await A.evaluate(() => window.__mic.cancelled)) === 1 && (await A.evaluate(() => window.__mic.stopped)) === 0);
await B.waitForTimeout(400);
check("микрофон на аватаре погас", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 0);

// 4. Ещё раз, с броском на стол — отправлено.
await A.mouse.move(say.x, say.y);
await A.mouse.down();
await A.waitForTimeout(200);
await A.mouse.move(zone.x, zone.y, { steps: 6 });
await A.waitForTimeout(300);
await A.mouse.move(195, 300, { steps: 6 });
await A.mouse.up();
await A.waitForTimeout(600);
check("бросок на стол — запись отправлена", (await A.evaluate(() => window.__mic.stopped)) === 1);

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
