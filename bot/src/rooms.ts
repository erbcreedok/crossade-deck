import type { Game } from "./games.js";
import type { RoomInfo } from "./links.js";

export type CreateRoom = (serverUrl: string, game: Game, by?: string) => Promise<RoomInfo>;

/** `POST /rooms` — server contract: `{ game, by? }` → `{ code, roomId, game }`. */
export const createRoom: CreateRoom = async (serverUrl, game, by) => {
  const res = await fetch(`${serverUrl}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(by ? { game, by } : { game }),
  });
  if (!res.ok) throw new Error(`POST /rooms failed: ${res.status}`);
  const data = (await res.json()) as { code: string; roomId: string; game: Game };
  return { code: data.code, game: data.game };
};

/**
 * `POST /rooms/code` — КОД ДО СТОЛА, вместе с обещанием, каким этот стол будет.
 *
 * Приглашение уходит раньше комнаты: карточка с кодом ложится в чужую переписку, а заводит стол
 * тот, кто первым по нему придёт. Создавать комнату на каждый набранный `inline_query` значило бы
 * плодить пустые столы на каждую букву.
 *
 * Стол из переписки ВЕЧНЫЙ и ПО КОДУ: к нему возвращаются завтра по той же ссылке, и он не должен
 * умереть от того, что оба вышли на ночь.
 */
export const reserveTable = async (serverUrl: string, game: Game, by?: string): Promise<string | undefined> => {
  try {
    const res = await fetch(`${serverUrl}/rooms/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, forever: true, visibility: "hidden", admission: "code", ...(by ? { by } : {}) }),
    });
    if (!res.ok) return undefined;
    return ((await res.json()) as { code?: string }).code;
  } catch {
    // Сервер молчит — приглашения просто не будет. Врать кодом, за которым никто не стоит, нельзя.
    return undefined;
  }
};
