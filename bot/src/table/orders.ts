// МЕНЮ КОМНАТЫ В ЧАТЕ — слова и кнопки, без Telegram. Бот только переводит нажатие в `TableCommand`
// и отдаёт серверу стола; решает сервер (админ ли, собраны ли карты, хватает ли их).

import { CARD_BACKS, CARD_FACES, type CardBack, type CardFaces, type Game, type RoomCard, type RunError, type SeatCard, type TableCommand } from "../../../server/src/table/contract.js";
import type { Button, Said } from "./talk.js";

/** Имена вида колоды словами — в кнопках и в ответе бота. */
export const FACES_SAY: Record<CardFaces, string> = { classic: "Классика", minimal: "Минимал" };
export const BACKS_SAY: Record<CardBack, string> = { plaid: "Плед", argyle: "Ромбы", club: "Трефы", lattice: "Решётка", crest: "Герб", ink: "Чернила" };

/** Кнопки меню: короткий код в `callback_data` → команда. */
export const MENU: Record<string, { label: string; command: TableCommand }> = {
  red: { label: "Перераздать", command: { t: "redeal" } },
  ...Object.fromEntries(CARD_FACES.map((faces) => [`lf${faces}`, { label: FACES_SAY[faces], command: { t: "look", faces } }])),
  ...Object.fromEntries(CARD_BACKS.map((back) => [`lb${back}`, { label: BACKS_SAY[back], command: { t: "look", back } }])),
};

const btn = (room: string, code: string): Button => ({ text: MENU[code]!.label, data: `tbr:${room}:${code}` });

/**
 * МЕНЮ КОМНАТЫ. Каждый сектор — одно решение и ничего больше: колода, джокеры, раздача, вид карт,
 * род, комната, рассадка. Нынешний выбор помечен точкой и нажатием ничего не меняет.
 *
 * ЧТО ВИДНО ТОЛЬКО ХОЗЯИНУ: род стола, «Закрыть» и выдача распорядителя. Распорядитель ведёт стол,
 * но комнату не отбирает и не закрывает.
 */
export function menuOf(card: RoomCard, kinds: ReadonlyArray<{ id: string; name: string }> = [], me?: string): Said {
  const r = card.room;
  const owner = me === undefined || me === card.by;
  const here = kinds.find((k) => k.id === card.kind)?.name ?? card.kind;
  const mark = (on: boolean, text: string) => (on ? `• ${text}` : text);
  const deck = (size: 36 | 52) => ({ text: mark(card.deck.size === size, String(size)), data: `tbd:${r}:${size}:${card.deck.jokers ? 1 : 0}` });
  const joker = (on: boolean) => ({ text: mark(card.deck.jokers === on, on ? "Вкл" : "Выкл"), data: `tbd:${r}:${card.deck.size}:${on ? 1 : 0}` });
  return {
    text: `«${card.title}» · игра: ${here}. Колода и джокеры пересобирают стол заново; раздача собирает карты крупье, мешает и раздаёт.`,
    rows: [
      [{ text: "Колода:", data: "tbx" }, deck(36), deck(52)],
      [{ text: "Джокеры:", data: "tbx" }, joker(true), joker(false)],
      [{ text: "Раздать", data: `tbg:${r}` }, { text: "Перераздать", data: `tbr:${r}:red` }],
      [{ text: "Лица:", data: "tbx" }, ...CARD_FACES.map((f) => btn(r, `lf${f}`))],
      [{ text: "Рубашка:", data: "tbx" }, ...CARD_BACKS.slice(0, 3).map((b) => btn(r, `lb${b}`))],
      CARD_BACKS.slice(3).map((b) => btn(r, `lb${b}`)),
      // РОД СТОЛА — его меняет только хозяин: это другая игра, а не настройка.
      ...(owner && kinds.length > 1
        ? [[{ text: "Род:", data: "tbx" }, ...kinds.map((k) => ({ text: mark(k.id === card.kind, k.name), data: k.id === card.kind ? "tbx" : `tbk:${r}:${k.id}` }))]]
        : []),
      [{ text: "Комната:", data: "tbx" }, { text: "Переименовать", data: `tbl:ren:${r}` }, ...(owner ? [{ text: "Закрыть", data: `tbl:del:${r}` }] : [])],
      [{ text: "Рассадка", data: `tbz:${r}` }],
    ],
  };
}

/** Как стул зовётся в списке: звёздочка распорядителю, число карт в руке. */
const seatName = (s: SeatCard): string => (s.who ? `${s.admin ? "★ " : ""}${s.who.name}${s.cards ? ` · ${s.cards}` : ""}` : "пустой стул");

/**
 * РАССАДКА — своим списком. Порядок строк и есть порядок за столом, по часовой; нажатие на стул
 * открывает, что с ним можно сделать.
 *
 * `moving` — стул, который уже взяли пересаживать: тогда у остальных вместо имени кнопка «сюда», и
 * нажатие меняет два стула местами. Так пересадка — это два нажатия и ни одного лишнего экрана.
 */
export function seatMenu(card: RoomCard, moving?: string): Said {
  const r = card.room;
  const held = card.seats.find((s) => s.id === moving);
  const rows: Button[][] = card.seats.map((s) => {
    if (held && s.id === held.id) return [{ text: `⇅ ${seatName(s)}`, data: `tbz:${r}` }];
    if (held) return [{ text: seatName(s), data: "tbx" }, { text: "сюда", data: `tbv:${r}:${held.id}:${s.id}` }];
    return [{ text: seatName(s), data: `tbn:${r}:${s.id}` }, { text: "Пересадить", data: `tbz:${r}:${s.id}` }];
  });
  rows.push([{ text: "Поставить стул", data: `tbs:add:${r}:-` }, { text: "‹ Назад", data: `tbm:${r}` }]);
  return {
    text: held
      ? `«${card.title}» · пересаживаю ${seatName(held)}. Нажми «сюда» у стула, с которым поменять местами.`
      : `«${card.title}» · рассадка по часовой. Стул — что с ним сделать; «Пересадить» — поменять местами с другим.`,
    rows,
  };
}

/**
 * ОДИН СТУЛ: всё, что с ним делают. Стул не отнимают и не выдают — человека выгоняют из комнаты, а
 * стул уходит за ним сам, если карт на нём не осталось.
 */
export function seatCard(card: RoomCard, chair: string, owner: boolean): Said {
  const r = card.room;
  const s = card.seats.find((one) => one.id === chair);
  if (!s) return { text: "Этого стула уже нет.", rows: [[{ text: "‹ Назад", data: `tbz:${r}` }]] };
  const act = (does: string, text: string): Button => ({ text, data: `tbs:${does}:${r}:${s.id}` });
  const rows: Button[][] = [];
  if (s.who && !s.dealer) rows.push([act("dealer", "Сделать раздающим")]);
  if (s.cards > 0) rows.push([act("sweep", "Забрать карты в руку крупье")]);
  // РАСПОРЯДИТЕЛЯ ВЫДАЁТ ТОЛЬКО ХОЗЯИН, и себе он его не выдаёт: он и так хозяин.
  if (owner && s.who && s.who.key !== card.by) {
    const on = card.admins.includes(s.who.key);
    rows.push([{ text: on ? "Забрать распорядителя" : "Сделать распорядителем", data: `tba:${on ? "0" : "1"}:${r}:${s.who.key}` }]);
  }
  if (s.who) rows.push([act("kick", "Выгнать из комнаты")]);
  rows.push([{ text: "Пересадить", data: `tbz:${r}:${s.id}` }, { text: "‹ Назад", data: `tbz:${r}` }]);
  const about = [s.dealer ? "раздающий" : "", s.admin ? "распорядитель" : "", s.cards ? `карт в руке: ${s.cards}` : "рука пуста"].filter(Boolean).join(", ");
  return { text: `${s.who ? s.who.name : "Пустой стул"} — ${about}.`, rows };
}

/**
 * МЕНЮ РАЗДАЧИ. Два решения: кому раздавать (нажатием стул включается и выключается) и с кого
 * начать. Всё остальное раздача делает сама — собирает карты крупье, мешает и раздаёт по одной.
 */
export function dealMenu(card: RoomCard, id: string, pick: { seats: string[]; from?: string }): Said {
  const rows: Button[][] = [[{ text: "Кому раздать:", data: "tbx" }]];
  for (const s of card.seats) {
    const on = pick.seats.includes(s.id);
    const name = s.who?.name ?? "пустой стул";
    rows.push([
      { text: on ? `✓ ${name}` : name, data: `tbq:${id}:${s.id}` },
      ...(on ? [{ text: pick.from === s.id ? "• первый" : "начать с него", data: pick.from === s.id ? "tbx" : `tbw:${id}:${s.id}` }] : []),
    ]);
  }
  rows.push([{ text: "Раздать", data: `tbe:${id}` }]);
  return { text: `«${card.title}» — кому раздаём и с кого начинаем. Первая карта ляжет отмеченному «первым».`, rows };
}

/** Какой стол — если их несколько. Команда ждёт в `pending` под коротким id. */
export function pickTable(cards: RoomCard[], pending: string): Said {
  return {
    text: "Какая комната?",
    rows: cards.map((c) => [{ text: c.title, data: `tbp:${c.room}:${pending}` }]),
  };
}

export function pickForMenu(cards: RoomCard[]): Said {
  return { text: "Меню какой комнаты?", rows: cards.map((c) => [{ text: c.title, data: `tbm:${c.room}` }]) };
}

const GAME: Record<Game, string> = { durak: "дурак", krest: "крестовый", belka: "белка" };

/** Что бот говорит, когда сервер принял команду. */
export function started(command: TableCommand, title: string): string {
  switch (command.t) {
    case "collect":
      return `Собираю карты крупье в руку — «${title}».`;
    case "shuffle":
      return `Перемешиваю — «${title}».`;
    case "croupier":
      return command.on
        ? `Крупье сел за «${title}» — со своим местом и своей рукой.`
        : `Крупье ушёл из «${title}»; его карты легли стопкой на стол.`;
    case "preset":
      return command.game === "belka"
        ? `Пресет «белка» на «${title}»: 36 карт, стулья крестом, шестёрки на край.`
        : `Пресет «${GAME[command.game]}» на «${title}»: ${command.size ?? 36}${command.jokers ? " + джокеры" : ""}.`;
    case "look":
      return `Колода на «${title}»: ${[command.faces && `лица — ${FACES_SAY[command.faces].toLowerCase()}`, command.back && `рубашка — ${BACKS_SAY[command.back].toLowerCase()}`].filter(Boolean).join(", ")}.`;
    case "deal":
      return `Раздаю${command.rule === "each" ? ` по ${command.n ?? 1}` : ` — ${GAME[command.rule]}`} на «${title}».`;
    case "redeal":
      return `Перераздаю на «${title}» — тем же стульям, что и в прошлый раз.`;
    case "bots": {
      if (command.n <= 0) return `Увожу игроков без человека из «${title}».`;
      // Чем они думают и какие они — говорится, только если это выбрали: молчаливый выбор за спиной
      // владельца хуже лишней строки.
      const кто = [command.profile && `характер — ${command.profile}`, command.brain && `думают через ${command.brain}`].filter(Boolean).join(", ");
      return `Сажаю игроков без человека за «${title}»: ${command.n}${кто ? ` (${кто})` : ""}.`;
    }
    // ДЕЛО СТОЛА — то же, что кнопка в окне крупье: собрать круг, вернуть его, указать ход. Имён дел
    // бот не знает наизусть и не выдумывает: их каталог живёт на сервере (`crews.ts`), и завтра там
    // будет другая игра с другими делами. Бот говорит то, что знает точно.
    case "crew":
      return `Делаю за крупье «${command.act}» — «${title}».`;
    case "seat":
      return {
        kick: `Выгоняю из «${title}».`,
        add: `Ставлю ещё один пустой стул за «${title}».`,
        sweep: `Забираю карты со стула в руку крупье — «${title}».`,
        dealer: `Назначаю раздающего за «${title}».`,
        place: `Пересаживаю за «${title}».`,
        swap: `Меняю стулья местами за «${title}».`,
      }[command.do];
  }
}

/** Отказ сервера словами. `needs-collect` — с кнопкой «Собрать и раздать». */
export function refusedSay(error: RunError, room: string, pending: string): Said {
  const text: Record<RunError, string> = {
    "not-admin": "Командует только админ комнаты — тот, кто её открыл.",
    busy: "Комната занята: предыдущая команда ещё идёт.",
    "needs-collect": "Карты ещё не собраны. Собрать, перемешать и раздать?",
    "not-enough-cards": "В колоде не хватит карт на такую раздачу.",
    "not-enough-players": "Не хватает игроков: белке нужны четверо за столом.",
    "wrong-players": "Этой раздаче нужно ровно столько игроков, сколько она просит: выбери их точно.",
    "no-dealer": "Не нашёл раздающего за столом.",
    "no-deal-yet": "Перераздавать нечего: в этой комнате ещё ни разу не раздавали.",
    "pick-seat": "Не понял, с кого начать: тебя за столом нет, а прошлый начальный стул уже пуст. Раздай заново и укажи стул.",
    empty: "В этой комнате ещё никого не было — зайди, и команды заработают.",
    bad: "Не понял команду.",
    "croupier-stays": "Крупье не уводят: без него некому раздавать и сгребать круг.",
  };
  return { text: text[error], rows: error === "needs-collect" ? [[{ text: "Собрать и раздать", data: `tbf:${room}:${pending}` }]] : [] };
}
