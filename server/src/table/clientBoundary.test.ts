import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// ГРАНИЦА КЛИЕНТА СТОЛА. Клиент — отдельная вещь: его собирают заранее и раздают откуда угодно. Из своей
// папки он выходит только в три места, и каждое — библиотека, а не чьё-то приложение:
//   ../src/table/        общее со столом на сервере: контракт, патч, чистые правила
//   ../../look/src/      вид Crossade
//   ../../game-kit/src/  кит
// Внутренности приложений (`apps/*`) и остальной сервер (`../src/` мимо `table/`) — не его дело.

const CLIENT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "table-client");
const ALLOWED = ["../src/table/", "../../look/src/", "../../game-kit/src/"];

describe("клиент стола выходит из своей папки только в библиотеки", () => {
  it("table-client.imports-only-libraries", () => {
    const strays: string[] = [];
    for (const file of readdirSync(CLIENT).filter((name) => name.endsWith(".ts"))) {
      const source = readFileSync(join(CLIENT, file), "utf8");
      for (const [, path] of source.matchAll(/(?:from|import)\s*\(?\s*"(\.\.\/[^"]+)"/g)) {
        if (!ALLOWED.some((root) => path!.startsWith(root))) strays.push(`${file} → ${path}`);
      }
    }
    expect(strays).toEqual([]);
  });

  it("table-client.names-no-game: какие игры и раздачи есть, клиент узнаёт из контракта, а не знает сам", () => {
    const named: string[] = [];
    for (const file of readdirSync(CLIENT).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      readFileSync(join(CLIENT, file), "utf8").split("\n").forEach((line, i) => {
        if (/\b(durak|krest|belka)\b/i.test(line) && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")) named.push(`${file}:${i + 1}`);
      });
    }
    expect(named).toEqual([]);
  });
});
