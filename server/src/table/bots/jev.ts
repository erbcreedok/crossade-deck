// JEV (TypeSafe AI) — мозг, который отвечает ВЫБОРОМ ИЗ СПИСКА, а не текстом.
//
// Этим он и ценен здесь: обычную модель приходится уговаривать ответить одним числом и разбирать,
// что она написала на самом деле. Jev отвечает номером варианта, и вместе с номером — вероятностями
// по всем вариантам. Из вероятностей получается СИЛА бота одной настройкой: брать лучший ход,
// тянуть по вероятностям или нарочно выбирать из слабой половины — и всё это на одном мозге.
//
// КЛЮЧ ТОЛЬКО ИЗ ОКРУЖЕНИЯ (`JEV_API_KEY`), как `TELEGRAM_BOT_TOKEN`. Ни в коде, ни в журнале, ни в
// слепке комнаты его нет и быть не должно. Нет ключа — мозг честно скажет это в журнал при первом
// ходе, а стол продолжит играть скриптовым.

import type { Brain, Move } from "./brain.js";
import { ask, moveSays } from "./say.js";
import { best } from "./greedy.js";

/** Куда стучаться. Прямой ключ раннего доступа — по решению владельца; путь меняется здесь одним местом. */
const JEV_URL = process.env["JEV_URL"] ?? "https://api.typesafe.ai/v1/systemone";

/** Как выбирать из вероятностей — это и есть «сила» бота. */
export type Pickiness = "best" | "sample" | "weak";

/** Вероятности по вариантам, как их вернул Jev. */
interface JevSaid {
  choice?: number;
  probabilities?: number[];
}

/**
 * ВЫБОР ПО ВЕРОЯТНОСТЯМ.
 *
 * `best` — лучший вариант; `sample` — тянем по вероятностям (бот ошибается так же, как человек);
 * `weak` — нарочно из нижней половины: так делается слабый соперник, который всё же играет по
 * правилам, а не случайно.
 */
export function choose(probs: readonly number[], how: Pickiness, rnd: () => number = Math.random): number {
  if (probs.length === 0) return 0;
  if (how === "best") return probs.indexOf(Math.max(...probs));
  const order = probs.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
  if (how === "weak") {
    const half = order.slice(Math.floor(order.length / 2));
    return (half[Math.floor(rnd() * half.length)] ?? order[order.length - 1]!).i;
  }
  const sum = probs.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  let roll = rnd() * sum;
  for (const one of order) {
    roll -= one.p;
    if (roll <= 0) return one.i;
  }
  return order[0]!.i;
}

/**
 * МОЗГ JEV. Ключ и строгость берутся при каждом ходе, а не при создании: владелец может положить
 * ключ в окружение и перезапустить стол, не трогая код.
 */
export const jevBrain = (how: Pickiness = "sample"): Brain => ({
  key: "jev",
  // Jev отвечает за 70–500 мс: срок короткий нарочно, чтобы стол не ждал сеть.
  thinkMs: 3000,
  choose: async (legal, view, profile, deadlineMs, stop): Promise<Move> => {
    if (legal.length <= 1) return best(legal, view, profile);
    const key = process.env["JEV_API_KEY"];
    if (!key) throw new Error("нет JEV_API_KEY");
    // Бросаем и по сроку, и по отмене: стол закрылся — ответ уже никому не нужен.
    const бросить = stop ? AbortSignal.any([AbortSignal.timeout(deadlineMs), stop]) : AbortSignal.timeout(deadlineMs);
    const answer = await fetch(JEV_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ state: ask(legal, view, profile), choices: legal.map(moveSays) }),
      signal: бросить,
    });
    if (!answer.ok) throw new Error(`jev: ${answer.status}`);
    const said = (await answer.json()) as JevSaid;
    const at = said.probabilities?.length ? choose(said.probabilities, how) : (said.choice ?? -1);
    const move = legal[at];
    if (move === undefined) throw new Error(`jev ответил мимо списка: ${JSON.stringify(said).slice(0, 120)}`);
    return move;
  },
});
