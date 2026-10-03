// ВХОД В СТОЛ — решает, откуда стол, и больше ничего.
//
//   ?stand                         стенд: стол в этой вкладке, за ним боты
//   в Telegram (Mini App)          дверь `telegram`, комната — `start_param` (или `?room=`)
//   в браузере                     дверь `guest`: пустит, только если серверу это разрешено

import { guestIdFor } from "./guestId.js";
import { mountLogin } from "./login.js";
import { menuUrl, nativeShell } from "./arNative.js";
import { ROOM_CLOSED, STALE_CLIENT, type JoinOptions } from "../src/table/contract.js";
import { localStore } from "./localStore.js";
import { linkLog, netStore } from "./netStore.js";
import { loadingCross } from "../../look/src/loading.js";
import { mountGround } from "./ground.js";
import { startFullscreen, type FullscreenApp } from "./fullscreen.js";
import { mountScreen } from "./screen.js";
import { mountRooms } from "./rooms.js";
import type { TableStore } from "./store.js";
import type { Intent } from "../src/table/contract.js";
import { watchScreen, witnessed, type ScreenHealth } from "./watch.js";
import { lagFromUrl, slowed } from "./lag.js";

interface TelegramWebApp extends FullscreenApp {
  BackButton?: { show(): void; onClick(fn: () => void): void };
  initData: string;
  initDataUnsafe: { start_param?: string };
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
}

/** Перезагрузка за свежей сборкой — не чаще раза за вкладку. Хранилище может быть закрыто: тогда не пробуем вовсе. */
const stale = {
  tried(): boolean {
    try {
      return sessionStorage.getItem("table.stale") !== null;
    } catch {
      return true;
    }
  },
  reload(): void {
    sessionStorage.setItem("table.stale", "1");
    location.reload();
  },
};

// SDK TELEGRAM ГРУЗИТСЯ В ФОНЕ (`index.html`): стол ждёт его не дольше `TG_WAIT_MS`. Не пришёл — вход
// берётся из адреса, куда Telegram кладёт подпись (`#tgWebAppData`), а вибрация и прочее SDK — когда дойдёт.
const TG_WAIT_MS = 2500;
/** ЭТАПЫ ВХОДА — мс от начала загрузки страницы; уходят в журнал записью `boot` (`bootStages`). */
const marks: Record<string, number> = { run: Math.round(performance.now()) };
await Promise.race([(globalThis as { __tg?: Promise<void> }).__tg, new Promise((r) => setTimeout(r, TG_WAIT_MS))]);
marks.tg = Math.round(performance.now());
const telegram = (globalThis as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
const hashData = new URLSearchParams(location.hash.slice(1)).get("tgWebAppData") ?? "";
const initData = telegram?.initData || hashData;
const startParam = telegram?.initDataUnsafe.start_param || new URLSearchParams(hashData).get("start_param") || undefined;
const stage = document.getElementById("stage")!;
const params = new URLSearchParams(location.search);
/**
 * КАКОЙ СТОЛ. Адрес страницы — первым: список комнат уводит в стол адресом, а Telegram после этого всё
 * ещё помнит параметр запуска (`start_param`) той ссылки, с которой мини-апп открыли. `?rooms` — назад
 * к списку, даже если мини-апп открыли ссылкой на стол.
 */
/** Приставка 3D-входа в `startapp` (кнопка бота «В 3D»): за ней — обычное имя комнаты. */
const THREE_D = "3d_";
const startAsked = startParam ?? params.get("tgWebAppStartParam") ?? "";
if (!params.has("room") && startAsked.startsWith(THREE_D)) {
  // Тот же вход, другой экран: адрес с `#` (подпись Telegram) уходит целиком, а 3D-вид сам снимет приставку.
  location.replace(`/table/3d${location.search}${location.hash}`);
  await new Promise(() => {});
}
const roomAsked = params.has("rooms") ? null : params.get("room") || startParam || params.get("tgWebAppStartParam");

/**
 * ВЫХОД В МЕНЮ ИЗ НЕОТКРЫВШЕГОСЯ СТОЛА — в приложении. У Telegram на такой случай есть его «назад» и крестик,
 * у приложения — только это: иначе упавший или зависший вход запирал человека на экране загрузки.
 */
function menuExit(): void {
  if (!nativeShell() || document.querySelector("[data-menu-exit]")) return;
  const exit = document.createElement("a");
  exit.dataset.menuExit = "";
  exit.href = menuUrl();
  exit.textContent = "‹ В меню";
  exit.style.cssText = "position:fixed;left:50%;bottom:calc(40px + var(--tg-safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1000;"
    + "padding:12px 20px;border-radius:12px;background:#f0c86a;color:#0b0704;font:400 15px Tiny5,monospace;text-decoration:none";
  document.body.append(exit);
}

function say(text: string): void {
  const note = document.getElementById("note")!;
  note.textContent = text;
  note.hidden = false;
}

/**
 * ЗАКРЫТЫЙ СТОЛ — ЭКРАН, А НЕ СТРОКА ОШИБКИ.
 *
 * По старой ссылке человек попадал сюда молча: раньше — за подменённый стол с чужим именем, потом —
 * на голую строку посреди чёрного поля. И то и другое читается как поломка. Закрытый стол — не
 * поломка, а обычный конец: стол убрали, и об этом надо сказать так же спокойно, как сказал бы
 * человек за настоящим столом.
 */
function closedTable(): void {
  const note = document.getElementById("note")!;
  note.innerHTML = `<div style="max-width:320px;display:flex;flex-direction:column;gap:14px;align-items:center">`
    + `<div style="width:76px;height:76px;border-radius:50%;display:grid;place-items:center;`
    + `background:linear-gradient(#2a3a30,#16231d);box-shadow:inset 0 0 0 3px #0b0704,inset 0 0 0 5px #3c5245">`
    + `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#cdb98f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">`
    + `<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>`
    + `<div style="font-size:18px;color:#f5ead0">Стол закрыт</div>`
    + `<div style="font-size:14px;line-height:1.5;color:#9aa3a1">Его убрали со стола. Карты этой партии уже не вернуть — открой новый стол в чате с ботом.</div>`
    + `</div>`;
  note.hidden = false;
}

/** Дольше этого после входа заставка не ждёт картинок и лиц (шрифт она ждёт всегда). */
const READY_CAP_MS = 3000;
/** Запросы страницы дольше `SLOW_MS` — адрес без запроса (там бывают подписи) и сколько шёл. */
const SLOW_MS = 1500;
function slowLoads(): { url: string; ms: number }[] {
  return (performance.getEntriesByType?.("resource") ?? [])
    .filter((e) => e.duration > SLOW_MS)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 8)
    .map((e) => ({ url: e.name.split("?")[0]!.slice(0, 120), ms: Math.round(e.duration) }));
}

/**
 * ГДЕ ШЛО ВРЕМЯ ВХОДА, по этапам — мс от начала загрузки страницы:
 *   native  — сколько приложение ждало до запроса страницы (его отметка `__nativeAt`, если есть);
 *   dns, tls, html, dom — страница: адрес, соединение, пришёл HTML, разобран;
 *   js      — скрипт стола: начал и кончил качаться, из кэша ли;
 *   run, tg — скрипт пошёл; дождались SDK Telegram;
 *   connect, joined — вход на сервер начат и принят;
 *   fonts, ready — шрифт и всё, что рисует экран (колода, лица, куклы).
 */
function bootStages(): Record<string, unknown> {
  const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  const js = (performance.getEntriesByType?.("resource") as PerformanceResourceTiming[] | undefined)?.find((e) => /\/app\.js/.test(e.name));
  const r = (v: number | undefined) => (v === undefined ? undefined : Math.round(v));
  const nativeAt = (globalThis as { __nativeAt?: number }).__nativeAt;
  return {
    ...(nativeAt ? { native: Math.round(performance.timeOrigin - nativeAt) } : {}),
    ...(nav ? { dns: r(nav.domainLookupEnd), tls: r(nav.connectEnd), ttfb: r(nav.responseStart), html: r(nav.responseEnd), dom: r(nav.domInteractive) } : {}),
    ...(js ? { js: [r(js.startTime), r(js.responseEnd)], jsCached: js.transferSize === 0, jsKb: Math.round(js.transferSize / 1024) } : {}),
    ...marks,
    ...(linkLog.length ? { link: linkLog } : {}),
  };
}

async function open(): Promise<TableStore> {
  if (params.has("stand")) return slowed(localStore(), lagFromUrl(location.search));
  const room = roomAsked;
  if (!room) throw new Error("Нет комнаты. Открой стол по ссылке из чата.");
  // Пропуск в адресе — стол открыт в приложении Crossade (`appPass.ts`): подписи Telegram там нет.
  const pass = params.get("pass"), key = params.get("key");
  const options: JoinOptions = initData
    ? { room, client: "html", door: "telegram", initData }
    : key || pass
      ? { room, client: nativeShell() ? "ios" : "html", door: "app", ...(key ? { key } : { pass: pass! }) }
      : { room, client: "html", door: "guest", name: params.get("name") ?? "Гость", guestId: guestIdFor(params.get("name") ?? "Гость") };
  return netStore(options);
}

// СВАЙП ВНИЗ НЕ ЗАКРЫВАЕТ СТОЛ — в три слоя, потому что каждый закрывает свою дыру:
//   1. `disableVerticalSwipes` — сам Telegram перестаёт ловить жест (клиенты с Bot API 7.7+);
//   2. `touchmove` отменяется у документа — старый клиент и iOS не получают ни прокрутки, ни резинки,
//      за которую Telegram тянет окно (слушатель НЕ пассивный, иначе отмена молча не работает).
//      ИСКЛЮЧЕНИЕ — окна, которые прокручиваются сами (`[data-scroll]`, например настройки): там палец
//      ведёт содержимое окна, а не стол, и отменять его нечего;
//   3. CSS в `index.html` — страница не прокручивается, и тянуть её не за что.
telegram?.ready();
telegram?.expand();
telegram?.disableVerticalSwipes?.();
startFullscreen(telegram);
document.addEventListener(
  "touchmove",
  (e) => {
    if (!(e.target as Element | null)?.closest?.("[data-scroll]")) e.preventDefault();
  },
  { passive: false },
);
mountGround(stage);
// ЛОАДЕР ХАБА — до входа и до последней картинки колоды. Поверх всего: у стола свои слои выше.
// Крест уже висит — он в самой странице (`index.html`), и `loadingCross` подхватывает его, а не рисует второй.
// ПОДПИСЬ — ЧТО ИДЁТ СЕЙЧАС: страница говорила «Загружаю скрипты», скрипт пришёл — дальше вход на сервер,
// потом сама комната (колода, куклы, шрифт).
const loading = loadingCross(document.body, "Подключаюсь к серверу");
document.querySelector<HTMLElement>("body > .crossade-loading")!.style.zIndex = "1000";

// ЖУРНАЛ ЭКРАНА НАЧИНАЕТСЯ ДО ВХОДА: падение при загрузке — тоже рассказ, и именно его разобрать
// труднее всего. Пока хранилища нет, рассказывать некуда, и пачка ждёт в памяти до первого `tell`
// после входа.
let tellStore: TableStore | undefined;
let screenHealth: ScreenHealth | undefined;
const witness = watchScreen((seen) => tellStore?.log(seen), {
  sound: () => screenHealth?.sound() ?? null,
  voice: () => screenHealth?.voice() ?? null,
  links: () => screenHealth?.links() ?? null,
});

// БЕЗ ССЫЛКИ НА СТОЛ — «Мои комнаты» (`rooms.ts`): кнопка меню, ярлык, профиль бота.
const choosing = !params.has("stand") && !roomAsked;
// ВХОД ЧЕРЕЗ TELEGRAM для приложения Crossade (`login.ts`) — вместо списка.
if (choosing && params.has("login")) {
  loading.done();
  mountLogin(document.body, params.get("bot") || "CrossaderBot");
} else if (choosing) {
  loading.done();
  mountRooms(document.body, telegram);
}
// ИЗ СПИСКА В СТОЛ — кнопка «назад» Telegram возвращает к списку.
if (params.get("from") === "rooms" && telegram?.BackButton) {
  telegram.BackButton.onClick(() => void (location.href = "?rooms"));
  telegram.BackButton.show();
}

// ЗАВИС ВХОД — через 10 с в приложении появляется выход в меню; открылся стол — таймер снят.
const stuck = choosing ? 0 : setTimeout(menuExit, 10_000);

marks.connect = Math.round(performance.now());
(choosing ? new Promise<TableStore>(() => {}) : open())
  .then((store) => {
    // Стол открылся — выход в меню больше не нужен, даже если вход шёл дольше десяти секунд и он успел появиться.
    clearTimeout(stuck);
    document.querySelector("[data-menu-exit]")?.remove();
    tellStore = store;
    document.title = store.title;
    const screen = mountScreen(stage, witnessed(store, witness), witness);
    screenHealth = screen.health;
    // Окошко для отладки и сторожей — как у звука и голоса (`__tableAudio`, `__tableMesh`).
    (globalThis as { __tableScreen?: { destroy(): void } }).__tableScreen = screen;
    // ТО ЖЕ ОКОШКО ДЛЯ НАМЕРЕНИЙ. Прогоны действуют пальцем там, где проверяют палец; но закон вроде
    // «стрелка переезжает после изменения круга» — не про палец, и тащить ради него карту мышью
    // значит мерить заодно и перетаскивание. Здесь намерение уходит тем же путём, что от пальца.
    (globalThis as { __tableSend?: (intent: Intent) => void }).__tableSend = (intent) => store.send(intent);
    // И СТОЛ, КАКИМ ЕГО ВИДИТ ЭТОТ ЗРИТЕЛЬ — прорезанный под него сервером, тот самый, по которому
    // рисуется экран. Дырки в чужие карты здесь нет: что прислано, то и видно на экране.
    (globalThis as { __tableState?: () => unknown }).__tableState = () => store.state;
    let gone = false;
    store.onGone(() => {
      gone = true;
      // Стола больше нет — экран снимает с окна всё, что на него вешал.
      screen.destroy();
      say("Комната закрыта.");
    });
    // СВЯЗЬ ПРОПАЛА — стол тот же и вернётся сам: человеку нужно только знать, что он сейчас не в игре.
    store.onLink?.((up) => {
      if (gone) return;
      if (up) document.getElementById("note")!.hidden = true;
      else say("Связь пропала. Возвращаюсь в комнату…");
    });
    // ЗАСТАВКА ЖДЁТ КОЛОДУ, ШРИФТ И ЛИЦА — НО НЕ ДОЛЬШЕ `READY_CAP_MS` ПОСЛЕ ВХОДА. Один зависший запрос
    // (аватарка с t.me, шрифт, картинка через туннель) иначе держит весь стол за заставкой сколько угодно;
    // недогруженное дорисуется само, когда придёт.
    const joined = performance.now();
    marks.joined = Math.round(joined);
    void (globalThis as { __fonts?: Promise<void> }).__fonts?.then(() => { marks.fonts = Math.round(performance.now()); });
    loading.say("Загружаю комнату");
    // Шрифт — без потолка: он с нашего адреса, и чужого начертания не должно быть видно ни мига.
    const shown = Promise.all([
      (globalThis as { __fonts?: Promise<void> }).__fonts,
      Promise.race([screen.ready.then(() => "ready" as const), new Promise<"cap">((r) => setTimeout(() => r("cap"), READY_CAP_MS))]),
    ]).then(([, how]) => how);
    return shown.then((how) => {
      marks.ready = Math.round(performance.now());
      loading.done();
      // СКОЛЬКО ОТКРЫВАЛСЯ СТОЛ — в журнал экрана, с самыми медленными запросами: «грузится долго» на
      // чужом телефоне иначе не разобрать.
      witness.saw("boot", { ms: Math.round(performance.now()), joined: Math.round(joined), how, slow: slowLoads(), stages: bootStages() });
      witness.tell();
      if (how === "cap") void screen.ready.then(() => witness.saw("boot.late", { ms: Math.round(performance.now()), slow: slowLoads() }));
    });
  })
  .catch((err: unknown) => {
    loading.done();
    const text = err instanceof Error ? err.message : String(err);
    // СЕРВЕР УШЁЛ ВПЕРЁД, а телефон держит старую сборку: перезагрузка — один раз, иначе при настоящей
    // несовместимости страница крутилась бы вечно.
    if (text.includes(STALE_CLIENT) && !stale.tried()) return void stale.reload();
    witness.saw("open.failed", { text: text.slice(0, 300) });
    witness.tell();
    // ЗАКРЫТЫЙ СТОЛ — ОТДЕЛЬНОЕ СЛОВО. Раньше по старой ссылке молча заводился новый стол, и человек
    // не понимал, куда делся его: имя другое, карт нет, и он там никто.
    if (text.includes(ROOM_CLOSED)) return void closedTable();
    say(/who are you|unsigned/.test(text) ? (nativeShell() ? "Сюда так не войти: пропуск устарел." : "Сюда так не войти. Открой стол по ссылке из чата.") : text);
    menuExit();
  });
