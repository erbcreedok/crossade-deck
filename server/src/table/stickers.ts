// СТИКЕРЫ ПО HTTP. Бот (с секретом стола) добавляет, перечисляет и удаляет набор человека; картинку
// стикера берёт кто угодно по ключу владельца и id — её рисуют у стула все, кто за столом.
//
// Бот передаёт только `file_id`: ссылка на файл телеги содержит токен бота, и байты забирает сервер своим
// токеном (`telegramImage`).

import express, { type Router } from "express";
import { MAX_STICKER_BYTES, addSticker, removeSticker, stickerImage, stickersOf } from "../db/stickersRepo.js";
import { telegramImage } from "../telegramPhoto.js";
import { guarded } from "./routes.js";

export type FetchImage = (fileId: string) => Promise<{ bytes: Buffer; type: string } | undefined>;

const telegram: FetchImage = (fileId) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? telegramImage(token, fileId, MAX_STICKER_BYTES) : Promise.resolve(undefined);
};

const OWNER = /^[A-Za-z0-9:_-]{1,64}$/;

export function stickerRoutes(fetchImage: FetchImage = telegram): Router {
  const r = express.Router();

  r.post("/table/stickers", guarded, async (req, res) => {
    const { by, fileId } = (req.body ?? {}) as { by?: unknown; fileId?: unknown };
    if (typeof by !== "string" || !OWNER.test(by) || typeof fileId !== "string" || !fileId) return void res.status(400).json({ error: "bad_request" });
    const image = await fetchImage(fileId);
    if (!image) return void res.json({ error: "not-image" });
    const out = addSticker(by, image.bytes, image.type);
    res.json(out === "full" ? { error: "full" } : out);
  });

  r.get("/table/stickers", guarded, (req, res) => {
    const by = req.query.by;
    if (typeof by !== "string" || !OWNER.test(by)) return void res.status(400).json({ error: "bad_request" });
    res.json(stickersOf(by));
  });

  r.delete("/table/stickers/:owner/:id", guarded, (req, res) => {
    res.json({ ok: removeSticker(req.params.owner, req.params.id) });
  });

  r.get("/table/stickers/:owner/:id", (req, res) => {
    const image = stickerImage(req.params.owner, req.params.id);
    if (!image) return void res.status(404).end();
    res.header("Cache-Control", "public, max-age=604800, immutable");
    res.type(image.type).send(image.bytes);
  });

  return r;
}
