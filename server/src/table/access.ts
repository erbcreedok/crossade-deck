// ДОСТУПЫ — ОДНА МОДЕЛЬ НА ВСЁ. Стол, стопки, руки, карты, крупье: вопрос всегда один и тот же.
//
//   «Можно ли <ключ> с <этой вещью>?» → можно, либо нельзя И ПОЧЕМУ.
//
// Ни ролей, ни «админа», ни «крупье» снаружи не видно. Роль — способ ВЫДАТЬ набор ключей, и живёт
// она только на сервере (`ROLES` ниже). Клиент знает разрешения, а не роли.
//
// ЭТОТ ФАЙЛ ЗОВУТ ОБА КОНЦА. Сервер — перед действием, клиент — перед тем, как нарисовать кнопку.
// Второго разбора нет нигде: два списка правил разошлись бы молча, и человек увидел бы кнопку,
// которую сервер откажет.

/**
 * ВСЁ, ЧТО МОЖНО СПРОСИТЬ. Ключ — `что.действие`.
 *
 *   table.*  стол целиком: раздать, собрать, перемешать, пресет, вид карт, роли, крупье
 *   pile.*   стопка: взять из неё, положить в неё, сгрести целиком, переставить, замки
 *   hand.*   рука: взять, положить, переложить, перевернуть, поза, флаги стула
 *   card.*   карта: накрыть другую, перевернуть одну
 *   crew.*   дела набора крупье — обычные ключи, а не отдельный вид конфига
 */
export const KEYS = [
  "table.deal", "table.collect", "table.shuffle", "table.preset", "table.look", "table.croupier", "table.roles", "table.close",
  "pile.take", "pile.drop", "pile.grip", "pile.move", "pile.guard",
  "hand.take", "hand.drop", "hand.reorder", "hand.flip", "hand.pose", "hand.flags",
  "card.cover", "card.turn",
] as const;

/** Ключ: из списка выше либо дело набора крупье (`crew.collect`, `crew.layout`, …). */
export type Key = (typeof KEYS)[number] | `crew.${string}`;

/**
 * ПОЧЕМУ НЕЛЬЗЯ. Отказ всегда назван: по причине экран пишет человеку словами, а сторож отличает
 * «запретила игра» от «заперта рука» — иначе оба выглядят как молчаливое «не сработало».
 */
export const WHYS = ["not-yours", "locked", "rejects", "not-your-turn", "beats", "full", "no-right"] as const;
export type Why = (typeof WHYS)[number];

export type Verdict = true | { no: Why };

/** Отказ — значение, а не исключение: его носят в ответе и показывают человеку. */
export const no = (why: Why): Verdict => ({ no: why });
export const yes: Verdict = true;
export const allowed = (v: Verdict): boolean => v === true;
export const why = (v: Verdict): Why | null => (v === true ? null : v.no);

/** Замки самой вещи — те же имена, что у стула и у стопки (`contract.ts`). */
export interface Locks {
  /** Рука: чужой не лезет. Стопка: порядок карт держится. */
  lock?: boolean;
  /** Рука не принимает: ни карт, ни стопок, ни от кого. */
  reject?: boolean;
  /** Стопка не принимает. */
  shut?: boolean;
  /** Стопку не сгрести и не вмержить. */
  seal?: boolean;
  /** Стопка прибита к сукну. */
  pin?: boolean;
}

/**
 * ЧТО НУЖНО ЗНАТЬ, ЧТОБЫ ОТВЕТИТЬ. Четыре источника — и ничего кроме них.
 *
 * Здесь нет ни стола, ни сети, ни часов: голые данные. Поэтому один и тот же разбор работает на
 * сервере, где стол настоящий, и на клиенте, где есть только снимок.
 */
export interface Ask {
  /** ИСТОЧНИК 4: ключи, выданные этому человеку. */
  granted: readonly string[];
  /** ИСТОЧНИК 1: замки вещи, с которой имеют дело. */
  locks?: Locks;
  /** ИСТОЧНИК 2: его ли это вещь — своя рука, своя выделенная карта. */
  mine?: boolean;
  /** ИСТОЧНИК 3: что сказала игра. Молчит (`undefined`) — игре нечего добавить. */
  game?: Verdict;
}

/**
 * КАКОЙ ЗАМОК ЧТО ЗАПИРАЕТ. Ключ спрашивает у вещи ровно то, что к нему относится.
 *
 * `lock` в этой таблице нет нарочно: он запирает ЧУЖОГО, а «чужой» — источник 2, и разбирается ниже
 * вместе с `mine`.
 */
const SHUTS: Partial<Record<Key, readonly [keyof Locks, Why][]>> = {
  "hand.drop": [["reject", "rejects"]],
  "pile.drop": [["shut", "locked"]],
  "pile.grip": [["seal", "locked"], ["pin", "locked"]],
  "pile.move": [["pin", "locked"]],
};

/**
 * ЧТО ЗАПИРАЕТ ЗАМОК. Замок руки и стопки стережёт ЧУЖОГО: хозяин своей рукой волен и под замком.
 *
 * Это и есть источник 2 — «своё или чужое»: он не запрещает сам по себе, а решает, действует ли на
 * этого человека замок вещи.
 */
const LOCKED: Partial<Record<Key, true>> = {
  "hand.take": true,
  "hand.drop": true,
  "hand.reorder": true,
  "hand.flip": true,
  "card.turn": true,
};

/** Ключи, которые есть у всех и без выдачи: со своим человек волен, и разрешения на это не просят. */
const FREE: Partial<Record<Key, true>> = {
  "hand.take": true,
  "hand.drop": true,
  "hand.reorder": true,
  "hand.flip": true,
  "pile.take": true,
  "pile.drop": true,
  "pile.grip": true,
  "pile.move": true,
  "card.cover": true,
  "card.turn": true,
};

/**
 * ОТВЕТ. Источники спрашиваются по порядку, и ПЕРВЫЙ ОТКАЗ ВЫИГРЫВАЕТ.
 *
 * Разрешение не перебивает отказ никогда — в этом весь смысл порядка: право не ломает замок.
 * Распорядитель стола не лезет в запертую руку; он снимает замок, если ему это позволено
 * (`hand.flags`), и это отдельный вопрос с отдельным ответом.
 */
export function may(key: Key, ask: Ask): Verdict {
  // 1. ВЕЩЬ.
  for (const [lock, reason] of SHUTS[key] ?? []) if (ask.locks?.[lock]) return no(reason);
  // 2. СВОЁ ИЛИ ЧУЖОЕ: замок действует на чужого и не действует на хозяина.
  if (LOCKED[key] && ask.locks?.lock && ask.mine !== true) return no("locked");
  // 3. ИГРА.
  if (ask.game !== undefined && ask.game !== true) return ask.game;
  // 4. НАБОР.
  if (!FREE[key] && !ask.granted.includes(key)) return no("no-right");
  return yes;
}

/**
 * РОЛИ — ТОЛЬКО ЗДЕСЬ И ТОЛЬКО НА СЕРВЕРЕ. Роль это имя набора ключей, и ничего кроме.
 *
 * `admin` — ведёт стол. `dealer` — раздающий этой сессии: ровно работа сдающего. `player` — все за
 * столом; со своими картами он и так волен, и отдельных ключей ему не нужно.
 */
export const ROLES = {
  /**
   * ХОЗЯИН — тот, кто открыл комнату. Всё, что есть у распорядителя, и сверх того два дела, которых
   * не отдают: РАЗДАВАТЬ РОЛИ и ЗАКРЫТЬ КОМНАТУ. Поэтому админа он выдаёт и забирает, а сам админ —
   * не может ни того, ни другого: иначе комнату отбирают у хозяина его же кнопкой.
   */
  owner: ["table.deal", "table.collect", "table.shuffle", "table.preset", "table.look", "table.croupier", "table.roles", "table.close", "pile.guard", "hand.pose", "hand.flags"],
  /** РАСПОРЯДИТЕЛЬ — ведёт стол: раздаёт, собирает, правит замки и позы. Ролей не раздаёт. */
  admin: ["table.deal", "table.collect", "table.shuffle", "table.preset", "table.look", "table.croupier", "pile.guard", "hand.pose", "hand.flags"],
  /** РАЗДАЮЩИЙ этой сессии: ровно работа сдающего. */
  dealer: ["table.deal", "table.collect", "table.shuffle"],
  /** ИГРОК — все за столом. Со своими картами он и так волен, отдельных ключей ему не нужно. */
  player: [],
} as const satisfies Record<string, readonly Key[]>;

export type Role = keyof typeof ROLES;
export const ROLE_NAMES: readonly Role[] = Object.keys(ROLES) as Role[];

/** Все ключи этих ролей — одним списком. Он и едет клиенту. */
export const grantedTo = (roles: Iterable<Role>, extra: readonly Key[] = []): Key[] => {
  const out = new Set<Key>(extra);
  for (const role of roles) for (const key of ROLES[role] as readonly Key[]) out.add(key);
  return [...out];
};

/** Есть ли такая роль. Разбор пришедшего значения идёт по таблице, а не по перечню имён в коде. */
export const isRole = (role: unknown): role is Role => typeof role === "string" && Object.hasOwn(ROLES, role);
