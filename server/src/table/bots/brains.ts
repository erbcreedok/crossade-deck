// КАТАЛОГ МОЗГОВ — одно место, где имя превращается в мозг.
//
// Незнакомое имя — скриптовый `greedy`, а не падение: бот всегда может сесть за стол. То же и с
// мозгом, которому не хватает ключа или запущенной программы: он честно скажет об этом в журнал
// ПРИ ПЕРВОМ ХОДЕ, а стол продолжит играть.

import type { Brain } from "./brain.js";
import { greedyBrain, randomBrain } from "./greedy.js";
import { cliBrain, CLI_BRAINS } from "./cli.js";
import { jevBrain } from "./jev.js";

/**
 * ЗА НЕГО ДУМАЮТ СНАРУЖИ — не мозг, а его отсутствие: стул занят, но ходов от комнаты не будет.
 * Ход придёт от внешнего агента (MCP) под ключом этого бота, когда тот решит.
 *
 * Так внешний игрок получает то, чего у него иначе нет: место за столом, имя, цвет и руку, которые
 * переживают перезапуск. Отдельной сущности «гость-агент» для этого заводить не пришлось.
 */
export const OUTSIDE_BRAIN = "outside";

/** Какие мозги вообще бывают — для подсказки в телеграм-боте. */
export const BRAIN_KEYS = ["greedy", "random", ...Object.keys(CLI_BRAINS), "jev", OUTSIDE_BRAIN] as const;

export function brainOf(key: string | undefined): Brain {
  // «Снаружи» мозгом не становится: если его всё же спросят, ходит скриптовый — стол не встаёт.
  if (key === undefined || key === "greedy" || key === OUTSIDE_BRAIN) return greedyBrain();
  if (key === "random") return randomBrain();
  if (key === "jev") return jevBrain();
  const cli = CLI_BRAINS[key];
  return cli ? cliBrain(key, cli) : greedyBrain();
}
