// Адрес игрового сервера приходит в РАНТАЙМЕ, а не вшивается в бандл на сборке.
//
// Зачем: артефакт должен быть один на все окружения. Пока адрес вшивался через VITE_*,
// «выкатить тот же образ на другой сервер» означало пересобрать его — то есть выкатить
// уже ДРУГОЙ артефакт, не тот, что проверяли. Теперь образ собирается один раз, а куда
// он ходит, решает окружение контейнера.
//
// Значения кладёт /config.js: в контейнере его пишет entrypoint из переменных окружения
// (deploy/runtime-config.sh), в dev его отдаёт client/public/config.js — пустой, чтобы
// не было 404 и чтобы прежний путь через VITE_* продолжал работать.
//
// Порядок: рантайм → вшитое на сборке (VITE_*) → localhost. Средняя ступень оставлена
// НАРОЧНО: docker-compose.yml и уже собранные образы передают build-аргументы и должны
// работать без единой правки.

export interface RuntimeConfig {
  serverUrl?: string;
  httpUrl?: string;
}

const DEFAULT_SERVER_URL = "ws://localhost:2567";
const DEFAULT_HTTP_URL = "http://localhost:2567";

declare global {
  interface Window {
    __CROSSADE_CONFIG__?: RuntimeConfig;
  }
}

// Пустая строка — штатный случай, а не поломка: config.js пишется ВСЕГДА, и если переменной
// окружения нет, в него уезжает "". Такое значение обязано пропускать ход дальше по цепочке,
// иначе клиент пойдёт на пустой адрес вместо того, что вшито в бандл.
function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function readRuntimeConfig(scope: unknown = globalThis): RuntimeConfig {
  const injected = (scope as { __CROSSADE_CONFIG__?: unknown } | null)?.__CROSSADE_CONFIG__;
  if (!injected || typeof injected !== "object") return {};
  const { serverUrl, httpUrl } = injected as Record<string, unknown>;
  return { serverUrl: nonEmpty(serverUrl), httpUrl: nonEmpty(httpUrl) };
}

export function resolveUrls(
  runtime: RuntimeConfig,
  baked: { serverUrl?: string; httpUrl?: string }
): { serverUrl: string; httpUrl: string } {
  return {
    serverUrl: runtime.serverUrl ?? nonEmpty(baked.serverUrl) ?? DEFAULT_SERVER_URL,
    httpUrl: runtime.httpUrl ?? nonEmpty(baked.httpUrl) ?? DEFAULT_HTTP_URL,
  };
}

const resolved = resolveUrls(readRuntimeConfig(), {
  serverUrl: import.meta.env.VITE_SERVER_URL,
  httpUrl: import.meta.env.VITE_HTTP_URL,
});

export const SERVER_URL = resolved.serverUrl;
export const HTTP_URL = resolved.httpUrl;
