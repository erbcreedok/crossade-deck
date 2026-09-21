// HTML-КЛИЕНТ СТОЛА — отдаётся тем же сервером, что держит комнаты.
//
// Здесь только АДРЕСА: что по ним лежит, говорит `ClientSource` из `clientBundle.ts`. Названа папка
// готовой сборки (`TABLE_CLIENT_DIR`) — раздаётся она; нет — клиент собирается на лету из исходников,
// и правка долетает до телефона следующим открытием Mini App, без шага сборки.
//
// Тот же адрес с `?stand` — стенд жеста: тот же клиент без сети, с ботами за столом.

import { join } from "path";
import express, { type Router } from "express";
import { builtSource, liveSource, type ClientPage, type ClientScript, type ClientSource } from "./clientBundle.js";

const fromEnv = (): ClientSource => (process.env.TABLE_CLIENT_DIR ? builtSource(process.env.TABLE_CLIENT_DIR) : liveSource());

export function clientRoutes(source: ClientSource = fromEnv()): Router {
  const r = express.Router();
  const fresh: express.RequestHandler = (_req, res, next) => {
    res.header("Cache-Control", "no-store, must-revalidate");
    next();
  };

  // ЗАПИСЬ ПАРТИИ (`replay`) — тот же клиент, только вместо сети журнал. Страница открытая: без
  // комнаты и секрета она ничего не покажет, а журнал за неё спрашивают уже с секретом.
  const pages: Array<[string, ClientPage, ClientScript]> = [
    ["/table/", "index", "app"],
    ["/table/replay", "replay", "replay"],
  ];
  for (const [path, page, script] of pages) {
    r.get(path, fresh, async (_req, res) => {
      res.type("html").send(await source.page(page));
    });

    r.get(`/table/${script}.js`, fresh, async (_req, res) => {
      try {
        res.type("js").send((await source.script(script)).js);
      } catch (err) {
        console.error(`клиент стола (${script}) не собрался:`, err);
        res.status(500).type("js").send(`document.body.textContent = ${JSON.stringify(`клиент не собрался: ${String(err)}`)};`);
      }
    });

    // Карта исходников — по требованию отладчика.
    r.get(`/table/${script}.js.map`, async (_req, res) => {
      try {
        res.type("application/json").send((await source.script(script)).map);
      } catch {
        res.status(404).end();
      }
    });
  }

  // ЛИЦА И РУБАШКИ — готовые растры колоды, как есть. Имя файла проверяется целиком: папка и карта из
  // известного списка, никакого пути из запроса. Четыре цвета (`-4c`) и кириллица (`-cyr`) — личный вид игрока.
  r.get(/^\/table\/cards\/((?:classic|minimal)(?:-4c)?(?:-cyr)?|backs)\/([a-z]+(?:-(?:[0-9]+|[AJQK]|red|black))?)\.webp$/, (req, res) => {
    const [set, file] = [req.params[0]!, req.params[1]!];
    res.header("Cache-Control", "public, max-age=86400");
    res.sendFile(join(source.cards, set, `${file}.webp`), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  // ЗВУКИ — записи Kenney «Casino Audio» (CC0), имя из известного вида.
  r.get(/^\/table\/sounds\/((?:drop|hand|turn|gather|merge|shuffle|sort)-[0-9])\.m4a$/, (req, res) => {
    res.header("Cache-Control", "public, max-age=86400");
    res.type("audio/mp4").sendFile(join(source.sounds, `${req.params[0]!}.m4a`), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  return r;
}
