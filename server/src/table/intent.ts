// НАМЕРЕНИЕ С ПРОВОДА — читается целиком или не читается.
//
// Клиент стола пишут не только здесь: бот, стенд, чужая вкладка с открытой консолью. Всё, что приходит
// сообщением `intent`, — `unknown`, и стол получает его только после того, как каждое поле проверено
// по контракту. Лишние поля отрезаются: дальше идёт ровно то, что описано в `Intent`.
//
// Чистый модуль: ни комнаты, ни сети. Кто бы ни принимал намерения — принимает их через эту дверь.

import { BOT_ACTS, CARD_BACKS, CARD_FACES, DECK_DOS, GATHER_SIDES, PILE_GUARDS, type Arrange, type BotAct, type ChairFlag, type HandPose, type Intent, type TableRules, type Where } from "./contract.js";

/** Имя карты, стопки, стула, человека, дела — короткая строка. */
const NAME_MAX = 120;
/** Столько карт в одном намерении хватает любой колоде стола; больше — не намерение, а затопление. */
export const BATCH_MAX = 512;

const ARRANGES: readonly Arrange[] = ["suit", "rank", "reverse", "shuffle"];
const CHAIR_FLAGS: readonly ChairFlag[] = ["lock", "hide", "reject", "forever"];
const POSE_KEYS: readonly (keyof HandPose)[] = ["fan", "shrink", "tuck"];

type Raw = Record<string, unknown>;
const isRaw = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const name = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= NAME_MAX;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const names = (v: unknown): v is string[] => Array.isArray(v) && v.length <= BATCH_MAX && v.every(name);

function readWhere(raw: unknown): Where | null {
  if (!isRaw(raw)) return null;
  switch (raw.in) {
    case "deck": {
      if (!name(raw.pile)) return null;
      if (raw.i !== undefined && !num(raw.i)) return null;
      if (raw.turn !== undefined && !num(raw.turn)) return null;
      return { in: "deck", pile: raw.pile, ...(num(raw.i) ? { i: raw.i } : {}), ...(num(raw.turn) ? { turn: raw.turn } : {}) };
    }
    case "hand":
      return name(raw.chair) && num(raw.i) ? { in: "hand", chair: raw.chair, i: raw.i } : null;
    case "felt": {
      if (!num(raw.x) || !num(raw.y) || !bool(raw.up) || !num(raw.angle)) return null;
      if (raw.under !== undefined && !bool(raw.under)) return null;
      return { in: "felt", x: raw.x, y: raw.y, up: raw.up, angle: raw.angle, ...(bool(raw.under) ? { under: raw.under } : {}) };
    }
    default:
      return null;
  }
}

function readPose(raw: unknown): Partial<HandPose> | null {
  if (!isRaw(raw)) return null;
  const pose: Partial<HandPose> = {};
  for (const key of POSE_KEYS) {
    if (raw[key] === undefined) continue;
    if (!bool(raw[key])) return null;
    pose[key] = raw[key];
  }
  return pose;
}

function readRules(raw: unknown): Partial<TableRules> | null {
  if (!isRaw(raw)) return null;
  const rules: Partial<TableRules> = {};
  if (raw.dropEmptyChairs !== undefined) {
    if (!bool(raw.dropEmptyChairs)) return null;
    rules.dropEmptyChairs = raw.dropEmptyChairs;
  }
  if (raw.faces !== undefined) {
    if (!oneOf(CARD_FACES, raw.faces)) return null;
    rules.faces = raw.faces;
  }
  if (raw.back !== undefined) {
    if (!oneOf(CARD_BACKS, raw.back)) return null;
    rules.back = raw.back;
  }
  return rules;
}

/** Читатель на каждое намерение контракта: новое намерение без читателя не соберётся. */
const READERS: { [K in Intent["t"]]: (raw: Raw) => Extract<Intent, { t: K }> | null } = {
  grab: (r) => (name(r.id) ? { t: "grab", id: r.id } : null),
  hold: (r) => (name(r.id) ? { t: "hold", id: r.id } : null),
  release: (r) => (name(r.id) ? { t: "release", id: r.id } : null),
  turn: (r) => (name(r.id) ? { t: "turn", id: r.id } : null),
  drop: (r) => {
    const to = readWhere(r.to);
    return name(r.id) && to ? { t: "drop", id: r.id, to } : null;
  },
  grip: (r) => (name(r.pile) ? { t: "grip", pile: r.pile } : null),
  flip: (r) => (r.chair === undefined ? { t: "flip" } : name(r.chair) ? { t: "flip", chair: r.chair } : null),
  dealer: (r) => (r.key === null || name(r.key) ? { t: "dealer", key: r.key } : null),
  // Дело крупье. `chair` — кому оно адресовано, если дело того требует («указать ход»): без него
  // такое дело доходило до стола безадресным и молча ничего не делало.
  crew: (r) => (name(r.act) ? { t: "crew", act: r.act, ...(name(r.chair) ? { chair: r.chair } : {}) } : null),
  // Управление игроком без человека: только известные дела из каталога, только по имени стула.
  bot: (r) => {
    if (!name(r.chair) || !(BOT_ACTS as readonly unknown[]).includes(r.act)) return null;
    // Мозг — только именем из каталога и только короткой строкой: длинное сюда не приедет.
    const brain = typeof r.brain === "string" && r.brain.length > 0 && r.brain.length <= 32 ? r.brain : undefined;
    return { t: "bot", chair: r.chair as string, act: r.act as BotAct, ...(brain === undefined ? {} : { brain }) };
  },
  chair: (r) => (r.act === "add" || r.act === "drop" ? { t: "chair", act: r.act, ...(name(r.chair) ? { chair: r.chair as string } : {}) } : null),
  arrange: (r) => {
    if (!oneOf(ARRANGES, r.how)) return null;
    if (r.ids === undefined) return { t: "arrange", how: r.how };
    return names(r.ids) ? { t: "arrange", how: r.how, ids: r.ids } : null;
  },
  pose: (r) => {
    const pose = readPose(r.pose);
    return name(r.chair) && pose ? { t: "pose", chair: r.chair, pose } : null;
  },
  stand: () => ({ t: "stand" }),
  sit: (r) => (name(r.chair) ? { t: "sit", chair: r.chair } : null),
  flag: (r) => (name(r.chair) && oneOf(CHAIR_FLAGS, r.flag) && bool(r.on) ? { t: "flag", chair: r.chair, flag: r.flag, on: r.on } : null),
  deckMove: (r) => {
    if (!name(r.pile) || !num(r.x) || !num(r.y)) return null;
    if (r.angle !== undefined && !num(r.angle)) return null;
    return { t: "deckMove", pile: r.pile, x: r.x, y: r.y, ...(num(r.angle) ? { angle: r.angle } : {}) };
  },
  deckDo: (r) => (name(r.pile) && oneOf(DECK_DOS, r.how) ? { t: "deckDo", pile: r.pile, how: r.how } : null),
  deckForever: (r) => (name(r.pile) && bool(r.on) ? { t: "deckForever", pile: r.pile, on: r.on } : null),
  deckPin: (r) => (name(r.pile) && bool(r.on) ? { t: "deckPin", pile: r.pile, on: r.on } : null),
  deckGuard: (r) => (name(r.pile) && oneOf(PILE_GUARDS, r.guard) && bool(r.on) ? { t: "deckGuard", pile: r.pile, guard: r.guard, on: r.on } : null),
  gather: (r) => {
    if (!names(r.ids) || !oneOf(GATHER_SIDES, r.side) || !isRaw(r.to)) return null;
    const to = r.to;
    if (name(to.pile)) return { t: "gather", ids: r.ids, side: r.side, to: { pile: to.pile } };
    return num(to.x) && num(to.y) && num(to.angle) ? { t: "gather", ids: r.ids, side: r.side, to: { x: to.x, y: to.y, angle: to.angle } } : null;
  },
  pick: (r) => (names(r.ids) && bool(r.on) ? { t: "pick", ids: r.ids, on: r.on } : null),
  unpick: () => ({ t: "unpick" }),
  moveMany: (r) => {
    if (!Array.isArray(r.moves) || r.moves.length > BATCH_MAX) return null;
    const moves: { id: string; to: Where }[] = [];
    for (const one of r.moves as unknown[]) {
      const to = isRaw(one) ? readWhere(one.to) : null;
      if (!isRaw(one) || !name(one.id) || !to) return null;
      moves.push({ id: one.id, to });
    }
    return { t: "moveMany", moves };
  },
  pileDrop: (r) => {
    const to = readWhere(r.to);
    return name(r.pile) && to && to.in !== "felt" ? { t: "pileDrop", pile: r.pile, to } : null;
  },
  turnMany: (r) => (names(r.ids) ? { t: "turnMany", ids: r.ids } : null),
  rules: (r) => {
    const rules = readRules(r.rules);
    return rules ? { t: "rules", rules } : null;
  },
  sync: () => ({ t: "sync" }),
};

export const INTENT_KINDS: ReadonlySet<Intent["t"]> = new Set(Object.keys(READERS) as Intent["t"][]);

export function readIntent(raw: unknown): Intent | null {
  if (!isRaw(raw) || typeof raw.t !== "string" || !Object.hasOwn(READERS, raw.t)) return null;
  return READERS[raw.t as Intent["t"]](raw);
}
