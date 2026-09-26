// ЖУРНАЛ ЗАПИСИ СЛОВАМИ — строка журнала комнаты, рассказанная человеку: кто, что, какой картой,
// откуда и куда.
//
// ГЛАЗА ЗАПИСИ — ЗАКОН. Запись хранит стол правдой (`seenBy(…, true)`): каждое лицо в ней открыто. А
// смотрят её чьими-то глазами, и журнал не должен быть дыркой в карты, которых эти глаза не видели.
// Поэтому лица режутся здесь тем же правилом, каким их режет стол (`Table.visibleTo`), — глазами
// выбранного зрителя, по кадру этого мгновения.
//
// Ходы стола рассказывает тот же `deedOf`, что пишет живой журнал за столом: слова одни, двух
// несовместимых рассказов об одном ходе нет. Своё здесь — только события журнала комнаты, которых
// живой журнал не видит (вход, отказ, начало партии, экран).
//
// Чего описать нечем — так и сказано: «описания нет», без выдуманного объяснения.

import { REFUSAL_SAYS, type Face, type Intent, type Op, type Refusal, type SeenCard, type Snapshot, type Where } from "../src/table/contract.js";
import { journal, whereSays } from "./journal.js";
import type { Told } from "./replayStore.js";

/** Событие для человека. `cards` — лица, как их видят выбранные глаза; `null` — рубашка. */
export interface LogLine {
  /** Кто сделал; `null` — стол или экран сам. */
  who: string | null;
  says: string;
  cards: (Face | null)[];
  /** Есть ли у этого вида события описание; `false` — честное «описания нет». */
  known: boolean;
}

const SUIT: Record<Face["suit"], string> = { s: "♠", h: "♥", d: "♦", c: "♣", r: "★", b: "★" };

/** Лицо словами: «10♥». Рубашка — «карта рубашкой». */
export const cardText = (face: Face | null): string => (face ? `${face.rank}${SUIT[face.suit] ?? ""}` : "карта рубашкой");

/**
 * ВИДНО ЛИ ЛИЦО ЭТИМ ГЛАЗАМ — правило стола (`Table.visibleTo`) по кадру, а не по серверу. В руке:
 * хозяину, пока карта не перевёрнута; остальным — если стул не скрыт. На сукне — если лицом вверх. В
 * стопке — если перевёрнута.
 */
function sees(viewer: string, snap: Snapshot, where: Where, card: SeenCard): boolean {
  if (where.in === "hand") {
    const chair = snap.chairs.find((one) => one.id === where.chair);
    return chair !== undefined && ((chair.owner === viewer && card.up !== true) || !chair.hide);
  }
  if (where.in === "felt") return where.up;
  return card.up === true;
}

/** Где карта лежит в кадре и какая она там. */
function locate(snap: Snapshot, id: string): { where: Where; card: SeenCard } | null {
  for (const chair of snap.chairs) {
    const i = chair.hand.findIndex((c) => c.id === id);
    if (i >= 0) return { where: { in: "hand", chair: chair.id, i }, card: chair.hand[i]! };
  }
  for (const pile of snap.piles) {
    const card = pile.cards.find((c) => c.id === id);
    if (card) return { where: { in: "deck", pile: pile.id }, card };
  }
  const felt = snap.felt.find((c) => c.id === id);
  return felt ? { where: { in: "felt", x: felt.x, y: felt.y, up: felt.up, angle: felt.angle }, card: felt } : null;
}

/** Лицо карты в кадре глазами зрителя; `null` — рубашка или карты в кадре нет. */
export function faceSeen(snap: Snapshot, viewer: string, id: string): Face | null {
  const at = locate(snap, id);
  return at && at.card.face && sees(viewer, snap, at.where, at.card) ? at.card.face : null;
}

/** Снять с карты лицо, если глаза его не видят. */
const cut = (card: SeenCard, keep: boolean): SeenCard => (keep || card.face === undefined ? card : (({ face: _face, ...rest }) => rest)(card));

/** Ход глазами зрителя — то, что `Table.seenOp` сделал бы с ним на сервере. */
export function opSeen(op: Op, snap: Snapshot, viewer: string): Op {
  if (op.t === "move") return { ...op, card: cut(op.card, sees(viewer, snap, op.to, op.card)) };
  if (op.t === "turn") {
    const at = locate(snap, op.card.id);
    return { ...op, card: cut(op.card, at !== null && sees(viewer, snap, at.where, at.card)) };
  }
  if (op.t === "deck") return { ...op, cards: op.cards.map((c) => cut(c, sees(viewer, snap, { in: "deck", pile: op.pile }, c))) };
  if (op.t === "chair") return { ...op, chair: { ...op.chair, hand: op.chair.hand.map((c, i) => cut(c, sees(viewer, snap, { in: "hand", chair: op.chair.id, i }, c))) } };
  return op;
}

/** Кадр стола глазами зрителя: лица, которых он не видит, сняты. */
export function snapSeen(snap: Snapshot, viewer: string): Snapshot {
  return {
    ...snap,
    chairs: snap.chairs.map((chair) => ({ ...chair, hand: chair.hand.map((c, i) => cut(c, sees(viewer, snap, { in: "hand", chair: chair.id, i }, c))) })),
    piles: snap.piles.map((pile) => ({ ...pile, cards: pile.cards.map((c) => cut(c, sees(viewer, snap, { in: "deck", pile: pile.id }, c))) })),
    felt: snap.felt.map((c) => (c.up || c.face === undefined ? c : (({ face: _face, ...rest }) => rest)(c))),
  };
}

/**
 * СЫРОЕ СОДЕРЖИМОЕ СОБЫТИЯ ГЛАЗАМИ ЗРИТЕЛЯ — для технических подробностей. Сырое — тоже журнал, и
 * лица в нём режутся так же: ходы — по кадру мгновения, записанные кадры стола — по самим себе.
 */
export function rawSeen(deed: Told, snap: Snapshot, viewer: string): unknown {
  const what = deed.what as Record<string, unknown> | undefined;
  if (!what || typeof what !== "object") return deed.what ?? null;
  if (deed.kind === "patch" && Array.isArray(what.ops)) return { ...what, ops: (what.ops as Op[]).map((op) => opSeen(op, snap, viewer)) };
  if (what.snapshot && typeof what.snapshot === "object") return { ...what, snapshot: snapSeen(what.snapshot as Snapshot, viewer) };
  return what;
}

const REFUSAL_TECH: Partial<Record<Refusal, string>> = { busy: "карту держит другой", "not-held": "карту не держали", gone: "карты уже нет", bad: "неверный ход" };
const refusalText = (why: unknown): string => {
  const text = REFUSAL_SAYS[why as Refusal] || REFUSAL_TECH[why as Refusal];
  return text ? text.toLowerCase() : `причина «${String(why)}»`;
};

/** Намерение словами: что человек пытался сделать. `null` — такого намерения журнал не знает. */
function intentSays(intent: Intent | undefined, snap: Snapshot, viewer: string, by: string | undefined, name: (key: string) => string): { says: string; cards: (Face | null)[] } | null {
  if (!intent || typeof intent !== "object") return null;
  const card = (id: string) => faceSeen(snap, viewer, id);
  const chairs = new Map(snap.chairs.map((one) => [one.id, one]));
  switch (intent.t) {
    case "grab":
      return { says: "берёт карту", cards: [card(intent.id)] };
    case "hold":
      return { says: "держит карту", cards: [card(intent.id)] };
    case "drop":
      return { says: `${intent.throw ? "бросает с силой" : "кладёт"} ${whereSays(intent.to, snap, chairs, by)}`, cards: [card(intent.id)] };
    case "release":
      return { says: "отпускает, не перекладывая", cards: [] };
    case "grip":
      return { says: `берёт стопку «${snap.piles.find((p) => p.id === intent.pile)?.name ?? intent.pile}»`, cards: [] };
    case "turn":
      return { says: "переворачивает карту", cards: [card(intent.id)] };
    case "flip":
      return { says: "переворачивает порядок руки", cards: [] };
    case "dealer":
      return { says: intent.key === null ? "снимает раздающего" : `отдаёт раздачу: ${name(intent.key)}`, cards: [] };
    case "crew":
      return { says: `просит крупье: «${intent.act}»`, cards: [] };
    case "bot":
      return { says: `управляет ботом: «${intent.act}»`, cards: [] };
    case "chair":
      return { says: intent.act === "add" ? "ставит стул" : "убирает стул", cards: [] };
    case "arrange":
      return { says: `переставляет руку: «${intent.how}»`, cards: [] };
    default:
      return null;
  }
}

/**
 * ОДНА СТРОКА ЖУРНАЛА КОМНАТЫ — СЛОВАМИ. Ход стола может дать несколько строк (крупье собрал круг и
 * тут же сменилась очередь), остальные события — одну.
 *
 * @param snap кадр стола на этом мгновении, правдой; лица режутся под `viewer` здесь
 * @param name имя по ключу человека
 */
export function describe(deed: Told, snap: Snapshot, viewer: string, name: (key: string) => string): LogLine[] {
  const what = (deed.what ?? {}) as Record<string, unknown>;
  const who = deed.who ? name(deed.who) : null;
  const one = (says: string, cards: (Face | null)[] = []): LogLine[] => [{ who, says, cards, known: true }];

  if (deed.side === "table" && deed.kind === "patch") {
    const ops = Array.isArray(what.ops) ? (what.ops as Op[]) : [];
    if (ops.length === 0) return [{ who: null, says: "ход обрезан в записи — что в нём было, неизвестно", cards: [], known: false }];
    const told = journal();
    told.take(ops.map((op) => opSeen(op, snap, viewer)), snap, deed.at);
    const lines = told.all().map((d) => {
      const cards = d.cards ?? [];
      const deal = d.deal?.length ? `: ${d.deal.map((p) => `${p.hand} — ${p.n}`).join(", ")}` : "";
      const count = d.count && cards.length === 0 && !d.deal ? ` (${d.count})` : "";
      return { who: d.who ?? null, says: `${d.says}${deal}${count}`, cards, known: true };
    });
    return lines.length > 0 ? lines : [{ who: null, says: `служебное изменение стола (${[...new Set(ops.map((op) => op.t))].join(", ")}) — на столе ничего не сдвинулось`, cards: [], known: true }];
  }

  switch (deed.kind) {
    case "act": {
      if (deed.side === "screen") return one("отправил действие столу");
      const said = intentSays(what.intent as Intent | undefined, snap, viewer, deed.who, name);
      return said ? one(said.says, said.cards) : [{ who, says: `действие «${String((what.intent as { t?: unknown } | undefined)?.t)}» — описания нет`, cards: [], known: false }];
    }
    case "refused": {
      const said = intentSays(what.intent as Intent | undefined, snap, viewer, deed.who, name);
      return one(`получил отказ: ${refusalText(what.why)}${said ? ` (хотел: ${said.says})` : ""}`, said?.cards ?? []);
    }
    case "join":
      return one(what.again ? "вернулся за стол" : "сел за стол");
    case "leave":
      return one("встал из-за стола");
    case "window.close":
      return one("закрыл окно стола");
    case "room.open":
      return one("открыл стол");
    case "room.close":
      return one("стол закрыт");
    case "room.raised":
      return one("стол поднят после перезапуска сервера");
    case "table.first":
      return one("первый кадр стола записан");
    case "match.start": {
      const players = Array.isArray(what.игроки) ? (what.игроки as { name?: string }[]).map((p) => p.name).filter(Boolean) : [];
      return one(`раздал — партия началась${players.length ? `: ${players.join(", ")}` : ""}`);
    }
    case "match.end":
      return one("проиграл — партия окончена");
    case "match.out":
      return one(`вышел из партии${typeof what.место === "number" ? `, место ${what.место}` : ""}`);
    case "match":
      if (what.идёт === false) return one("партии нет");
      return one(typeof what.ход === "string" ? `очередь хода: ${name(what.ход)}` : "очередь хода: никого");
    case "mic":
      return one(what.on ? "включил микрофон" : "выключил микрофон");
    case "replay.pass":
      return one("взял ссылку на запись");
    case "chair.add":
      return one("поставил стул");
    case "chair.drop":
      return one("убрал стул");
    case "crew.point":
      return one("крупье указал, чей ход");
    case "crew.failed":
      return one(`крупье не смог: «${String(what.шаг)}»`);
    case "crew.refused":
      return one(`крупье отказал: «${String(what.дело)}»`);
    case "bot.seated":
      return one(`посадил бота: ${typeof what.кому === "string" ? name(what.кому) : "бот"}`);
    case "bot.order":
      return one(`велел боту ${typeof what.кому === "string" ? name(what.кому) : ""}: «${String(what.дело)}»`);
    case "bot.act":
    case "outside.act":
      return one(`сходил: «${String(what.move)}»`, typeof what.id === "string" ? [faceSeen(snap, viewer, what.id)] : []);
    case "bot.refused":
      return one(`бот получил отказ: ${refusalText(what.why)}`);
    case "bot.failed":
      return one("бот не смог сходить");
    // ЭКРАН ИГРОКА — что было у него на телефоне.
    case "open":
      return one(`открыл стол на экране ${String(what.w)}×${String(what.h)}`);
    case "open.failed":
      return one("стол не открылся на экране");
    case "view":
      return one("повёл камеру");
    case "screen":
      return one("экран перестроился");
    case "press":
      return one("коснулся экрана");
    case "press.idle":
      return one("коснулся — и ничего не произошло");
    case "sound":
      return one("звук на экране изменился");
    case "boom":
      return one(`ошибка на странице${typeof what.text === "string" ? `: ${what.text}` : ""}`);
    case "gone":
      return one("выпал из стола");
    case "link":
      return one(what.up ? "связь со столом восстановилась" : "связь со столом пропала");
    case "voice.links":
      return one("голосовая связь изменилась");
    case "voice.silent":
      return one("голос: кого-то не слышно");
    default:
      return [{ who, says: `событие «${deed.kind}» — описания нет`, cards: [], known: false }];
  }
}
