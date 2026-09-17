// КОМАНДЫ СТОЛА В ЧАТЕ — слова и кнопки, без Telegram. Бот только переводит сообщение в `TableCommand`
// и отдаёт серверу стола; решает сервер (админ ли, собраны ли карты, хватает ли их).
//
//   /collect                                  собрать всё крупье в руку
//   /shuffle                                  перемешать
//   /durak [36|52] [jokers]                   пресет: колода под дурака
//   /krest [36|52] [jokers]                   пресет: колода под крестовый
//   /belka                                    пресет: 36, стулья крестом, шестёрки на край
//   /deal N|durak|krest|belka [@кто] [-skip-empty] [-as-dealer] [-force]
//   /deck [classic|minimal] [plaid|argyle|club|lattice|crest|ink]   вид колоды на весь стол
//   /menu                                     меню стола кнопками

import { CARD_BACKS, CARD_FACES, type CardBack, type CardFaces, type DealRule, type Game, type RoomCard, type RunError, type TableCommand } from "../../../server/src/table/contract.js";
import type { Button, Said } from "./talk.js";

export const ORDER_COMMANDS = ["collect", "shuffle", "durak", "krest", "belka", "deal", "deck", "croupier"] as const;

/** Имена вида колоды словами — в кнопках и в ответе бота. */
export const FACES_SAY: Record<CardFaces, string> = { classic: "Классика", minimal: "Минимал" };
export const BACKS_SAY: Record<CardBack, string> = { plaid: "Плед", argyle: "Ромбы", club: "Трефы", lattice: "Решётка", crest: "Герб", ink: "Чернила" };
export type OrderName = (typeof ORDER_COMMANDS)[number];

/** Разобрать команду. `null` — слова не сложились, и бот отвечает подсказкой. */
export function parseOrder(name: OrderName, args: string): TableCommand | null {
  const words = args.trim().split(/\s+/).filter(Boolean).map((w) => w.toLowerCase());
  const has = (...flags: string[]) => words.some((w) => flags.includes(w.replace(/^-+/, "")));
  if (name === "collect" || name === "shuffle") return words.length === 0 ? { t: name } : null;
  // КРУПЬЕ: без слов — посадить, «убрать» / «off» — увести. Убранный роняет карты на стол.
  if (name === "croupier") {
    if (words.length === 0) return { t: "croupier", on: true };
    return has("убрать", "off", "нет", "no") ? { t: "croupier", on: false } : null;
  }
  if (name === "deck") {
    const faces = CARD_FACES.find((f) => words.includes(f));
    const back = CARD_BACKS.find((b) => words.includes(b));
    if (!words.length || words.length !== Number(Boolean(faces)) + Number(Boolean(back))) return null;
    return { t: "look", ...(faces ? { faces } : {}), ...(back ? { back } : {}) };
  }
  if (name === "durak" || name === "krest" || name === "belka") {
    const size = words.includes("52") ? 52 : 36;
    const jokers = has("jokers", "joker", "j", "джокеры", "джокер");
    const unknown = words.filter((w) => !["36", "52"].includes(w) && !["jokers", "joker", "j", "джокеры", "джокер"].includes(w.replace(/^-+/, "")));
    if (unknown.length) return null;
    return name === "belka" ? { t: "preset", game: "belka" } : { t: "preset", game: name, size, ...(jokers ? { jokers: true } : {}) };
  }
  const [first, ...rest] = args.trim().split(/\s+/).filter(Boolean);
  if (!first) return null;
  const low = first.toLowerCase();
  const rule: DealRule | null = /^\d+$/.test(low) ? "each" : low === "durak" || low === "krest" || low === "belka" ? low : null;
  if (!rule) return null;
  const n = rule === "each" ? Number(low) : undefined;
  if (n !== undefined && (n < 1 || n > 54)) return null;
  let dealer: string | undefined;
  const out: Extract<TableCommand, { t: "deal" }> = { t: "deal", rule, ...(n ? { n } : {}) };
  for (const w of rest) {
    const flag = w.toLowerCase().replace(/^-+/, "");
    if (w.startsWith("-") && flag === "skip-empty") out.skipEmpty = true;
    else if (w.startsWith("-") && flag === "as-dealer") out.asDealer = true;
    else if (w.startsWith("-") && flag === "force") out.force = true;
    else if (/^\d+$/.test(w) && rule === "durak") out.n = Number(w);
    else if (!w.startsWith("-") && dealer === undefined) dealer = w;
    else return null;
  }
  return dealer ? { ...out, dealer } : out;
}

export const ORDERS_HELP = [
  "Команды комнаты (только её админ):",
  "/menu — меню комнаты кнопками",
  "/collect — собрать всё крупье в руку (крупье за столом нет — в колоду)",
  "/shuffle — перемешать",
  "/durak [36|52] [jokers] — колода под дурака",
  "/krest [36|52] [jokers] — колода под крестовый",
  "/belka — белка: 36, стулья крестом, шестёрки на край",
  "/deal N|durak|krest|belka [@кто раздаёт] [-skip-empty] [-as-dealer] [-force]",
  "/croupier [убрать] — посадить крупье за стол или увести его (его карты лягут стопкой на стол)",
  "/deck [classic|minimal] [plaid|argyle|club|lattice|crest|ink] — вид колоды на весь стол (или кнопками в /menu)",
].join("\n");

/** Кнопки меню: короткий код в `callback_data` → команда. */
export const MENU: Record<string, { label: string; command: TableCommand }> = {
  col: { label: "Собрать", command: { t: "collect" } },
  shf: { label: "Перемешать", command: { t: "shuffle" } },
  pd36: { label: "36", command: { t: "preset", game: "durak", size: 36 } },
  pd52: { label: "52", command: { t: "preset", game: "durak", size: 52 } },
  pd36j: { label: "36+🃏", command: { t: "preset", game: "durak", size: 36, jokers: true } },
  pd52j: { label: "52+🃏", command: { t: "preset", game: "durak", size: 52, jokers: true } },
  pk36: { label: "36", command: { t: "preset", game: "krest", size: 36 } },
  pk52: { label: "52", command: { t: "preset", game: "krest", size: 52 } },
  pk36j: { label: "36+🃏", command: { t: "preset", game: "krest", size: 36, jokers: true } },
  pk52j: { label: "52+🃏", command: { t: "preset", game: "krest", size: 52, jokers: true } },
  pb: { label: "Белка", command: { t: "preset", game: "belka" } },
  dd: { label: "Дурак", command: { t: "deal", rule: "durak" } },
  dk: { label: "Крестовый", command: { t: "deal", rule: "krest" } },
  db: { label: "Белка", command: { t: "deal", rule: "belka" } },
  cr1: { label: "Посадить", command: { t: "croupier", on: true } },
  cr0: { label: "Увести", command: { t: "croupier", on: false } },
  ...Object.fromEntries(CARD_FACES.map((faces) => [`lf${faces}`, { label: FACES_SAY[faces], command: { t: "look", faces } }])),
  ...Object.fromEntries(CARD_BACKS.map((back) => [`lb${back}`, { label: BACKS_SAY[back], command: { t: "look", back } }])),
};

const btn = (room: string, code: string): Button => ({ text: MENU[code]!.label, data: `tbr:${room}:${code}` });

export function menuOf(card: RoomCard, kinds: ReadonlyArray<{ id: string; name: string }> = [], me?: string): Said {
  const r = card.room;
  const owner = me === undefined || me === card.by;
  const here = kinds.find((k) => k.id === card.kind)?.name ?? card.kind;
  return {
    text: `«${card.title}» · игра: ${here}. Пресет меняет колоду и рассадку, раздача — раздаёт по своим правилам (раздаёт админ, по часовой со следующего).`,
    rows: [
      [btn(r, "col"), btn(r, "shf")],
      [{ text: "Пресет · дурак:", data: "tbx" }, btn(r, "pd36"), btn(r, "pd52"), btn(r, "pd36j"), btn(r, "pd52j")],
      [{ text: "Пресет · крестовый:", data: "tbx" }, btn(r, "pk36"), btn(r, "pk52"), btn(r, "pk36j"), btn(r, "pk52j")],
      [{ text: "Пресет:", data: "tbx" }, btn(r, "pb")],
      [{ text: "Раздать:", data: "tbx" }, btn(r, "dd"), btn(r, "dk"), btn(r, "db")],
      [{ text: "Крупье:", data: "tbx" }, btn(r, "cr1"), btn(r, "cr0")],
      [{ text: "Лица:", data: "tbx" }, ...CARD_FACES.map((f) => btn(r, `lf${f}`))],
      [{ text: "Рубашка:", data: "tbx" }, ...CARD_BACKS.slice(0, 3).map((b) => btn(r, `lb${b}`))],
      CARD_BACKS.slice(3).map((b) => btn(r, `lb${b}`)),
      // РОД СТОЛА — тем же меню: нынешний род отмечен и нажатием ничего не меняет.
      ...(kinds.length > 1
        ? [[{ text: "Род:", data: "tbx" }, ...kinds.map((k) => ({ text: k.id === card.kind ? `• ${k.name}` : k.name, data: k.id === card.kind ? "tbx" : `tbk:${r}:${k.id}` }))]]
        : []),
      [{ text: "Комната:", data: "tbx" }, { text: "Переименовать", data: `tbl:ren:${r}` }, ...(owner ? [{ text: "Закрыть", data: `tbl:del:${r}` }] : [])],
      // РОЛИ РАЗДАЁТ ТОЛЬКО ХОЗЯИН. Распорядитель ведёт стол, но комнату не отбирает и не закрывает.
      ...(owner ? rolesRows(card) : []),
    ],
  };
}

/**
 * КТО В КОМНАТЕ И ЧТО ЕМУ ВЫДАНО. Хозяин помечен, у прочих кнопка «Сделать распорядителем» или
 * «Забрать» — по одной строке на человека, чтобы не гадать, кого именно нажимаешь.
 */
export function rolesRows(card: RoomCard): Button[][] {
  const others = card.people.filter((p) => p.key !== card.by);
  if (others.length === 0) return [[{ text: "Роли: за столом ещё никого", data: "tbx" }]];
  return [
    [{ text: "Роли:", data: "tbx" }],
    ...others.map((p) => {
      const on = card.admins.includes(p.key);
      return [
        { text: `${on ? "★ " : ""}${p.name}`, data: "tbx" },
        { text: on ? "Забрать" : "Сделать распорядителем", data: `tba:${on ? "0" : "1"}:${card.room}:${p.key}` },
      ];
    }),
  ];
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
    "no-dealer": "Не нашёл раздающего за столом.",
    "no-deal-yet": "Перераздавать нечего: в этой комнате ещё ни разу не раздавали.",
    "pick-seat": "Не понял, с кого начать: тебя за столом нет, а прошлый начальный стул уже пуст. Раздай заново и укажи стул.",
    empty: "В этой комнате ещё никого не было — зайди, и команды заработают.",
    bad: "Не понял команду.",
  };
  return { text: text[error], rows: error === "needs-collect" ? [[{ text: "Собрать и раздать", data: `tbf:${room}:${pending}` }]] : [] };
}
