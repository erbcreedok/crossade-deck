// ПРИГЛАШЕНИЕ В ЧУЖУЮ ПЕРЕПИСКУ — то, что бот кладёт в чат, где его самого нет.
//
// Slash-команду в личке двух людей бот не слышит и услышать не может: он там не присутствует.
// Единственная дверь — inline mode: человек набирает `@CrossaderBot chess` прямо в переписке, под
// полем ввода выпадают столы, и выбранный ложится в чат карточкой со ссылкой.
//
// КНОПКА — ОБЫЧНАЯ ССЫЛКА, а не `web_app`: такие кнопки телега разрешает только в личке с самим
// ботом, и в inline-карточке их не бывает. `t.me/<бот>?startapp=<код>` открывает мини-апп ровно
// так же — хаб читает код из `start_param`.
//
// Здесь только слова и адреса. Кода стола этот файл не выдумывает: его держит сервер.

import { GAMES, type Game } from "./games.js";

/** Какие столы предложить на набранное. Пусто — все: человек ещё не выбрал, а не ошибся. */
export function gamesFor(query: string): Game[] {
  const asked = query.trim().toLowerCase();
  const all = Object.keys(GAMES) as Game[];
  if (!asked) return all;
  const fits = all.filter((game) => game.startsWith(asked) || GAMES[game].toLowerCase().startsWith(asked));
  // НЕ ПОНЯЛИ — ПОКАЗЫВАЕМ ВСЁ, а не пустоту: пустой выпадающий список выглядит поломкой бота, а
  // человек всего лишь набрал «ша» кириллицей там, где ждали «chess».
  return fits.length > 0 ? fits : all;
}

/** Адрес стола внутри телеги. Код едет в `startapp` — единственной строке, которую бот может передать. */
export function startappUrl(botName: string, code: string): string {
  return `https://t.me/${botName}?startapp=${encodeURIComponent(code)}`;
}

/** Что написано в карточке: её строчка в выпадающем списке и само сообщение, которое ляжет в чат. */
export function inviteCard(game: Game, code: string): { title: string; description: string; text: string; button: string } {
  return {
    title: GAMES[game],
    description: `Стол ${code} — сядем вдвоём`,
    text: `Стол «${GAMES[game]}», код ${code}`,
    button: "Войти",
  };
}
