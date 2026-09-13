// КТО ЧТО МОЖЕТ ЗА СТОЛОМ — таблица, а не кнопки.
//
// Решение живёт здесь одним списком правил, и его читают ОБА: сервер, когда действие приходит, и
// экран, когда рисует панель. Если каждое место решит само, места разойдутся в первый же день: в
// списке кик есть, в тултипе нет, а сервер пустит обоих.
//
// ПРАВО, КОТОРОЕ ПРОВЕРЯЕТ ТОЛЬКО КЛИЕНТ, — ЭТО НАДПИСЬ, А НЕ ПРАВО. Поэтому правило написано так,
// чтобы его можно было выполнить без экрана: (кто я, кто он, какая комната) → можно или нет, и
// почему нет. Причина обязательна: кнопка, пропавшая молча, читается как поломка, и первым делом
// про неё спрашивают «почему у меня нет кика».
//
// Порт черновика из ветки дизайна (`design/table/rights.js`) — оттуда же и слова.

import type { Mode, Role } from "./db/roomsRepo.js";

/** Что человек может в этой комнате: распоряжаться, предлагать или ничего. */
export type Power = "full" | "admin" | "proposal" | "none";

/** Стол, как его видит правило: сколько стульев, сколько людей и есть ли у игры своё число мест. */
export interface Table {
  readonly chairs?: number;
  readonly capacity?: number;
  /** Число мест, назначенное правилом игры. Есть — двигать мебель нельзя. */
  readonly chairsFixed?: number;
}

/** Человек за столом, как его видит правило. */
export interface Someone {
  readonly account: string;
  readonly role: Role;
  /**
   * ПОЛОЖЕН ЛИ ЕМУ СТУЛ. Не уровень: игрок без стула — зритель, а хозяин без стула ведёт стол, за
   * которым не играет.
   */
  readonly seated: boolean;
  /**
   * ЗДЕСЬ ЛИ ОН СЕЙЧАС — в идущей сессии. Стул живёт в ней, и дать его тому, кого за столом нет,
   * нельзя: место запишется в пустоту, а роль сменится молча, и это выглядит как «кнопка не
   * работает». Пусто — про присутствие не спросили, и правило о нём не судит.
   */
  readonly here?: boolean;
}

/** Админ или хозяин — те, кому вообще принадлежит управление столом. */
const rules = (one: Someone): boolean => one.role === "owner" || one.role === "admin";

/**
 * ЧТО ЧЕЛОВЕК МОЖЕТ ПРИ ЭТОМ УКЛАДЕ.
 *
 *   ВОЛЬНИЦА — каждый админ делает что хочет, не спрашивая никого.
 *   СОВЕТ    — действие админа утверждают админы голосованием.
 *   ВЕЧЕ     — комнату настраивают все игроки голосованием. Зрители не голосуют: у них нет стула,
 *              а значит нет и доли в столе.
 */
export function powerOf(me: Someone, mode: Mode): Power {
  // БЕЗ СТУЛА ИГРОК НЕ РЕШАЕТ: доли в столе у него нет, и голоса тоже — это и значит «зритель».
  // Хозяина и админа стул не касается: они ведут стол, а не играют за ним.
  if (me.role === "player" && !me.seated) return "none";
  if (mode === "assembly") return rules(me) || me.role === "player" ? "proposal" : "none";
  if (!rules(me)) return "none";
  if (mode === "council") return "proposal";
  return me.role === "owner" ? "full" : "admin";
}

/** Распоряжается комнатой — прямо или через голосование. */
const manages = (p: Power): boolean => p !== "none";

/**
 * Распоряжается ЛЮДЬМИ — стулом, правами, чужими фигурами. В вече игроки настраивают КОМНАТУ, но не
 * людей: голосованием выгонять соседа — это другая игра, и её никто не заказывал.
 */
const handles = (me: Someone, p: Power): boolean => rules(me) && manages(p);

/** Что можно сделать с человеком за столом. Те же слова, что в панели. */
/**
 * ЧТО МОЖНО СДЕЛАТЬ С ЧЕЛОВЕКОМ ЗА СТОЛОМ. «Поставить стул» сюда не входит и не входило по смыслу:
 * это действие над СТОЛОМ, и в списке действий над человеком оно размножалось по всем строкам —
 * кнопка стояла у каждого, а делала одно и то же ни для кого из них.
 */
export const DEEDS = ["seat:give", "seat:take", "admin:grant", "admin:revoke", "owner:pass", "kick", "colour"] as const;

/** Действия над самим столом. Их немного, и они не про людей. */
export const TABLE_DEEDS = ["seat:add"] as const;

/**
 * ДЕЙСТВИЯ НАД ЧУЖОЙ РУКОЙ — лок, пин, скрытность.
 *
 * ПРАВО НА НИХ СЧИТАЕТ КОМНАТА, А ИСПОЛНЯЕТ СТОЛ: рука — это узлы дерева, оно ходит между экранами
 * само, и комнате незачем знать, как лежат карты. Поэтому они есть в списке разрешённого, но
 * сообщением в комнату не присылаются: там их просто нечем сделать.
 */
export const HAND_DEEDS = ["piece:lock", "piece:pin", "piece:hide"] as const;
export type Deed = (typeof DEEDS)[number] | (typeof TABLE_DEEDS)[number] | (typeof HAND_DEEDS)[number];

export function isDeed(raw: unknown): raw is Deed {
  return (
    typeof raw === "string" &&
    ((DEEDS as readonly string[]).includes(raw) || (TABLE_DEEDS as readonly string[]).includes(raw))
  );
}

/** Как действие называется человеку. Одно место на панель и на отказ. */
export const DEED_WORD: Record<Deed, string> = {
  "piece:lock": "Лок",
  "piece:pin": "Пин",
  "piece:hide": "Скрытность",
  "seat:add": "Поставить стул",
  "seat:give": "Дать стул",
  "seat:take": "Лишить стула",
  "admin:grant": "Дать админа",
  "admin:revoke": "Забрать админа",
  "owner:pass": "Передать комнату",
  kick: "Выгнать",
  colour: "Сменить цвет",
};

/** `true` — можно; строка — почему нельзя, теми же словами, какими это скажут человеку. */
export function may(deed: Deed, me: Someone, them: Someone, mode: Mode, table: Table = {}): true | string {
  const p = powerOf(me, mode);
  const mine = me.account === them.account;
  switch (deed) {
    case "seat:add":
      // ПОСТАВИТЬ СТУЛ — НЕ ТО ЖЕ, ЧТО ДАТЬ ЕГО: дают существующий, ставят новый. За доской нового
      // места не бывает — там их два по правилу игры, а не по желанию хозяина.
      if (table.chairsFixed !== undefined) return "за этой игрой мест ровно столько, сколько правил";
      if (table.chairs !== undefined && table.capacity !== undefined && table.chairs >= table.capacity) {
        return "больше людей эта комната не держит";
      }
      return handles(me, p) || "мебель двигает тот, кто распоряжается";
    case "seat:give":
      if (them.seated) return "он уже за столом";
      if (them.here === false) return "его сейчас нет за столом — стул дают тому, кто пришёл";
      return handles(me, p) || "мест не раздаёшь";
    case "seat:take":
      // ХОЗЯИНА МОЖНО ЛИШИТЬ СТУЛА: он защищён только от кика и от снятия админки.
      if (!them.seated) return "он и так без стула";
      if (mine) return "со своего встают сами";
      return handles(me, p) || "местами не распоряжаешься";
    case "admin:grant":
      if (them.role !== "player") return "он уже с правами";
      return handles(me, p) || "правами не делишься";
    case "admin:revoke":
      if (them.role === "owner") return "хозяина нельзя разжаловать";
      if (them.role !== "admin") return "он не админ";
      return handles(me, p) || "правами не распоряжаешься";
    case "owner:pass":
      if (p !== "full") return "комнату передаёт только хозяин";
      if (mine) return "она и так твоя";
      return them.seated ? true : "сначала посади его";
    case "kick":
      if (them.role === "owner") return "хозяина нельзя выгнать";
      if (mine) return "себя выгоняют кнопкой «выйти»";
      return handles(me, p) || "выгонять некому";
    case "piece:lock":
    case "piece:pin":
    case "piece:hide":
      // РУКА ЕСТЬ ТОЛЬКО У ТОГО, КТО СИДИТ. Зрителю нечего локать и прятать — у него нет фигур.
      if (!them.seated) return "он не за столом — руки нет";
      return mine || handles(me, p) || "чужой рукой распоряжается админ";
    case "colour":
      // ЦВЕТ — ЭТО ОН САМ, А НЕ СОСТОЯНИЕ ЕГО РУКИ: свой меняет каждый, чужой — тот, кто
      // распоряжается столом.
      return mine || handles(me, p) || "чужой цвет меняет тот, кто распоряжается";
  }
}

export interface Allowed {
  readonly deed: Deed;
  readonly label: string;
  /** Уклад требует голоса: то же действие, другое слово и другое последствие. */
  readonly vote: boolean;
}

export interface Denied {
  readonly deed: Deed;
  readonly label: string;
  readonly why: string;
}

/**
 * МОЖНО ЛИ ПОСТАВИТЬ ЗА ЭТОТ СТОЛ ЕЩЁ ОДИН СТУЛ — вопрос про мебель, и задаётся он раз на стол, а
 * не раз на человека. `true` — можно; строка — почему нет.
 */
export function mayAddChair(me: Someone, mode: Mode, table: Table = {}): true | string {
  return may("seat:add", me, me, mode, table);
}

/**
 * ЧТО МОЖНО СДЕЛАТЬ С ЭТИМ ЧЕЛОВЕКОМ, И ЧТО НЕЛЬЗЯ — С ПРИЧИНАМИ.
 *
 * В совете и вече разрешённое остаётся разрешённым, но становится ПРЕДЛОЖЕНИЕМ: та же кнопка,
 * другое слово. Своё над собой (цвет) голосования не требует — это не про комнату.
 */
export function deedsOn(me: Someone, them: Someone, mode: Mode, table: Table = {}): { can: Allowed[]; cant: Denied[] } {
  const p = powerOf(me, mode);
  const can: Allowed[] = [];
  const cant: Denied[] = [];
  for (const deed of [...HAND_DEEDS, ...DEEDS] as Deed[]) {
    const verdict = may(deed, me, them, mode, table);
    if (verdict !== true) {
      cant.push({ deed, label: DEED_WORD[deed], why: verdict });
      continue;
    }
    const own = me.account === them.account && deed !== "kick";
    const vote = p === "proposal" && !own;
    can.push({ deed, label: vote ? `Предложить: ${DEED_WORD[deed].toLowerCase()}` : DEED_WORD[deed], vote });
  }
  return { can, cant };
}
