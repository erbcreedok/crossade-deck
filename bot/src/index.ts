import { Bot } from "grammy";
import { loadEnv } from "./env.js";
import { TableApi, tableEnv } from "./table/api.js";
import { startNodeBeat } from "./table/node.js";
import { installTable } from "./table/tableBot.js";
import { Registry } from "./table/registry.js";
import { Watch } from "./table/watch.js";

/** Что бот отвечает на голый /start: стол зовётся в переписку, а не выбирается из списка игр. */
const START_SAID = [
  "Комната живёт в переписке: набери @<бот> в любом чате и выбери, какую открыть — песочницу или крестовый.",
  "Здесь же: /room — открыть комнату в этом чате, /rooms — твои комнаты.",
].join("\n");

const env = loadEnv();
const bot = new Bot(env.botToken);
bot.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  // «В ПРИЛОЖЕНИИ» С КАРТОЧКИ СТОЛА — пропуск лично нажавшему (`appLink.ts`).
  const native = /^app-([A-Za-z0-9_-]{12,60})$/.exec(ctx.match?.trim() ?? "");
  if (native && table) return void (await table.app(ctx, native[1]!));
  await ctx.reply(START_SAID);
});

/**
 * СТОЛЫ ДЛЯ HTML-КЛИЕНТА — свой набор команд (`table/tableBot.ts`), включается, только если настроен
 * сервер стола. Ставится после разговора про профиль: тот отпускает сообщения, которых не ждал.
 */
const table = (() => {
  const tenv = tableEnv();
  if (!tenv) return undefined;
  const file = process.env.TABLE_CHATS_FILE || new URL("../data/table-chats.json", import.meta.url).pathname;
  const rooms = process.env.TABLE_ROOMS_FILE || new URL("../data/table-rooms.json", import.meta.url).pathname;
  return installTable(bot, new TableApi(tenv), new Watch(file), new Registry(rooms), tenv.secret);
})();

/**
 * ПОЗВАТЬ ДРУГА ТАМ, ГДЕ БОТА НЕТ. В личке двух людей slash-команду никто не услышит — бот туда не
 * приглашён и приглашён быть не может. Inline mode — единственная дверь: человек набирает
 * `@CrossaderBot chess` прямо в переписке, и выбранный результат ложится в чат карточкой стола.
 *
 * Кнопка — `url`, а не `web_app`: телега разрешает `web_app` только в личке с самим ботом, и в
 * inline-карточке такая кнопка не живёт. `t.me/<бот>?startapp=<код>` открывает тот же мини-апп.
 *
 * КОД ЗДЕСЬ ТОЛЬКО РЕЗЕРВИРУЕТСЯ. Комнату поднимет первый вошедший: заводить её на каждый
 * набранный запрос значило бы оставлять пустой стол на каждую букву.
 */
bot.on("inline_query", async (ctx) => {
  // НИЧЕГО НЕ КЕШИРОВАТЬ: у каждой карточки своя комната, и отданная из кеша отправила бы двух
  // разных людей за один и тот же стол.
  const results = table ? await table.inlineResults(`tg:${ctx.from.id}`) : [];
  await ctx.answerInlineQuery(results as Parameters<typeof ctx.answerInlineQuery>[0], { cache_time: 0, is_personal: true });
});

async function main(): Promise<void> {
  const me = await bot.api.getMe();
  await bot.api.setMyCommands([
    { command: "start", description: "С чего начать" },
    ...(table
      ? [
          { command: "room", description: "Открыть комнату в этом чате: /room [название]" },
          { command: "rooms", description: "Комнаты этого чата" },
          { command: "records", description: "Записи сыгранных партий — смотрит любой" },
          { command: "app", description: "Открыть комнату в приложении Crossade (в личке)" },
          { command: "admin", description: "Все комнаты — для хозяина (в личке)" },
          { command: "sticker", description: "Добавить стикеры в свой набор (в личке)" },
          { command: "stickers", description: "Мой набор стикеров (в личке)" },
          { command: "menu", description: "Меню комнаты: колода, раздача, рассадка" },
        ]
      : []),
  ]);
  // КНОПКА МЕНЮ — «Мои комнаты» (мини-апп стола без комнаты), если это включено (`TABLE_MENU_APP=1`);
  // иначе обычная: список команд. Включение — решение хозяина: кнопка меняется у всех чатов бота.
  const rooms = table && process.env.TABLE_MENU_APP === "1" ? table.roomsUrl() : null;
  await bot.api.setChatMenuButton({ menu_button: rooms ? { type: "web_app", text: "Мои комнаты", web_app: { url: rooms } } : { type: "commands" } });
  await table?.start(me.username, (chat, text) => bot.api.sendMessage(chat, text));
  console.log(`бот @${me.username} запущен, long polling`);
  // Страница «Узлы» у хозяина стола: какая машина держит бота. «Держит» — только после того, как Telegram ответил.
  let polling = false;
  const tenv = tableEnv();
  if (tenv) startNodeBeat(tenv, () => polling);
  // ВЫБРАННАЯ INLINE-КАРТОЧКА ПРИХОДИТ, ТОЛЬКО ЕСЛИ ЕЁ ПОПРОСИТЬ: по умолчанию Telegram её не шлёт.
  await bot.start({ ...(table ? { allowed_updates: ["message", "callback_query", "inline_query", "chosen_inline_result"] as const } : {}), onStart: () => void (polling = true) });
}

main().catch((err) => {
  console.error("бот упал:", err);
  process.exit(1);
});
