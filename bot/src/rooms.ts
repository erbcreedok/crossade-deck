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
