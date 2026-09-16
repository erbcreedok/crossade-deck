// ЖИВОЙ ГОЛОС — жест (зажать 💬, увести палец, навести на зону), кого слышно и раздел звука.
// Микрофон НЕ подменён: Chromium даёт поддельное устройство ключами ниже, поэтому путь идёт целиком — от
// настоящего `getUserMedia` через воркрет до кусков в сети. Услышать их безголовый браузер не может, и правда
// о них — журнал `window.__tableLive`.
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
const live = (p) => p.evaluate(() => ({ ...window.__tableLive }));
// Кусок, посланный мгновением раньше, может долететь мгновением позже: перед замером ждём, пока счётчик встанет.
const settled = async (p) => {
  let was = -1;
  for (let t = 0; t < 2000; t += 120) {
    const now = (await live(p)).heard;
    if (now === was) return now;
    was = now;
    await p.waitForTimeout(120);
  }
  return was;
};
const grew = async (p, was, ms = 900) => {
  for (let t = 0; t < ms; t += 80) {
    if ((await live(p)).sent > was) return true;
    await p.waitForTimeout(80);
  }
  return false;
};

// 1. ПАЛЕЦ НА КНОПКЕ — микрофона ещё нет: только подсказка, куда тянуть. Ждать нечего, мерило — движение.
const say = await sayAt(A);
await A.mouse.move(say.x, say.y);
await A.mouse.down();
await A.waitForTimeout(700);
check("палец на кнопке — шайбы нет", (await A.$("[data-mic-puck]")) === null);
check("…и зон тоже нет", (await A.$("[data-mic-drop]")) === null);
check("…подсказка зовёт тянуть", /тян/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
check("…и наружу не ушло ни куска", (await live(A)).sent === 0, await live(A));
check("HUD прежний", (await A.$$eval("[data-section]", (els) => els.length)) > 1);

// 2. ПАЛЕЦ УШЁЛ С КНОПКИ — в руке микрофон, зоны видны. Говорить он ещё не начал: слово даёт наводка.
await A.mouse.move(say.x + 40, say.y - 60, { steps: 5 });
await A.waitForTimeout(700);
check("увёл палец — под ним шайба с микрофоном", (await A.$("[data-mic-puck]")) !== null);
check("сукно — зона: его слышат все", (await A.$('[data-mic-drop="felt"]')) !== null);
check("остальные кнопки HUD скрыты", (await A.$$eval("[data-section]", (els) => els.length)) === 1);
const zones = await A.$$eval('[data-mic-drop="chair"]', (els) => els.map((el) => el.dataset.chair));
const mineChair = (await spots(A)).mine;
check("свой стул зоной не становится", !zones.includes(mineChair), { zones, mineChair });
const croupier = ((await spots(A)).seats ?? []).find((sp) => sp.croupier);
if (croupier) {
  const his = ((await spots(A)).seats ?? []).find((sp) => sp.key === croupier.key);
  check("стул крупье зоной не становится", !zones.includes(his?.key), zones);
}
check("чужие занятые стулья — зоны", zones.length >= 1, zones);
check("мимо зон — молчание: подсказка зовёт навести", /навед/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
check("…и наружу по-прежнему ничего", (await live(A)).sent === 0, await live(A));

// 3. НАВЁЛ НА СУКНО — речь идёт сразу, без задержки и без броска. Себя я при этом не слышу.
await A.mouse.move(195, 300, { steps: 6 });
check("навёл на сукно — речь пошла", await grew(A, 0), await live(A));
check("подсказка говорит, что слышат все", /все/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
check("сам себя не слышу", (await live(A)).heard === 0, await live(A));
await B.waitForTimeout(500);
check("остальные слышат его речь", (await live(B)).heard > 0, await live(B));
// СЛЫШАТ — ЭТО НЕ «ПРИШЛО»: кусок, который не разобрался, тоже приходит. Считаем разобранные.
check("…и речь у них разбирается, а не молча пропадает", (await live(B)).played > 0, await live(B));
check("и видят микрофон на его аватаре", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 1);
const markAt = await B.$eval("[data-mic-mark]", (el) => el.getBoundingClientRect().toJSON());
const author = ((await spots(B)).seats ?? []).find((sp) => sp.key === mineChair);
check("микрофон — у аватара, а не за стулом", author && Math.hypot(markAt.x + markAt.width / 2 - author.x, markAt.y + markAt.height / 2 - author.y) <= author.r * 1.6, { markAt, author });

// 4. УВЁЛ МИКРОФОН С ЗОНЫ — речь обрывается тут же, хотя палец всё ещё держат.
await A.mouse.move(say.x, say.y + 40, { steps: 6 });
await A.waitForTimeout(500);
const quiet = await live(A);
await A.waitForTimeout(600);
check("увёл с зоны — речь встала", (await live(A)).sent === quiet.sent, { quiet, now: await live(A) });
await B.waitForTimeout(500);
check("микрофон на аватаре погас", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 0);

// 3а. СЧЁТ НА СЕРВЕРЕ — им и разбирают обрыв, когда речи не слышно: дошло, разобрано, разослано.
{
  const tally = await (await fetch(`${base}/health`)).json().then((h) => h.live);
  check("сервер считает дошедшие куски", tally && tally.got > 0, tally);
  check("…и все они разбираются", tally && tally.bad === 0, tally);
  check("…и рассылаются дальше", tally && tally.sent > 0, tally);
}

// 4а. НАВЁЛ НА СВОЙ СТУЛ — это не зона: себе говорить незачем, и речь наружу не идёт.
{
  const my = ((await spots(A)).seats ?? []).find((sp) => sp.key === mineChair);
  await A.mouse.move(my.x, my.y, { steps: 6 });
  await A.waitForTimeout(400);
  const was = await live(A);
  await A.waitForTimeout(700);
  check("свой стул речи не слушает", (await live(A)).sent === was.sent && (await live(A)).to === null, { was, now: await live(A) });
}

// 5. НАВЁЛ НА ЧУЖОЙ СТУЛ — слышит только он. Третий за столом об этой речи не знает.
{
  const seats = (await spots(A)).seats ?? [];
  const keyB = (await spots(B)).me;
  const chairB = (await spots(B)).mine;
  const seatB = seats.find((sp) => sp.key === chairB);
  await A.mouse.move(seatB.x, seatB.y, { steps: 6 });
  await A.waitForTimeout(200);
  // Замер — ПОСЛЕ наводки: по пути к стулу палец пересекает сукно, и кусок, сказанный над ним, честно
  // уходит всем. Личное начинается там, где микрофон встал на стул.
  const heardB = await settled(B), heardC = await settled(C);
  check("подсказка называет, кто слышит", /слышит/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
  check("речь адресована ему", (await live(A)).to === keyB, { to: (await live(A)).to, keyB });
  await A.waitForTimeout(900);
  check("адресат её слышит", (await live(B)).heard > heardB, { was: heardB, now: (await live(B)).heard });
  check("третий за столом — нет", (await live(C)).heard === heardC, { was: heardC, now: (await live(C)).heard });
}

// 5а. МИКРОФОН НЕ ДАЛИ — жест не исчезает молча, а говорит, почему. Проверяем на C: ему запретим доступ.
{
  const D = C;
  await D.context().clearPermissions();
  await D.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new Error("нет доступа")) },
    });
  });
  await D.reload();
  await D.waitForSelector(".crossade-loading", { state: "detached" });
  await D.waitForTimeout(600);
  const sayD = await sayAt(D);
  await D.mouse.move(sayD.x, sayD.y);
  await D.mouse.down();
  await D.mouse.move(sayD.x + 40, sayD.y - 60, { steps: 5 });
  await D.waitForTimeout(700);
  const said = (await D.$$eval("[data-mic-hint]", (els) => els.map((el) => el.textContent).join(" "))) ?? "";
  check("микрофон не дали — жест говорит, почему", /микрофон/i.test(said), said);
  check("…и зон при отказе не рисует", (await D.$("[data-mic-drop]")) === null);
  await D.mouse.up();
  await D.waitForTimeout(300);
}

// 6. ОТПУСТИЛ — микрофон гаснет, шайба и зоны уходят, клавиатура не открывается.
await A.mouse.up();
await A.waitForTimeout(400);
check("отпустил — шайбы нет", (await A.$("[data-mic-puck]")) === null);
check("…и зон нет", (await A.$("[data-mic-drop]")) === null);
check("…клавиатуры жест не открыл", (await A.$("[data-keys]")) === null && (await A.$("[data-key]")) === null);
const after = await live(A);
await A.waitForTimeout(600);
check("…и речь наружу не идёт", (await live(A)).sent === after.sent);
await B.waitForTimeout(400);
check("микрофон на чужом аватаре погас", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 0);

// 5б. ДВА ОКНА ОДНОГО ЧЕЛОВЕКА — речь идёт в одно. Иначе он слышит её дважды со сдвигом, то есть с эхо,
// и виноватым выглядит говорящий. Оба окна входят настоящей дверью Telegram, одним и тем же человеком.
{
  const initData = (() => {
    const user = JSON.stringify({ id: 77, first_name: "Двойной" });
    const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AA", user };
    const sum = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
    const key = createHmac("sha256", "WebAppData").update("test").digest();
    return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
  })();
  const twin = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await p.route("https://telegram.org/**", (r) => r.abort());
    await p.addInitScript((data) => {
      window.Telegram = {
        WebApp: {
          initData: data, initDataUnsafe: {}, platform: "ios", version: "8.0",
          ready() {}, expand() {}, disableVerticalSwipes() {}, isVersionAtLeast: () => true,
          onEvent() {}, SettingsButton: { show() {}, onClick() {} },
          HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
        },
      };
    }, initData);
    await p.goto(`${base}/table/?room=${room}`);
    await p.waitForSelector(".crossade-loading", { state: "detached" });
    await p.waitForTimeout(500);
    return p;
  };
  const old = await twin();
  const now = await twin();
  await A.waitForTimeout(500);
  const sayA2 = await sayAt(A);
  await A.mouse.move(sayA2.x, sayA2.y);
  await A.mouse.down();
  await A.mouse.move(195, 300, { steps: 6 });
  await A.waitForTimeout(1500);
  await A.mouse.up();
  await A.waitForTimeout(500);
  const heardNow = (await live(now)).played, heardOld = (await live(old)).played;
  check("речь дошла до того окна, в котором человек сейчас", heardNow > 0, { heardNow, heardOld });
  check("…и не двоится вторым его же окном", heardOld === 0, { heardNow, heardOld });
  await old.close();
  await now.close();
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
