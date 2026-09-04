import { Bot, InlineKeyboard } from "grammy";
import { loadEnv } from "./env.js";
import { GAMES, type Game } from "./games.js";
import { gameOfCommand, gameOfNewArg } from "./commands.js";
import { createRoom } from "./rooms.js";
import { dmMessage, groupMessage } from "./links.js";

const env = loadEnv();
const bot = new Bot(env.botToken);

async function replyWithNewRoom(ctx: any, game: Game): Promise<void> {
  const by = ctx.from ? String(ctx.from.id) : undefined;
  const room = await createRoom(env.serverUrl, game, by);
  if (ctx.chat?.type === "private") {
    const { text, keyboard } = dmMessage(env.hubUrl, room);
    await ctx.reply(text, { reply_markup: keyboard });
    return;
  }
  const me = await bot.api.getMe();
  const { text, keyboard } = groupMessage(env.hubUrl, room, me.username, env.appName);
  await ctx.reply(text, { reply_markup: keyboard });
}

bot.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  const keyboard = new InlineKeyboard()
    .text(GAMES.cards, "start:cards")
    .text(GAMES.chess, "start:chess")
    .text(GAMES.nardy, "start:nardy");
  await ctx.reply("Выбери игру — сделаю стол и дам ссылку.", { reply_markup: keyboard });
});

bot.callbackQuery(/^start:(cards|chess|nardy)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await replyWithNewRoom(ctx, ctx.match[1] as Game);
});

bot.command(["cards", "chess", "nardy"], async (ctx) => {
  const game = gameOfCommand(ctx.message!.text!.split(/\s/, 1)[0]);
  if (game) await replyWithNewRoom(ctx, game);
});

bot.command("new", async (ctx) => {
  const game = gameOfNewArg(ctx.match);
  if (!game) {
    await ctx.reply("Укажи игру: /new cards, /new chess или /new nardy.");
    return;
  }
  await replyWithNewRoom(ctx, game);
});

async function main(): Promise<void> {
  const me = await bot.api.getMe();
  await bot.api.setMyCommands([
    { command: "start", description: "Выбрать игру и получить ссылку на стол" },
    { command: "cards", description: "Новый стол: карты" },
    { command: "chess", description: "Новый стол: шахматы" },
    { command: "nardy", description: "Новый стол: нарды" },
    { command: "new", description: "Новый стол: /new cards|chess|nardy" },
  ]);
  await bot.api.setChatMenuButton({
    menu_button: { type: "web_app", text: "Играть", web_app: { url: env.hubUrl } },
  });
  console.log(`бот @${me.username} запущен, long polling`);
  await bot.start();
}

main().catch((err) => {
  console.error("бот упал:", err);
  process.exit(1);
});
