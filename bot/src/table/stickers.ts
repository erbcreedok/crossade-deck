// СТИКЕРЫ ИГРОКА В ЛИЧКЕ С БОТОМ. Набор живёт на сервере стола; бот только принимает картинки и показывает набор.
//
//   /sticker    — бот ждёт картинки и обычные (не анимированные) стикеры, пока их шлют (10 минут тишины — хватит)
//   /stickers   — набор: каждый стикер с кнопкой «Удалить»

import { InlineKeyboard, InputFile, type Bot, type Context } from "grammy";
import type { TableApi } from "./api.js";
import { DOWN } from "./talk.js";

/** Сколько бот ждёт следующую картинку после /sticker или прошлой картинки. */
export const STICKER_WAIT_MS = 10 * 60_000;
/** Фото — размер не меньше этого, если есть: у стула стикер рисуется примерно такой высоты на плотном экране. */
const WANT_PX = 320;

export const STICKER_TEXT = {
  privateOnly: "Стикеры собираются в личке со мной — напиши мне /sticker.",
  waiting: "Присылай картинки или обычные стикеры — по одной, сколько хочешь. Анимированные и видео-стикеры не подойдут. Твой набор: /stickers",
  added: (n: number) => `Добавил. В наборе ${n}. Присылай ещё или открой стол — стикеры во вкладке 🖼 клавиатуры.`,
  notImage: "Это не картинка — не получилось взять.",
  animated: "Анимированные и видео-стикеры не подойдут — пришли обычный или картинку.",
  full: "Набор полон. Удали лишние: /stickers",
  empty: "Набор пуст. Добавить: /sticker",
  listed: (n: number) => `В наборе ${n}. Под каждым — «Удалить».`,
  removed: "Удалил.",
} as const;

interface PhotoSize {
  file_id: string;
  width: number;
}

/** Ключ фото нужного размера: самое мелкое не меньше `WANT_PX`, иначе самое крупное. */
export function pickStickerPhoto(sizes: readonly PhotoSize[] | undefined): string | undefined {
  if (!sizes?.length) return undefined;
  const sorted = [...sizes].sort((a, b) => a.width - b.width);
  return (sorted.find((s) => s.width >= WANT_PX) ?? sorted.at(-1))!.file_id;
}

export function installStickers(bot: Bot, api: TableApi) {
  /** Кто сейчас шлёт стикеры: id человека → до какого времени ждём. */
  const waiting = new Map<number, number>();
  const isWaiting = (ctx: Context) => ctx.chat?.type === "private" && (waiting.get(ctx.from!.id) ?? 0) > Date.now();
  const byOf = (ctx: Context) => `tg:${ctx.from!.id}`;

  bot.command("sticker", async (ctx) => {
    if (ctx.chat.type !== "private") return void (await ctx.reply(STICKER_TEXT.privateOnly));
    waiting.set(ctx.from!.id, Date.now() + STICKER_WAIT_MS);
    await ctx.reply(STICKER_TEXT.waiting);
  });

  const take = async (ctx: Context, fileId: string) => {
    waiting.set(ctx.from!.id, Date.now() + STICKER_WAIT_MS);
    const out = await api.addSticker(byOf(ctx), fileId);
    if (out === "down" || out === "missing") return void (await ctx.reply(DOWN));
    if ("error" in out) return void (await ctx.reply(out.error === "full" ? STICKER_TEXT.full : STICKER_TEXT.notImage));
    const all = await api.stickers(byOf(ctx));
    await ctx.reply(STICKER_TEXT.added(Array.isArray(all) ? all.length : 1));
  };

  bot.on("message:sticker", async (ctx, next) => {
    if (!isWaiting(ctx)) return next();
    const s = ctx.message.sticker;
    if (s.is_animated || s.is_video) return void (await ctx.reply(STICKER_TEXT.animated));
    await take(ctx, s.file_id);
  });

  bot.on("message:photo", async (ctx, next) => {
    if (!isWaiting(ctx)) return next();
    const id = pickStickerPhoto(ctx.message.photo);
    if (!id) return void (await ctx.reply(STICKER_TEXT.notImage));
    await take(ctx, id);
  });

  bot.command("stickers", async (ctx) => {
    if (ctx.chat.type !== "private") return void (await ctx.reply(STICKER_TEXT.privateOnly));
    const ids = await api.stickers(byOf(ctx));
    if (ids === "down" || ids === "missing") return void (await ctx.reply(DOWN));
    if (!ids.length) return void (await ctx.reply(STICKER_TEXT.empty));
    await ctx.reply(STICKER_TEXT.listed(ids.length));
    for (const id of ids) {
      const img = await api.stickerImage(byOf(ctx), id);
      if (img === "down" || img === "missing") continue;
      const markup = { reply_markup: new InlineKeyboard().text("Удалить", `stkdel:${id}`) };
      const file = new InputFile(img.bytes, img.type === "image/webp" ? "sticker.webp" : "sticker.jpg");
      if (img.type === "image/webp") await ctx.replyWithSticker(file, markup);
      else await ctx.replyWithPhoto(file, markup);
    }
  });

  bot.callbackQuery(/^stkdel:([A-Za-z0-9_-]+)$/, async (ctx) => {
    const out = await api.removeSticker(byOf(ctx), ctx.match[1]!);
    if (out === "down" || out === "missing") return void (await ctx.answerCallbackQuery({ text: DOWN }));
    await ctx.answerCallbackQuery({ text: STICKER_TEXT.removed });
    await ctx.deleteMessage().catch(() => {});
  });
}
