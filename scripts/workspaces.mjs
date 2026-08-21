// Единственный список воркспейсов репозитория — раскрытый из `package.json`, а не переписанный.
//
// Читают его ОБА пути: `.github/workflows/ci.yml` строит по нему матрицу проверок, а
// `scripts/check-ci.mjs` по нему же сторожит. Ровно та же причина, по которой в проекте появился
// `deploy/components.json`: список, переписанный во второе место, однажды разъедется с первым —
// и разъезд заметят не тогда, когда он случился, а когда что-то не проверилось.
//
// Именно это и произошло с CI: воркспейсы `game-kit`, `game-presets/*` и `apps/*` появлялись в
// `package.json`, а в CI не появлялись, потому что список там был написан руками. Пока он пишется
// руками, забыть строку можно снова; выведенный список забыть нельзя.
//
// Запуск: `node scripts/workspaces.mjs` — JSON для матрицы, `--names` — имена через пробел.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const manifest = (dir) => {
  const file = join(ROOT, dir, "package.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
};

/**
 * Пакеты воркспейса: имя, папка и объявленные скрипты.
 *
 * Раскрывается только звёздочка на последнем сегменте (`apps/*`) — единственная форма, которая в
 * этом репозитории есть. Шире не делается СПЕЦИАЛЬНО: полноценный глоб потребовал бы зависимости
 * или своего матчера, а поддержать нужно ровно то, что записано в `package.json`. Появится другая
 * форма — упадёт здесь, громко, а не тихо пропустит пакет.
 */
export function workspaces() {
  const root = manifest(".");
  const found = [];
  for (const pattern of root.workspaces ?? []) {
    if (!pattern.includes("*")) {
      found.push(pattern);
      continue;
    }
    const [parent, ...rest] = pattern.split("/");
    if (rest.length !== 1 || rest[0] !== "*") {
      throw new Error(`форма воркспейса не поддержана: ${pattern} (умеем "имя" и "папка/*")`);
    }
    for (const entry of readdirSync(join(ROOT, parent), { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(ROOT, parent, entry.name, "package.json"))) {
        found.push(`${parent}/${entry.name}`);
      }
    }
  }
  return found.map((dir) => {
    const pkg = manifest(dir);
    return { dir, name: pkg.name, scripts: Object.keys(pkg.scripts ?? {}) };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = workspaces();
  const out = process.argv.includes("--names") ? all.map((w) => w.name).join(" ") : JSON.stringify(all.map((w) => w.name));
  console.log(out);
}
