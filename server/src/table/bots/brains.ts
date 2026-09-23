// КАТАЛОГ МОЗГОВ — одно место, где имя превращается в мозг.
//
// Незнакомое имя — скриптовый `greedy`, а не падение: бот всегда может сесть за стол. То же и с
// мозгом, которому не хватает ключа или запущенной программы: он честно скажет об этом в журнал
// ПРИ ПЕРВОМ ХОДЕ, а стол продолжит играть.

import type { Brain } from "./brain.js";
import { greedyBrain, randomBrain } from "./greedy.js";
import { cliBrain, CLI_BRAINS } from "./cli.js";
import { jevBrain } from "./jev.js";

/** Какие мозги вообще бывают — для подсказки в телеграм-боте. */
export const BRAIN_KEYS = ["greedy", "random", ...Object.keys(CLI_BRAINS), "jev"] as const;

export function brainOf(key: string | undefined): Brain {
  if (key === undefined || key === "greedy") return greedyBrain();
  if (key === "random") return randomBrain();
  if (key === "jev") return jevBrain();
  const cli = CLI_BRAINS[key];
  return cli ? cliBrain(key, cli) : greedyBrain();
}
