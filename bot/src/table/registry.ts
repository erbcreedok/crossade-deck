// ЧЬИ СТОЛЫ — память бота о комнатах, которые он открыл: кто хозяин, где стол живёт и как называется.
//
// Комнаты живут в памяти сервера стола и умирают вместе с его запуском. Карты этого не переживают — так
// задумано. А вот ИМЯ, ДОМ И ПРАВА АДМИНА переживать обязаны: иначе после перезапуска человек заходит по
// своей же ссылке и попадает в чужую безымянную комнату, где он никто. Список лежит на диске бота: сервер,
// который умер, никому уже ничего не скажет.

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Home } from "../../../server/src/table/contract.js";

export interface Known {
  home: Home;
  by: string;
  title: string;
}

export class Registry {
  private rooms: Record<string, Known>;

  constructor(private readonly file: string) {
    try {
      this.rooms = JSON.parse(readFileSync(file, "utf8")) as Record<string, Known>;
    } catch {
      this.rooms = {};
    }
  }

  remember(room: string, known: Known): void {
    this.rooms[room] = known;
    this.save();
  }

  /** Стол переименовали — имя в памяти тоже. */
  rename(room: string, title: string): void {
    const had = this.rooms[room];
    if (!had) return;
    this.rooms[room] = { ...had, title };
    this.save();
  }

  forget(room: string): void {
    delete this.rooms[room];
    this.save();
  }

  all(): [string, Known][] {
    return Object.entries(this.rooms);
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.rooms));
  }
}
