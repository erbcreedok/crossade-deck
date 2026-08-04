// Анонимные ники песочницы — «цвет + животное», как гости в Google Docs. Детерминированы от
// sessionId (переподключение того же сокета даёт то же имя). Зеркало client2/game/boards/room.ts
// (пакеты не делят код — тот же приём, что у version.ts).

const NICK_COLORS: readonly { word: string; color: number }[] = [
  { word: "Красная", color: 0xe0483f },
  { word: "Синяя", color: 0x6a9ae0 },
  { word: "Зелёная", color: 0x7ec46a },
  { word: "Лиловая", color: 0xd06ae0 },
  { word: "Бирюзовая", color: 0x55c8b0 },
  { word: "Рыжая", color: 0xe0a24c },
];

const NICK_ANIMALS = ["панда", "лиса", "сова", "выдра", "рысь", "белка", "цапля", "куница"] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function guestIdentity(sessionId: string): { name: string; color: number } {
  const h = hash(sessionId);
  const c = NICK_COLORS[h % NICK_COLORS.length]!;
  const a = NICK_ANIMALS[Math.floor(h / NICK_COLORS.length) % NICK_ANIMALS.length]!;
  return { name: `${c.word} ${a}`, color: c.color };
}

export const MEMBER_COLORS = [0xe0a24c, 0x6a9ae0, 0x7ec46a, 0xd06ae0, 0x55c8b0, 0xe07a55, 0xc9c95a, 0x8a7ae0, 0x5ab0c9, 0xc97a5a, 0x7ac98a, 0xc95a9a] as const;
