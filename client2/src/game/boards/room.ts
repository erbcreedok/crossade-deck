// КОМНАТА — сборка людей вокруг живой борды (BOARDS-DESIGN §6–7). Роли — не иерархия классов,
// а ТРИ ортогональных факта о человеке:
//   identity   — кто он: user (токен аккаунта) | guest (без аккаунта, имя «цвет + зверь»);
//   membership — его отношение к КОМНАТЕ: member | moderator;
//   occupancy  — его отношение к БОРДЕ: player(seatId) | observer.
// «Игрок» — не сущность, а человек, занявший место; встал — снова наблюдатель.
//
// Чистая модель + редьюсер (без Pixi/React): стори гоняет её на одном канвасе с мок-людьми,
// сервер потом получит ту же модель поверх своих сообщений. Стандалон-игра = неявная комната
// с фиксированной бордой и спрятанным UI (решение §7) — отдельного кода не требует.

export type Membership = "member" | "moderator";
export type Occupancy = { kind: "observer" } | { kind: "player"; seat: string };

export interface RoomMember {
  id: string;
  name: string;
  guest: boolean;
  /** Presence-цвет: у гостя выводится из ЦВЕТА в имени («красная панда» — красный). */
  color: number;
  membership: Membership;
  occupancy: Occupancy;
}

export interface RoomPolicy {
  guestsAllowed: boolean;
  /** «Мешать»: наблюдателю разрешён драг в общих зонах (шахматы вечером). */
  observersCanTouch: boolean;
}

export interface RoomState {
  code: string;
  members: RoomMember[];
  policy: RoomPolicy;
  /** Какая борда стоит на столе (id из библиотеки) — заменяемая: люди и роли остаются. */
  boardId: string;
}

export type RoomCommand =
  | { t: "join"; id: string; displayName?: string; guest?: boolean }
  | { t: "leave"; id: string }
  | { t: "sit"; id: string; seat: string }
  | { t: "stand"; id: string }
  /** Поменяться местами с другим ИГРОКОМ (оба на местах) — «сесть за стул» друг друга. */
  | { t: "swapSeats"; a: string; b: string }
  | { t: "setBoard"; boardId: string }
  | { t: "setPolicy"; policy: Partial<RoomPolicy> }
  | { t: "setModerator"; id: string; on: boolean };

// ——— гости: «цвет + зверь», presence-цвет из цвета имени ———

const GUEST_COLORS: readonly { word: string; color: number }[] = [
  { word: "красная", color: 0xe05555 },
  { word: "синяя", color: 0x4c9ae0 },
  { word: "зелёная", color: 0x5ec46a },
  { word: "жёлтая", color: 0xe0c04c },
  { word: "лиловая", color: 0xb06ae0 },
  { word: "бирюзовая", color: 0x4cc8c8 },
];
const GUEST_ANIMALS = ["панда", "выдра", "рысь", "капибара", "сова", "лама", "черепаха", "лиса"] as const;

/** Имя гостя по его id — детерминированно: тот же гость всегда «та же панда». */
export function guestName(id: string): { name: string; color: number } {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = GUEST_COLORS[h % GUEST_COLORS.length]!;
  const a = GUEST_ANIMALS[Math.floor(h / GUEST_COLORS.length) % GUEST_ANIMALS.length]!;
  return { name: `${c.word} ${a}`, color: c.color };
}

const USER_COLORS = [0xe0a24c, 0x6a9ae0, 0x7ec46a, 0xd06ae0, 0x55c8b0, 0xe07a55];

function colorForUser(index: number): number {
  return USER_COLORS[index % USER_COLORS.length]!;
}

// ——— редьюсер ———

export function createRoom(code: string, boardId: string, policy?: Partial<RoomPolicy>): RoomState {
  return { code, members: [], policy: { guestsAllowed: true, observersCanTouch: false, ...policy }, boardId };
}

export function memberAt(room: RoomState, seat: string): RoomMember | undefined {
  return room.members.find((m) => m.occupancy.kind === "player" && m.occupancy.seat === seat);
}

export function applyRoomCommand(room: RoomState, cmd: RoomCommand): RoomState {
  switch (cmd.t) {
    case "join": {
      if (room.members.some((m) => m.id === cmd.id)) return room;
      const guest = cmd.guest ?? false;
      if (guest && !room.policy.guestsAllowed) return room;
      const named = guest ? guestName(cmd.id) : { name: cmd.displayName ?? cmd.id, color: colorForUser(room.members.length) };
      const member: RoomMember = {
        id: cmd.id,
        name: named.name,
        guest,
        color: named.color,
        // Первый вошедший — модератор (создатель комнаты); дальше права раздаёт он.
        membership: room.members.length === 0 ? "moderator" : "member",
        occupancy: { kind: "observer" },
      };
      return { ...room, members: [...room.members, member] };
    }
    case "leave":
      return { ...room, members: room.members.filter((m) => m.id !== cmd.id) };
    case "sit": {
      if (memberAt(room, cmd.seat)) return room; // занятый стул не отдаётся
      return mapMember(room, cmd.id, (m) => ({ ...m, occupancy: { kind: "player", seat: cmd.seat } }));
    }
    case "stand":
      return mapMember(room, cmd.id, (m) => ({ ...m, occupancy: { kind: "observer" } }));
    case "swapSeats": {
      const a = room.members.find((m) => m.id === cmd.a);
      const b = room.members.find((m) => m.id === cmd.b);
      if (!a || !b || a.occupancy.kind !== "player" || b.occupancy.kind !== "player") return room;
      const seatA = a.occupancy.seat;
      const seatB = b.occupancy.seat;
      let next = mapMember(room, cmd.a, (m) => ({ ...m, occupancy: { kind: "player", seat: seatB } }));
      next = mapMember(next, cmd.b, (m) => ({ ...m, occupancy: { kind: "player", seat: seatA } }));
      return next;
    }
    case "setBoard":
      // Смена борды = замена spec: люди, роли и цвета ОСТАЮТСЯ, occupancy сбрасывается —
      // у новой борды свои места (и их может быть меньше).
      return { ...room, boardId: cmd.boardId, members: room.members.map((m) => ({ ...m, occupancy: { kind: "observer" } })) };
    case "setPolicy":
      return { ...room, policy: { ...room.policy, ...cmd.policy } };
    case "setModerator":
      return mapMember(room, cmd.id, (m) => ({ ...m, membership: cmd.on ? "moderator" : "member" }));
  }
}

function mapMember(room: RoomState, id: string, f: (m: RoomMember) => RoomMember): RoomState {
  return { ...room, members: room.members.map((m) => (m.id === id ? f(m) : m)) };
}

/** Рассадка для BoardScene: seatId → имя сидящего (null — стул свободен). */
export function occupantsFor(room: RoomState, seatIds: readonly string[]): (string | null)[] {
  return seatIds.map((seat) => memberAt(room, seat)?.name ?? null);
}

/** Может ли этот человек трогать общие зоны борды: игрок — всегда, наблюдатель — по политике. */
export function canTouch(room: RoomState, id: string): boolean {
  const m = room.members.find((x) => x.id === id);
  if (!m) return false;
  return m.occupancy.kind === "player" || room.policy.observersCanTouch;
}
