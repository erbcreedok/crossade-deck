// ЭКРАН САМОЙ КОМНАТЫ — то, что открывается тапом по названию и коду наверху.
//
// Это НЕ список людей. Список отвечает «чей это стол и кто за ним», а здесь стол отвечает про себя:
// как его зовут, по какому коду в него попадают, кого в него пускают, кто в нём решает и переживёт
// ли он сегодняшний вечер. Мешать два разговора в одном экране значит прятать один за другим.
//
// ТЕ ЖЕ КОНТРОЛЫ, ЧТО И ПРИ СОЗДАНИИ СТОЛА: комната настраивается дважды — когда её заводят и
// потом, отсюда. Спрашивать одно и то же двумя разными способами значит учить человека заново.
//
// НАСТРОЙКА НЕ ПРЯЧЕТСЯ ОТ ТОГО, КОМУ ЕЁ НЕ ПОЛОЖЕНО МЕНЯТЬ: чего тебе нельзя — стоит тускло и не
// нажимается, а причина написана внизу, в «нельзя». Человек должен видеть, КАК устроен стол, за
// которым он сидит, даже если переставить в нём ничего не может.

import { PALETTE } from "@crossade/look";
import { esc } from "./icons.js";
import { qrSvg } from "./qr.js";

const LETTER = "Tiny5, monospace";
const DIGIT = "'Press Start 2P', monospace";

/** Право на действие над комнатой — как его дал сервер, его же словами. */
export interface RoomDeed {
  readonly deed: string;
  readonly label: string;
  /** Уклад требует голоса: та же кнопка, другое слово и другое последствие. */
  readonly vote?: boolean;
}

export interface RoomDenial {
  readonly deed: string;
  readonly label: string;
  readonly why: string;
}

/** Комната, как её показывает этот экран. Всё — данные; ни одного знания об игре. */
export interface TopHudRoom {
  readonly code: string | null;
  /**
   * ИМЯ ЭТОГО СТОЛА, если ему его дали. `null` — своего имени у него нет, и его зовут именем игры:
   * как называется игра, знает только она сама.
   */
  readonly title: string | null;
  readonly visibility: "public" | "friends" | "hidden";
  readonly admission: "open" | "code" | "invite";
  readonly mode: "free" | "council" | "assembly";
  readonly forever: boolean;
  /** Вечность сняли, и она ждёт срока. Пусто — не снимали. */
  readonly foreverDropAt?: number;
  readonly can?: readonly RoomDeed[];
  readonly cant?: readonly RoomDenial[];
}

/** Сам стол: сколько за ним стульев и вправе ли я поставить ещё. */
export interface TopHudTable {
  readonly chairs?: number;
  readonly mayAddChair?: boolean;
  readonly whyNoChair?: string;
}

/**
 * СЛОВА — ЗДЕСЬ, ЗНАЧЕНИЯ — У СЕРВЕРА. Сервер говорит `hidden`, человек читает «приватная»: язык
 * принадлежит экрану, и переводить его на сервере значило бы завести там второй экран.
 */
export const VISIBILITY_WORDS: readonly (readonly [TopHudRoom["visibility"], string])[] = [
  ["hidden", "приватная"],
  ["friends", "для друзей"],
  ["public", "публичная"],
];

export const ADMISSION_WORDS: readonly (readonly [TopHudRoom["admission"], string])[] = [
  ["code", "по коду"],
  ["invite", "по приглашению"],
  ["open", "открыто"],
];

export const MODE_WORDS: readonly (readonly [TopHudRoom["mode"], string])[] = [
  ["free", "вольница"],
  ["council", "совет"],
  ["assembly", "вече"],
];

/** Одним словом — что этот уклад значит. Экраны берут отсюда, чтобы не расходиться в словах. */
export const MODE_MEANS: Record<TopHudRoom["mode"], string> = {
  free: "каждый админ делает что хочет",
  council: "действия админов решают админы голосованием",
  assembly: "комнату настраивают все игроки голосованием",
};

const label = (word: string): string =>
  `<span style="font:400 10px ${LETTER};letter-spacing:.1em;color:${PALETTE.inkDim};opacity:.7">${word}</span>`;

const block = (word: string, inner: string): string =>
  `<div style="display:flex;flex-direction:column;gap:9px;padding:14px 0;` +
  `box-shadow:inset 0 3px 0 -1px ${PALETTE.black}8c">${label(word)}${inner}</div>`;

/** Кнопка. Золотом — то, что зовёт; тревожным — то, что стол уносит. */
export const roomButton = (deed: string, word: string, kind: "gold" | "danger" | "quiet" | ""): string =>
  `<button data-room="${esc(deed)}" style="font:400 13px ${LETTER};cursor:pointer;border:0;border-radius:8px;padding:9px 12px;` +
  (kind === "gold"
    ? `background:linear-gradient(${PALETTE.goldLight} 0%,${PALETTE.gold} 48%,${PALETTE.goldDark} 100%);` +
      `box-shadow:inset 0 0 0 3px ${PALETTE.black},0 2px 0 ${PALETTE.black}99;color:${PALETTE.black};`
    : kind === "danger"
      ? `background:linear-gradient(${PALETTE.dangerDim},${PALETTE.dangerDark});` +
        `box-shadow:inset 0 0 0 3px ${PALETTE.black},0 2px 0 ${PALETTE.black}99;color:${PALETTE.ink};`
      : kind === "quiet"
        ? `background:transparent;box-shadow:inset 0 0 0 2px ${PALETTE.wood};color:${PALETTE.inkDim};`
        : `background:linear-gradient(${PALETTE.panelLight},${PALETTE.panel});` +
          `box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.wood},0 3px 0 ${PALETTE.black}8c;color:${PALETTE.ink};`) +
  `">${esc(word)}</button>`;

/**
 * ВЫБОР ИЗ НЕСКОЛЬКИХ — РЯДОМ, А НЕ ПО КРУГУ. Строка «значение ›», которую надо тыкать, чтобы
 * увидеть варианты, прячет от человека то, из чего он выбирает.
 */
const pick = (
  deed: string,
  options: readonly (readonly [string, string])[],
  now: string,
  live: boolean,
): string =>
  `<div style="display:flex;gap:6px;flex-wrap:wrap">` +
  options
    .map(([value, word]) => {
      const on = value === now;
      return (
        `<button ${live ? `data-room="${esc(deed)}" data-value="${esc(value)}"` : ""} ` +
        `style="flex:1 1 auto;${live ? "cursor:pointer;" : ""}border:0;border-radius:8px;padding:9px 10px;` +
        `font:400 12px ${LETTER};white-space:nowrap;` +
        (on
          ? `background:linear-gradient(${PALETTE.goldLight} 0%,${PALETTE.gold} 48%,${PALETTE.goldDark} 100%);` +
            `box-shadow:inset 0 0 0 3px ${PALETTE.black},0 2px 0 ${PALETTE.black}99;color:${PALETTE.black};`
          : `background:linear-gradient(${PALETTE.panelLight},${PALETTE.panel});` +
            `box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.wood};color:${PALETTE.inkDim};`) +
        `${live ? "" : "opacity:.6;"}">${esc(word)}</button>`
      );
    })
    .join("") +
  `</div>`;

const toggle = (deed: string, on: boolean, yes: string, no: string, live: boolean): string =>
  `<button ${live ? `data-room="${esc(deed)}"` : ""} style="${live ? "cursor:pointer;" : "opacity:.6;"}border:0;` +
  `background:transparent;display:flex;align-items:center;gap:10px;padding:0">` +
  `<span style="flex:none;width:52px;height:30px;border-radius:999px;display:flex;align-items:center;padding:0 3px;` +
  `box-sizing:border-box;background:${on ? PALETTE.gold : PALETTE.well};box-shadow:inset 0 0 0 3px ${PALETTE.black};` +
  `justify-content:${on ? "flex-end" : "flex-start"}">` +
  `<span style="width:22px;height:22px;border-radius:50%;background:${on ? PALETTE.black : PALETTE.wood}"></span></span>` +
  `<span style="font:400 13px ${LETTER};color:${on ? PALETTE.ink : PALETTE.inkDim};text-align:left">${on ? yes : no}</span>` +
  `</button>`;

const hint = (words: string): string =>
  `<span style="font:400 11px ${LETTER};color:${PALETTE.inkDim};line-height:1.6">${esc(words)}</span>`;

/**
 * СКОЛЬКО МЕСТ ЗА СТОЛОМ. Число идёт под пальцем сразу, а стул ставится по ОТПУСКАНИИ: иначе за
 * одно движение через весь ползунок стол получил бы два десятка стульев по дороге.
 */
const chairsControl = (table: TopHudTable): string => {
  const chairs = table.chairs!;
  const may = table.mayAddChair === true;
  return (
    `<div style="display:flex;align-items:center;gap:12px">` +
    `<span data-g="chairs-value" style="flex:none;background:${PALETTE.well};box-shadow:inset 0 0 0 3px ${PALETTE.black},` +
    `inset 0 0 0 5px ${PALETTE.wood};border-radius:10px;padding:11px 16px;font:400 17px ${DIGIT};color:${PALETTE.ink}">` +
    `${chairs}</span>` +
    (may
      ? `<input data-g="chairs" type="range" min="${chairs}" max="32" step="1" value="${chairs}" ` +
        `style="flex:1;accent-color:${PALETTE.gold};height:30px">`
      : "") +
    `</div>` +
    hint(may ? "тяни ползунок — стул встаёт за стол" : (table.whyNoChair ?? "мест столько, сколько назначено"))
  );
};

/**
 * КВАДРАТ ДЛЯ КАМЕРЫ. Светлым фоном и тёмными модулями, а не наоборот: камера ищет тёмное на
 * светлом, и вывернутый под цвет стола QR читается втрое хуже — это тот случай, когда красиво и
 * работает расходятся.
 */
const qrPicture = (link: string): string => {
  const picture = qrSvg(link, 180, PALETTE.black, PALETTE.ink);
  if (!picture) return "";
  return (
    `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0 4px">` +
    picture +
    hint("наведи камерой — попадёшь за этот стол") +
    `</div>`
  );
};

/** Сколько осталось до срока, словами: «завтра» — это про завтра, а не про «когда-нибудь». */
const whenDrops = (at: number, now: number): string => {
  const hours = Math.max(0, Math.round((at - now) / (60 * 60 * 1000)));
  if (hours <= 1) return "в течение часа";
  if (hours < 20) return `через ${hours} ч`;
  return "завтра";
};

export interface RoomSheetAsk {
  readonly room: TopHudRoom;
  /** Как называется игра — её же словом. Стоит вместо имени у стола, которому имени не дали. */
  readonly game?: string | undefined;
  readonly table?: TopHudTable | undefined;
  /** Своя строка отказа — то, что комната только что сказала на нажатие. */
  readonly refusal?: string | undefined;
  /** Открыто ли поле для своего кода: его спрашивают только у того, кто его попросил. */
  readonly askingCode?: boolean;
  /** Адрес, по которому этот стол открывается. Его копирует «ссылка» и его же рисует QR. */
  readonly link?: string | undefined;
  /** Показан ли квадрат для камеры. Он большой, и всё время висеть ему незачем. */
  readonly showQr?: boolean;
  /** Что экран только что сделал сам, словами: «ссылка скопирована». Живёт до следующего нажатия. */
  readonly said?: string | undefined;
  /** Сейчас — чтобы «завтра» считалось от него, а не от часов, которые никто не переводил. */
  readonly now?: number;
}

/**
 * ВЕСЬ ЭКРАН КОМНАТЫ, РАЗМЕТКОЙ. Чистая функция от того, что сказали сервер и палец: проверить
 * порядок блоков и то, что запрещённое стоит тускло, можно не поднимая ни стола, ни браузера.
 */
export function roomSheetHtml(ask: RoomSheetAsk): string {
  const { room, table } = ask;
  const now = ask.now ?? Date.now();
  const can = room.can ?? [];
  const cant = room.cant ?? [];
  const allowed = (deed: string): RoomDeed | undefined => can.find((one) => one.deed === deed);
  // ГОЛОСОВАНИЕ НАЗЫВАЕТСЯ ВСЛУХ В ЗАГОЛОВКЕ: то же действие, но кончится оно не сразу, и человек
  // должен знать это ДО того, как нажмёт.
  const votes = (deed: string): string => (allowed(deed)?.vote === true ? " · ГОЛОСОВАНИЕМ" : "");
  const pending = room.foreverDropAt !== undefined;

  return (
    `<div style="padding:0 18px 24px">` +
    // ИМЯ СТОЛА — ЭТО ЕГО КОД, и он стоит первым, крупным: за ним сюда и приходят.
    `<div style="display:flex;align-items:center;gap:14px;padding:6px 0 12px">` +
    `<span style="background:${PALETTE.black};box-shadow:inset 0 0 0 3px ${PALETTE.gold};border-radius:10px;` +
    `padding:10px 14px;font:400 20px ${DIGIT};color:${PALETTE.gold};letter-spacing:.06em">${esc(room.code ?? "")}</span>` +
    `<span style="display:flex;flex-direction:column;gap:3px">` +
    `<span style="font:400 14px ${LETTER};color:${PALETTE.ink}">${esc(room.title ?? ask.game ?? "")}</span>` +
    `<span style="font:400 11px ${LETTER};color:${PALETTE.inkDim}">` +
    `${room.forever && !pending ? "вечная" : "живёт, пока в ней есть люди"}</span></div>` +
    `<div style="display:flex;gap:8px;flex-wrap:wrap;padding-bottom:4px">` +
    roomButton("room:link", "Ссылка на комнату", "gold") +
    roomButton("qr", "QR", "quiet") +
    (allowed("room:code") ? roomButton("code:new", "↻", "") + roomButton("code:own", "Свой код", "quiet") : "") +
    `</div>` +
    // КВАДРАТ ДЛЯ КАМЕРЫ — ТУТ ЖЕ, ПОД КНОПКОЙ: сосед наводит телефон на твой экран, и второй экран
    // ради одной картинки — это второй экран.
    (ask.showQr && ask.link ? qrPicture(ask.link) : "") +
    (ask.said ? `<div style="padding:2px 0 6px">${hint(ask.said)}</div>` : "") +
    // СВОЙ КОД СПРАШИВАЕТСЯ ТУТ ЖЕ, а не в отдельном окне: кнопка, после которой ничего не
    // происходит, читается как сломанная, а второй экран ради одного поля — это второй экран.
    (ask.askingCode
      ? `<div style="display:flex;gap:8px;padding:8px 0 4px">` +
        `<input data-g="code" type="text" maxlength="12" placeholder="КОД" ` +
        `style="flex:1;min-width:0;background:${PALETTE.well};border:0;box-shadow:inset 0 0 0 3px ${PALETTE.black};` +
        `border-radius:8px;padding:9px 12px;font:400 13px ${DIGIT};color:${PALETTE.ink};text-transform:uppercase">` +
        roomButton("code:take", "Занять", "") +
        `</div>`
      : "") +
    block("ВИДИМОСТЬ" + votes("room:public"), pick("room:public", VISIBILITY_WORDS, room.visibility, !!allowed("room:public"))) +
    block("ДОПУСК" + votes("room:access"), pick("room:access", ADMISSION_WORDS, room.admission, !!allowed("room:access"))) +
    (table?.chairs === undefined ? "" : block("МЕСТ ЗА СТОЛОМ", chairsControl(table))) +
    block(
      "КТО РЕШАЕТ" + votes("room:mode"),
      pick("room:mode", MODE_WORDS, room.mode, !!allowed("room:mode")) +
        hint(
          MODE_MEANS[room.mode] +
            (room.mode === "council" ? " · у хозяина голос тяжелее на волос — им разрешаются ничьи" : ""),
        ),
    ) +
    block(
      "ВЕЧНАЯ КОМНАТА",
      toggle("room:forever", room.forever && !pending, "живёт всегда", "закроется, когда все уйдут", !!allowed("room:forever")) +
        // СНЯТИЕ АДМИНОМ ЖДЁТ СУТКИ, И ЖДАНИЕ ВИДНО. Молчаливый отложенный снос — это сюрприз
        // через день; строка говорит, когда и чем это кончится, и её же хозяин отменяет одним тапом.
        (pending
          ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:${PALETTE.well};` +
            `box-shadow:inset 0 0 0 3px ${PALETTE.black};border-radius:10px;padding:10px 12px">` +
            `<span style="font:400 11px ${LETTER};color:${PALETTE.inkDim};line-height:1.6">` +
            `Перестанет быть вечной ${whenDrops(room.foreverDropAt!, now)}.<br>Пока в ней сидят — живёт как обычная.</span>` +
            (allowed("room:forever") ? roomButton("room:forever", "Вернуть", "gold") : "") +
            `</div>`
          : ""),
    ) +
    block(
      "ХОЧЕШЬ СВОЮ ТАКУЮ ЖЕ",
      allowed("room:fork")
        ? roomButton("room:fork", "Сделать свою копию", "") +
          hint("Те же люди и те же права, хозяин — ты. Комнат станет две.")
        : hint(cant.find((one) => one.deed === "room:fork")?.why ?? ""),
    ) +
    (allowed("room:close")
      ? `<div style="padding-top:16px">` +
        roomButton("room:close", allowed("room:close")!.vote === true ? "Предложить закрыть комнату" : "Закрыть комнату", "danger") +
        `</div>`
      : "") +
    // ЧЕГО НЕЛЬЗЯ — ОДНИМ БЛОКОМ ВНИЗУ: это не ошибка и не предупреждение, это список того, чего у
    // тебя нет, и читают его целиком, когда ищут пропавшую кнопку.
    (ask.refusal || cant.length > 0
      ? `<div style="display:flex;flex-direction:column;gap:3px;padding-top:16px">` +
        label("НЕЛЬЗЯ") +
        (ask.refusal ? `<span style="font:400 12px ${LETTER};color:${PALETTE.ink}">${esc(ask.refusal)}</span>` : "") +
        cant
          .map(
            (one) =>
              `<span style="font:400 12px ${LETTER};color:${PALETTE.inkDim};opacity:.75">` +
              `${esc(one.label)} — ${esc(one.why)}</span>`,
          )
          .join("") +
        `</div>`
      : "") +
    `</div>`
  );
}
