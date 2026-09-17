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
import { MSG, type CarryOut, type Face, type Intent, type JoinOptions, type Op, type Person, type RunResult, type TableCommand, type Welcome } from "./contract.js";
import { cleanWatch, Eyes } from "./eyes.js";
import { cleanLive, ear, LiveTalk, liveTally, type Live } from "./live.js";
import { cleanSignal, Signals, type Signal } from "./rtc.js";
import { cleanMic, type Mic } from "./voice.js";
import { collectSteps, execute, plan } from "./script.js";
import type { Key } from "./access.js";

/** ЧТО КАКОЙ КОМАНДОЙ ДВИГАЮТ — ключ на каждую (`access.ts`). Команды без ключа здесь нет. */
const RUN_RIGHTS: Record<string, Key> = {
  deal: "table.deal", collect: "table.collect", shuffle: "table.shuffle",
  preset: "table.preset", look: "table.look", croupier: "table.croupier",
};
import { SHOT_MS, Shots, cleanSay, cleanShot, type Say, type Shot } from "./say.js";
import { deal } from "./deal.js";
import { whoIs, type Who } from "./identity.js";
import { deskOf } from "./desks.js";
import { RING } from "./games/krest.js";
import { move, start, type Match } from "./games/match.js";
import { attach, creatorOf, crewKind, kindOf, openEntry, titleOf } from "./lobby.js";
import { actOf, crewOf } from "./crews.js";
import { seatPoint } from "./ring.js";

/**
 * Где крупье выкладывает стопку: перед собой, но НЕ НА МЕСТЕ КОЛОДЫ — колода живёт у него же, и
 * стопка, положенная в ту же точку, смешалась бы с ней на глаз.
 */
const LAYOUT_RADIUS = 4;
import { readCommand } from "./routes.js";
import { roomIsSigned } from "./roomIds.js";
import { Table } from "./table.js";

const INTENTS = new Set<Intent["t"]>(["grab", "hold", "drop", "release", "turn", "flip", "arrange", "pose", "stand", "sit", "flag", "deckMove", "deckDo", "deckForever", "deckPin", "deckGuard", "gather", "pick", "unpick", "moveMany", "turnMany", "pileDrop", "rules", "sync", "crew", "dealer"]);

export class TableRoom extends Room {
  /** Слоты выстрелов стикерами; окно чуть короче клиентского — на запаздывание сети. */
  private shots = new Shots(SHOT_MS - 150);
  /** Кто на что смотрит: открытые окна стопок и стульев. Живёт, пока человек в комнате. */
  private eyes = new Eyes();
  /** Сколько голосовых человек отправил за последние секунды: больше предела сервер не пересылает. */
  private talk = new LiveTalk();
  private signals = new Signals();
  maxClients = 16;

  private table!: Table;
  private room = "";
  /**
   * ПАРТИЯ, ЕСЛИ ОНА ИДЁТ. Ведётся ПО СТУЛЬЯМ, а не по людям: рука принадлежит стулу, человек может
   * уйти и вернуться, а очередь от этого не должна сбиваться.
   */
  private match: Match | null = null;
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
    // РОД СТОЛА берётся у комнаты: его записал тот, кто её открыл. Стол сам про род не знает —
    // он получает правила и работает с ними, как с любыми другими.
    // СУДЬЯ ЖИВЁТ В КОМНАТЕ, а правила спрашивают его через это окошко: чей ход и кто закрыл круг.
    // Партии нет — окно отдаёт `null`, и стол ведёт себя как песочница.
    this.table = new Table(deal(), creatorOf(this.room), deskOf(kindOf(this.room), () => this.judgeView()));
    attach(this.room, {
      people: () => this.table.here.filter((p) => !p.bot),
      close: () => void this.disconnect(),
      run: (by, command) => this.run(by, command),
      claim: (by) => this.spread(this.table.claim(by)),
      // РОД СМЕНИЛИ НА ХОДУ: стол берёт другие правила, а карты и люди остаются на местах. Партия
      // старого рода при этом кончается — судить её стало нечем.
      recrew: () => this.resend(),
      recast: (kind) => {
        this.match = null;
        this.table.recast(deskOf(kind, () => this.judgeView()));
        this.resend();
      },
    });

    // КРУПЬЕ СИДИТ С САМОГО НАЧАЛА: он часть стола, а не гость. Админ уводит его сам, если не нужен.
    void this.seatCroupier();

    this.onMessage(MSG.hello, (client) => {
      const me = this.personOf(client.sessionId);
      if (!me) return;
      const welcome: Welcome = { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room), carries: this.table.carriesSeenBy(me.key), eyes: this.eyes.all(), now: Date.now(), crew: [...crewOf(crewKind(this.room)).acts] };
      client.send(MSG.welcome, welcome);
    });

    this.onMessage(MSG.intent, (client, intent: Intent) => {
      const me = this.personOf(client.sessionId);
      if (!me || !intent || !INTENTS.has(intent.t)) return;
      if (intent.t === "sync") {
        client.send(MSG.welcome, { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room), carries: this.table.carriesSeenBy(me.key), eyes: this.eyes.all(), now: Date.now(), crew: [...crewOf(crewKind(this.room)).acts] } satisfies Welcome);
        return;
      }
      // ДЕЛО КРУПЬЕ — не ход по столу, а состав стола: его исполняет комната.
      if (intent.t === "crew") return void this.crewAct(me.key, intent.act);
      const result = this.table.act(me.key, intent, Date.now());
      if ("refused" in result) client.send(MSG.refused, { intent, why: result.refused });
      else {
        this.spread(result.ops);
        this.followMatch(me.key, intent);
      }
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

    // ЖИВОЙ ГОЛОС — кусок речи остальным, пока он говорит: на сукно всем, на стул — лично тому, кто на нём.
    this.onMessage(MSG.live, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const out = cleanLive(raw);
      liveTally.got += 1;
      liveTally.last = Date.now();
      if (!out) liveTally.bad += 1;
      if (!me?.seat || !out || !this.talk.take(me.key, Date.now())) return;
      const live: Live = { ...out, by: me.key };
      // ОДНО УХО НА ЧЕЛОВЕКА: в остальные его окна речь не идёт, иначе он слышит её столько раз, сколько их.
      const ears = new Map<string, string[]>();
      for (const other of this.clients) {
        const key = this.seats.get(other.sessionId);
        if (key === undefined || key === me.key) continue;
        if (out.to !== undefined && key !== out.to) continue;
        ears.set(key, [...(ears.get(key) ?? []), other.sessionId]);
      }
      const heard = new Set([...ears.values()].map((list) => ear(list)));
      for (const other of this.clients) {
        if (!heard.has(other.sessionId)) continue;
        liveTally.sent += 1;
        other.send(MSG.live, live);
      }
    });

    // ЗНАКОМСТВО ГОЛОСОВ — записку донести и забыть. Дальше речь идёт мимо стола, напрямую между устройствами.
    this.onMessage(MSG.rtc, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const out = cleanSignal(raw);
      if (!me?.seat || !out || !this.signals.take(me.key, Date.now())) return;
      const note: Signal = { ...out, from: me.key };
      // В ТО ЖЕ ОДНО ОКНО, что слушает речь: знакомиться со вторым, висящим в фоне, не с кем.
      const windows = this.clients.filter((one) => this.seats.get(one.sessionId) === out.to);
      const at = ear(windows.map((one) => one.sessionId));
      for (const one of windows) if (one.sessionId === at) one.send(MSG.rtc, note);
    });

    this.onMessage(MSG.stickers, (client) => {
      const me = this.personOf(client.sessionId);
      if (me) client.send(MSG.stickers, stickersOf(me.key));
    });

    this.clock.setInterval(() => this.spread(this.table.sweep(Date.now())), 1000);
  }

  /**
   * СУДЬЯ ИДЁТ ЗА РУКОЙ ЧЕЛОВЕКА, а не наоборот.
   *
   * Стол уже пропустил ход — права спросили у правил, а права спросили у судьи. Значит остаётся
   * ДОГНАТЬ судью тем же ходом: положил в кольцо — `lay`, забрал из кольца в руку — `take`.
   * Если судья вдруг откажет, мы его не слушаем: стол уже сходил, и расходиться им нельзя.
   */
  private followMatch(by: string, intent: Intent): void {
    if (this.match === null || intent.t !== "drop") return;
    const chair = this.table.layout().chairs.find((c) => c.owner === by);
    if (!chair || chair.id !== this.match.turn) return;
    const to = intent.to as { in?: string; pile?: string; chair?: string };
    const face = this.table.faceOf(intent.id);
    const laid = to.in === "deck" && to.pile === RING && face !== undefined;
    const took = to.in === "hand" && to.chair === chair.id;
    if (!laid && !took) return;
    const next = move(this.match, chair.id, laid ? { t: "lay", card: face! } : { t: "take" });
    if (!("refused" in next)) this.match = next;
  }

  /** Что правила видят о партии: очередь и закрывший — В КЛЮЧАХ ЛЮДЕЙ, потому что правам нужны люди. */
  private judgeView(): { turn: string | null; closer: string | null } | null {
    if (this.match === null) return null;
    const owner = (chair: string | null) => (chair === null ? null : (this.table.layout().chairs.find((c) => c.id === chair)?.owner ?? null));
    return { turn: owner(this.match.turn), closer: owner(this.match.closer) };
  }

  /**
   * РАЗДАЛИ ВСЕ КАРТЫ — ПАРТИЯ НАЧАЛАСЬ. Отдельной кнопки «начать» нет и не нужно: раздача этой игры
   * и есть начало, а судья собирается из того, что легло в руки.
   */
  private openMatch(dealer: string | null): void {
    const at = this.table.layout();
    const hands: Record<string, readonly Face[]> = {};
    for (const chair of at.chairs) {
      if (chair.croupier || chair.hand.length === 0) continue;
      hands[chair.id] = chair.hand.map((id) => this.table.faceOf(id)).filter((f): f is Face => f !== undefined);
    }
    this.match = Object.keys(hands).length > 1 ? start(hands, dealer) : null;
  }

  /**
   * КОМАНДА АДМИНА ИЗ БОТА. Проверка и план — сразу, ответ боту — сразу; ходы идут потом, с паузами, и
   * их видят все сидящие. Бот садится за стол, когда впервые понадобился, и дальше сидит без стула.
   */
  async run(by: string, command: TableCommand): Promise<RunResult> {
    // ПРАВО, А НЕ ЛИЧНОСТЬ: команду ведёт тот, кому выдан этот доступ (`access.ts`).
    const right = RUN_RIGHTS[command.t];
    if (right && !this.table.may(by, right)) return { error: "not-admin" };
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
    }).then(() => {
      // Раздача кончилась — собираем судью из того, что легло в руки. Раздающий у этой игры ходит
      // последним, но первым ходит тот, у кого шестёрка козыря, — это решает сам судья.
      if (command.t === "deal") this.openMatch(this.table.layout().chairs.find((c) => c.owner === by)?.id ?? null);
    });
    return { ok: true };
  }

  /**
   * ДЕЛО КРУПЬЕ. Что он умеет — берётся из набора комнаты (`crews.ts`), а не из игры: крестовый с
   * крупье от дурака — законная комбинация. Кому можно: `adminOnly` — распорядителю, прочее — всем,
   * кого пускает замок его стула.
   *
   * Сами дела идут теми же шагами, что и команды бота: карта за картой, с паузой, чтобы за столом
   * было видно, что происходит, а не «всё вдруг стало иначе».
   */
  private crewAct(by: string, act: string): void {
    const item = actOf(crewKind(this.room), act);
    const chair = this.table.layout().chairs.find((c) => c.croupier);
    if (!item || !chair) return;
    // Дело набора — обычный ключ: `crew.collect`, `crew.layout`. Помеченные `adminOnly` живут в
    // наборе распорядителя, прочие открыты всем, кого пускает замок стула крупье.
    if (item.adminOnly && !this.table.may(by, "table.croupier")) return;
    if (this.table.busy) return;
    // ВЫКЛАДКА — ОДНО ДВИЖЕНИЕ: стопка кладётся целиком, её не носят по карте.
    if (act === "layout") return void this.layout(by, chair.id, chair.angle);
    const steps = act === "collect" ? collectSteps(this.table) : [];
    if (steps.length === 0) return;
    void execute(this.table, steps, by, {
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
  }

  /** ВСЯ РУКА КРУПЬЕ — ОДНОЙ ЗАКРЫТОЙ СТОПКОЙ ПЕРЕД НИМ. */
  private layout(by: string, seat: string, angle: number): void {
    const chair = this.table.layout().chairs.find((c) => c.id === seat);
    if (!chair || chair.hand.length === 0) return;
    const at = seatPoint(angle, LAYOUT_RADIUS);
    const out = this.table.act(by, { t: "gather", ids: [...chair.hand], side: "down", to: { x: at.x, y: at.y, angle: 0 } }, Date.now());
    if (!("refused" in out)) this.spread(out.ops);
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
    // ОТКРЫЛ СТОЛ В НОВОМ ОКНЕ — старым голос больше не принадлежит: иначе они дерутся за одну связь, и
    // речь достаётся тому, кого человек уже не видит.
    for (const one of this.clients) {
      if (one.sessionId !== client.sessionId && this.seats.get(one.sessionId) === person.key) {
        one.send(MSG.rtc, { from: person.key, to: person.key, kind: "bye", body: "" });
      }
    }
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
    this.talk.forget(key);
    this.signals.forget(key);
    this.spread(this.table.leave(key));
  }

  private freeInk(): string {
    const taken = new Set(this.table.here.map((one) => one.ink));
    return INKS.find((ink) => !taken.has(ink)) ?? INKS[this.table.here.length % INKS.length]!;
  }

  /** Посадить крупье: имя и аватар он берёт у бота, поэтому ждёт Telegram и садится чуть позже старта. */
  private async seatCroupier(): Promise<void> {
    const who = await botPerson(tableConfig().botToken);
    this.spread(this.table.seatCroupier({ ...who, ink: this.freeInk() }));
  }

  /** Глаза — всем одинаковым списком. */
  private spreadEyes(): void {
    const all = this.eyes.all();
    for (const client of this.clients) if (this.seats.has(client.sessionId)) client.send(MSG.eyes, all);
  }

  /**
   * ЗАНОВО ВЕСЬ СТОЛ — каждому сидящему. Дифами такое не рассылается: у стола появились и пропали
   * места, и клиент должен увидеть новый стол целиком, а не собирать его из кусков.
   */
  private resend(): void {
    for (const client of this.clients) {
      const me = this.personOf(client.sessionId);
      if (!me) continue;
      client.send(MSG.welcome, { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room), carries: this.table.carriesSeenBy(me.key), eyes: this.eyes.all(), now: Date.now(), crew: [...crewOf(crewKind(this.room)).acts] } satisfies Welcome);
    }
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
