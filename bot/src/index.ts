import { Bot, InlineKeyboard } from "grammy";
import { loadEnv } from "./env.js";
import { claimLink, claimReply, tellProfile } from "./link.js";
import { askFor, buttonsFor, cleanName, linkedSaid, nextSaid, stopWaiting, waitingIn, type Offer } from "./talk.js";
import { readStart, sourceFor, sourcesOf } from "./sources.js";
import { profilePhoto, pickPhoto } from "./photo.js";
import { TableApi, tableEnv } from "./table/api.js";
import { installTable } from "./table/tableBot.js";
import { Registry } from "./table/registry.js";
import { Watch } from "./table/watch.js";

/** Что бот отвечает на голый /start: стол зовётся в переписку, а не выбирается из списка игр. */
const START_SAID = [
  "Стол живёт в переписке: набери @<бот> в любом чате и выбери, какой стол открыть — песочницу или крестовый.",
  "Здесь же: /table — открыть стол в этом чате, /tables — твои столы.",
].join("\n");

const env = loadEnv();
const bot = new Bot(env.botToken);
/** Приложения, чьи ссылки этот бот умеет подтверждать, — по одному на пару переменных. */
const sources = sourcesOf();

bot.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  // ССЫЛКА ИЗ ПРОФИЛЯ ПРИХОДИТ СЮДА ЖЕ — телега кладёт код в payload команды. Это тот самый
  // обратный поток: про человека заранее не известно ничего, а нажав «Запустить», он сообщает
  // боту свой chat_id, и этого достаточно.
  const start = readStart(ctx.match);
  if (start) {
    // КОМУ АДРЕСОВАНО — СКАЗАНО В САМОЙ ССЫЛКЕ: у бота несколько приложений, и подтверждение
    // уходит тому серверу, чьё имя она несёт (`sources.ts`).
    const to = sourceFor(start, sources, { serverUrl: env.serverUrl, ...(env.linkSecret ? { secret: env.linkSecret } : {}) });
    if (!to) {
      await ctx.reply(claimReply(start.source ? "unknown-source" : "misconfigured"));
      return;
    }
    // ЧТО ТЕЛЕГА МОЖЕТ ПРЕДЛОЖИТЬ ЧЕЛОВЕКУ: его тамошнее имя и ключ к его лицу. Байты лица заберёт
    // сервер своим токеном — ссылка на файл содержит токен бота и наружу не уходит.
    const their = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
    const photo = await profilePhoto(env.botToken, String(ctx.from!.id));
    const result = await claimLink(
      { serverUrl: to.serverUrl, secret: to.secret },
      start.code,
      String(ctx.from!.id),
      {
        ...(ctx.from?.username ? { label: `@${ctx.from.username}` } : {}),
        ...(their ? { name: their } : {}),
        ...(photo ? { photoFileId: photo } : {}),
      },
    );
    await ctx.reply(claimReply(result));
    // РАЗГОВОР ПРО ИМЯ И ЛИЦО — ЗДЕСЬ ЖЕ. Человек стоит перед ботом; отправлять его на страницу
    // ради двух кнопок значит терять его на полпути.
    if (typeof result !== "string" && (result.kind === "linked" || result.kind === "switch")) {
      const offer = (result.offer ?? { kind: "none" }) as Offer;
      await ctx.reply(linkedSaid(result.name ?? "", offer), { reply_markup: keyboardOf(offer) });
    }
    return;
  }
  await ctx.reply(START_SAID);
});

/** Кнопки телеги под вопросом — ряд на ответ, потому что читаются они сверху вниз. */
function keyboardOf(offer: Offer): InlineKeyboard | undefined {
  const rows = buttonsFor(offer);
  if (rows.length === 0) return undefined;
  const keyboard = new InlineKeyboard();
  for (const row of rows) {
    for (const one of row) keyboard.text(one.text, one.data);
    keyboard.row();
  }
  return keyboard;
}

/** Куда бот несёт выбор человека — тому приложению, чью ссылку он открыл. */
function whereFor(): { serverUrl: string; secret: string } | undefined {
  // Пока приложение одно на разговор: выбор уходит туда же, куда ушло подтверждение. Когда их
  // станет несколько, помнить источник придётся вместе с ожиданием (`talk.ts`).
  const only = [...sources.values()][0];
  if (only) return { serverUrl: only.serverUrl, secret: only.secret };
  return env.linkSecret ? { serverUrl: env.serverUrl, secret: env.linkSecret } : undefined;
}

/** Сказать серверу выбор и задать следующий вопрос, если он есть. */
async function moveOn(ctx: any, telegramId: string, what: { name?: string; photoFileId?: string; keep?: "name" | "photo" }): Promise<void> {
  const to = whereFor();
  if (!to) {
    await ctx.reply("Привязка сейчас не настроена.");
    return;
  }
  const said = await tellProfile(to, telegramId, what);
  if (!said) {
    await ctx.reply("Не вышло записать. Попробуй ещё раз или доделай на странице.");
    return;
  }
  const offer = said.offer as Offer;
  const next = nextSaid(offer);
  if (next) await ctx.reply(next, { reply_markup: keyboardOf(offer) });
  else await ctx.reply(`Готово. Теперь ты «${said.name}» — возвращайся на страницу.`);
}

// ВЫБОР В ОДИН ТАП. Всё, что человек может ответить кнопкой, отвечается кнопкой: печатать он будет
// только там, где печатать и правда надо — своё имя.
bot.callbackQuery(/^(keep|take|type):(name|photo)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [, does, what] = ctx.match as unknown as [string, "keep" | "take" | "type", "name" | "photo"];
  const telegramId = String(ctx.from.id);

  if (does === "keep") return moveOn(ctx, telegramId, { keep: what });

  if (does === "take") {
    if (what === "name") {
      const their = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ");
      return moveOn(ctx, telegramId, { name: their });
    }
    const photo = await profilePhoto(env.botToken, telegramId);
    if (!photo) {
      await ctx.reply("В Telegram лица не нашлось — пришли своё фото или оставь как есть.");
      return;
    }
    return moveOn(ctx, telegramId, { photoFileId: photo });
  }

  // «Ввести своё» — бот ждёт СЛЕДУЮЩЕЕ сообщение, и только от того, кто это попросил.
  askFor(ctx.chat!.id, what, telegramId);
  await ctx.reply(what === "name" ? "Напиши, как тебя звать." : "Пришли фото — оно станет аватаром.");
});

// ОТВЕТ, КОТОРЫЙ ЖДАЛИ. Всё остальное бот по-прежнему не слушает: это не чат, а несколько вопросов.
bot.on("message", async (ctx, next) => {
  const waiting = waitingIn(ctx.chat.id);
  if (!waiting) return next();

  if (waiting.waiting === "name") {
    const name = cleanName(ctx.message.text);
    if (!name) {
      await ctx.reply("Имя должно быть словами. Напиши ещё раз.");
      return;
    }
    stopWaiting(ctx.chat.id);
    return moveOn(ctx, waiting.telegramId, { name });
  }

  const sent = pickPhoto(ctx.message.photo);
  if (!sent) {
    await ctx.reply("Это не фото. Пришли картинку — или нажми «Оставить как есть».");
    return;
  }
  stopWaiting(ctx.chat.id);
  return moveOn(ctx, waiting.telegramId, { photoFileId: sent });
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
          { command: "table", description: "Открыть стол в этом чате: /table [название]" },
          { command: "tables", description: "Столы этого чата" },
          { command: "sticker", description: "Добавить стикеры в свой набор (в личке)" },
          { command: "stickers", description: "Мой набор стикеров (в личке)" },
          { command: "menu", description: "Меню стола: сбор, пресеты, раздачи" },
          { command: "collect", description: "Собрать все карты крупье в руку" },
          { command: "shuffle", description: "Перемешать колоду" },
          { command: "durak", description: "Пресет дурака: /durak [36|52] [jokers]" },
          { command: "krest", description: "Пресет крестового: /krest [36|52] [jokers]" },
          { command: "belka", description: "Пресет белки: 36, стулья крестом, шестёрки на край" },
          { command: "deal", description: "Раздать: /deal N|durak|krest|belka [@кто] [-skip-empty] [-as-dealer] [-force]" },
          { command: "deck", description: "Вид колоды: /deck [classic|minimal] [plaid|argyle|club|lattice|crest|ink]" },
        ]
      : []),
  ]);
  // КНОПКА МЕНЮ — ОБЫЧНАЯ: хаба у бота больше нет, стол зовётся карточкой в переписку.
  await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
  await table?.start(me.username, (chat, text) => bot.api.sendMessage(chat, text));
  console.log(`бот @${me.username} запущен, long polling`);
  // ВЫБРАННАЯ INLINE-КАРТОЧКА ПРИХОДИТ, ТОЛЬКО ЕСЛИ ЕЁ ПОПРОСИТЬ: по умолчанию Telegram её не шлёт.
  await bot.start(table ? { allowed_updates: ["message", "callback_query", "inline_query", "chosen_inline_result"] } : {});
}

main().catch((err) => {
  console.error("бот упал:", err);
  process.exit(1);
});
