// СТОЛ ДЛЯ ПРИМЕРКИ ЭКРАНА «ЗА СТОЛОМ»: вечная комната с кодом TEST, за ней — оунер, админ, игрок
// и зритель.
//
// Список участников нечем проверить, пока в комнате один человек: роли, «без стула» и порядок
// строк видно только тогда, когда за столом разные люди. Живых четверых для этого не собрать, и
// поэтому трое здесь — записи в базе: настоящие аккаунты, настоящее членство, настоящие роли.
//
// ОУНЕР — ЖИВОЙ ЧЕЛОВЕК, А НЕ ЧЕТВЁРТАЯ ВЫДУМКА: стол заводится затем, чтобы в него зайти своим
// же телефоном, и комната, принадлежащая выдуманному аккаунту, для этого не годится.
//
//   npm run seed:test-room -- <имя аккаунта | номер аккаунта | телеграм-id>
//
// Запускается повторно: комната с кодом TEST заводится один раз, а люди за ней досаживаются.

import { createAccount } from "../src/accounts.js";
import { db } from "../src/db/open.js";
import { accountById, accountByIdentity } from "../src/db/accountsRepo.js";
import { addMember, roomByCode, type Role } from "../src/db/roomsRepo.js";
import { openRoom } from "../src/rooms.js";

const CODE = "TEST";

/** Мокковые соседи: имя, цвет и роль. Зритель — без стула, и это видно в списке. */
const GUESTS: readonly { name: string; color: string; role: Role }[] = [
  { name: "Алия", color: "#7fd1b9", role: "admin" },
  { name: "Тимур", color: "#e08b3f", role: "player" },
  { name: "Дана", color: "#b98fe0", role: "spectator" },
];

/** Кого назвали хозяином: номер аккаунта, телеграм-id или имя — что из них подошло. */
function ownerBy(asked: string): string | undefined {
  if (accountById(asked)) return asked;
  const telegram = accountByIdentity("telegram", asked);
  if (telegram) return telegram.id;
  // ИМЁНА НЕ УНИКАЛЬНЫ: двух «Ерболов» нельзя разводить молча — стол уйдёт не тому, и это
  // выяснится, только когда он не найдётся в своём списке комнат.
  const rows = db().prepare(`SELECT id FROM accounts WHERE name = ?`).all(asked) as { id: string }[];
  if (rows.length > 1) {
    console.error(`Аккаунтов с именем «${asked}» несколько: ${rows.map((r) => r.id).join(", ")}. Назови номер.`);
    process.exit(1);
  }
  return rows[0]?.id;
}

/** Аккаунт с таким именем — или новый с ним же. Скрипт запускают не один раз. */
function guestAccount(name: string, color: string): string {
  const row = db().prepare(`SELECT id FROM accounts WHERE name = ?`).get(name) as { id: string } | undefined;
  if (row) return row.id;
  const made = createAccount(name);
  db().prepare(`UPDATE accounts SET color = ? WHERE id = ?`).run(color, made.id);
  return made.id;
}

function main(): void {
  const asked = process.argv[2];
  if (!asked) {
    console.error("Кому принадлежит стол? npm run seed:test-room -- <имя | номер аккаунта | телеграм-id>");
    process.exit(1);
  }
  const owner = ownerBy(asked);
  if (!owner) {
    console.error(`Не нашёл аккаунт «${asked}». Имя должно совпадать точно — так, как оно записано в профиле.`);
    process.exit(1);
  }

  const room =
    roomByCode(CODE) ??
    openRoom({ game: "cards", seats: 4, ownerAccount: owner, visibility: "hidden", admission: "code", mode: "free", forever: true, code: CODE });
  if (!room) {
    console.error(`Код ${CODE} занят другой комнатой.`);
    process.exit(1);
  }

  for (const guest of GUESTS) addMember(room.id, guestAccount(guest.name, guest.color), guest.role);

  console.log(`Стол ${room.code} (${room.id}): оунер ${accountById(owner)!.name}, за ним ${GUESTS.map((g) => `${g.name} — ${g.role}`).join(", ")}.`);
}

main();
