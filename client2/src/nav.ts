// Навигация client2 с учётом базового пути. В проде приложение живёт под сабрутом /v2/
// (один домен со старым клиентом), локально — под '/'. import.meta.env.BASE_URL это учитывает.
const BASE = import.meta.env.BASE_URL; // '/' в dev, '/v2/' в проде

/** Внутренний переход по маршруту приложения (меню/песочница/стол) с префиксом базы. */
export function goApp(path: string): void {
  window.location.href = BASE + path.replace(/^\//, "");
}

/** Текущий маршрут без базового префикса — для роутинга в main.tsx. */
export function routePath(): string {
  const p = window.location.pathname;
  return (p.startsWith(BASE) ? p.slice(BASE.length) : p).replace(/^\//, "");
}

// Ссылка на СТАРЫЙ клиент (v1) — неприметный тумблер версий. Локально ведёт на порт соседнего
// dev-сервера, но по ТОМУ ЖЕ хосту, что открыт: зашёл по IP (с телефона) — ссылка на IP, зашёл
// по localhost — на localhost. В проде — тот же origin '/'. Так переключение работает везде.
export const OLD_CLIENT_URL = import.meta.env.DEV ? `http://${window.location.hostname}:5173/` : "/";
