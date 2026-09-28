// HTML-КЛИЕНТ СТОЛА — отдаётся тем же сервером, что держит комнаты.
//
// Здесь только АДРЕСА: что по ним лежит, говорит `ClientSource` из `clientBundle.ts`. Названа папка
// готовой сборки (`TABLE_CLIENT_DIR`) — раздаётся она; нет — клиент собирается на лету из исходников,
// и правка долетает до телефона следующим открытием Mini App, без шага сборки.
//
// Тот же адрес с `?stand` — стенд жеста: тот же клиент без сети, с ботами за столом.

import { createHash } from "crypto";
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
  // СМОТРЕЛКА ЗА БОТАМИ — страница без своего бандла: весь её код в ней самой, потому что она
  // только спрашивает одну дверь и рисует список. Сама по себе не показывает ничего: комнату и
  // пропуск ей дают адресом, а дверь их проверяет.
  r.get("/table/bots", fresh, async (_req, res) => {
    res.type("html").send(await source.page("bots"));
  });
  // «ВСЕ СТОЛЫ» — страница хозяина, тоже без бандла. Сама ничего не знает: стол пускает по подписи
  // Telegram, которую она приносит (`/table/admin/rooms`).
  r.get("/table/admin", fresh, async (_req, res) => {
    res.type("html").send(await source.page("admin"));
  });

  // СКРИПТ — ПО ОТПЕЧАТКУ СОДЕРЖИМОГО. Страница (всегда свежая) зовёт `app.js?v=<отпечаток>`, и по этому
  // адресу скрипт хранится у телефона год: пока код не менялся, в сеть за ним не ходят вовсе, даже после
  // перезапуска стола. Новый код — новый отпечаток, скачивается один раз. Без отпечатка или с чужим —
  // без кэша, как раньше.
  const stamps = new Map<string, string>();
  const stampOf = async (script: ClientScript): Promise<string | null> => {
    try {
      const { js } = await source.script(script);
      let v = stamps.get(js);
      if (!v) stamps.set(js, (v = createHash("sha256").update(js).digest("hex").slice(0, 12)));
      return v;
    } catch {
      return null;
    }
  };

  for (const [path, page, script] of pages) {
    r.get(path, fresh, async (_req, res) => {
      const [html, v] = await Promise.all([source.page(page), stampOf(script)]);
      res.type("html").send(v ? html.replace(`src="${script}.js"`, `src="${script}.js?v=${v}"`) : html);
    });

    r.get(`/table/${script}.js`, async (req, res) => {
      try {
        const v = await stampOf(script);
        res.header("Cache-Control", v && req.query.v === v ? "public, max-age=31536000, immutable" : "no-store, must-revalidate");
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

  // ШРИФТ — Tiny5 (OFL), свой. Страница стола открывается и с адреса реле, а файл берётся с мака: без
  // разрешения чужому адресу браузер шрифт не применит.
  r.get(/^\/table\/fonts\/(tiny5-(?:cyrillic|latin))\.woff2$/, (req, res) => {
    res.header("Cache-Control", "public, max-age=31536000, immutable");
    res.header("Access-Control-Allow-Origin", "*");
    res.type("font/woff2").sendFile(join(source.fonts, `${req.params[0]!}.woff2`), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  // СПРАЙТЫ ТЕЛА — второй вид аватара; имя — из известного списка, как у звуков.
  r.get(/^\/table\/sprites\/((?:king-body|king-head|hand-open|hand-closed))\.png$/, (req, res) => {
    res.header("Cache-Control", "public, max-age=86400");
    res.header("Access-Control-Allow-Origin", "*");
    res.type("image/png").sendFile(join(source.sprites, `${req.params[0]!}.png`), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });
  // КУКЛЫ ЗА СТОЛОМ — король и дама из колоды векторами: расцветку и обводку экран печёт сам (`dollSprites.ts`).
  r.get(/^\/table\/sprites\/((?:club-K|diamond-Q))\.svg$/, (req, res) => {
    res.header("Cache-Control", "public, max-age=86400");
    res.header("Access-Control-Allow-Origin", "*");
    res.type("image/svg+xml").sendFile(join(source.sprites, `${req.params[0]!}.svg`), (err) => {
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
