// КУКЛЫ ЗА СТОЛОМ — кем человек сидит: король или дама из колоды, в одной из расцветок. Выбирает сам
// (профиль стола, `tableProfilesRepo.ts`), видят все. У фигуры колоды три краски — красная, синяя и золото;
// расцветка их подменяет, чтобы одинаковые куклы за столом не сливались. Свой цвет человека (`Person.ink`)
// поверх любой расцветки — обводкой: он всегда различает двоих.
//
// Одно место на сервер, веб и Unity: чистые данные.

import { SETS, cleanParts, type Parts } from "./skins.js";

/** Кем можно сидеть — готовые наборы каталога (`skins.ts`); поверх набора человек меняет части сам. */
export const DOLLS: readonly string[] = SETS.map((s) => s.id);
export type Doll = string;
/** Кем сидит тот, кто ещё не выбирал, — палкой с кружком-аватаром: остальное приходит наградой (`rewards.ts`). */
const DEFAULT_DOLLS = ["stick"] as const;

/** Три краски расцветки: чем заменить красную, синюю и золото рисунка. */
export interface Palette {
  name: string;
  red: string;
  blue: string;
  gold: string;
  /**
   * ПРЕДПОЧИТАЕМЫЙ СВОЙ ЦВЕТ — обводка, которая к расцветке идёт. Выбрал расцветку — обводка встаёт этой;
   * поменять её потом можно отдельно. Один из восьми своих цветов (`profileInks.ts`, `INKS`).
   */
  ink: string;
}

/** Шестнадцать расцветок; первые `MAIN_PALETTES` — основные, видны сразу, остальные — под «ещё». */
export const PALETTES: readonly Palette[] = [
  { name: "классика", red: "#b3221f", blue: "#1d4f80", gold: "#f2c14e", ink: "#e0483f" },
  { name: "изумруд", red: "#2f7d4f", blue: "#173a2c", gold: "#e7c766", ink: "#a8e08f" },
  { name: "аметист", red: "#6b3fa0", blue: "#2b2560", gold: "#d9c9a0", ink: "#b98fe0" },
  { name: "уголь", red: "#3a3a3a", blue: "#5b6570", gold: "#c9ccd1", ink: "#f2c14e" },
  { name: "закат", red: "#d9602a", blue: "#6e1f3a", gold: "#f2d24e", ink: "#e08b3f" },
  { name: "лёд", red: "#3f8fbf", blue: "#1b3550", gold: "#dfe9f2", ink: "#8fb4e0" },
  { name: "роза", red: "#c2457a", blue: "#4a2340", gold: "#f2c6a8", ink: "#e08fb4" },
  { name: "мох", red: "#6f7d2f", blue: "#2f3a1c", gold: "#d8c98a", ink: "#a8e08f" },
  { name: "медь", red: "#a8552a", blue: "#3d2a1f", gold: "#e0a060", ink: "#e08b3f" },
  { name: "бирюза", red: "#1f9a8f", blue: "#15434a", gold: "#f0d9a0", ink: "#7fd1b9" },
  { name: "вино", red: "#7a1f2e", blue: "#2a1a2e", gold: "#c9a55a", ink: "#e0483f" },
  { name: "песок", red: "#b89a5a", blue: "#5a4a30", gold: "#f2e2b0", ink: "#f2c14e" },
  { name: "ночь", red: "#3a4ab0", blue: "#10163a", gold: "#b8c4f2", ink: "#8fb4e0" },
  { name: "лава", red: "#e0301f", blue: "#2a0f0a", gold: "#ffb02e", ink: "#e08b3f" },
  { name: "мята", red: "#4fb88a", blue: "#1f4a3a", gold: "#e8f2c8", ink: "#7fd1b9" },
  { name: "сирень", red: "#9a6ad0", blue: "#3a2a5a", gold: "#f0d0f0", ink: "#b98fe0" },
];
export const MAIN_PALETTES = 5;

/** Что человек выбрал себе. */
export interface DollLook {
  doll: Doll;
  palette: number;
}

/** Хэш ключа: одинаковый при каждом вопросе, разный у разных людей. */
function hash(key: string): number {
  let sum = 0;
  for (const ch of key) sum = (sum * 31 + ch.codePointAt(0)!) % 0x7fffffff;
  return sum;
}

/** Кукла того, кто ещё ничего не выбрал: палка, и по ключу — одна из основных расцветок. */
export function dollFor(key: string): DollLook {
  const h = hash(key);
  return { doll: DEFAULT_DOLLS[h % DEFAULT_DOLLS.length]!, palette: Math.floor(h / DEFAULT_DOLLS.length) % MAIN_PALETTES };
}

/** Свои части из строки базы (JSON «слот → часть»); испорчена — своих нет. */
export function ownParts(json: string | null | undefined): Partial<Parts> {
  if (!json) return {};
  try {
    return cleanParts(JSON.parse(json));
  } catch {
    return {};
  }
}

/** Разбор выбора из сети: кукла и расцветка — каждое поле или годное, или его нет. */
export function cleanDoll(raw: unknown): Partial<DollLook> {
  const o = (raw ?? {}) as { doll?: unknown; palette?: unknown };
  const out: Partial<DollLook> = {};
  if (typeof o.doll === "string" && DOLLS.includes(o.doll)) out.doll = o.doll;
  if (typeof o.palette === "number" && Number.isInteger(o.palette) && o.palette >= 0 && o.palette < PALETTES.length) out.palette = o.palette;
  return out;
}
