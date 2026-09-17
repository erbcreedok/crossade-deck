// СТОЛЫ В TELEGRAM — команды, кнопки и inline-карточка стола. Бот здесь только управляет: столы
// живут на сервере стола, а бот открывает, перечисляет, переименовывает и закрывает их по HTTP.
//
//   /table [название]   открыть стол в этом чате (группа или личка с ботом)
//   /tables             столы этого чата — вход, переименовать, закрыть
//   @бот в любой переписке — карточка нового стола (`inlineResults`)
//
// Дев-кит этого файла не касается: его команды и карточки живут в `index.ts` как жили.

import { InlineKeyboard, type Bot, type Context } from "grammy";
import { mintRoom } from "../../../server/src/table/roomIds.js";
import { deskNames } from "../../../server/src/table/desks.js";
import type { TableApi } from "./api.js";
import type { Home, RoomCard, TableCommand } from "../../../server/src/table/contract.js";
import { MENU, menuOf, ORDER_COMMANDS, ORDERS_HELP, parseOrder, pickForMenu, pickTable, refusedSay, started } from "./orders.js";
import { DOWN, askTitle, closed, gone, inlineOpened, inviteArticle, inviteExisting, listed, mayManage, notYours, opened, recast, renamed, type Button, type Links } from "./talk.js";
import type { Registry } from "./registry.js";
import type { Watch } from "./watch.js";
import { installStickers } from "./stickers.js";

const POLL_MS = 30_000;
const DOWN_POLLS = 3;

export function keyboardOf(rows: Button[][]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of rows) {
    for (const b of row) {
      if ("url" in b) kb.url(b.text, b.url);
      else if ("app" in b) kb.webApp(b.text, b.app);
      else kb.text(b.text, b.data);
    }
    kb.row();
  }
  return kb;
}

export function installTable(bot: Bot, api: TableApi, watch: Watch, registry: Registry, secret: string) {
  installStickers(bot, api);
  let botName = "";
  const links: Links = {
    anywhere: (room) => (api.appName && botName ? `https://t.me/${botName}/${api.appName}?startapp=${room}` : api.openUrl(room)),
    app: (room) => api.openUrl(room),
  };
  /** Кто сейчас переименовывает какой стол: `чат:человек` → комната. */
  const naming = new Map<string, string>();
  const chatOf = (ctx: Context) => String(ctx.chat!.id);
  /** Как чат называется в Telegram — из этого сервер делает имя стола. В личке названия нет. */
  const chatTitleOf = (ctx: Context) => {
    const chat = ctx.chat!;
    return "title" in chat && chat.title ? chat.title : undefined;
  };
  const homeOf = (ctx: Context): Home => ({ kind: "chat", chat: chatOf(ctx), ...(chatTitleOf(ctx) ? { chatTitle: chatTitleOf(ctx) } : {}) });
  const inPrivate = (ctx: Context) => ctx.chat?.type === "private";
  const byOf = (ctx: Context) => `tg:${ctx.from!.id}`;

  bot.command("table", async (ctx) => {
    const at = await api.where();
    if (!at.up) return void (await ctx.reply(DOWN));
    const card = await api.open(homeOf(ctx), byOf(ctx), ctx.match.trim() || undefined);
    if (card === "down" || card === "missing") return void (await ctx.reply(DOWN));
    watch.remember(chatOf(ctx), card.room, card.title, at.boot);
    registry.remember(card.room, { home: homeOf(ctx), by: byOf(ctx), title: card.title });
    const all = await api.list(chatOf(ctx));
    const said = opened(card, Array.isArray(all) ? all.length : 1, links, inPrivate(ctx));
    await ctx.reply(said.text, { reply_markup: keyboardOf(said.rows) });
  });

  bot.command("tables", async (ctx) => {
    // В ЛИЧКЕ — все столы этого человека, а не «столы этой лички»: там их не бывает вовсе.
    const cards = await tablesFor(ctx);
    if (cards === "down") return void (await ctx.reply(DOWN));
    const said = listed(cards, links, inPrivate(ctx), byOf(ctx));
    await ctx.reply(said.text, { reply_markup: keyboardOf(said.rows) });
  });

  // ── КОМАНДЫ СТОЛА ──────────────────────────────────────────────────────────────────────────
  //
  // Какой стол: в группе — столы этой группы; в личке — столы этой лички и все, что человек открыл где
  // угодно. Один — команда идёт сразу; несколько — бот спрашивает кнопками, и команда ждёт под коротким id.
  const pending = new Map<string, { command: TableCommand; by: string; at: number }>();
  const PENDING_MS = 10 * 60_000;
  const park = (command: TableCommand, by: string) => {
    const now = Date.now();
    for (const [k, v] of pending) if (now - v.at > PENDING_MS) pending.delete(k);
    const id = Math.random().toString(36).slice(2, 8);
    pending.set(id, { command, by, at: now });
    return id;
  };

  async function tablesFor(ctx: Context): Promise<RoomCard[] | "down"> {
    const here = await api.list(chatOf(ctx));
    if (here === "down") return "down";
    const list = Array.isArray(here) ? here : [];
    if (!inPrivate(ctx)) return list;
    const mine = await api.listBy(byOf(ctx));
    if (mine === "down") return "down";
    const seen = new Set(list.map((c) => c.room));
    return [...list, ...(Array.isArray(mine) ? mine.filter((c) => !seen.has(c.room)) : [])];
  }

  async function runAndSay(ctx: Context, room: string, command: TableCommand, by: string) {
    const [out, cards] = [await api.run(room, by, command), await api.listBy(byOf(ctx))];
    if (out === "down") return void (await ctx.reply(DOWN));
    if (out === "missing") return void (await ctx.reply(gone));
    const title = (Array.isArray(cards) ? cards.find((c) => c.room === room)?.title : undefined) ?? "стол";
    if ("ok" in out) return void (await ctx.reply(started(command, title)));
    const said = refusedSay(out.error, room, park(command, by));
    await ctx.reply(said.text, { reply_markup: keyboardOf(said.rows) });
  }

  for (const name of ORDER_COMMANDS) {
    bot.command(name, async (ctx) => {
      const command = parseOrder(name, ctx.match);
      if (!command) return void (await ctx.reply(ORDERS_HELP));
      const cards = await tablesFor(ctx);
      if (cards === "down") return void (await ctx.reply(DOWN));
      if (cards.length === 0) return void (await ctx.reply("Здесь нет комнат. Открыть: /table [название]"));
      if (cards.length === 1) return runAndSay(ctx, cards[0]!.room, command, byOf(ctx));
      const said = pickTable(cards, park(command, byOf(ctx)));
      await ctx.reply(said.text, { reply_markup: keyboardOf(said.rows) });
    });
  }

  bot.command("menu", async (ctx) => {
    const cards = await tablesFor(ctx);
    if (cards === "down") return void (await ctx.reply(DOWN));
    if (cards.length === 0) return void (await ctx.reply("Здесь нет комнат. Открыть: /table [название]"));
    const said = cards.length === 1 ? menuOf(cards[0]!, deskNames()) : pickForMenu(cards);
    await ctx.reply(said.text, { reply_markup: keyboardOf(said.rows) });
  });

  bot.callbackQuery("tbx", (ctx) => ctx.answerCallbackQuery());

  // УПРАВЛЕНИЕ СТОЛОМ. Кнопка может стоять и в чужой переписке — там у бота нет чата, и меню уходит
  // нажавшему в личку; чужой стол нажавшему не открывается, даже если кнопку видят все.
  bot.callbackQuery(/^tbm:([A-Za-z0-9_-]+)$/, async (ctx) => {
    const room = ctx.match[1]!;
    const afar = !ctx.chat;
    const say = async (text: string) => {
      if (afar) await ctx.answerCallbackQuery({ text, show_alert: true });
      else await ctx.reply(text);
    };
    const cards = afar ? await api.listBy(byOf(ctx)) : await tablesFor(ctx);
    if (cards === "down" || cards === "missing") {
      if (!afar) await ctx.answerCallbackQuery();
      return void (await say(DOWN));
    }
    const card = (Array.isArray(cards) ? cards : []).find((c) => c.room === room);
    if (!card || (afar && card.by !== byOf(ctx))) {
      if (!afar) await ctx.answerCallbackQuery();
      return void (await say(afar ? notYours : gone));
    }
    const said = menuOf(card, deskNames());
    if (afar) {
      const sent = await ctx.api.sendMessage(ctx.from.id, said.text, { reply_markup: keyboardOf(said.rows) }).catch(() => null);
      return void (await ctx.answerCallbackQuery(
        sent ? { text: "Меню стола — у меня в личке." } : { text: "Напиши мне в личку — оттуда я пришлю меню.", show_alert: true },
      ));
    }
    await ctx.answerCallbackQuery();
    await ctx.reply(said.text, { reply_markup: keyboardOf(said.rows) });
  });

  bot.callbackQuery(/^tbr:([A-Za-z0-9_-]+):([a-z0-9]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const item = MENU[ctx.match[2]!];
    if (!item) return;
    await runAndSay(ctx, ctx.match[1]!, item.command, byOf(ctx));
  });

  // Выбран стол для ждущей команды (`tbp`) — или «Собрать и раздать» (`tbf`): та же команда с force.
  bot.callbackQuery(/^tb(p|f):([A-Za-z0-9_-]+):([a-z0-9]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, kind, room, id] = ctx.match as unknown as [string, "p" | "f", string, string];
    const wait = pending.get(id);
    if (!wait || wait.by !== byOf(ctx)) return void (await ctx.reply("Эта кнопка устарела — повтори команду."));
    const command = kind === "f" && wait.command.t === "deal" ? { ...wait.command, force: true } : wait.command;
    await runAndSay(ctx, room, command, wait.by);
  });

  // РОД СТОЛА СМЕНИЛИ КНОПКОЙ. Стол не разгоняется: меняются правила, карты и люди остаются.
  bot.callbackQuery(/^tbk:([A-Za-z0-9_-]+):([a-z]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, room, kind] = ctx.match as unknown as [string, string, string];
    const cards = await tablesFor(ctx);
    if (cards === "down") return void (await ctx.reply(DOWN));
    const card = cards.find((c) => c.room === room);
    if (!card) return void (await ctx.reply(gone));
    if (card.by && card.by !== byOf(ctx)) return void (await ctx.reply(notYours));
    const out = await api.recast(room, kind);
    if (out === "down") return void (await ctx.reply(DOWN));
    if (out === "missing") return void (await ctx.reply(gone));
    const said = menuOf(out, deskNames());
    await ctx.reply(`${recast(out.title, deskNames().find((k) => k.id === out.kind)?.name ?? out.kind)}\n${said.text}`, { reply_markup: keyboardOf(said.rows) });
  });

  bot.callbackQuery(/^tbl:(ren|del):([A-Za-z0-9_-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, does, room] = ctx.match as unknown as [string, "ren" | "del", string];
    // ИЩЕМ ТАМ ЖЕ, ГДЕ БРАЛИ СПИСОК: в личке он шире чата, и стол из другого чата кнопке иначе не виден.
    const here = await api.list(chatOf(ctx));
    if (here === "down") return void (await ctx.reply(DOWN));
    const cards = await tablesFor(ctx);
    if (cards === "down") return void (await ctx.reply(DOWN));
    const card = cards.find((c) => c.room === room);
    const may = mayManage(card, byOf(ctx), new Set((Array.isArray(here) ? here : []).map((c) => c.room)));
    if (may === "foreign") return void (await ctx.reply(notYours));
    if (may === "gone" || !card) {
      // Стола нет — пусть уходит и из памяти бота, иначе он будет являться в списке вечно.
      registry.forget(room);
      return void (await ctx.reply(gone));
    }
    if (does === "ren") {
      naming.set(`${chatOf(ctx)}:${ctx.from.id}`, room);
      return void (await ctx.reply(askTitle(card.title)));
    }
    const done = await api.close(room);
    if (done === "down") return void (await ctx.reply(DOWN));
    watch.forget(chatOf(ctx), room);
    registry.forget(room);
    await ctx.reply(done === "missing" ? gone : closed(card.title));
  });

  // НАЗВАНИЕ — СЛЕДУЮЩИМ СООБЩЕНИЕМ, и только от того, кто нажал «Переименовать». Остальное бот не слушает.
  bot.on("message:text", async (ctx, next) => {
    const key = `${chatOf(ctx)}:${ctx.from.id}`;
    const room = naming.get(key);
    if (!room || ctx.message.text.startsWith("/")) return next();
    naming.delete(key);
    const before = await api.list(chatOf(ctx));
    const from = Array.isArray(before) ? before.find((c) => c.room === room)?.title : undefined;
    const card = await api.rename(room, ctx.message.text);
    if (card === "down") return void (await ctx.reply(DOWN));
    if (card === "missing") return void (await ctx.reply(gone));
    const at = await api.where();
    if (at.up) watch.remember(chatOf(ctx), room, card.title, at.boot);
    registry.rename(room, card.title);
    await ctx.reply(renamed(from ?? card.title, card.title));
  });

  // КАРТОЧКА СТАЛА СООБЩЕНИЕМ — теперь известно, где стол живёт. Приходит, только если в BotFather
  // включён `/setinlinefeedback`; без него стол заводится первым вошедшим (`TableRoom.onCreate`).
  bot.on("chosen_inline_result", async (ctx) => {
    const chosen = /^tbl:([a-z]+):(.+)$/.exec(ctx.chosenInlineResult.result_id);
    const room = chosen?.[2];
    const message = ctx.chosenInlineResult.inline_message_id;
    if (!room) return;
    const home: Home = { kind: "inline", message: message ?? "" };
    const card = await api.open(home, `tg:${ctx.from.id}`, undefined, room, chosen?.[1]);
    if (card !== "down" && card !== "missing") registry.remember(room, { home, by: `tg:${ctx.from.id}`, title: card.title });
    // Имя комнаты известно только теперь — вписываем его в карточку, и в текст, и на кнопку.
    if (message && card !== "down" && card !== "missing") {
      const said = inlineOpened(card, links);
      await ctx.api.editMessageTextInline(message, said.text, { reply_markup: keyboardOf(said.rows) }).catch(() => {});
    }
  });

  /**
   * КАРТОЧКИ ДЛЯ INLINE-РЕЖИМА: первым — новый стол, за ним — столы, которые у этого человека уже есть.
   * Так готовый стол зовётся в любую переписку, а не заводится каждый раз заново.
   */
  async function inlineResults(by: string): Promise<unknown[]> {
    const at = await api.where();
    if (!at.up) {
      return [{ type: "article", id: "tbl-down", title: "Комнаты сейчас недоступны", description: "Сервер выключен", input_message_content: { message_text: DOWN } }];
    }
    // ПО КАРТОЧКЕ НА КАЖДЫЙ РОД СТОЛА, и у каждой своя комната: человек выбирает род ровно один раз —
    // здесь. Имена родов берутся из каталога сервера, второго списка названий нет.
    const fresh = deskNames().map(({ id, name }) => {
      const room = mintRoom(secret);
      const card = inviteArticle(id, name, room, links);
      return {
        type: "article",
        id: `tbl:${id}:${room}`,
        title: card.title,
        description: card.description,
        input_message_content: { message_text: card.text },
        reply_markup: keyboardOf([[card.button]]),
      };
    });
    const had = await api.listBy(by);
    const mine = Array.isArray(had) ? had.slice(0, 8) : [];
    return [
      ...fresh,
      ...mine.map((one) => {
        const said = inviteExisting(one, links, one.by === by);
        return {
          type: "article",
          id: `tbg:${one.room}`,
          title: said.title,
          description: said.description,
          input_message_content: { message_text: said.text },
          reply_markup: keyboardOf(said.rows),
        };
      }),
    ];
  }

  async function start(name: string, tell: (chat: string, text: string) => Promise<unknown>) {
    botName = name;
    // ОДИН НЕОТВЕЧЕННЫЙ ОПРОС — ЕЩЁ НЕ СМЕРТЬ: сеть бота моргнула, а чатам уже сказали бы «столы
    // закрылись». Выключенным стол считается после `DOWN_POLLS` молчаний подряд; перезапуск виден сразу.
    let silent = 0;
    // СЕРВЕР ПЕРЕЗАПУСТИЛСЯ — карты не вернуть, но комнаты вернуть обязаны: имя, дом и хозяина. Иначе
    // человек заходит по своей же ссылке и попадает в чужую безымянную комнату, где он никто.
    let known: string | null = null;
    const restore = async (boot: string) => {
      if (known === boot) return;
      known = boot;
      for (const [room, one] of registry.all()) {
        const back = await api.open(one.home, one.by, one.title, room);
        if (back === "missing") registry.forget(room);
      }
    };
    const poll = async () => {
      const at = await api.where();
      silent = at.up ? 0 : silent + 1;
      if (at.up) await restore(at.boot);
      if (!at.up && silent < DOWN_POLLS) return;
      for (const one of watch.check(at)) await tell(one.chat, one.text).catch(() => {});
    };
    await poll();
    setInterval(() => void poll(), POLL_MS);
  }

  return { inlineResults, start };
}
