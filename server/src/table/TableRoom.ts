// КОМНАТА СТОЛА — `Table` в сети: пускает по двери, раздаёт дифы, каждому свои.
//
// Правил в комнате нет: они в `Table`. Здесь только то, чего `Table` знать не должен, — сессии,
// часы и то, что в одном соединении может сидеть лишь один человек.
//
// КОМНАТА НЕ УМИРАЕТ ПУСТОЙ (`autoDispose = false`): стол чата живёт, пока жив сервер, и вернувшийся
// через час находит свои карты там, где оставил. Закрывает её только бот (`lobby.closeEntry`).

import { Room, type Client } from "@colyseus/core";
import { INKS } from "../profileInks.js";
import { tableConfig } from "./config.js";
import { MSG, type Intent, type JoinOptions, type Op, type Person, type Welcome } from "./contract.js";
import { deal } from "./deal.js";
import { whoIs, type Who } from "./identity.js";
import { attach, openEntry, titleOf } from "./lobby.js";
import { roomIsSigned } from "./roomIds.js";
import { Table } from "./table.js";

const INTENTS = new Set<Intent["t"]>(["grab", "hold", "drop", "release", "flip", "sync"]);

export class TableRoom extends Room {
  maxClients = 16;

  private table!: Table;
  private room = "";
  /** Сессия → человек. Один человек может сидеть с двух устройств: ключ у них общий. */
  private seats = new Map<string, Person>();

  onCreate(options: Partial<JoinOptions>): void {
    const { secret } = tableConfig();
    if (!secret || !roomIsSigned(options.room, secret)) throw new Error("unsigned room");
    this.room = options.room;
    this.autoDispose = false;
    this.table = new Table(deal());
    // КОМНАТА, ОТКРЫТАЯ ВХОДОМ, А НЕ БОТОМ: inline-карточка, чьё сообщение бот ещё не записал.
    openEntry(this.room, { kind: "inline", message: "" }, "");
    attach(this.room, { people: () => this.table.here, close: () => void this.disconnect() });

    this.onMessage(MSG.hello, (client) => {
      const me = this.seats.get(client.sessionId);
      if (!me) return;
      const welcome: Welcome = { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room) };
      client.send(MSG.welcome, welcome);
    });

    this.onMessage(MSG.intent, (client, intent: Intent) => {
      const me = this.seats.get(client.sessionId);
      if (!me || !intent || !INTENTS.has(intent.t)) return;
      if (intent.t === "sync") {
        client.send(MSG.welcome, { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room) } satisfies Welcome);
        return;
      }
      const result = this.table.act(me.key, intent, Date.now());
      if ("refused" in result) client.send(MSG.refused, { intent, why: result.refused });
      else this.spread(result.ops);
    });

    this.clock.setInterval(() => this.spread(this.table.sweep(Date.now())), 1000);
  }

  onAuth(client: Client, options: Partial<JoinOptions>): Who {
    const { botToken, guests, secret } = tableConfig();
    if (!secret || !roomIsSigned(options.room, secret)) throw new Error("unsigned room");
    const who = whoIs(options, client.sessionId, { botToken, guests });
    if (!who) throw new Error("who are you");
    return who;
  }

  onJoin(client: Client, _options?: unknown, who?: Who): void {
    if (!who) return;
    const sitting = this.table.here.find((one) => one.key === who.key);
    const person: Person = { ...who, ink: sitting?.ink ?? this.freeInk() };
    this.seats.set(client.sessionId, person);
    this.spread(this.table.join(person));
  }

  onLeave(client: Client): void {
    const me = this.seats.get(client.sessionId);
    this.seats.delete(client.sessionId);
    if (!me) return;
    // С ДРУГОГО УСТРОЙСТВА ОН ЕЩЁ ЗДЕСЬ — тогда не уходит никто.
    if ([...this.seats.values()].some((one) => one.key === me.key)) return;
    this.spread(this.table.leave(me.key));
  }

  private freeInk(): string {
    const taken = new Set(this.table.here.map((one) => one.ink));
    return INKS.find((ink) => !taken.has(ink)) ?? INKS[this.table.here.length % INKS.length]!;
  }

  /** Разослать дифы — каждому, какими их видно ему. */
  private spread(ops: Op[]): void {
    if (ops.length === 0) return;
    const v = this.table.version;
    for (const client of this.clients) {
      const me = this.seats.get(client.sessionId);
      if (me) client.send(MSG.patch, { v, ops: ops.map((op) => this.table.seenOp(op, me.key)) });
    }
  }
}
