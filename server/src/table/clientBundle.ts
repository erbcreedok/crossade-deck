// СБОРКА HTML-КЛИЕНТА СТОЛА — одна на оба случая жизни.
//
//   на лету      сервер собирает клиент сам при первом запросе: правка долетает до телефона следующим
//                открытием Mini App. Так живёт разработка.
//   заранее      `buildClient(папка)` кладёт готовую страницу со всем, что ей нужно, и сервер только
//                раздаёт её. Так живёт хост: в образе нет ни исходников клиента, ни esbuild.
//
// Адреса у обоих одни и те же — их держит `client.ts`, а откуда брать байты, говорит `ClientSource`.

import { cp, mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { BUILD_INFO } from "../version.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES = join(HERE, "..", "..", "table-client");
const BAKED_CARDS = join(HERE, "..", "..", "..", "game-presets", "cards", "src", "decks", "baked");

/** Страницы клиента: адрес скрипта на странице → входной файл в `table-client/`. */
export const CLIENT_SCRIPTS = { app: "main", replay: "replay" } as const;
export type ClientScript = keyof typeof CLIENT_SCRIPTS;
export const CLIENT_PAGES = { index: "index.html", replay: "replay.html", bots: "bots.html" } as const;
export type ClientPage = keyof typeof CLIENT_PAGES;

export interface ClientSource {
  page(name: ClientPage): Promise<string>;
  script(name: ClientScript): Promise<{ js: string; map: string }>;
  /** Файлы, которые отдаются как есть: сервер сам проверяет имя, источник говорит только папку. */
  readonly sounds: string;
  readonly cards: string;
}

async function bundle(name: ClientScript): Promise<{ js: string; map: string }> {
  const { build } = await import("esbuild");
  const out = await build({
    entryPoints: [join(SOURCES, `${CLIENT_SCRIPTS[name]}.ts`)],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2020",
    // Имя файла — то, под которым скрипт отдаётся: от него esbuild пишет ссылку на карту исходников.
    outfile: join(SOURCES, `${name}.js`),
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
}

/**
 * КЛИЕНТ СОБИРАЕТСЯ ОДИН РАЗ ЗА ЗАПУСК. Выкатка — это новый процесс, поэтому свежая сборка долетает
 * сразу и без всякой инвалидации, а второй заход за ней уже не платит ничего.
 */
export function liveSource(): ClientSource {
  const built: Partial<Record<ClientScript, Promise<{ js: string; map: string }>>> = {};
  return {
    page: (name) => readFile(join(SOURCES, CLIENT_PAGES[name]), "utf8"),
    script: (name) =>
      (built[name] ??= bundle(name).catch((err) => {
        delete built[name];
        throw err;
      })),
    sounds: join(SOURCES, "sounds"),
    cards: BAKED_CARDS,
  };
}

/** Папка, которую оставил `buildClient`: читается с диска, в памяти не держится ничего. */
export function builtSource(dir: string): ClientSource {
  return {
    page: (name) => readFile(join(dir, CLIENT_PAGES[name]), "utf8"),
    script: async (name) => ({
      js: await readFile(join(dir, `${name}.js`), "utf8"),
      map: await readFile(join(dir, `${name}.js.map`), "utf8"),
    }),
    sounds: join(dir, "sounds"),
    cards: join(dir, "cards"),
  };
}

export async function buildClient(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const page of Object.values(CLIENT_PAGES)) await cp(join(SOURCES, page), join(dir, page));
  for (const name of Object.keys(CLIENT_SCRIPTS) as ClientScript[]) {
    const { js, map } = await bundle(name);
    await writeFile(join(dir, `${name}.js`), js);
    await writeFile(join(dir, `${name}.js.map`), map);
  }
  await cp(join(SOURCES, "sounds"), join(dir, "sounds"), { recursive: true });
  await cp(BAKED_CARDS, join(dir, "cards"), { recursive: true });
}
