// ЖУРНАЛ ПАРТИИ — кто что когда сделал, словами, на экране у каждого игрока.
//
// ГЛАВНЫЙ ЗАКОН: журнал показывает РОВНО ТО, ЧТО ЭТОТ ЗРИТЕЛЬ И ТАК ВИДИТ. Карта ушла в закрытую
// стопку, в скрытую руку или легла рубашкой — в журнале «карта» и рубашка, а не «дама пик». Иначе
// журнал стал бы дыркой в чужие карты: смотреть в него было бы выгоднее, чем на стол.
//
// И закон этот здесь НЕ ПРОВЕРЯЕТСЯ — он уже исполнен. Поток операций приходит прорезанным под
// зрителя (`Table.seenOp`): если у карты нет лица, значит стол этому игроку его не показал. Журнал
// просто честно печатает то, что получил, и подделать его нечем — второго источника карт у экрана нет.
//
// У КАЖДОГО ЗРИТЕЛЯ ЖУРНАЛ СВОЙ, и это следствие того же закона: одно движение для хозяина карты —
// «Ye взял 7 черв», для соседа — «Ye взял карту». Поэтому строки собираются на экране, а не на
// сервере: сервер разослал бы всем одинаковые.

import type { Chair, Face, Op, SeenCard, Snapshot, Where } from "../src/table/contract.js";

/** Одна запись журнала. `card` — лицо, если зритель его видел; иначе рубашка. */
export interface Deed {
  at: number;
  /** Кто сделал. Пусто — сделал стол (раздача, смена правил). */
  who?: string;
  /** Цвет того, кто сделал, — им же подсвечено имя. */
  ink?: string;
  /** Что случилось, словами: «положил на стол», «убрал в руку». */
  says: string;
  /** Карты этой записи: лицо или рубашка. */
  cards?: (Face | null)[];
  /** Сколько карт, если их много и показывать по одной незачем. */
  count?: number;
}

const HAND = "руку";

/**
 * Чья это рука — словами. `null` — рука того, кто сейчас ходит: её зовут СВОЕЙ, а не по имени.
 *
 * Иначе журнал заикается: «Ye из руки — Ye на стол». За столом так не говорят.
 */
function handOf(chair: string, snap: Snapshot, chairs: Map<string, Chair>, by: string | undefined): string | null {
  const owner = chairs.get(chair)?.owner ?? null;
  if (owner !== null && owner === by) return null;
  const person = owner === null ? undefined : snap.people.find((one) => one.key === owner);
  return person?.name ?? "пустой стул";
}

/** Имя стопки для человека: у мест, объявленных игрой, оно своё — «круг хода», а не «стопка». */
const pileOf = (pile: string, snap: Snapshot): string =>
  snap.piles.find((one) => one.id === pile)?.name?.toLowerCase() ?? (pile === "deck" ? "колода" : "стопка");

/** Куда положили: «на стол», «себе в руку», «в руку Батыру», «в круг хода». */
export function whereSays(where: Where, snap: Snapshot, chairs: Map<string, Chair>, by?: string): string {
  if (where.in === "felt") return "на стол";
  if (where.in === "hand") {
    const чья = handOf(where.chair, snap, chairs, by);
    return чья === null ? `себе в ${HAND}` : `в ${HAND} — ${чья}`;
  }
  return `в ${pileOf(where.pile, snap)}`;
}

/** Откуда взяли — то же место другим падежом: «со стола», «из своей руки», «из колоды». */
export function fromSays(where: Where, snap: Snapshot, chairs: Map<string, Chair>, by?: string): string {
  if (where.in === "felt") return "со стола";
  if (where.in === "hand") {
    const чья = handOf(where.chair, snap, chairs, by);
    return чья === null ? "из своей руки" : `из руки — ${чья}`;
  }
  return `из «${pileOf(where.pile, snap)}»`;
}

/** Лицо карты, если зритель его видел. `null` — рубашка: этот игрок карты не видел. */
const faceOf = (card: SeenCard): Face | null => card.face ?? null;

/** Кто держит эту карту сейчас — по нему подписывается движение, если следа нет. */
const whoOf = (snap: Snapshot, key: string | undefined): { who?: string; ink?: string } => {
  if (key === undefined) return {};
  const person = snap.people.find((one) => one.key === key);
  return person ? { who: person.name, ink: person.ink } : { who: key };
};

/**
 * ОДНА ОПЕРАЦИЯ — В СТРОКУ ЖУРНАЛА. `null` — событие, которое человеку показывать нечего
 * (замки, выделения, права): журнал должен читаться как рассказ о партии, а не как лента протокола.
 *
 * @param snap стол ПОСЛЕ операции — из него берутся имена людей, стульев и стопок
 */
export function deedOf(op: Op, snap: Snapshot, now: number): Deed | null {
  const chairs = new Map(snap.chairs.map((one) => [one.id, one]));
  switch (op.t) {
    case "move": {
      // ПОПРАВКА КАРТ В ОДНОЙ И ТОЙ ЖЕ РУКЕ — не событие партии, а привычка: её делают десятки раз
      // за круг, и в журнале она выходила строкой «из своей руки себе в руку».
      if (op.from.in === "hand" && op.to.in === "hand" && op.from.chair === op.to.chair) return null;
      // СЛЕД ЗНАЕТ, КТО НЁС, — он же переживает то, что карта уже в новом месте.
      const by = op.trail ? { who: op.trail.byName, ink: snap.people.find((p) => p.key === op.trail!.by)?.ink } : {};
      return {
        at: now,
        ...by,
        says: `${fromSays(op.from, snap, chairs, op.trail?.by)} ${whereSays(op.to, snap, chairs, op.trail?.by)}`,
        cards: [faceOf(op.card)],
      };
    }
    case "turn":
      return {
        at: now,
        who: op.trail.byName,
        ...(snap.people.find((p) => p.key === op.trail.by)?.ink === undefined ? {} : { ink: snap.people.find((p) => p.key === op.trail.by)!.ink }),
        says: op.up ? "перевернул лицом" : "перевернул рубашкой",
        cards: [faceOf(op.card)],
      };
    case "deck":
      // Перемешали — карты новые и лиц у них нет ни у кого: показывать нечего, кроме числа. Но
      // НАЗВАТЬ СТОПКУ надо: стопок за столом много, и «собрал стопку» не говорит, какую именно.
      return { at: now, says: `${op.shuffled ? "перемешал" : "собрал"} «${pileOf(op.pile, snap)}»`, count: op.cards.length };
    case "join":
      return { at: now, who: op.person.name, ink: op.person.ink, says: "сел за стол" };
    case "leave":
      return { at: now, ...whoOf(snap, op.key), says: "вышел" };
    case "unchair":
      return { at: now, says: "стул убран", ...(op.felt.length === 0 ? {} : { count: op.felt.length }) };
    case "unmake":
      return { at: now, says: "карты убраны со стола", count: op.ids.length };
    case "rules":
      return { at: now, says: "колода сменилась" };
    case "dealer":
      return { at: now, ...whoOf(snap, op.key ?? undefined), says: "раздаёт" };
    // ОСТАЛЬНОЕ — НЕ РАССКАЗ. Замки, выделения, права, поза руки и ход партии меняются десятки раз
    // за минуту и человеку ничего не говорят; в журнале они были бы шумом, за которым не видно игры.
    default:
      return null;
  }
}

/** Сколько записей журнал держит. Больше телефон не прокрутит, а память за партию вырастет заметно. */
export const JOURNAL_KEEP = 200;

/** Журнал: копит записи, старые выбрасывает. */
export function journal(keep = JOURNAL_KEEP) {
  let deeds: Deed[] = [];
  return {
    /** Принять пачку операций. Возвращает, добавилось ли что-то: по этому экран решает, перерисовывать ли. */
    take(ops: readonly Op[], snap: Snapshot, now: number): boolean {
      const свежие = ops.map((op) => deedOf(op, snap, now)).filter((one): one is Deed => one !== null);
      if (свежие.length === 0) return false;
      deeds = [...deeds, ...свежие].slice(-keep);
      return true;
    },
    all(): readonly Deed[] {
      return deeds;
    },
    clear(): void {
      deeds = [];
    },
  };
}
