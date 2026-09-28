// AR ИЗ ПРИЛОЖЕНИЯ — стол открыт внутри нативного Crossade (`native/ios-table`), и тогда положение телефона
// в комнате даёт ARKit, а не гироскоп с метками.
//
// Приложение кладёт в страницу `window.__crossadeNative` до её скриптов, а когда AR включён — зовёт
// `window.__arFrame(qx, qy, qz, qw, x, y, z, fov, tracking)` каждый кадр камеры:
//   q         поворот телефона (камера → мир): камера смотрит в −Z, верх экрана +Y — те же оси, что у `arLens`
//   x, y, z   где телефон, метры; мир ARKit выровнен по тяжести (+Y вверх), ноль — где AR включили
//   fov       вертикальный обзор экрана, градусы — под картинку камеры, которую приложение рисует под страницей
//   tracking  1 — ARKit уверен в месте, 0 — ищет (темно, закрыли камеру)
// Камеру рисует приложение ПОД страницей: в AR страница прозрачна насквозь.

import type { Quat, Vec } from "./arLens.js";

export interface NativePose {
  q: Quat;
  pos: Vec;
  fov: number;
  tracking: boolean;
}

interface Shell {
  /** Включить или выключить AR в приложении: камеру и слежение. */
  ar(on: boolean): void;
  /** Запомнить ключ приложения (`appPass.ts`) — гость получил его здесь, на странице. */
  key?(key: string): void;
  /** Вход через Telegram: приложение открывает страницу входа в системном окне и ловит ключ. */
  login?(): void;
  /**
   * НАЙТИ ПОВЕРХНОСТЬ: ARKit бросает луч из середины экрана на горизонтальную плоскость и отвечает
   * `window.__arSurface(x, y, z, found)` — точка в метрах мира ARKit; `found` 1 — настоящая найденная плоскость,
   * 0 — примерная. Ничего — `window.__arSurface()` без чисел. Старое приложение этого не умеет.
   */
  surface?(): void;
}

/** Приложение, в котором открыт стол; `null` — это браузер или Telegram. */
export function nativeShell(): Shell | null {
  return (globalThis as { __crossadeNative?: Shell }).__crossadeNative ?? null;
}

/**
 * МЕНЮ ПРИЛОЖЕНИЯ — «Мои комнаты» с ключом, без ключа — экран входа (`rooms.ts`). Системной кнопки «назад»,
 * как у Telegram, в приложении нет: сюда ведут имя стола и выход из зависшей загрузки.
 */
export function menuUrl(): string {
  const key = new URLSearchParams(location.search).get("key");
  return key ? `?rooms&key=${encodeURIComponent(key)}` : "?rooms";
}

/** Слушать ответ «где поверхность» (`Shell.surface`); вернёт, как перестать. */
export function hearSurface(heard: (at: Vec | null, found: boolean) => void): () => void {
  const g = globalThis as { __arSurface?: (...n: number[]) => void };
  g.__arSurface = (x, y, z, found) => {
    heard(x === undefined || y === undefined || z === undefined ? null : [x, y, z], found === 1);
  };
  return () => { delete g.__arSurface; };
}

/** Слушать позу от приложения; вернёт, как перестать. */
export function hearNative(heard: (pose: NativePose) => void): () => void {
  const g = globalThis as { __arFrame?: (...n: number[]) => void };
  g.__arFrame = (qx, qy, qz, qw, x, y, z, fov, tracking) => {
    heard({ q: [qx!, qy!, qz!, qw!], pos: [x!, y!, z!], fov: fov!, tracking: tracking === 1 });
  };
  return () => { delete g.__arFrame; };
}
