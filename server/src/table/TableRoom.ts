// КОМНАТА СТОЛА — `Table` в сети: пускает по двери, раздаёт дифы, каждому свои.
//
// Правил в комнате нет: они в `Table`. Здесь только то, чего `Table` знать не должен, — сессии,
// часы и то, что в одном соединении может сидеть лишь один человек.
//
// КОМНАТА НЕ УМИРАЕТ ПУСТОЙ (`autoDispose = false`): стол чата живёт, пока жив сервер, и вернувшийся
// через час находит свои карты там, где оставил. Закрывает её только бот (`lobby.closeEntry`).

import { hasSticker, stickersOf } from "../db/stickersRepo.js";
import { Room, type Client } from "@colyseus/core";
import { INKS } from "../profileInks.js";
import { tableConfig } from "./config.js";
import { BOT_KEY, botPerson } from "./botPerson.js";
import { MSG, type CarryOut, type Intent, type JoinOptions, type Op, type Person, type RunResult, type TableCommand, type Welcome } from "./contract.js";
import { cleanWatch, Eyes } from "./eyes.js";
import { cleanMic, cleanVoice, Voices, type Mic, type Voice } from "./voice.js";
import { execute, plan } from "./script.js";
import { SHOT_MS, Shots, cleanSay, cleanShot, type Say, type Shot } from "./say.js";
import { deal } from "./deal.js";
import { whoIs, type Who } from "./identity.js";
import { attach, creatorOf, openEntry, titleOf } from "./lobby.js";
import { readCommand } from "./routes.js";
import { roomIsSigned } from "./roomIds.js";
import { Table } from "./table.js";

const INTENTS = new Set<Intent["t"]>(["grab", "hold", "drop", "release", "turn", "flip", "arrange", "pose", "stand", "sit", "flag", "deckMove", "deckDo", "deckForever", "deckPin", "deckGuard", "gather", "pick", "unpick", "moveMany", "turnMany", "pileDrop", "rules", "sync"]);

export class TableRoom extends Room {
  /** Слоты выстрелов стикерами; окно чуть короче клиентского — на запаздывание сети. */
  private shots = new Shots(SHOT_MS - 150);
  /** Кто на что смотрит: открытые окна стопок и стульев. Живёт, пока человек в комнате. */
  private eyes = new Eyes();
  /** Сколько голосовых человек отправил за последние секунды: больше предела сервер не пересылает. */
  private voices = new Voices();
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
    attach(this.room, {
      people: () => this.table.here.filter((p) => !p.bot),
      close: () => void this.disconnect(),
      run: (by, command) => this.run(by, command),
      claim: (by) => this.spread(this.table.claim(by)),
    });

    this.onMessage(MSG.hello, (client) => {
      const me = this.personOf(client.sessionId);
      if (!me) return;
      const welcome: Welcome = { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room), carries: this.table.carriesSeenBy(me.key), eyes: this.eyes.all(), now: Date.now() };
      client.send(MSG.welcome, welcome);
    });

    this.onMessage(MSG.intent, (client, intent: Intent) => {
      const me = this.personOf(client.sessionId);
      if (!me || !intent || !INTENTS.has(intent.t)) return;
      if (intent.t === "sync") {
        client.send(MSG.welcome, { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room), carries: this.table.carriesSeenBy(me.key), eyes: this.eyes.all(), now: Date.now() } satisfies Welcome);
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

    // СЛОВО У СТУЛА — остальным как есть. Пишет только сидящий: словам негде встать, кроме как у стула.
    this.onMessage(MSG.say, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const out = cleanSay(raw);
      if (!me?.seat || !out) return;
      const say: Say = { ...out, by: me.key };
      for (const other of this.clients) {
        const key = this.seats.get(other.sessionId);
        if (key !== undefined && key !== me.key) other.send(MSG.say, say);
      }
    });

    // СТИКЕР ВЫСТРЕЛОМ — из своего набора и только в свободный слот; лишний не долетает ни до кого.
    this.onMessage(MSG.shot, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const out = cleanShot(raw);
      if (!me?.seat || !out || !hasSticker(me.key, out.id) || !this.shots.fire(me.key, Date.now())) return;
      const shot: Shot = { ...out, by: me.key };
      for (const other of this.clients) {
        const key = this.seats.get(other.sessionId);
        if (key !== undefined && key !== me.key) other.send(MSG.shot, shot);
      }
    });

    // ГЛАЗА — что у него открыто. Меняется редко, поэтому рассылается всем целиком, включая самого: свой глаз
    // отсеивает клиент, зато список у всех один и тот же.
    this.onMessage(MSG.eyes, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const spots = cleanWatch(raw);
      if (!me || !spots) return;
      if (this.eyes.look(me.key, spots, Date.now())) this.spreadEyes();
    });

    // КОМАНДА КНОПКОЙ — то же, что из бота: проверка админа внутри `run`, исполняет крупье или бот.
    this.onMessage(MSG.command, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const command = readCommand(raw);
      if (!me || !command) return;
      void this.run(me.key, command);
    });

    // МИКРОФОН ВКЛЮЧИЛСЯ — остальным: у них на его аватаре пульсирует микрофон. Отмена — тот же `off`.
    this.onMessage(MSG.mic, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const out = cleanMic(raw);
      if (!me?.seat || !out) return;
      const mic: Mic = { ...out, by: me.key };
      for (const other of this.clients) {
        const key = this.seats.get(other.sessionId);
        if (key !== undefined && key !== me.key) other.send(MSG.mic, mic);
      }
    });

    // ЗАПИСЬ — остальным как есть и больше никуда: ни на диск, ни в историю. Автор слышит свою у себя.
    this.onMessage(MSG.voice, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const out = cleanVoice(raw);
      if (!me?.seat || !out || !this.voices.send(me.key, Date.now())) return;
      const voice: Voice = { ...out, by: me.key };
      for (const other of this.clients) {
        const key = this.seats.get(other.sessionId);
        if (key === undefined || key === me.key) continue;
        // ЛИЧНОЕ — только тому, на чей стул бросили; остальные его не слышат и не знают о нём.
        if (out.to !== undefined && key !== out.to) continue;
        other.send(MSG.voice, voice);
      }
    });

    this.onMessage(MSG.stickers, (client) => {
      const me = this.personOf(client.sessionId);
      if (me) client.send(MSG.stickers, stickersOf(me.key));
    });

    this.clock.setInterval(() => this.spread(this.table.sweep(Date.now())), 1000);
  }

  /**
   * КОМАНДА АДМИНА ИЗ БОТА. Проверка и план — сразу, ответ боту — сразу; ходы идут потом, с паузами, и
   * их видят все сидящие. Бот садится за стол, когда впервые понадобился, и дальше сидит без стула.
   */
  async run(by: string, command: TableCommand): Promise<RunResult> {
    if (by !== creatorOf(this.room)) return { error: "not-admin" };
    // ВИД КОЛОДЫ — не ход, а правило: меняется сразу, даже посреди раздачи, и бот за стол не садится.
    if (command.t === "look") {
      const steps = plan(this.table, command, [], by);
      if ("steps" in steps) for (const step of steps.steps) if (step.t === "rules") this.spread(this.table.setRules(step.rules));
      return { ok: true };
    }
    // КРУПЬЕ — не ход, а состав стола: садится и уходит сразу, даже посреди раздачи он не нужен как ход.
    if (command.t === "croupier") {
      const who = await botPerson(tableConfig().botToken);
      this.spread(command.on ? this.table.seatCroupier({ ...who, ink: this.freeInk() }) : this.table.removeCroupier());
      return { ok: true };
    }
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
    if (this.eyes.forget(key)) this.spreadEyes();
    this.voices.forget(key);
    this.spread(this.table.leave(key));
  }

  private freeInk(): string {
    const taken = new Set(this.table.here.map((one) => one.ink));
    return INKS.find((ink) => !taken.has(ink)) ?? INKS[this.table.here.length % INKS.length]!;
  }

  /** Глаза — всем одинаковым списком. */
  private spreadEyes(): void {
    const all = this.eyes.all();
    for (const client of this.clients) if (this.seats.has(client.sessionId)) client.send(MSG.eyes, all);
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
