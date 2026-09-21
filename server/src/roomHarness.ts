import { afterAll, beforeAll, beforeEach } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { KitRoom } from "./KitRoom.js";
import { TableRoom } from "./table/TableRoom.js";
import { TABLE_ROOM } from "./table/contract.js";

// Общая обвязка тестов комнаты: поднять сервер, поделить его на все случаи одного файла,
// прибрать между тестами.
//
// vi.mock("./accounts.js") сюда переехать НЕ может: он хойстится в рамках файла теста,
// поэтому остаётся в каждом файле (четыре строки).

// Короткие таймауты — тесты не ждут реальные секунды. Комната читает их «лениво»
// (при каждом обращении, см. roomConfig.ts), ровно ради тестируемости.
process.env.EMPTY_ROOM_TTL_MS = "300"; // сколько живёт опустевшая (все на паузе) комната

/** По порту на файл тестов: параллельные воркеры vitest не должны делить сокет. */
export const TEST_PORTS = {
  kit: 2671,
  kitCounts: 2672,
  kitDeeds: 2673,
  kitRoom: 2674,
  table: 2675,
  tableRoutes: 2676,
  tableChronicle: 2677,
} as const;

export function createGameServer() {
  const server = new Server({ transport: new WebSocketTransport() });
  server.define("kit_room", KitRoom);
  server.define(TABLE_ROOM, TableRoom).filterBy(["room"]);
  return server;
}

/**
 * Поднимает тестовый сервер на файл и чистит комнаты между тестами.
 * Возвращает геттер, потому что сам сервер появляется только в beforeAll.
 *
 * Порт обязателен и у каждого файла свой: vitest гоняет файлы параллельно, и на общем
 * порту они дерутся за него (EADDRINUSE). Список портов — TEST_PORTS ниже, чтобы номера
 * не расползлись по файлам и не начали совпадать.
 */
export function useTestServer(port: number): () => ColyseusTestServer {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    // Не boot(server, port): при передаче готового Server библиотека игнорирует порт и
    // всегда слушает свой 2568 (см. @colyseus/testing/build/index.js). Поднимаем сами —
    // ровно то же самое, что делает boot, но на нужном порту.
    const gameServer = createGameServer();
    await gameServer.listen(port);
    colyseus = new ColyseusTestServer(gameServer);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  return () => colyseus;
}
