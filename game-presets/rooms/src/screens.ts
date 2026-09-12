// ТРИ ЭКРАНА МОСТА — список, найти, создать. Разметка и ничего больше: ни запросов, ни состояния.
//
// ОДИН СПИСОК, А НЕ ВТОРОЙ ЭКРАН «РЕЗУЛЬТАТЫ ПОИСКА». Второй список — это второй набор пустых
// состояний, второй способ войти и второе место, где всё это разойдётся. Поиск просто сужает то,
// что уже видно.

import { PALETTE, tint } from "@crossade/look";
import {
  MODE_WORDS,
  MODE_MEANS,
  OPENNESS_MEANS,
  OPENNESS_WORDS,
  type Filters,
  type Mode,
  type Openness,
  type Room,
  type Who,
} from "./rooms.js";
import { ball, block, btn, CODE_FONT, esc, FONT, hint, inkFor, label, pick, seatsControl, toggle } from "./parts.js";

/** Сколько лиц помещается в строке, прежде чем остальные сворачиваются в «+N». */
const FACES = 3;

/** Группы по порядку. Свои — первыми: человек чаще ВОЗВРАЩАЕТСЯ, чем выбирает. */
export const GROUPS: readonly { id: Room["group"]; title: string }[] = [
  { id: "mine", title: "ТВОИ СТОЛЫ" },
  { id: "friends", title: "ГДЕ ДРУЗЬЯ" },
  { id: "forever", title: "ТВОИ ВЕЧНЫЕ" },
  { id: "public", title: "ПУБЛИЧНЫЕ" },
];

const marks = (room: Room): string =>
  [
    room.forever ? plate("вечная", PALETTE.black, PALETTE.gold) : "",
    room.openness === "friends" ? plate("друзья", PALETTE.black, "#7fd1b9") : "",
    room.openness === "code"
      ? `<span style="font:400 9px ${FONT};color:${PALETTE.inkDim};box-shadow:inset 0 0 0 2px ${PALETTE.wood};border-radius:4px;padding:2px 5px">по коду</span>`
      : "",
  ].join("");

const plate = (text: string, ink: string, ground: string): string =>
  `<span style="font:400 9px ${FONT};color:${ink};background:${ground};border-radius:4px;padding:2px 5px">${esc(text)}</span>`;

const faces = (people: readonly Room["people"][number][]): string =>
  people
    .slice(0, FACES)
    .map(
      (one, i) =>
        `<span style="margin-left:${i ? -9 : 0}px;z-index:${9 - i}">${ball(26, one.color ?? inkFor(one.name), one.name.slice(0, 1).toUpperCase())}</span>`,
    )
    .join("") +
  (people.length > FACES
    ? `<span style="margin-left:-9px;z-index:1">${ball(26, null, `+${people.length - FACES}`)}</span>`
    : "");

/**
 * СТРОКА СТОЛА. Код — главное в ней; имени у комнаты нет и не надо: «стол Марата» — это тот же код
 * плюс лицо владельца.
 *
 * СВОЙ СТОЛ ВЫГЛЯДИТ СВОИМ: золотая кромка говорит «место держится» без единого слова, а «твой
 * ход» — единственное, ради чего этот список открывают заново.
 */
export function roomRow(room: Room, open: boolean, mixed: boolean): string {
  const full = room.taken >= room.seats && !room.mySeat;
  const edge = room.myTurn ? PALETTE.gold : room.mySeat ? "#8a6a3a" : PALETTE.wood;
  const count = room.mySeat
    ? room.online === 0
      ? "все вышли · стол ждёт"
      : `сейчас ${room.online} из ${room.taken}`
    : `${room.taken}/${room.seats}${full ? " · мест нет" : ""}`;
  return (
    `<div style="background:${PALETTE.well};box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${edge};` +
    `border-radius:12px;padding:11px 12px;display:flex;flex-direction:column;gap:9px">` +
    `<div style="display:flex;align-items:center;gap:10px">` +
    `<span style="flex:none;width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;` +
    `background:${PALETTE.black};font-size:18px">${esc(room.game.sign)}</span>` +
    `<div style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1">` +
    `<div style="display:flex;align-items:center;gap:7px">` +
    `<span style="font:400 13px ${CODE_FONT};color:${PALETTE.gold}">${esc(room.code)}</span>` +
    (mixed ? `<span style="font:400 12px ${FONT};color:${PALETTE.inkDim}">${esc(room.game.name)}</span>` : "") +
    `</div>` +
    `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">` +
    (room.myTurn ? plate("твой ход", PALETTE.black, PALETTE.gold) : "") +
    (room.mySeat && !room.myTurn
      ? `<span style="font:400 9px ${FONT};color:${PALETTE.gold};box-shadow:inset 0 0 0 2px ${PALETTE.gold};border-radius:4px;padding:2px 5px">твой стул</span>`
      : "") +
    marks(room) +
    `<span style="font:400 11px ${FONT};color:${full ? PALETTE.danger : PALETTE.inkDim}">${esc(count)}</span>` +
    `</div></div>` +
    `<div style="display:flex;align-items:center">${faces(room.people)}</div>` +
    `</div>` +
    `<div style="display:flex;gap:7px">` +
    btn(`enter:${room.code}`, room.mySeat ? "Вернуться" : full ? "Смотреть" : "Войти", room.mySeat || !full ? "gold" : "plain", true) +
    btn(`info:${room.code}`, open ? "Скрыть" : "Инфо", "quiet", true) +
    `</div>` +
    (open ? aboutHtml(room) : "") +
    `</div>`
  );
}

/** Что скрыто под «Инфо»: кто хозяин, когда открыт, каким укладом живёт и кто за ним сидит. */
function aboutHtml(room: Room): string {
  const line = (what: string, value: string): string =>
    `${esc(what)}: <span style="color:${PALETTE.ink}">${esc(value)}</span>`;
  return (
    `<div style="display:flex;flex-direction:column;gap:7px;padding-top:4px;box-shadow:inset 0 3px 0 -1px ${tint(PALETTE.black, 0.55)}">` +
    `<div style="padding-top:9px;font:400 12px ${FONT};color:${PALETTE.inkDim};line-height:1.7">` +
    `${line("Игра", room.game.name)}<br>` +
    `${line("Хозяин", room.owner ?? "ничей")} · создан ${esc(room.age)}<br>` +
    `${line("Решает", MODE_WORDS[room.mode])} · ${line("допуск", OPENNESS_WORDS[room.openness])}</div>` +
    `<div style="display:flex;flex-wrap:wrap;gap:8px">` +
    room.people
      .map(
        (one) =>
          `<span style="display:flex;align-items:center;gap:5px">${ball(22, one.color ?? inkFor(one.name), one.name.slice(0, 1).toUpperCase())}` +
          `<span style="font:400 11px ${FONT};color:${PALETTE.inkDim}">${esc(one.name)}${one.away ? " · отошёл" : ""}</span></span>`,
      )
      .join("") +
    (room.people.length === 0 ? `<span style="font:400 11px ${FONT};color:${PALETTE.inkDim}">пока никого</span>` : "") +
    `</div></div>`
  );
}

/**
 * ПУСТЫЕ СОСТОЯНИЯ — СОБСТВЕННЫЕ ЭКРАНЫ МОСТА, а не забота того, кто его вставил. Мост, который в
 * этих случаях рисует пустоту, каждый хозяин страницы будет чинить сам и по-своему.
 */
export function nothingHtml(sign: string, words: string, actions = ""): string {
  return (
    `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:70px 24px 0;text-align:center">` +
    `<span style="font-size:34px;opacity:.5">${sign}</span>` +
    `<span style="font:400 14px ${FONT};color:${PALETTE.inkDim};line-height:1.7">${words}</span>` +
    (actions ? `<div style="display:flex;gap:8px">${actions}</div>` : "") +
    `</div>`
  );
}

export function chipsHtml(chips: readonly { id: string; text: string }[]): string {
  if (chips.length === 0) return "";
  return (
    `<div style="display:flex;gap:6px;flex-wrap:wrap;padding:2px 0 6px">` +
    chips
      .map(
        (one) =>
          `<button data-do="chip:${esc(one.id)}" style="cursor:pointer;border:0;border-radius:999px;padding:7px 10px;font:400 11px ${FONT};` +
          `background:${PALETTE.gold};box-shadow:inset 0 0 0 3px ${PALETTE.black};color:${PALETTE.black}">${esc(one.text)} ✕</button>`,
      )
      .join("") +
    `<button data-do="chip:all" style="cursor:pointer;border:0;border-radius:999px;padding:7px 10px;font:400 11px ${FONT};` +
    `background:transparent;box-shadow:inset 0 0 0 2px ${PALETTE.wood};color:${PALETTE.inkDim}">сбросить всё</button></div>`
  );
}

/** Список, собранный по группам. Пустые группы не рисуются вовсе — заголовок без строк пуст вдвойне. */
export function listHtml(rooms: readonly Room[], openCode: string | undefined, mixed: boolean, who: Who): string {
  const body = GROUPS.map(({ id, title }) => {
    const ours = rooms.filter((room) => room.group === id);
    if (ours.length === 0) return "";
    return (
      `<span style="font:400 10px ${FONT};letter-spacing:.1em;color:${PALETTE.inkDim};opacity:.7;padding-top:6px">${title}</span>` +
      ours.map((room) => roomRow(room, room.code === openCode, mixed)).join("")
    );
  }).join("");
  // ГОСТЮ НЕЧЕГО ПОКАЗАТЬ В ДВУХ ГРУППАХ ИЗ ЧЕТЫРЁХ, и это надо сказать, а не молча сократить
  // список: иначе он не узнает, что у него вообще могут быть друзья и вечные столы.
  const said =
    who === "guest"
      ? `<div style="background:${PALETTE.well};box-shadow:inset 0 0 0 3px ${PALETTE.black};border-radius:12px;padding:12px 14px;` +
        `margin-top:10px;font:400 12px ${FONT};color:${PALETTE.inkDim};line-height:1.7">Столы друзей и свои вечные видно после входа.</div>`
      : "";
  return body + said;
}

/** НАЙТИ: код сверху, подбор ниже — самый частый случай это четыре знака, присланные другом. */
export function findHtml(typed: string, filters: Filters, games: readonly { id: string; name: string }[]): string {
  const cell = (sign: string | undefined): string =>
    `<span style="flex:1;height:52px;display:flex;align-items:center;justify-content:center;background:${PALETTE.black};` +
    `box-shadow:inset 0 0 0 3px ${sign ? PALETTE.gold : PALETTE.wood};border-radius:10px;font:400 20px ${CODE_FONT};` +
    `color:${PALETTE.gold}">${esc(sign ?? "")}</span>`;
  const cells = [0, 1, 2, 3].map((i) => cell(typed[i])).join("");
  return (
    `<div style="padding:0 16px 16px;display:flex;flex-direction:column">` +
    `<div style="padding:6px 0 4px">${label("КОД КОМНАТЫ")}` +
    `<div data-do="type" style="display:flex;gap:8px;padding-top:9px;cursor:pointer">${cells}</div>` +
    `<div style="padding-top:9px">${btn("byCode", "Войти по коду", "gold")}</div>` +
    `<div style="padding-top:8px">${hint("Код присылают в чат — по нему пускают даже в закрытую комнату.")}</div></div>` +
    block("ИГРА", pick("fGame", [{ id: "any", text: "любая" }, ...games.map((g) => ({ id: g.id, text: g.name }))], filters.game)) +
    block("МЕСТ ЗА СТОЛОМ, ОТ", seatsControl("fSeats", filters.seatsFrom, "столы меньше этого не покажем")) +
    block("СВОБОДНЫЕ МЕСТА", toggle("fFree", filters.onlyFree, "только те, куда можно сесть", "показывать и полные")) +
    block("КТО РЕШАЕТ", pick("fMode", [{ id: "any", text: "любой" }, ...modeOptions()], filters.mode)) +
    `<div style="padding-top:18px">${btn("found", "Показать столы", "plain")}</div></div>`
  );
}

const modeOptions = (): { id: Mode; text: string }[] =>
  (Object.keys(MODE_WORDS) as Mode[]).map((id) => ({ id, text: MODE_WORDS[id] }));

const opennessOptions = (): { id: Openness; text: string }[] =>
  (Object.keys(OPENNESS_WORDS) as Openness[]).map((id) => ({ id, text: OPENNESS_WORDS[id] }));

/**
 * СОЗДАТЬ. Каждый контрол — по своей природе выбора, а не одинаковой строкой «значение ›»: из трёх
 * видимостей выбирают, вечность включают, мест называют число, а КОД УЖЕ ЕСТЬ — он выдан заранее,
 * и его правят, а не придумывают с нуля.
 */
export function createHtml(
  game: { name: string; sign: string },
  code: string,
  openness: Openness,
  mode: Mode,
  seats: number,
  forever: boolean,
): string {
  return (
    `<div style="padding:0 16px 16px">` +
    `<div style="display:flex;align-items:center;gap:12px;padding:6px 0 4px">` +
    `<span style="flex:none;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;` +
    `background:${PALETTE.black};font-size:22px">${esc(game.sign)}</span>` +
    `<div style="display:flex;flex-direction:column;gap:3px">` +
    `<span style="font:400 16px ${FONT};color:${PALETTE.ink}">${esc(game.name)}</span>` +
    `<span style="font:400 11px ${FONT};color:${PALETTE.inkDim}">стол на ${seats} мест</span></div></div>` +
    // КОД ГОТОВ ЗАРАНЕЕ: комнату зовут кодом, и он должен быть в руках ДО нажатия «создать» —
    // чтобы его можно было отправить другу прямо отсюда, ещё не сев за стол.
    block(
      "КОД КОМНАТЫ",
      `<div style="display:flex;align-items:center;gap:9px">` +
        `<span style="flex:1;background:${PALETTE.black};box-shadow:inset 0 0 0 3px ${PALETTE.gold};border-radius:10px;padding:12px;` +
        `text-align:center;font:400 19px ${CODE_FONT};color:${PALETTE.gold};letter-spacing:.08em">${esc(code)}</span>` +
        btn("code:new", "↻", "plain", true) +
        btn("code:own", "Свой", "quiet", true) +
        `</div>`,
    ) +
    block("ВИДИМОСТЬ", pick("vis", opennessOptions(), openness) + hint(OPENNESS_MEANS[openness])) +
    block("МЕСТ ЗА СТОЛОМ", seatsControl("seats", seats, "тяни ползунок или нажми на число — от 2 до 32")) +
    block("КТО РЕШАЕТ", pick("mode", modeOptions(), mode) + hint(MODE_MEANS[mode])) +
    block("ВЕЧНАЯ КОМНАТА", toggle("forever", forever, "живёт всегда", "закроется, когда все уйдут")) +
    `<div style="padding-top:18px">${btn("made", "Создать и сесть", "gold")}</div></div>`
  );
}
