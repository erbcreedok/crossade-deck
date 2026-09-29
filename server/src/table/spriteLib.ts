// БИБЛИОТЕКА СПРАЙТОВ — картинки сами по себе: у каждой своё имя, и ни детали, ни ракурса у неё нет. Какая картинка
// каким ракурсом какой детали встанет, решается в «Деталях». Сюда кладёт хозяин (загрузка SVG / PNG со страницы) и
// agy (нарисованная сторона — отдельной картинкой). Файлы — в папке библиотеки, имя и вид — в базе
// (`tableSpritesRepo.ts`). Отдаются всем по `/table/lib/<id>.<вид>`: по ним будут рисовать столы.

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addLibSprite, dropLibSprite, type LibSprite } from "../db/tableSpritesRepo.js";

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LIB = process.env.TABLE_SPRITE_LIB ?? join(SERVER, "data", "sprite-lib");
export const LIB_MAX_BYTES = 2 * 1024 * 1024;
const NAME_MAX = 40;

export const libFile = (id: string, ext: string): string | null => (/^[a-f0-9]{12}$/.test(id) && (ext === "svg" || ext === "png") ? join(LIB, `${id}.${ext}`) : null);

/**
 * КАКАЯ ЭТО КАРТИНКА — или почему её не взять. PNG — по подписи байтов. SVG — только рисунок: без скриптов, без
 * обработчиков, без внешних ссылок (файл отдаётся с нашего адреса, и открытый напрямую он не должен ничего делать).
 */
export function kindOf(bytes: Buffer): { ext: "svg" | "png" } | { error: string } {
  if (bytes.length === 0) return { error: "empty" };
  if (bytes.length > LIB_MAX_BYTES) return { error: "too_big" };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png" };
  const text = bytes.toString("utf8");
  if (!/<svg\b/i.test(text)) return { error: "not_an_image" };
  if (/<script\b|<foreignObject\b|\bon[a-z]+\s*=|javascript:|(?:xlink:)?href\s*=\s*["'](?!#)/i.test(text)) return { error: "unsafe_svg" };
  return { ext: "svg" };
}

export const cleanName = (raw: unknown): string | null => (typeof raw === "string" && raw.trim() ? raw.trim().slice(0, NAME_MAX) : null);

/** Положить картинку в библиотеку. */
export async function keepSprite(bytes: Buffer, name: string, origin: LibSprite["origin"], now = Date.now()): Promise<LibSprite | { error: string }> {
  const kind = kindOf(bytes);
  if ("error" in kind) return kind;
  const one: LibSprite = { id: randomBytes(6).toString("hex"), name, ext: kind.ext, origin, at: now };
  await mkdir(LIB, { recursive: true });
  await writeFile(libFile(one.id, one.ext)!, bytes);
  addLibSprite(one);
  return one;
}

export async function dropSprite(one: LibSprite): Promise<void> {
  dropLibSprite(one.id);
  await rm(libFile(one.id, one.ext)!, { force: true });
}

export async function spriteBytes(one: LibSprite): Promise<Buffer | null> {
  const path = libFile(one.id, one.ext)!;
  return existsSync(path) ? readFile(path) : null;
}
