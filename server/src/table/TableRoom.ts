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
import { BOT_KEY, botPerson } from "./botPerson.js";
import { MSG, type CarryOut, type Intent, type JoinOptions, type Op, type Person, type RunResult, type TableCommand, type Welcome } from "./contract.js";
import { execute, plan } from "./script.js";
import { deal } from "./deal.js";
import { whoIs, type Who } from "./identity.js";
import { attach, creatorOf, openEntry, titleOf } from "./lobby.js";
import { roomIsSigned } from "./roomIds.js";
import { Table } from "./table.js";

const INTENTS = new Set<Intent["t"]>(["grab", "hold", "drop", "release", "flip", "sit", "flag", "rules", "sync"]);

export class TableRoom extends Room {
  maxClients = 16;

  private table!: Table;
  private room = "";
  /** Сессия → ключ человека. Один человек может сидеть с двух устройств: ключ у них общий. */
  private seats = new Map<string, string>();

  /** Человек, каким его знает стол сейчас, — со стулом, на который он сел. */
  private personOf(session: string): Person | undefined {
    const key = this.seats.get(session);
    return key === undefined ? undefined : this.table.here.find((one) => one.key === key);
  }

  onCreate(options: Partial<JoinOptions>): void {
    const { secret } = tableConfig();
    if (!secret || !roomIsSigned(options.room, secret)) throw new Error("unsigned room");
    this.room = options.room;
    this.autoDispose = false;
    // КОМНАТА, ОТКРЫТАЯ ВХОДОМ, А НЕ БОТОМ: inline-карточка, чьё сообщение бот ещё не записал.
    openEntry(this.room, { kind: "inline", message: "" }, "");
    // АДМИН — ТОТ, КТО ОТКРЫЛ КОМНАТУ В БОТЕ. Спрашивается при открытии: запись к этому моменту есть.
    this.table = new Table(deal(), creatorOf(this.room));
    attach(this.room, { people: () => this.table.here.filter((p) => !p.bot), close: () => void this.disconnect(), run: (by, command) => this.run(by, command) });

    this.onMessage(MSG.hello, (client) => {
      const me = this.personOf(client.sessionId);
      if (!me) return;
      const welcome: Welcome = { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room), carries: this.table.carriesSeenBy(me.key), now: Date.now() };
      client.send(MSG.welcome, welcome);
    });

    this.onMessage(MSG.intent, (client, intent: Intent) => {
      const me = this.personOf(client.sessionId);
      if (!me || !intent || !INTENTS.has(intent.t)) return;
      if (intent.t === "sync") {
        client.send(MSG.welcome, { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room), carries: this.table.carriesSeenBy(me.key), now: Date.now() } satisfies Welcome);
        return;
      }
      const result = this.table.act(me.key, intent, Date.now());
      if ("refused" in result) client.send(MSG.refused, { intent, why: result.refused });
      else this.spread(result.ops);
    });

    // ПАЛЕЦ В ВОЗДУХЕ — остальным, каждому своими глазами; отправителю не возвращается.
    this.onMessage(MSG.carry, (client, out: CarryOut) => {
      const me = this.personOf(client.sessionId);
      if (!me || "refused" in this.table.carry(me.key, out, Date.now())) return;
      for (const other of this.clients) {
        const key = this.seats.get(other.sessionId);
        if (key === undefined || key === me.key) continue;
        const [seen] = this.table.carriesSeenBy(key, out.id);
        if (seen) other.send(MSG.carry, seen);
      }
    });

    this.clock.setInterval(() => this.spread(this.table.sweep(Date.now())), 1000);
  }

  /**
   * КОМАНДА АДМИНА ИЗ БОТА. Проверка и план — сразу, ответ боту — сразу; ходы идут потом, с паузами, и
   * их видят все сидящие. Бот садится за стол, когда впервые понадобился, и дальше сидит без стула.
   */
  async run(by: string, command: TableCommand): Promise<RunResult> {
    if (by !== creatorOf(this.room)) return { error: "not-admin" };
    if (this.table.busy) return { error: "busy" };
    const bot = await botPerson(tableConfig().botToken);
    if (!this.table.here.some((p) => p.key === BOT_KEY)) {
      this.spread(this.table.joinBot({ ...bot, ink: this.freeInk() }));
    }
    const people = this.table.here.map((p) => ({ key: p.key, name: p.name, username: p.username, seat: p.seat }));
    const p = plan(this.table, command, people, by);
    if ("error" in p) return p;
    const actor = p.actor === "bot" ? BOT_KEY : p.actor;
    void execute(this.table, p.steps, actor, {
      spread: (ops) => this.spread(ops),
      carry: (id) => {
        for (const other of this.clients) {
          const key = this.seats.get(other.sessionId);
          if (key === undefined) continue;
          const [seen] = this.table.carriesSeenBy(key, id);
          if (seen) other.send(MSG.carry, seen);
        }
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
    });
    return { ok: true };
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
    this.seats.set(client.sessionId, person.key);
    this.spread(this.table.join(person));
  }

  onLeave(client: Client): void {
    const key = this.seats.get(client.sessionId);
    this.seats.delete(client.sessionId);
    if (key === undefined) return;
    // С ДРУГОГО УСТРОЙСТВА ОН ЕЩЁ ЗДЕСЬ — тогда не уходит никто.
    if ([...this.seats.values()].includes(key)) return;
    this.spread(this.table.leave(key));
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
      const key = this.seats.get(client.sessionId);
      if (key !== undefined) client.send(MSG.patch, { v, ops: ops.map((op) => this.table.seenOp(op, key)) });
    }
  }
}
