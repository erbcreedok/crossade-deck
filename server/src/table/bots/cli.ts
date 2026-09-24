// МОЗГ ЧЕРЕЗ ЧУЖУЮ ПРОГРАММУ — Claude, Gemini, Ollama: те, что уже стоят на этой машине.
//
// Ключей у нас нет, а программы есть, и это тот редкий случай, когда запустить процесс честнее, чем
// городить свой клиент к чужому API: авторизация уже сделана, и её не надо ни хранить, ни обновлять.
//
// ТРИ ВЕЩИ, БЕЗ КОТОРЫХ ЭТОТ МОЗГ ОПАСЕН, И ВСЕ ТРИ ЗДЕСЬ ЕСТЬ:
//   1. ДЕДЛАЙН. Процесс убивается по сроку — иначе зависший мозг останавливает стол насовсем. Срок
//      у каждой программы свой: `claude` отвечает за 5–6 с, `agy` доходил до 20 с.
//   2. ВОПРОС — ОДИН ДОВОД ИЛИ ПОТОК, НИКОГДА НЕ СТРОКА КОМАНДЫ. `spawn` получает доводы массивом и
//      запускает программу без оболочки, поэтому вопрос доезжает целиком, что бы в нём ни стояло.
//      Опасна была бы склейка команды в строку — её здесь нет.
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
  /**
   * Как дать программе вопрос — они просят по-разному, и это не мелочь:
   *
   *   `stdin` — доводы постоянные, вопрос уходит в поток (`claude`, `ollama`);
   *   функция — вопрос входит в доводы (`agy` читает его только флагом `-p=…`).
   *
   * ОБА СПОСОБА БЕЗОПАСНЫ. Доводы уходят массивом в `spawn` без оболочки, поэтому вопрос остаётся
   * одним доводом целиком — что бы в нём ни стояло. Опасна была бы склейка команды в строку, а её
   * здесь нет и быть не может.
   */
  args: readonly string[] | ((question: string) => string[]);
  /** Понадобится ли программе что-то в окружении — и что сказать, если этого нет. */
  needs?: { env: string; says: string };
  /** Свой срок, если эта программа думает дольше прочих. */
  thinkMs?: number;
}

/**
 * ЧТО СТОИТ НА ЭТОЙ МАШИНЕ. Имя слева — то, что владелец пишет в команде `bots`.
 *
 * Все они носят свою авторизацию с собой, поэтому запускаются откуда угодно. У `agy` она в самом
 * Antigravity, но CLI ходит в него сам — запущенного окна для этого не нужно.
 */
export const CLI_BRAINS: Record<string, CliBrain> = {
  claude: { cmd: join(homedir(), ".local/bin/claude"), args: ["-p", "--model", "sonnet", "--output-format", "text"] },
  // Gemini через Antigravity. Берётся самая быстрая ступень: боту нужен номер хода, а не рассуждение.
  flash: {
    cmd: join(homedir(), ".local/bin/agy"),
    args: (question) => ["--model", "gemini-3.8-flash-low", "--output-format", "text", "--disable-slash-commands", `-p=${question}`],
    // Он заметно медленнее Клода: живьём попадались ходы по 20 с. Тридцати секунд не хватало.
    thinkMs: 60000,
  },
  pro: {
    cmd: join(homedir(), ".local/bin/agy"),
    args: (question) => ["--model", "gemini-3.1-pro-low", "--output-format", "text", "--disable-slash-commands", `-p=${question}`],
    thinkMs: 90000,
  },
  ollama: { cmd: "ollama", args: ["run", "qwen2.5:3b"] },
};

/** Запустить программу, отдать ей вопрос и дождаться ответа — или убить по сроку либо по отмене. */
export function runCli(one: CliBrain, question: string, deadlineMs: number, stop?: AbortSignal): Promise<string> {
  return new Promise((done, fail) => {
    if (one.needs && !process.env[one.needs.env]) return void fail(new Error(one.needs.says));
    const args = one.args;
    const byArgs = typeof args === "function";
    const child = spawn(one.cmd, byArgs ? args(question) : [...args], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`не уложился в ${deadlineMs} мс`));
    }, deadlineMs);
    timer.unref?.();
    // ДУМАТЬ СТАЛО НЕЗАЧЕМ — убиваем сейчас же, не дожидаясь срока. Иначе после закрытия стола
    // программа живёт ещё полминуты и доводит до конца ответ, который никто не прочтёт; у платного
    // мозга это прямые деньги на ветер.
    const бросить = () => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      fail(new Error("мысль оборвана"));
    };
    if (stop?.aborted) return void бросить();
    stop?.addEventListener("abort", бросить, { once: true });
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
    // Вопрос ушёл доводом — в поток идёт пустота, но закрыть его надо: иначе программа ждёт ввода.
    child.stdin.end(byArgs ? "" : question);
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
  thinkMs: one.thinkMs ?? CLI_THINK_MS,
  choose: async (legal, view, profile, deadlineMs, stop): Promise<Move> => {
    if (legal.length <= 1) return best(legal, view, profile);
    const said = await runCli(one, ask(legal, view, profile), deadlineMs, stop);
    const move = pick(legal, said);
    if (move === null) throw new Error(`ответ не разобран: ${said.slice(0, 120)}`);
    return move;
  },
});
