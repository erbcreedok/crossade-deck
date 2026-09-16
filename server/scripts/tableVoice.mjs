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
// Пока палец держат (до секунды), экран не меняется вовсе: ни панели записи, ни подсказки, ни шайбы.
const hudWas = await A.$$eval("[data-section]", (els) => els.length);
check("пока держат — панели записи нет", (await A.$("[data-mic-hint]")) === null && (await A.$("[data-mic-puck]")) === null);
check("…и подсветки нет", (await A.$("[data-mic-drop]")) === null);
check("…и HUD прежний", hudWas > 1, hudWas);
await A.mouse.up();
await A.waitForTimeout(400);
check("отпустил раньше секунды — запись не начиналась", (await A.evaluate(() => window.__mic.started)) === 0);
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
check("под пальцем шайба с микрофоном и кольцом отсчёта", (await A.getAttribute("[data-mic-puck]", "data-on")) === "true" && (await A.$("[data-mic-count]")) !== null);
// КОЛЬЦО СЧИТАЕТ ВРЕМЯ ЗАПИСИ, а не начинается заново от каждого движения пальца.
const gone = () => A.$eval("[data-mic-count]", (el) => Number(el.getAttribute("stroke-dashoffset")));
const goneWas = await gone();
await A.mouse.move(say.x + 30, say.y - 40, { steps: 4 });
await A.waitForTimeout(250);
const goneMoved = await gone();
check("кольцо не откатывается от движения пальцем", goneMoved >= goneWas, { goneWas, goneMoved });
await A.waitForTimeout(400);
check("кольцо продолжает таять", (await gone()) > goneMoved, { goneMoved });
check("остальные кнопки HUD скрыты", (await A.$$eval("[data-section]", (els) => els.length)) === 1);
check("подсказка про бросок на стол", /стол/i.test((await A.$$eval("[data-mic-hint]", (e) => e.map((x) => x.textContent).join(""))) ?? ""), await A.$$eval("[data-mic-hint]", (e) => e.map((x) => x.textContent)));
const drop = await A.$$eval('[data-mic-drop="felt"]', (e) => e.map((x) => x.getBoundingClientRect().toJSON()));
// Сукно — круг посреди экрана: сверху и снизу остаётся игровая зона, которая дропзоной НЕ является.
check("подсвечено круглое сукно, а не весь экран", drop[0] && drop[0].y > 40 && drop[0].bottom < 700 && drop[0].width <= 390, drop);
await B.waitForTimeout(350);
check("остальные видят микрофон на его аватаре", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 1);
// Значок висит У САМОГО АВАТАРА, а не за стулом: его центр — в пределах диска.
const markAt = await B.$eval("[data-mic-mark]", (el) => el.getBoundingClientRect().toJSON());
const authorChair = (await spots(A)).mine;
const author = ((await spots(B)).seats ?? []).find((sp) => sp.key === authorChair);
check("микрофон — у аватара, а не за стулом", author && Math.hypot(markAt.x + markAt.width / 2 - author.x, markAt.y + markAt.height / 2 - author.y) <= author.r * 1.6, { markAt, author });

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

// 4а. Пока запись ЗВУЧИТ, значка микрофона нет: дышит сам аватар.
const talkingMarks = await B.$$eval("[data-mic-mark]", (els) => els.length);
check("у звучащей записи значка микрофона нет", talkingMarks === 0, talkingMarks);

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
  // Подпись с именем НЕ дышит вместе с кружком. Меряем по самому холсту: где в столбце под аватаром
  // проходит рамка подписи (она цвета игрока) — эти строки не должны сдвинуться, пока кружок раздут.
  const plateRows = async (p, key) => {
    const sp = ((await spots(p)).seats ?? []).find((one) => one.key === key);
    if (!sp?.plate) return null;
    return p.evaluate(({ plate }) => {
      const canvas = document.querySelector("canvas");
      const g = canvas.getContext("2d");
      const dpr = canvas.width / canvas.clientWidth;
      const x = Math.round((plate.x + plate.w / 2) * dpr);
      const from = Math.round((plate.y - plate.h) * dpr);
      const to = Math.round((plate.y + plate.h * 2) * dpr);
      const strip = g.getImageData(x, Math.max(0, from), 1, Math.max(1, to - from)).data;
      const rows = [];
      for (let i = 0; i < strip.length; i += 4) {
        // Рамка и заливка подписи темнее сукна — ищем чёрную рамку плашки.
        if (strip[i] < 40 && strip[i + 1] < 40 && strip[i + 2] < 40) rows.push(from + i / 4);
      }
      return rows.length ? { top: rows[0], bottom: rows[rows.length - 1] } : null;
    }, { plate: sp.plate });
  };
  // «Говорит» видно по дышащему аватару: кто звучит и насколько раздут его диск — в снимке холста.
  const talkSeen = async (p, ms = 1500) => {
    let puffed = false;
    for (let t = 0; t < ms; t += 60) {
      const now = await spots(p);
      if (now.speaking && (now.seats ?? []).some((sp) => sp.puff > 1)) puffed = true;
      await p.waitForTimeout(60);
    }
    return puffed;
  };
  const mineB = (await spots(B)).mine;
  const heardBy = seatB.key === mineB ? B : C;
  const missed = heardBy === B ? C : B;
  await A.mouse.up();
  const authorKey = (await spots(A)).mine;
  const [gotIt, gotThird, loudRows, loudPuff] = await Promise.all([
    talkSeen(heardBy),
    talkSeen(missed),
    // Замер В РАЗГАР звучания — кружок в этот миг раздут.
    (async () => {
      for (let t = 0; t < 1500; t += 80) {
        if ((await spots(A)).speaking) return plateRows(A, authorKey);
        await A.waitForTimeout(80);
      }
      return null;
    })(),
    (async () => {
      let most = 1;
      for (let t = 0; t < 1500; t += 60) {
        const sp = ((await spots(A)).seats ?? []).find((one) => one.key === authorKey);
        most = Math.max(most, sp?.puff ?? 1);
        await A.waitForTimeout(60);
      }
      return most;
    })(),
  ]);
  check("бросок на стул — запись ушла", (await A.evaluate(() => window.__mic.stopped)) === 2);
  check("личное услышал адресат", gotIt, seatB.key);
  check("третий его не услышал", !gotThird);
  const quietRows = await plateRows(A, authorKey);
  check("аватар дышит заметно", loudPuff >= 1.2, loudPuff);
  // Меряем НИЖНИЙ край плашки: верхний тонет в раздутом кружке, а низ подписи — чистый признак её места.
  check("подпись с именем не прыгает вместе с аватаром",
    loudRows !== null && quietRows !== null && Math.abs(loudRows.bottom - quietRows.bottom) <= 1,
    { loudRows, quietRows });
}

// 4c. «Не слушать» у чужого игрока — отдельно от «не читать». Пишет B (его лимит ещё цел), глушит его C.
{
  const chairB = (await spots(B)).mine;
  const seatOfB = ((await spots(C)).seats ?? []).find((sp) => sp.key === chairB);
  await C.mouse.click(seatOfB.x, seatOfB.y);
  await C.waitForSelector('[data-g="tip"]');
  check("в окне игрока есть и «не читать», и «не слушать»", (await C.$("[data-mute]")) !== null && (await C.$("[data-voice-mute]")) !== null);
  check("«не слушать» по умолчанию выключено", (await C.getAttribute("[data-voice-mute]", "aria-pressed")) === "false");
  await C.click("[data-voice-mute]");
  await C.waitForTimeout(200);
  check("включается сам по себе, «не читать» не трогая",
    (await C.getAttribute("[data-voice-mute]", "aria-pressed")) === "true" && (await C.getAttribute("[data-mute]", "aria-pressed")) === "false");

  const sayB = await sayAt(B);
  await B.mouse.move(sayB.x, sayB.y);
  await B.mouse.down();
  await B.waitForTimeout(1300);
  await B.mouse.move(195, 300, { steps: 6 });
  await B.mouse.up();
  const listens = async (p, ms = 2000) => {
    for (let t = 0; t < ms; t += 60) {
      if ((await spots(p)).speaking) return true;
      await p.waitForTimeout(60);
    }
    return false;
  };
  const [atA, atC] = await Promise.all([listens(A), listens(C)]);
  check("заглушённый голос у заглушившего не звучит", !atC);
  check("…а у остальных звучит", atA);
  await C.click("[data-voice-mute]");
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
