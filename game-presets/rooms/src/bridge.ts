// МОСТ МЕЖДУ ХАБОМ И ИГРОЙ — экран, на котором выбирают стол.
//
// Внутрь ему дают: список комнат, кто смотрит и что ответил сервер. Наружу он отдаёт три вещи:
// ВОЙТИ В КОМНАТУ, СОЗДАТЬ ТАКУЮ и СТОЛ БЕЗ КОМНАТЫ. Больше он не умеет ничего и знать о нашем
// сервере не должен: тот же мост открывается из игры на её собственном URL, где хаба нет вовсе.
//
// Экраны переключаются внутри (список / найти / создать) — это не места в адресе: адрес называет
// стол, а не то, каким путём к нему шли.

import { PALETTE, tint } from "@crossade/look";
import { btn, esc, FONT, SEATS_MAX, SEATS_MIN } from "./parts.js";
import { chipsHtml, createHtml, findHtml, listHtml, nothingHtml } from "./screens.js";
import {
  chipsOf,
  fits,
  NO_FILTERS,
  type Answer,
  type Filters,
  type Mode,
  type NewTable,
  type Openness,
  type Room,
  type Who,
} from "./rooms.js";

export interface BridgeGame {
  readonly id: string;
  readonly name: string;
  readonly sign: string;
}

export interface BridgeOptions {
  /** Игры, которые мост умеет показывать. Первая — та, под которую открывают стол. */
  readonly games: readonly BridgeGame[];
  /** Под какую игру этот мост. Пусто — общий список, и тогда в строке пишется имя игры. */
  readonly game?: string | undefined;
  /** Войти в комнату с этим кодом. */
  readonly onEnter: (code: string) => void;
  /** Создать такую комнату — и сесть за неё. */
  readonly onCreate: (table: NewTable) => void;
  /** Стол без комнаты: как косынка — один, ни с кем, без кода. */
  readonly onSolo: () => void;
  /** Дай ещё один свободный код. Мост не выдумывает коды сам — он их только показывает. */
  readonly freshCode: () => Promise<string | undefined>;
  /** Где мост берёт напечатанное. По умолчанию — окно ввода браузера. */
  readonly ask?: ((question: string, now: string) => Promise<string | undefined>) | undefined;
}

export interface Bridge {
  readonly element: HTMLElement;
  /** Показать мост: комнаты, кто смотрит, что ответил сервер. */
  show(o: { rooms: readonly Room[]; who: Who; answer?: Answer; code?: string; said?: string }): void;
  hide(): void;
  readonly shown: boolean;
  stop(): void;
}

const askInWindow = async (question: string, now: string): Promise<string | undefined> => {
  const said = globalThis.prompt?.(question, now);
  return said === null ? undefined : (said ?? undefined);
};

export function roomsBridge(container: HTMLElement, o: BridgeOptions): Bridge {
  const ask = o.ask ?? askInWindow;

  let shown = false;
  let screen: "list" | "find" | "create" = "list";
  let rooms: readonly Room[] = [];
  let who: Who = "guest";
  let answer: Answer = "loading";
  let openCode: string | undefined;
  let typed = "";
  let filters: Filters = NO_FILTERS;
  let applied = false;
  /** Код будущего стола — выданный заранее, чтобы его можно было отправить другу до создания. */
  let code = "";
  /** Что сказать тому, кто пришёл сюда не сам: «стол закрылся», «не вышло открыть». */
  let said = "";
  let openness: Openness = "code";
  let mode: Mode = "free";
  let seats = 4;
  let forever = false;
  let stopped = false;

  const element = document.createElement("div");
  element.className = "crossade-rooms";
  element.style.cssText = "position:absolute;inset:0;z-index:11;pointer-events:none";
  container.appendChild(element);

  const gameOf = (id: string | undefined): BridgeGame => o.games.find((one) => one.id === id) ?? o.games[0]!;
  const nameOfGame = (id: string): string => o.games.find((one) => one.id === id)?.name ?? id;
  /** Общий список — тот, где игры разные: тогда имя игры пишется в каждой строке. */
  const mixed = (): boolean => !o.game;

  const seen = (): readonly Room[] => (applied ? rooms.filter((room) => fits(room, filters)) : rooms);

  const barHtml = (count: number): string =>
    `<div data-g="bar" style="position:absolute;left:0;right:0;top:0;z-index:9;padding-top:env(safe-area-inset-top, 0px);` +
    `background:${tint(PALETTE.black, 0.42)};backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)">` +
    `<div style="display:flex;align-items:center;gap:8px;height:44px;padding:0 10px">` +
    `<button data-do="back" style="cursor:pointer;border:0;display:flex;align-items:center;justify-content:center;width:32px;height:28px;` +
    `box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.wood};background:linear-gradient(#25321f,#16210f)">` +
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${PALETTE.ink}" stroke-width="2.2" stroke-linecap="round">` +
    `<path d="M15 5 8 12l7 7"/></svg></button>` +
    `<span style="font:400 13px ${FONT};letter-spacing:.08em;color:${PALETTE.gold}">${esc(titleOf())}</span>` +
    `<span style="flex:1"></span>` +
    (screen === "list" && answer === "rooms"
      ? `<span style="font:400 11px ${FONT};color:${PALETTE.inkDim}">${count} комнат</span>`
      : "") +
    `</div></div>`;

  const titleOf = (): string =>
    screen === "find" ? "НАЙТИ КОМНАТУ" : screen === "create" ? "НОВЫЙ СТОЛ" : mixed() ? "КОМНАТЫ" : gameOf(o.game).name.toUpperCase();

  const listBodyHtml = (): string => {
    const chips = applied ? chipsOf(filters, nameOfGame) : [];
    if (answer === "loading") return nothingHtml("⏳", "Спрашиваем сервер,<br>кто сейчас за столами…");
    if (answer === "silent") {
      return nothingHtml(
        "⚡",
        "Сервер не отвечает.<br>Комнат не видно — но стол<br>можно открыть и одному.",
        btn("retry", "Ещё раз", "gold", true) + btn("solo", "Играть одному", "plain", true),
      );
    }
    const found = seen();
    if (found.length === 0 && chips.length > 0) {
      return nothingHtml(
        "🔍",
        `Под эти условия не подошёл ни один стол.<br>Всего открыто ${rooms.length}.`,
        btn("chip:all", "Снять фильтры", "gold", true) + btn("create", "Создать свой", "plain", true),
      );
    }
    if (found.length === 0) {
      return nothingHtml(
        "🕸",
        who === "guest"
          ? "Открытых столов сейчас нет.<br>Создай свой — или войди,<br>чтобы видеть столы друзей."
          : "Открытых столов сейчас нет.<br>Создай свой — к нему придут.",
        btn("create", "Создать стол", "gold", true) + btn("find", "Ввести код", "plain", true),
      );
    }
    return listHtml(found, openCode, mixed(), who);
  };

  const bottomHtml = (): string =>
    screen !== "list"
      ? ""
      : `<div data-g="bottom" style="position:absolute;left:0;right:0;bottom:0;z-index:9;` +
        `padding:10px 12px calc(12px + env(safe-area-inset-bottom, 0px));background:${tint(PALETTE.black, 0.62)};` +
        `backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;gap:8px">` +
        `<span style="flex:1">${btn("find", "Найти", "plain")}</span>` +
        `<span style="flex:1">${btn("create", "Создать", "gold")}</span>` +
        `<span style="flex:none">${btn("solo", "Одному", "quiet")}</span></div>`;

  const html = (): string => {
    if (!shown) return "";
    const chips = applied ? chipsOf(filters, nameOfGame) : [];
    // СКАЗАННОЕ СТОИТ НАД СПИСКОМ, А НЕ ПОД НИМ: человек пришёл сюда не сам — его сюда вернули, и
    // первое, что он должен прочесть, это почему.
    const saidHtml = said
      ? `<div style="background:${PALETTE.well};box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.gold};` +
        `border-radius:12px;padding:12px 14px;font:400 13px ${FONT};color:${PALETTE.gold};line-height:1.6">${esc(said)}</div>`
      : "";
    const body =
      screen === "list"
        ? `<div style="display:flex;flex-direction:column;gap:9px;padding:0 12px 16px">${saidHtml}${chipsHtml(chips)}${listBodyHtml()}</div>`
        : screen === "find"
          ? findHtml(typed, filters, o.games)
          : createHtml(gameOf(o.game), code, openness, mode, seats, forever);
    return (
      `<div data-g="rooms" style="position:absolute;inset:0;z-index:20;pointer-events:auto;background:${PALETTE.felt}">` +
      barHtml(seen().length) +
      `<div data-g="body" style="position:absolute;left:0;right:0;top:0;bottom:0;overflow:auto;` +
      `padding-top:calc(env(safe-area-inset-top, 0px) + 52px);padding-bottom:${screen === "list" ? "84px" : "24px"}">${body}</div>` +
      bottomHtml() +
      `</div>`
    );
  };

  const draw = (): void => {
    if (stopped) return;
    element.innerHTML = html();
    for (const slider of element.querySelectorAll<HTMLInputElement>("[data-slider]")) {
      const id = slider.dataset["slider"]!;
      // ПОКА ТЯНУТ — МЕНЯЕМ ТОЛЬКО ЧИСЛО. Пересборка разметки на каждый пиксель отрывает палец от
      // ползунка: элемент, который тянули, к следующему кадру уже другой.
      slider.oninput = () => {
        const value = Number(slider.value);
        if (id === "seats") seats = value;
        else filters = { ...filters, seatsFrom: value };
        const shows = element.querySelector(`[data-g="${id}-value"]`);
        if (shows) shows.textContent = String(value);
      };
      slider.onchange = () => draw();
    }
  };

  /** Число, названное с клавиатуры: тот же ответ, что и у ползунка, но когда оно уже известно. */
  const askNumber = async (question: string, now: number): Promise<number | undefined> => {
    const said = await ask(`${question} (${SEATS_MIN}–${SEATS_MAX})`, String(now));
    const n = Number(said);
    if (!Number.isFinite(n) || n < SEATS_MIN || n > SEATS_MAX) return undefined;
    return Math.round(n);
  };

  const toCreate = async (): Promise<void> => {
    screen = "create";
    // КОД БЕРЁТСЯ ДО ЭКРАНА, А НЕ ПРИ НАЖАТИИ «СОЗДАТЬ»: его показывают, чтобы отправить другу
    // раньше, чем сядут за стол.
    if (!code) code = (await o.freshCode()) ?? "";
    draw();
  };

  const act = async (what: string): Promise<void> => {
    const colon = what.indexOf(":");
    const name = colon < 0 ? what : what.slice(0, colon);
    const value = colon < 0 ? "" : what.slice(colon + 1);

    if (name === "back") {
      if (screen === "list") hide();
      else {
        screen = "list";
        draw();
      }
      return;
    }
    if (name === "find") {
      screen = "find";
      draw();
      return;
    }
    if (name === "create") {
      await toCreate();
      return;
    }
    if (name === "solo") {
      hide();
      o.onSolo();
      return;
    }
    if (name === "retry") {
      answer = "loading";
      draw();
      return;
    }
    if (name === "enter") {
      hide();
      o.onEnter(value);
      return;
    }
    if (name === "info") {
      openCode = openCode === value ? undefined : value;
      draw();
      return;
    }
    if (name === "found") {
      applied = true;
      screen = "list";
      draw();
      return;
    }
    if (name === "type" || name === "byCode") {
      const said = (await ask("Код комнаты", typed))?.trim().toUpperCase();
      if (!said) return;
      typed = said.slice(0, 8);
      draw();
      if (name === "byCode" || typed.length >= 4) {
        hide();
        o.onEnter(typed);
      }
      return;
    }
    if (name === "fGame") {
      filters = { ...filters, game: value };
      draw();
      return;
    }
    if (name === "fMode") {
      filters = { ...filters, mode: value as Filters["mode"] };
      draw();
      return;
    }
    if (name === "fFree") {
      filters = { ...filters, onlyFree: !filters.onlyFree };
      draw();
      return;
    }
    if (name === "fSeats") {
      const n = await askNumber("От скольких мест?", filters.seatsFrom);
      if (n) filters = { ...filters, seatsFrom: n };
      draw();
      return;
    }
    if (name === "chip") {
      if (value === "all") {
        filters = NO_FILTERS;
        applied = false;
      } else if (value === "game") filters = { ...filters, game: "any" };
      else if (value === "seatsFrom") filters = { ...filters, seatsFrom: 2 };
      else if (value === "onlyFree") filters = { ...filters, onlyFree: false };
      else if (value === "mode") filters = { ...filters, mode: "any" };
      draw();
      return;
    }
    if (name === "vis") {
      openness = value as Openness;
      draw();
      return;
    }
    if (name === "mode") {
      mode = value as Mode;
      draw();
      return;
    }
    if (name === "forever") {
      forever = !forever;
      draw();
      return;
    }
    if (name === "seats") {
      const n = await askNumber("Сколько мест за столом?", seats);
      if (n) seats = n;
      draw();
      return;
    }
    if (name === "code") {
      if (value === "new") code = (await o.freshCode()) ?? code;
      else {
        const said = (await ask("Свой код комнаты (2–8 знаков)", code))?.trim().toUpperCase();
        if (said) code = said.slice(0, 8);
      }
      draw();
      return;
    }
    if (name === "made") {
      const table: NewTable = { game: o.game ?? o.games[0]!.id, code, openness, mode, seats, forever };
      hide();
      o.onCreate(table);
      // Код истрачен: следующий стол получит свой, а не этот же.
      code = "";
    }
  };

  element.addEventListener("click", (e) => {
    const hit = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-do]");
    if (!hit) return;
    e.preventDefault();
    void act(hit.dataset["do"] ?? "");
  });

  const hide = (): void => {
    shown = false;
    screen = "list";
    draw();
  };

  return {
    element,
    show(o2) {
      rooms = o2.rooms;
      who = o2.who;
      answer = o2.answer ?? "rooms";
      if (o2.code) code = o2.code;
      said = o2.said ?? "";
      shown = true;
      draw();
    },
    hide,
    get shown() {
      return shown;
    },
    stop() {
      stopped = true;
      element.remove();
    },
  };
}
