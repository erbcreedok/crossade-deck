// Комната знает свою игру только внутри себя (KitRoom.game); HTTP-слою она нужна отдельно,
// чтобы GET /rooms/by-code мог ответить, не спрашивая саму комнату. In-memory, как publicRooms
// и inviteCodes — переживает рестарт сервера так же, как они (никак).
const roomGames = new Map<string, string>();

export function setRoomGame(roomId: string, game: string): void {
  roomGames.set(roomId, game);
}

export function getRoomGame(roomId: string): string | undefined {
  return roomGames.get(roomId);
}

export function clearRoomGame(roomId: string): void {
  roomGames.delete(roomId);
}
