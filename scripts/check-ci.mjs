// Сторож CI: проверки не должны молча разъезжаться с репозиторием.
//
// Закон родился из настоящей поломки, а не из осторожности. В `ci.yml` месяцами жили джобы
// `client` и `client2` с `working-directory` на папки, удалённые из git, — на свежем чекауте
// они падали ещё на `npm ci`. А `game-kit`, `game-presets/*` и `apps/*` в CI не значились вовсе.
// Не замечено это было потому, что каждый ночной коммит нёс `[skip ci]`: workflow не запускался,
// и «зелёный main» держался на том, что никто не смотрел.
//
// Отсюда три утверждения, и каждое ловит свою половину той поломки:
//
//   1. Путь, названный в workflow, существует.   — джоба на удалённую папку.
//   2. Каждый пакет репозитория проверяется.     — пакет, о котором CI не узнал.
//   3. Список воркспейсов ВЫВЕДЕН, а не переписан. — то, из-за чего пункт 2 случился.
//   4. Граф джоб сходится: `needs` и `uses` ведут в существующее.
//
// Четвёртое стоит здесь по той же причине, что и первое, только цена ошибки другая: опечатка в
// `needs` не падает — GitHub тихо считает такую джобу пропущенной, и гейт «после зелёных тестов»
// перестаёт быть гейтом, ничем этого не показав.
//
// Запуск: `npm run check:ci` (и он же первым шагом в CI, до всякой установки — секунды).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaces } from "./workspaces.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_DIR = join(ROOT, ".github", "workflows");
const CI = "ci.yml";

const problems = [];
const complain = (line) => problems.push(line);

const flows = readdirSync(FLOW_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
const textOf = (file) => readFileSync(join(FLOW_DIR, file), "utf8");

// ---- 1. Путь, названный в workflow, существует ------------------------------------------------
//
// Только те ключи, где значение — путь В РЕПОЗИТОРИИ. `run:` сюда не входит: там пути живут
// внутри shell-строк вперемешку с переменными, и разбирать их значило бы писать свой парсер
// команд ради проверки, которую первая же `${{ }}`-подстановка обошла бы.
const PATH_KEYS = ["working-directory", "cache-dependency-path"];

for (const file of flows) {
  for (const [i, line] of textOf(file).split("\n").entries()) {
    const hit = /^\s*(working-directory|cache-dependency-path):\s*(.+?)\s*$/.exec(line);
    if (!hit || !PATH_KEYS.includes(hit[1])) continue;
    const value = hit[2].replace(/^["']|["']$/g, "");
    // Подстановку проверить нельзя — её значение известно только в момент запуска.
    if (value.includes("${{")) continue;
    if (!existsSync(join(ROOT, value))) {
      complain(`${file}:${i + 1} — ${hit[1]}: ${value}, а такого пути в репозитории нет`);
    }
  }
}

// ---- 2. Каждый пакет репозитория проверяется ---------------------------------------------------
//
// Пакеты берутся из git, а не с диска: рядом лежат неотслеживаемые огрызки удалённых поколений
// клиента (`client/`, `client2/`), и по диску сторож потребовал бы джобу для каждого из них.
const tracked = execFileSync("git", ["ls-files", "*package.json"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((p) => p && !p.includes("node_modules"))
  .map((p) => dirname(p))
  .filter((dir) => dir !== ".");

const ours = workspaces();
const inWorkspace = new Set(ours.map((w) => w.dir));
const ci = textOf(CI);

// Воркспейсы попадают в матрицу выведенным списком — проверять надо не упоминание, а то, что у
// пакета ЕСТЬ что запускать: шаг `npm run typecheck -w <пакет>` на пакете без такого скрипта
// молча ничего не делает, и джоба зеленеет, ничего не проверив.
for (const w of ours) {
  for (const script of ["typecheck", "test"]) {
    if (!w.scripts.includes(script)) {
      complain(`${w.dir} (${w.name}) — нет скрипта "${script}", шаг матрицы CI на нём пустой`);
    }
  }
}

// Пакеты ВНЕ воркспейса (у сервера свой лок и своя установка) в матрицу не попадают: их джобы
// написаны руками, и упомянуты они должны быть тоже руками.
for (const dir of tracked) {
  if (inWorkspace.has(dir)) continue;
  if (!ci.includes(dir)) {
    complain(`${dir} — пакет вне воркспейса, и в ${CI} он не назван: его никто не проверяет`);
  }
}

// ---- 3. Список воркспейсов выведен, а не переписан ---------------------------------------------
//
// Утверждение ровно про то, из-за чего всё и случилось. Переписать список обратно руками можно
// только выкинув эту ссылку — тогда здесь и станет красно.
if (!ci.includes("scripts/workspaces.mjs")) {
  complain(`${CI} — матрица воркспейсов не выводится из scripts/workspaces.mjs, значит список переписан руками`);
}

// ---- 4. Граф джоб сходится ---------------------------------------------------------------------
//
// Разбор построчный, а не парсером YAML: зависимости у сторожа нет и заводить её ради четырёх
// файлов не стоит. Отсюда и осторожность — сомнительные формы (`needs` блочным списком через
// перенос, подстановка в `uses`) пропускаются молча. Сторож ловит опечатку, а не притворяется
// вторым GitHub'ом.
for (const file of flows) {
  const lines = textOf(file).split("\n");
  const jobs = new Set();
  let inJobs = false;
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) inJobs = true;
    else if (/^\S/.test(line)) inJobs = false;
    else if (inJobs) {
      const job = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
      if (job) jobs.add(job[1]);
    }
  }

  for (const [i, line] of lines.entries()) {
    const needs = /^\s*needs:\s*(.+?)\s*$/.exec(line);
    if (needs) {
      const value = needs[1];
      const named = value.startsWith("[")
        ? value.replace(/^\[|\]$/g, "").split(",")
        : /^[A-Za-z0-9_-]+$/.test(value)
          ? [value]
          : [];
      for (const raw of named) {
        const name = raw.trim();
        if (name && !jobs.has(name)) {
          complain(`${file}:${i + 1} — needs: ${name}, а джобы с таким именем в файле нет`);
        }
      }
    }

    const uses = /^\s*uses:\s*(\.\/\S+?)\s*$/.exec(line);
    if (uses && !uses[1].includes("${{") && !existsSync(join(ROOT, uses[1]))) {
      complain(`${file}:${i + 1} — uses: ${uses[1]}, а такого workflow в репозитории нет`);
    }
  }
}

// ---- итог --------------------------------------------------------------------------------------
if (problems.length) {
  console.error(`CI разъехался с репозиторием, ${problems.length} шт.:\n`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log(`CI сходится с репозиторием: ${flows.length} workflow, ${tracked.length} пакетов, воркспейсов ${ours.length}.`);
