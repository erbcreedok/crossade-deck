// МОЗГ ЧЕРЕЗ ЧУЖУЮ ПРОГРАММУ — Claude, Gemini, Ollama: те, что уже стоят на этой машине.
//
// Ключей у нас нет, а программы есть, и это тот редкий случай, когда запустить процесс честнее, чем
// городить свой клиент к чужому API: авторизация уже сделана, и её не надо ни хранить, ни обновлять.
//
// ТРИ ВЕЩИ, БЕЗ КОТОРЫХ ЭТОТ МОЗГ ОПАСЕН, И ВСЕ ТРИ ЗДЕСЬ ЕСТЬ:
//   1. ДЕДЛАЙН. Процесс убивается по сроку — иначе зависший `claude` останавливает стол насовсем.
//   2. ВОПРОС ЧЕРЕЗ stdin, а не через аргументы: в карте бывает что угодно, а склейка строки в
//      команду — это дыра, через которую однажды приедет чужая команда.
//   3. ОТВЕТ — ТОЛЬКО НОМЕР. Что бы программа ни написала, берётся первое число, и оно сверяется со
//      списком (`say.pick`). Не сошлось — ходит запасной.
//
// Цена хода настоящая: один ход `claude` стоит несколько центов, поэтому такой мозг не ставится по
// умолчанию — его просят командой `bots {brain}`.

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Brain, Move } from "./brain.js";
import { ask, pick } from "./say.js";
import { best } from "./greedy.js";

export interface CliBrain {
  /** Что запустить. */
  cmd: string;
  /** С какими доводами. Вопрос сюда НЕ подставляется: он уходит в stdin. */
  args: readonly string[];
  /** Понадобится ли программе что-то в окружении — и что сказать, если этого нет. */
  needs?: { env: string; says: string };
}

/**
 * ЧТО СТОИТ НА ЭТОЙ МАШИНЕ. Имя слева — то, что владелец пишет в команде `bots`.
 *
 * `claude` и `ollama` работают как есть. `flash` (Gemini через Antigravity) требует запущенного
 * Antigravity: его язык-сервер подставляет адрес в `ANTIGRAVITY_LS_ADDRESS`, и без него программа
 * отвечает отказом — поэтому мозг честно скажет об этом в журнал, а стол продолжит играть.
 */
export const CLI_BRAINS: Record<string, CliBrain> = {
  claude: { cmd: join(homedir(), ".local/bin/claude"), args: ["-p", "--model", "sonnet", "--output-format", "text"] },
  flash: {
    cmd: join(homedir(), ".gemini/antigravity-cli/bin/agentapi"),
    args: ["new-conversation", "--model=flash"],
    needs: { env: "ANTIGRAVITY_LS_ADDRESS", says: "нужен запущенный Antigravity" },
  },
  ollama: { cmd: "ollama", args: ["run", "qwen2.5:3b"] },
};

/** Запустить программу, отдать ей вопрос в stdin и дождаться ответа — или убить по сроку. */
export function runCli(one: CliBrain, question: string, deadlineMs: number): Promise<string> {
  return new Promise((done, fail) => {
    if (one.needs && !process.env[one.needs.env]) return void fail(new Error(one.needs.says));
    const child = spawn(one.cmd, [...one.args], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`не уложился в ${deadlineMs} мс`));
    }, deadlineMs);
    timer.unref?.();
    child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.stderr.on("data", (chunk) => (err += String(chunk)));
    child.on("error", (why) => {
      clearTimeout(timer);
      fail(why);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return void done(out);
      fail(new Error(`${one.cmd}: ${code} ${err.slice(0, 200)}`));
    });
    child.stdin.end(question);
  });
}

/**
 * МОЗГ НА ЧУЖОЙ ПРОГРАММЕ. Упала, не уложилась, ответила не числом — бросает, и комната ходит
 * запасным. Здесь же ход выбирается запасным сразу, если список всего из одного хода: платить за
 * вопрос, ответ на который один, незачем.
 */
/** Внешней программе нужны секунды: `claude` отвечает за 5–6 с, `ollama` за 3–4. */
const CLI_THINK_MS = 30000;

export const cliBrain = (key: string, one: CliBrain): Brain => ({
  key,
  thinkMs: CLI_THINK_MS,
  choose: async (legal, view, profile, deadlineMs): Promise<Move> => {
    if (legal.length <= 1) return best(legal, view, profile);
    const said = await runCli(one, ask(legal, view, profile), deadlineMs);
    const move = pick(legal, said);
    if (move === null) throw new Error(`ответ не разобран: ${said.slice(0, 120)}`);
    return move;
  },
});
