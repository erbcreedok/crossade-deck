// Адрес игрового сервера: рантайм-инъекция (window.__CRUSADE_CONFIG__) побеждает над тем, что
// вшито на сборке (import.meta.env.VITE_*), а вшитое — над жёстко зашитым дефолтом. Так собранный
// бандл остаётся одним и тем же артефактом на всех окружениях — куда ему стучаться, решает
// страница, которая его подаёт, а не пересборка. Форма перенесена из client/src/runtimeConfig.ts
// (тот же порядок приоритета), реализация своя.

export interface RuntimeConfig {
  serverUrl?: string;
  httpUrl?: string;
}

declare global {
  interface Window {
    __CRUSADE_CONFIG__?: RuntimeConfig;
  }
}

const DEFAULT_SERVER_URL = "ws://localhost:2567";
const DEFAULT_HTTP_URL = "http://localhost:2567";

// Пустая строка — не значит "задано": .env без переменной и рантайм-конфиг без поля дают именно
// "", и оба случая обязаны пропускать выбор дальше по цепочке, а не застревать на пустом адресе.
export function resolveUrl(
  runtime: string | undefined,
  env: string | undefined,
  fallback: string
): string {
  if (typeof runtime === "string" && runtime !== "") return runtime;
  if (typeof env === "string" && env !== "") return env;
  return fallback;
}

function windowConfig(): RuntimeConfig {
  return typeof window === "undefined" ? {} : window.__CRUSADE_CONFIG__ ?? {};
}

export function serverUrl(): string {
  return resolveUrl(windowConfig().serverUrl, import.meta.env.VITE_SERVER_URL, DEFAULT_SERVER_URL);
}

export function httpUrl(): string {
  return resolveUrl(windowConfig().httpUrl, import.meta.env.VITE_HTTP_URL, DEFAULT_HTTP_URL);
}
