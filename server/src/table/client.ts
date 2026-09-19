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

  // ЗАПИСЬ ПАРТИИ — тот же клиент, только вместо сети журнал. Страница открытая: без комнаты и
  // секрета она ничего не покажет, а журнал за неё спрашивают уже с секретом.
  r.get("/table/replay", fresh, async (_req, res) => {
    res.type("html").send(await readFile(join(ROOT, "replay.html"), "utf8"));
  });

  r.get("/table/replay.js", fresh, async (_req, res) => {
    try {
      res.type("js").send((await bundle("replay")).js);
    } catch (err) {
      console.error("проигрыватель не собрался:", err);
      res.status(500).type("js").send(`document.body.textContent = ${JSON.stringify(`не собрался: ${String(err)}`)};`);
    }
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
  r.get(/^\/table\/sounds\/((?:drop|hand|turn|gather|merge|shuffle|sort)-[0-9])\.m4a$/, (req, res) => {
    res.header("Cache-Control", "public, max-age=86400");
    res.type("audio/mp4").sendFile(join(ROOT, "sounds", `${req.params[0]!}.m4a`), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  // МИКРОФОН ЖИВЬЁМ — отдельным файлом и своим адресом: `AudioWorklet` иначе его не возьмёт.
  r.get("/table/live-worklet.js", fresh, (_req, res) => {
    res.type("js").sendFile(join(ROOT, "live-worklet.js"), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  /**
   * КЛИЕНТ СОБИРАЕТСЯ ОДИН РАЗ ЗА ЗАПУСК. Выкатка — это новый процесс, поэтому свежая сборка долетает
   * сразу и без всякой инвалидации, а второй заход за ней уже не платит ничего.
   */
  const built: Record<string, Promise<{ js: string; map: string }> | null> = {};
  const bundle = (entry = "main") => (built[entry] ??= (async () => {
    const { build } = await import("esbuild");
    const out = await build({
      entryPoints: [join(ROOT, `${entry}.ts`)],
      bundle: true,
      write: false,
      format: "esm",
      target: "es2020",
      outfile: join(ROOT, `${entry}.js`),
      // КАРТА ИСХОДНИКОВ — ОТДЕЛЬНЫМ ФАЙЛОМ, а не внутри. Вшитая, она весила вчетверо больше самого
      // клиента, и телефон тащил её по сети каждый заход, хотя не открывает её никогда. Ссылку на
      // неё в конце файла читает только отладчик — он и скачает, когда понадобится.
      sourcemap: "linked",
      minify: true,
      logLevel: "silent",
      // Номер сборки — строкой внизу настроек: видно, что телефон открыл свежий стол.
      define: { __TABLE_BUILD__: JSON.stringify(BUILD_INFO.build) },
    });
    const js = out.outputFiles.find((one) => one.path.endsWith(".js"))!.text;
    const map = out.outputFiles.find((one) => one.path.endsWith(".map"))?.text ?? "";
    return { js, map };
  })().catch((err) => {
    built[entry] = null;
    throw err;
  }));

  r.get("/table/app.js", fresh, async (_req, res) => {
    try {
      res.type("js").send((await bundle()).js);
    } catch (err) {
      console.error("клиент стола не собрался:", err);
      res.status(500).type("js").send(`document.body.textContent = ${JSON.stringify(`клиент не собрался: ${String(err)}`)};`);
    }
  });

  // Карта исходников — по требованию отладчика, и только она одна кэшируется надолго: у неё своё имя на запуск.
  r.get("/table/app.js.map", async (_req, res) => {
    try {
      res.type("application/json").send((await bundle()).map);
    } catch {
      res.status(404).end();
    }
  });

  return r;
}
