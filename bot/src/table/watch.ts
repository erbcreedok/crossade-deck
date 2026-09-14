// СТОРОЖ СТОЛОВ: бот помнит, в каких чатах открывал столы, и сам говорит этим чатам, когда столов
// не стало.
//
// Столы живут в памяти сервера стола, поэтому их смерть не приходит сообщением — её видно только
// снаружи: у маяка сменился `boot` (перезапуск) или маяк замолчал (сервер выключен). Список чатов
// лежит на диске бота, а не сервера: сервер, который умер, никому уже ничего не скажет.

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Where } from "./api.js";
import { lost } from "./talk.js";

/** Чат → его столы (id → название), и запуск сервера, на котором они открыты. */
export interface Memory {
  boot: string | null;
  chats: Record<string, Record<string, string>>;
}

export class Watch {
  private memory: Memory;

  constructor(private readonly file: string) {
    try {
      this.memory = JSON.parse(readFileSync(file, "utf8")) as Memory;
    } catch {
      this.memory = { boot: null, chats: {} };
    }
  }

  remember(chat: string, room: string, title: string, boot: string): void {
    if (this.memory.boot !== boot) this.memory = { boot, chats: {} };
    (this.memory.chats[chat] ??= {})[room] = title;
    this.save();
  }

  forget(chat: string, room: string): void {
    const rooms = this.memory.chats[chat];
    if (!rooms) return;
    delete rooms[room];
    if (Object.keys(rooms).length === 0) delete this.memory.chats[chat];
    this.save();
  }

  /**
   * ЧТО СКАЗАТЬ И КОМУ, судя по тому, где стол сейчас. Сказанное забывается сразу: второй раз про
   * те же столы не говорят. Молчание одного опроса ещё не смерть — это решает реле (`BEACON_TTL_MS`).
   */
  check(now: Where): { chat: string; text: string }[] {
    if (!this.memory.boot || Object.keys(this.memory.chats).length === 0) return [];
    if (now.up && now.boot === this.memory.boot) return [];
    const why = now.up ? "restart" : "down";
    const out = Object.entries(this.memory.chats).map(([chat, rooms]) => ({ chat, text: lost(Object.values(rooms), why) }));
    this.memory = { boot: now.up ? now.boot : null, chats: {} };
    this.save();
    return out;
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.memory));
  }
}
