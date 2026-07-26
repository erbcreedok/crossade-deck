// Версия сборки для client2 — чтобы по скриншоту было видно, залился ли деплой (на телефоне
// другого способа нет). Значения инжектит vite через define (см. vite.config.ts): номер сборки —
// число коммитов (или APP_BUILD снаружи в Docker), коммит — короткий хеш. В dev/тестах define не
// отрабатывает, поэтому у каждого поля свой fallback — подпись должна показывать что-то всегда.

export interface BuildInfo {
  version: string;
  build: string; // номер сборки (число коммитов) или "dev"
  commit: string; // короткий хеш коммита или "dev"
  builtAt: string; // ISO-время сборки; пустое — собрано локально
}

declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT_AT__: string;

function defined(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

// В dev vite впрыскивает свежие значения на каждую загрузку страницы (см. vite.config.ts
// liveBuildInfo), чтобы номер не «замерзал» на моменте старта dev-сервера. В проде/тестах глобали
// нет → берём вшитое define. Так после коммита достаточно обновить вкладку, без рестарта vite.
const live = (globalThis as { __BUILD_LIVE__?: { build: string; commit: string } }).__BUILD_LIVE__;

export const BUILD_INFO: BuildInfo = {
  version: defined(typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined, "0.0.0"),
  build: live?.build ?? defined(typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : undefined, "dev"),
  commit: live?.commit ?? defined(typeof __APP_COMMIT__ !== "undefined" ? __APP_COMMIT__ : undefined, "dev"),
  builtAt: defined(typeof __APP_BUILT_AT__ !== "undefined" ? __APP_BUILT_AT__ : undefined, ""),
};

/** Короткая подпись для угла экрана: «v0.2.0+306». Плюс — метаданные сборки по semver. */
export function formatVersion(info: BuildInfo = BUILD_INFO): string {
  return `v${info.version}+${info.build}`;
}
