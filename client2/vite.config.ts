import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = createRequire(import.meta.url)("./package.json") as { version?: string };

// Данные о сборке из git. В сборочном контейнере .git отсутствует (в контекст образа
// попадает только исходник), поэтому у каждой команды есть запасной вариант, а номер
// сборки вдобавок можно передать снаружи через APP_BUILD — так его пробрасывает
// Dockerfile из build-аргумента. Подпись версии не должна ронять сборку (см. src/version.ts).
function git(command: string, fallback: string): string {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}

// Номер сборки — число коммитов в истории. Растёт сам, одинаков у клиента и сервера,
// собранных с одного коммита, и не требует ручного учёта в отличие от счётчика в файле.
function buildNumber(): string {
  return process.env.APP_BUILD || git("git rev-list --count HEAD", "dev");
}

// В ПРОДЕ новый клиент временно раздаётся под сабрутом /v2/ (один домен со старым): base
// должен быть /v2/, чтобы пути к ассетам и роутинг были префиксованы. Локально (dev) держим
// base '/' — отдельный порт 5174, standalone. BASE_URL пробрасывается в код (см. src/nav.ts).
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/v2/" : "/",
  plugins: [react()],
  server: { port: 5174, host: true },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
    __APP_BUILD__: JSON.stringify(buildNumber()),
    __APP_COMMIT__: JSON.stringify(process.env.APP_COMMIT || git("git rev-parse --short HEAD", "dev")),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
}));
