import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// ОБЩЕЕ СО СТОЛОМ — ЧИСТОЕ. Всё, что клиент стола и бот берут из `server/src/table`, уезжает в браузер
// и в чужой процесс, поэтому обязано быть логикой и типами, и только: ни node, ни express, ни colyseus,
// ни базы — и не напрямую, и не через третьи руки. Это и есть граница протокола: пока она держится,
// эти модули можно вынуть в отдельный пакет одним переносом, не распутывая ничего.

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * Кто входит и что ему можно сверх чистого. Клиенту — ничего: он живёт в браузере. Боту — `crypto`:
 * он подписывает имя комнаты тем же секретом, что и сервер (`roomIds.ts`), и делает это в node.
 */
const ROOTS: { dir: string; mayAlso: string[] }[] = [
  { dir: join(HERE, "..", "..", "table-client"), mayAlso: [] },
  { dir: join(HERE, "..", "..", "..", "bot", "src"), mayAlso: ["crypto"] },
];
const IMPORT = /(?:from|import)\s*\(?\s*"([^"]+)"/g;

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((one) => (one.isDirectory() ? sources(join(dir, one.name)) : one.name.endsWith(".ts") && !one.name.endsWith(".test.ts") ? [join(dir, one.name)] : []));

const fileOf = (from: string, path: string): string => resolve(dirname(from), path.replace(/\.js$/, ".ts"));

/** Модули стола, в которые входят снаружи: клиент и бот. */
function doors(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const root of ROOTS) {
    for (const file of sources(root.dir)) {
      // `import type` стирается при сборке и за собой ничего не тянет.
      for (const [line, path] of readFileSync(file, "utf8").matchAll(IMPORT)) {
        if (!path!.startsWith(".") || line.startsWith("import type")) continue;
        const target = fileOf(file, path!);
        // Вошли двое — можно только то, что можно обоим.
        if (target.startsWith(HERE) && existsSync(target)) out.set(target, out.has(target) ? out.get(target)!.filter((m) => root.mayAlso.includes(m)) : root.mayAlso);
      }
    }
  }
  return out;
}

describe("общее со столом — чистое", () => {
  it("table.shared-is-pure: ни node, ни express, ни colyseus, ни базы — и транзитивно тоже", () => {
    const dirty: string[] = [];
    const walk = (file: string, trail: string[], mayAlso: string[], seen: Set<string>): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      for (const [line, path] of text.matchAll(IMPORT)) {
        const typeOnly = text.slice(Math.max(0, text.lastIndexOf("\n", text.indexOf(line)) + 1), text.indexOf(line) + line.length).trimStart().startsWith("import type");
        if (typeOnly) continue;
        if (!path!.startsWith(".")) {
          if (!mayAlso.includes(path!)) dirty.push(`${[...trail, file].map((f) => f.slice(HERE.length + 1)).join(" → ")} тянет "${path}"`);
          continue;
        }
        const next = fileOf(file, path!);
        if (!next.startsWith(HERE)) dirty.push(`${file.slice(HERE.length + 1)} выходит из стола: ${path}`);
        else if (existsSync(next)) walk(next, [...trail, file], mayAlso, seen);
      }
    };
    const entered = doors();
    expect(entered.size).toBeGreaterThan(10);
    for (const [door, mayAlso] of entered) walk(door, [], mayAlso, new Set());
    expect(dirty).toEqual([]);
  });
});
