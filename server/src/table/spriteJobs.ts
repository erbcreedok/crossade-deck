// ЗАКАЗЫ СПРАЙТОВ СО СТРАНИЦЫ ХОЗЯИНА — вкладка «agy» на `/table/admin`. Заказ — тот же `/sprite`
// (`scripts/sprite.mjs`), запущенный столом в отдельном процессе: он переживает перезапуск стола, а всё, что о нём
// нужно знать, лежит в его папке `data/sprite-jobs/<заказ>/`:
//
//   job.json   что заказано (часть, стороны, бриф, основа, фото) и когда
//   out.txt    что говорит скрипт (круги проверки, ГОДНО / НЕ ГОДНО)
//   agy.log    что говорит agy, по мере вывода
//   exit       код выхода — появляется, когда скрипт кончил
//   <id>-sheet.png   лист: все стороны в трёх расцветках
//
// Рисунки ложатся в `design/persona/skins/<id>/` (как у `/sprite` из чата); «В библиотеку» кладёт каждую сторону
// отдельной картинкой в библиотеку спрайтов (`spriteLib.ts`).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keepSprite } from "./spriteLib.js";

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = resolve(SERVER, "..");
export const JOBS = process.env.TABLE_SPRITE_JOBS ?? join(SERVER, "data", "sprite-jobs");
const PHOTOS = join(JOBS, "_photos");
const DRAWN = join(ROOT, "design", "persona", "skins");

export const JOB_SLOTS = ["head", "hair", "body", "legs"] as const;
const SIDES: Record<string, string[]> = { "1": ["front"], "2": ["front", "back"], "4": ["front", "back", "right"], "6": ["front", "back", "right", "top", "bottom"] };

export interface JobAsk {
  id: string;
  slot: (typeof JOB_SLOTS)[number];
  sides: "1" | "2" | "4" | "6";
  brief: string;
  name?: string;
  like?: string;
  keep?: string;
  photo?: string;
}

export interface Job extends JobAsk {
  job: string;
  views: string[];
  at: number;
  pid?: number;
  /** Принят в библиотеку — id картинок. */
  lib?: string[];
}

export type JobState = "running" | "good" | "bad" | "broken";

/** Разбор заказа из сети: всё или ничего. */
export function cleanAsk(raw: unknown): JobAsk | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const id = str(o.id, 40), brief = str(o.brief, 2000);
  if (!id || !/^[a-z0-9-]+$/.test(id) || !brief) return null;
  if (!JOB_SLOTS.includes(o.slot as JobAsk["slot"]) || !(typeof o.sides === "string" && o.sides in SIDES)) return null;
  const like = str(o.like, 40), keep = str(o.keep, 200), photo = str(o.photo, 80), name = str(o.name, 24);
  if (like && !/^[a-z0-9-]+$/.test(like)) return null;
  if (photo && !/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(photo)) return null;
  if (keep && !/^#[0-9a-fA-F]{6}(\s*,\s*#[0-9a-fA-F]{6})*$/.test(keep)) return null;
  return { id, slot: o.slot as JobAsk["slot"], sides: o.sides as JobAsk["sides"], brief, ...(name ? { name } : {}), ...(like ? { like } : {}), ...(keep ? { keep } : {}), ...(photo ? { photo } : {}) };
}

/** Папка скина, где этой части ещё нет: `pirate`, занято — `pirate-2`, `pirate-3`… Прежнюю попытку можно сравнить. */
export function freeId(id: string, slot: string, has = (dir: string) => existsSync(join(DRAWN, dir, `front-${slot}.svg`))): string {
  if (!has(id)) return id;
  for (let n = 2; ; n += 1) if (!has(`${id}-${n}`)) return `${id}-${n}`;
}

/** Фото-референс со страницы — в папку фото; ответ — имя, по которому заказ его назовёт. */
export async function keepPhoto(bytes: Buffer, type: string): Promise<string> {
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  await mkdir(PHOTOS, { recursive: true });
  const name = `${randomBytes(8).toString("hex")}.${ext}`;
  await writeFile(join(PHOTOS, name), bytes);
  return name;
}

/** Запустить заказ. Процесс отвязан от стола: стол перезапустили — agy рисует дальше. */
export async function startJob(ask: JobAsk, now = Date.now(), run = spawnSprite): Promise<Job> {
  const id = freeId(ask.id, ask.slot);
  const job: Job = { ...ask, id, job: `${now.toString(36)}-${id}-${ask.slot}`, views: SIDES[ask.sides]!, at: now };
  const dir = join(JOBS, job.job);
  await mkdir(dir, { recursive: true });
  // Прогоны подменяют скрипт заглушкой (`scripts/spriteFake.mjs`): agy рисует минуты и стоит денег.
  const script = process.env.TABLE_SPRITE_SCRIPT ? resolve(process.env.TABLE_SPRITE_SCRIPT) : join(SERVER, "scripts", "sprite.mjs");
  const args = [script, "--id", id, "--slot", ask.slot, "--sides", ask.sides, "--work", dir];
  if (ask.like) args.push("--like", ask.like);
  if (ask.keep) args.push("--keep", ask.keep);
  if (ask.photo) args.push("--photo", join(PHOTOS, ask.photo));
  args.push(ask.brief);
  job.pid = run(args, dir);
  await writeFile(join(dir, "job.json"), JSON.stringify(job, null, 2));
  return job;
}

function spawnSprite(args: string[], dir: string): number | undefined {
  // Код выхода — файлом: процесс переживёт стол, а спросят о нём уже у нового.
  const quoted = [process.execPath, ...args].map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(" ");
  const { VITEST: _, ...env } = process.env;
  const child = spawn("/bin/sh", ["-c", `${quoted} > out.txt 2>&1; echo $? > exit`], { cwd: dir, detached: true, stdio: "ignore", env });
  child.unref();
  return child.pid;
}

const alive = (pid?: number): boolean => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const tail = async (file: string, bytes = 12_000): Promise<string> => {
  try {
    const text = await readFile(file, "utf8");
    return text.length > bytes ? `…${text.slice(-bytes)}` : text;
  } catch {
    return "";
  }
};

export interface JobView extends Job {
  state: JobState;
  out: string;
  sheet: boolean;
}

async function viewOf(dir: string, full: boolean): Promise<JobView | null> {
  let job: Job;
  try {
    job = JSON.parse(await readFile(join(dir, "job.json"), "utf8")) as Job;
  } catch {
    return null;
  }
  const exit = existsSync(join(dir, "exit")) ? Number((await readFile(join(dir, "exit"), "utf8")).trim()) : null;
  const state: JobState = exit === null ? (alive(job.pid) ? "running" : "broken") : exit === 0 ? "good" : exit === 1 ? "bad" : "broken";
  const out = full ? `${await tail(join(dir, "out.txt"))}\n${await tail(join(dir, "agy.log"))}`.trim() : await tail(join(dir, "out.txt"), 400);
  return { ...job, state, out, sheet: existsSync(join(dir, `${job.id}-sheet.png`)) };
}

const jobDir = (job: string): string | null => (/^[a-z0-9]+-[a-z0-9-]+-(head|hair|body|legs)$/.test(job) ? join(JOBS, job) : null);

/** Все заказы — новые сверху. */
export async function listJobs(): Promise<JobView[]> {
  if (!existsSync(JOBS)) return [];
  const names = (await readdir(JOBS)).filter((n) => jobDir(n));
  const all = await Promise.all(names.map((n) => viewOf(join(JOBS, n), false)));
  return all.filter((j): j is JobView => j !== null).sort((a, b) => b.at - a.at);
}

export async function oneJob(job: string): Promise<JobView | null> {
  const dir = jobDir(job);
  return dir && existsSync(dir) ? viewOf(dir, true) : null;
}

export const sheetOf = (job: JobView): string => join(JOBS, job.job, `${job.id}-sheet.png`);

const SIDE_NAMES: Record<string, string> = { front: "лицо", back: "спина", right: "бок", top: "верх", bottom: "низ" };

/**
 * В БИБЛИОТЕКУ: каждая нарисованная сторона — отдельной картинкой библиотеки (`spriteLib.ts`), с именем
 * «<имя> · <сторона>». Какой ракурс какой детали она станет — решается в «Деталях».
 */
export async function acceptJob(job: JobView, now = Date.now()): Promise<{ sprites: string[] } | { error: string }> {
  if (job.state !== "good") return { error: "not_good" };
  if (job.lib?.length) return { error: "already" };
  const ids: string[] = [];
  for (const v of job.views) {
    const got = await keepSprite(await readFile(join(DRAWN, job.id, `${v}-${job.slot}.svg`)), `${job.name ?? job.id} · ${SIDE_NAMES[v] ?? v}`, "agy", { slot: job.slot, side: v, tags: [job.name ?? job.id] }, now);
    if ("error" in got) return got;
    ids.push(got.id);
  }
  await writeFile(join(JOBS, job.job, "job.json"), JSON.stringify({ ...job, state: undefined, out: undefined, sheet: undefined, lib: ids }, null, 2));
  return { sprites: ids };
}

/** Убрать попытку: папку заказа и её рисунки (принятые картинки в библиотеке остаются). Работающую — сначала остановить. */
export async function dropJob(job: JobView): Promise<{ ok: true } | { error: string }> {
  if (job.state === "running" && job.pid) {
    try {
      process.kill(-job.pid, "SIGTERM");
    } catch {
      /* уже кончился */
    }
  }
  for (const v of job.views) await rm(join(DRAWN, job.id, `${v}-${job.slot}.svg`), { force: true });
  const drawn = join(DRAWN, job.id);
  if (existsSync(drawn) && (await readdir(drawn)).length === 0) await rmdir(drawn);
  await rm(join(JOBS, job.job), { recursive: true, force: true });
  return { ok: true };
}

/** Папки готовых частей, которые можно взять основой (`--like`). */
export async function likeDirs(): Promise<string[]> {
  if (!existsSync(DRAWN)) return [];
  const names = await readdir(DRAWN);
  const dirs = await Promise.all(names.map(async (n) => ((await stat(join(DRAWN, n))).isDirectory() ? n : null)));
  return dirs.filter((n): n is string => n !== null).sort();
}

