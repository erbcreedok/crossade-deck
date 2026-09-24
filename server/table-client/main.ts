// ВХОД В СТОЛ — решает, откуда стол, и больше ничего.
//
//   ?stand                         стенд: стол в этой вкладке, за ним боты
//   в Telegram (Mini App)          дверь `telegram`, комната — `start_param` (или `?room=`)
//   в браузере                     дверь `guest`: пустит, только если серверу это разрешено

import { ROOM_CLOSED, STALE_CLIENT, type JoinOptions } from "../src/table/contract.js";
import { localStore } from "./localStore.js";
import { netStore } from "./netStore.js";
import { loadingCross } from "../../look/src/loading.js";
import { mountGround } from "./ground.js";
import { mountScreen } from "./screen.js";
import type { TableStore } from "./store.js";
import type { Intent } from "../src/table/contract.js";
import { watchScreen, witnessed, type ScreenHealth } from "./watch.js";

interface TelegramWebApp {
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

const telegram = (globalThis as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
const stage = document.getElementById("stage")!;
const params = new URLSearchParams(location.search);

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

async function open(): Promise<TableStore> {
  if (params.has("stand")) return localStore();
  const room = telegram?.initDataUnsafe.start_param || params.get("room") || params.get("tgWebAppStartParam");
  if (!room) throw new Error("Нет комнаты. Открой стол по ссылке из чата.");
  const options: JoinOptions = telegram?.initData
    ? { room, client: "html", door: "telegram", initData: telegram.initData }
    : { room, client: "html", door: "guest", name: params.get("name") ?? "Гость" };
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
document.addEventListener(
  "touchmove",
  (e) => {
    if (!(e.target as Element | null)?.closest?.("[data-scroll]")) e.preventDefault();
  },
  { passive: false },
);
mountGround(stage);
// ЛОАДЕР ХАБА — до входа и до последней картинки колоды. Поверх всего: у стола свои слои выше.
const loading = loadingCross(document.body, "Загружаю стол");
(document.body.lastElementChild as HTMLElement).style.zIndex = "1000";

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

open()
  .then((store) => {
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
      say("Стол закрыт.");
    });
    // СВЯЗЬ ПРОПАЛА — стол тот же и вернётся сам: человеку нужно только знать, что он сейчас не в игре.
    store.onLink?.((up) => {
      if (gone) return;
      if (up) document.getElementById("note")!.hidden = true;
      else say("Связь пропала. Возвращаюсь за стол…");
    });
    return screen.ready.then(() => loading.done());
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
    say(/who are you|unsigned/.test(text) ? "Сюда так не войти. Открой стол по ссылке из чата." : text);
  });
