// КТО СЕЙЧАС ЗА СТОЛОМ — и это единственное про комнату, чему место в памяти, а не в базе.
//
// Комната вечна, её люди — нет: список за столом живёт ровно столько, сколько идёт сессия, и после
// рестарта сервера он не «устарел», а просто перестал существовать вместе со столом, за которым
// сидели. Писать его в базу значило бы хранить факт, который врёт с первой же секунды простоя.
//
// Нужен он списку комнат: «2/4» и три лица в строке — это то, ради чего список открывают.

export interface PersonAtTable {
  readonly name: string;
  /** Любимый цвет из профиля. Пусто — у человека его ещё нет, и кружок будет тёмным. */
  readonly color: string | null;
  /** Отошёл: стул держится, человека нет. */
  readonly away?: boolean;
}

const atTable = new Map<string, readonly PersonAtTable[]>();

/** Ростер сессии сменился. `roomId` — вечная запись, а не сессия: сессий у неё много, стол один. */
export function setPeople(roomId: string, people: readonly PersonAtTable[]): void {
  atTable.set(roomId, people);
}

export function peopleAt(roomId: string): readonly PersonAtTable[] {
  return atTable.get(roomId) ?? [];
}

/** Сессия кончилась — за столом никого. Строка «сейчас 0 из 3» честнее, чем вчерашние лица. */
export function forgetPeople(roomId: string): void {
  atTable.delete(roomId);
}
