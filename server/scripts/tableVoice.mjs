// ЖИВОЙ ГОЛОС — жест (зажать 💬, увести палец, навести на зону), кого слышно и раздел звука.
// Микрофон НЕ подменён: Chromium даёт поддельное устройство ключами ниже, поэтому путь идёт целиком — от
// настоящего `getUserMedia` до настоящей связи между двумя браузерами. Услышать речь безголовый браузер не
// может, и правда о ней — звуковая ЭНЕРГИЯ, дошедшая до слушателя (`window.__tableFlow`, статистика RTP):
// снятая дорожка всё равно шлёт тишину, поэтому по байтам молчание неотличимо от разговора.
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
  // ЖЕСТ МОГУТ ОТНЯТЬ: браузер шлёт pointercancel, и удержание кончается само. Считаем такие случаи — иначе
  // «микрофон погас сам» не отличить от «его отпустили».
  await p.addInitScript(() => {
    window.__cancels = 0;
    addEventListener("pointercancel", () => { window.__cancels += 1; }, { capture: true });
  });
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
  // Стол мог только что перерисоваться (вход, пересадка, перезагрузка) — ждём кнопку НА МЕСТЕ, а не просто
  // в разметке: между её появлением и первым кадром она ещё без размеров.
  for (let t = 0; t < 15000; t += 200) {
    const b = await p.locator('[data-section="say"]').boundingBox().catch(() => null);
    if (b && b.width > 0) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await p.waitForTimeout(200);
  }
  throw new Error("кнопка 💬 так и не появилась на экране");
};
const live = (p) => p.evaluate(() => ({ ...window.__tableMesh }));
// ПРАВДА О ПОТОКЕ — байты RTP, пришедшие слушателю: намерения говорящего тут ничего не доказывают.
const flow = async (p, from) => ((await p.evaluate(() => window.__tableFlow())) ?? {})[from] ?? 0;
const flowed = async (p, from, was, ms = 5000) => {
  for (let t = 0; t < ms; t += 200) {
    if ((await flow(p, from)) > was) return true;
    await p.waitForTimeout(200);
  }
  return false;
};
// Снятая дорожка всё равно шлёт тишину, и она несёт крупицу энергии: молчанием считаем прирост меньше
// `HUSH`, речью — больше `TALK`. Между ними живой звук не попадает: разница на два порядка.
const HUSH = 0.02, TALK = 0.1;
// Элемент уже в разметке, но ещё без размеров: меряем, когда он встал на место, а не как только появился.
const boxOf = async (p, sel, ms = 5000) => {
  for (let t = 0; t < ms; t += 200) {
    const b = await p.locator(sel).first().boundingBox().catch(() => null);
    if (b && b.width > 0) return b;
    await p.waitForTimeout(200);
  }
  return null;
};
const quietFor = async (p, from, ms = 1500) => {
  const was = await flow(p, from);
  await p.waitForTimeout(ms);
  return (await flow(p, from)) - was;
};

// ДВА ОКНА ОДНОГО ЧЕЛОВЕКА заводим ЗАРАНЕЕ: связь с новым окном договаривается не мгновенно, а замер в
// конце должен быть коротким — долгое удержание в прогоне рвётся само.
  const initData = (() => {
    const user = JSON.stringify({ id: 77, first_name: "Двойной" });
    const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AA", user };
    const sum = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
    const key = createHmac("sha256", "WebAppData").update("test").digest();
    return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
  })();
  const twin = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on("pageerror", (e) => console.log("TWIN ERROR", e.message));
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
await now.waitForTimeout(800);

// 1. ПАЛЕЦ НА КНОПКЕ — микрофона ещё нет: только подсказка, куда тянуть. Ждать нечего, мерило — движение.
const keyA0 = (await spots(A)).me;
const say = await sayAt(A);
await A.mouse.move(say.x, say.y);
await A.mouse.down();
await A.waitForTimeout(700);
check("палец на кнопке — шайбы нет", (await A.$("[data-mic-puck]")) === null);
check("…и зон тоже нет", (await A.$("[data-mic-drop]")) === null);
check("…подсказка зовёт тянуть", /тян/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
check("…и наружу не ушло ни куска", (await live(A)).talking.length === 0, await live(A));
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
check("…и наружу по-прежнему ничего", (await live(A)).talking.length === 0, await live(A));

// 3. НАВЁЛ НА СУКНО — речь идёт сразу, без задержки и без броска. Себя я при этом не слышу.
await A.mouse.move(195, 300, { steps: 6 });
check("навёл на сукно — дорожка открыта столу", (await live(A)).talking.length >= 1, await live(A));
check("подсказка говорит, что слышат все", /все/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
check("сам себя не слышу", (await flow(A, keyA0)) === 0, keyA0);
await B.waitForTimeout(500);
check("речь долетает напрямую, мимо сервера", await flowed(B, keyA0, TALK), await live(B));
check("и видят микрофон на его аватаре", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 1);
const markAt = await boxOf(B, "[data-mic-mark]");
const author = ((await spots(B)).seats ?? []).find((sp) => sp.key === mineChair);
check("микрофон — у аватара, а не за стулом", markAt && author && Math.hypot(markAt.x + markAt.width / 2 - author.x, markAt.y + markAt.height / 2 - author.y) <= author.r * 1.6, { markAt, author });

// 3б. ЧУЖОЙ ГОЛОС ИГРАЕТ ЭЛЕМЕНТОМ В САМОЙ СТРАНИЦЕ: оторванный от документа `Audio` в webview айфона
// молчит, и это не видно ниоткуда, кроме как отсюда.
{
  const el = await B.evaluate(() => {
    const one = [...document.querySelectorAll("audio")].find((a) => a.srcObject);
    return one ? { inPage: one.isConnected, playing: !one.paused, inline: one.hasAttribute("playsinline") } : null;
  });
  check("чужой голос играет элементом, стоящим в странице", el?.inPage === true, el);
  check("…и ему разрешено играть на месте, а не в проигрывателе айфона", el?.inline === true, el);
  check("…и он действительно играет", el?.playing === true, el);
}

// 4. УВЁЛ МИКРОФОН С ЗОНЫ — речь обрывается тут же, хотя палец всё ещё держат.
await A.mouse.move(say.x, say.y + 40, { steps: 6 });
await A.waitForTimeout(500);
check("увёл с зоны — дорожка закрыта", (await live(A)).talking.length === 0, await live(A));
check("…и речь до слушателя больше не доходит", (await quietFor(B, keyA0)) < HUSH, await live(A));
await B.waitForTimeout(500);
check("микрофон на аватаре погас", (await B.$$eval("[data-mic-mark]", (els) => els.length)) === 0);

// 3а. СЕРВЕР РЕЧИ НЕ ВИДИТ: он свёл двоих запиской и ушёл, дальше она идёт мимо него.
{
  const tally = await (await fetch(`${base}/health`)).json().then((h) => h.live);
  check("через сервер речь не идёт вовсе — он только свёл двоих", tally && tally.got === 0, tally);
}

// 4а. НАВЁЛ НА СВОЙ СТУЛ — это не зона: себе говорить незачем, и речь наружу не идёт.
{
  const my = ((await spots(A)).seats ?? []).find((sp) => sp.key === mineChair);
  await A.mouse.move(my.x, my.y, { steps: 6 });
  await A.waitForTimeout(400);
  check("свой стул речи не слушает", (await live(A)).talking.length === 0 && (await live(A)).aimed === null, await live(A));
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
  const heardB = await flow(B, keyA0), heardC = await flow(C, keyA0);
  check("подсказка называет, кто слышит", /слышит/i.test((await A.textContent("[data-mic-hint]")) ?? ""), await A.textContent("[data-mic-hint]"));
  check("речь идёт только ему", (await live(A)).talking.join() === keyB, await live(A));
  await A.waitForTimeout(900);
  check("адресат её слышит", await flowed(B, keyA0, heardB + TALK), { was: heardB });
  check("третий за столом — нет", (await flow(C, keyA0)) - heardC < HUSH, { was: heardC, now: await flow(C, keyA0) });
}

// 5а. МИКРОФОН НЕ ДАЛИ — жест не исчезает молча, а говорит, почему. Садится отдельный игрок Г, которому
// доступа не дадут: перезагружать уже сидящего нельзя — он вернётся новым человеком и без стула.
{
  const D = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await D.route("https://telegram.org/**", (r) => r.abort());
  await D.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new Error("нет доступа")) },
    });
  });
  await D.goto(`${base}/table/?room=${room}&name=D`);
  await D.waitForSelector(".crossade-loading", { state: "detached" });
  await D.waitForTimeout(700);
  const sayD = await sayAt(D);
  await D.mouse.move(sayD.x, sayD.y);
  await D.mouse.down();
  await D.mouse.move(sayD.x + 40, sayD.y - 60, { steps: 5 });
  await D.waitForTimeout(900);
  const said = (await D.$$eval("[data-mic-hint]", (els) => els.map((el) => el.textContent).join(" "))) ?? "";
  check("микрофон не дали — жест говорит, почему", /микрофон/i.test(said), said);
  check("…и зон при отказе не рисует", (await D.$("[data-mic-drop]")) === null);
  await D.mouse.up();
  await D.close();
}

// 5б. РЕЧЬ ИДЁТ В ОДНО ОКНО — то, в котором человек сейчас. Иначе он слышит её дважды со сдвигом, то есть
// с эхо, и виноватым выглядит говорящий.
{
  const sayA2 = await sayAt(A);
  await A.mouse.move(sayA2.x, sayA2.y);
  await A.mouse.down();
  await A.waitForTimeout(150);
  const mid = (await spots(A)).middle;
  await A.mouse.move(mid.x, mid.y, { steps: 6 });
  await A.waitForTimeout(300);
  check("микрофон наведён на сукно", (await live(A)).talking.length >= 1, await live(A));
  const reached = await flowed(now, keyA0, TALK, 4000);
  const heardOld = await flow(old, keyA0);
  await A.mouse.up();
  check("речь дошла до того окна, в котором человек сейчас", reached, { heardOld, a: await live(A), cancels: await A.evaluate(() => window.__cancels) });
  check("…и не двоится вторым его же окном", heardOld < HUSH, { heardOld });
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

// 7. ГЛУШИЛКА ПРОВЕРЯЕТСЯ ГРОМКОСТЬЮ, А НЕ СЕРЫМ ПОЛЗУНКОМ: настройка ложится на элемент звука, и если её
// не переложить на уже звучащий, человек выключает голоса и продолжает всё слышать. Смотрим у Б — до него
// речь А дошла по-настоящему, значит элемент у него есть.
{
  const vols = () => B.$$eval("audio", (els) => els.map((el) => el.volume));
  const loudest = async () => Math.max(0, ...(await vols()));
  check("чужой голос звучит, пока его не глушили", (await vols()).length > 0 && (await loudest()) > 0, await vols());

  await B.click("[data-settings]");
  await B.waitForSelector("[data-settings-panel]");
  await B.click("[data-look=voiceMute]");
  await B.waitForTimeout(200);
  check("выключил голосовые — чужой голос стих на деле", (await loudest()) === 0, await vols());
  await B.click("[data-look=voiceMute]");
  await B.waitForTimeout(200);
  check("вернул голосовые — снова слышно", (await loudest()) > 0, await vols());
  await B.click("[data-settings-close]");
  await B.waitForTimeout(200);

  // «Не слушать этого» — та же беда порознь: она живёт у стула, а не в настройках.
  // Здесь смотрим ГОЛОС ИМЕННО А: глушилка личная, и «стало тише везде» её бы не доказало.
  const volA = () => B.$eval(`audio[data-voice="${keyA0}"]`, (el) => el.volume);
  const seatA = (await spots(B)).seats.find((s) => s.who === "A");
  await B.mouse.click(seatA.x, seatA.y);
  await B.waitForSelector("[data-voice-mute]");
  await B.click("[data-voice-mute]");
  await B.waitForTimeout(200);
  check("заглушил человека — его голос стих на деле", (await volA()) === 0, await vols());
  await B.click("[data-voice-mute]");
  await B.waitForTimeout(200);
  check("снял глушилку — он снова слышен", (await volA()) > 0, await vols());

  // ТИШИНА — ФЛАЖКОМ, А НЕ НУЛЁМ: на айфоне громкость элемента принадлежит качельке сбоку, и ноль от
  // страницы там просто выбрасывается. Ноль проверен выше; здесь — что рядом с ним стоит `muted`.
  const mutedA = () => B.$eval(`audio[data-voice="${keyA0}"]`, (el) => el.muted);
  await B.click("[data-voice-mute]");
  await B.waitForTimeout(200);
  check("заглушённый элемент помечен немым, а не просто тихим", await mutedA(), { volume: await volA() });

  // ГЛУШИТЬ МОЖНО ПРЯМО ПОСРЕДИ РЕЧИ. Пока человек говорит, кадр идёт под каждое колебание голоса; если
  // при этом переписывать разметку, кнопка исчезает из-под пальца и нажатие не доходит никогда.
  // Начинаем С ИЗВЕСТНОГО СОСТОЯНИЯ, а не «ещё одно нажатие от прошлого»: одно потерянное нажатие выше — и
  // всё дальше проверялось бы наоборот.
  for (let i = 0; i < 4 && (await mutedA()); i += 1) {
    await B.click("[data-voice-mute]");
    await B.waitForTimeout(200);
  }
  check("перед речью его слышно", (await mutedA()) === false, { volume: await volA() });
  // У А с прошлого раздела открыты настройки — они накрывают 💬, и жест ушёл бы в них.
  await A.click("[data-settings-close]");
  await A.waitForTimeout(300);
  const say7 = await sayAt(A);
  await A.mouse.move(say7.x, say7.y);
  await A.mouse.down();
  await A.waitForTimeout(150);
  await A.mouse.move(say7.x + 40, say7.y - 60, { steps: 5 });
  await A.mouse.move(195, 300, { steps: 6 });
  await A.waitForTimeout(600);
  check("он и правда говорит прямо сейчас", (await live(A)).talking.length >= 1, await live(A));
  // ПАЛЬЦЕМ, А НЕ `click()`: тот ждёт, пока кнопка устоится, и перерисовку под собой прощает. Палец не
  // прощает — нажатие начинается на одной кнопке, а заканчивается на другой, и click не случается вовсе.
  const tapMute = async () => {
    const b = await boxOf(B, "[data-voice-mute]");
    await B.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await B.mouse.down();
    await B.waitForTimeout(60);
    await B.mouse.up();
    await B.waitForTimeout(300);
  };
  // НИЧТО НЕ ХОДИТ ХОДУНОМ ПОД ЧУЖУЮ РЕЧЬ. Аватар дышит и пускает кольца на холсте; если это дыхание
  // просачивается в раскладку, слой поверх холста перестраивается по нескольку раз в секунду — и любая
  // кнопка исчезает из-под пальца между нажатием и отпусканием.
  const still = await B.evaluate(async () => {
    const btn = document.querySelector("[data-voice-mute]");
    const over = btn.closest("[data-g='tip']").parentElement;
    const was = over.innerHTML;
    let rebuilt = 0;
    const eye = new MutationObserver((ms) => { for (const m of ms) rebuilt += m.addedNodes.length; });
    eye.observe(over, { childList: true });
    await new Promise((go) => setTimeout(go, 1000));
    eye.disconnect();
    return { same: was === over.innerHTML, rebuilt, alive: btn.isConnected };
  });
  check("под чужую речь слой поверх стола не перестраивается", still.rebuilt === 0, still);
  check("…и кнопка под пальцем остаётся той же самой", still.alive && still.same, still);

  await tapMute();
  check("заглушил его посреди речи", await mutedA(), { volume: await volA(), a: await live(A) });
  await tapMute();
  check("и вернул слух, не дожидаясь, пока он замолчит", (await mutedA()) === false, { volume: await volA() });

  // ПАЛЕЦ ПОДНЯТ — ЗАПИСЬ ЗАКРЫТА ТУТ ЖЕ. Ждём меньше, чем длилась прежняя отсрочка: она горела точкой
  // записи на телефоне при уже закрытом рте, и человек читал это как «оно меня всё ещё слушает».
  await A.mouse.up();
  await A.waitForTimeout(150);
  check("отпустил палец — микрофон отдан системе сразу", (await live(A)).open === false, await live(A));
}

// ОТЧЁТ ПЕЧАТАЕТСЯ ДО ЗАКРЫТИЯ БРАУЗЕРА: живые голосовые связи не дают ему закрыться быстро, и прогон
// раньше молча висел — с полным набором пройденных проверок в памяти и без единой строки на экране.
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableVoice ${checks.filter((c) => c.ok).length}/${checks.length}`);
await Promise.race([browser.close(), new Promise((go) => setTimeout(go, 3000))]);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
