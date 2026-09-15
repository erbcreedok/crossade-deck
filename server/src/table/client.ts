// HTML-КЛИЕНТ СТОЛА — отдаётся тем же сервером, что держит комнаты, и собирается В МОМЕНТ ЗАПРОСА.
//
// Сборки как шага нет намеренно: клиент живёт на маке, и правка должна долетать до телефона
// следующим открытием Mini App, а не после `npm run build`. esbuild собирает `table-client/main.ts`
// вместе с контрактом и дифом из `src/table/` за десятки миллисекунд — один источник у сервера и
// клиента, без копии.
//
// Тот же адрес с `?stand` — стенд жеста: тот же клиент без сети, с ботами за столом.

import { BUILD_INFO } from "../version.js";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import express, { type Router } from "express";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "table-client");
const CARDS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "game-presets", "cards", "src", "decks", "baked");

export function clientRoutes(): Router {
  const r = express.Router();
  const fresh: express.RequestHandler = (_req, res, next) => {
    res.header("Cache-Control", "no-store, must-revalidate");
    next();
  };

  r.get("/table/", fresh, async (_req, res) => {
    res.type("html").send(await readFile(join(ROOT, "index.html"), "utf8"));
  });

  // ЛИЦА И РУБАШКИ — готовые растры колоды, как есть. Имя файла проверяется целиком: папка и карта из
  // известного списка, никакого пути из запроса. Четыре цвета (`-4c`) и кириллица (`-cyr`) — личный вид игрока.
  r.get(/^\/table\/cards\/((?:classic|minimal)(?:-4c)?(?:-cyr)?|backs)\/([a-z]+(?:-(?:[0-9]+|[AJQK]|red|black))?)\.webp$/, (req, res) => {
    const [set, file] = [req.params[0]!, req.params[1]!];
    res.header("Cache-Control", "public, max-age=86400");
    res.sendFile(join(CARDS, set, `${file}.webp`), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  // ЗВУКИ — записи Kenney «Casino Audio» (CC0), имя из известного вида.
  r.get(/^\/table\/sounds\/((?:drop|hand|turn|gather|merge|shuffle)-[0-9])\.m4a$/, (req, res) => {
    res.header("Cache-Control", "public, max-age=86400");
    res.type("audio/mp4").sendFile(join(ROOT, "sounds", `${req.params[0]!}.m4a`), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  r.get("/table/app.js", fresh, async (_req, res) => {
    try {
      const { build } = await import("esbuild");
      const out = await build({
        entryPoints: [join(ROOT, "main.ts")],
        bundle: true,
        write: false,
        format: "esm",
        target: "es2020",
        sourcemap: "inline",
        logLevel: "silent",
        // Номер сборки — строкой внизу настроек: видно, что телефон открыл свежий стол.
        define: { __TABLE_BUILD__: JSON.stringify(BUILD_INFO.build) },
      });
      res.type("js").send(out.outputFiles[0]!.text);
    } catch (err) {
      console.error("клиент стола не собрался:", err);
      res.status(500).type("js").send(`document.body.textContent = ${JSON.stringify(`клиент не собрался: ${String(err)}`)};`);
    }
  });

  return r;
}
