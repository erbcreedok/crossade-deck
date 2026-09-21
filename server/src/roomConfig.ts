// Тайминги комнаты. Читаются ПРИ КАЖДОМ обращении, а не один раз при загрузке модуля: тесты
// подставляют короткие значения через process.env и не ждут реальных тридцати минут.

/** Сколько живёт опустевшая комната перед диспоузом (даёт вернуться «в последнюю игру»). */
export function getEmptyRoomTtlMs(): number {
  return envMs("EMPTY_ROOM_TTL_MS", 30 * 60_000);
}

function envMs(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
