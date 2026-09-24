// КОМНАТА СТОЛА — `Table` в сети: пускает по двери, раздаёт дифы, каждому свои.
//
// Правил в комнате нет: они в `Table`. Здесь только то, чего `Table` знать не должен, — сессии,
// часы и то, что в одном соединении может сидеть лишь один человек.
//
// КОМНАТА НЕ УМИРАЕТ ПУСТОЙ (`autoDispose = false`): стол чата живёт, пока жив сервер, и вернувшийся
// через час находит свои карты там, где оставил. Закрывает её только бот (`lobby.closeEntry`).

import {
 hasSticker, stickersOf } from "../db/stickersRepo.js";
import { Room, type Client } from "@colyseus/core";
import { INKS } from "../profileInks.js";
import { iceServers, tableConfig } from "./config.js";
import { BOT_KEY, botPerson } from "./botPerson.js";
import { DEAL_PRESETS, MSG, PROTOCOL, STALE_CLIENT, type CarryOut, type DealRule, type Face, type Intent, type JoinOptions, type Op, type Person, type RunError, type RunResult, type SeatCard, type TableCommand, type Welcome } from "./contract.js";
import { cleanWatch, Eyes } from "./eyes.js";
import { cleanSignal, ear, Signals, type Signal } from "./rtc.js";
import { cleanMic, type Mic } from "./voice.js";
import { clockwise, collectSteps, deckOf, execute, plan, tuneSteps, type DealMemo } from "./script.js";
import type { Key } from "./access.js";

/** ЧТО КАКОЙ КОМАНДОЙ ДВИГАЮТ — ключ на каждую (`access.ts`). Команды без ключа здесь нет. */
const RUN_RIGHTS: Record<string, Key> = {
  deal: "table.deal", redeal: "table.deal", collect: "table.collect", shuffle: "table.shuffle",
  preset: "table.preset", look: "table.look", croupier: "table.croupier", bots: "table.seats",
};
import { LINE_MAX, SHOT_MS, Shots, cleanSay, cleanShot, type Say, type Shot } from "./say.js";
import { deal } from "./deal.js";
import { whoIs, type Who } from "./identity.js";
import { deskOf, refereeOf } from "./desks.js";
import type { Referee, Seats } from "./referee.js";
import { adminsOf, attach, creatorOf, crewKind, keepStateOf, keptStateOf, kindOf, openEntry, titleOf } from "./lobby.js";
import { actOf, crewOf } from "./crews.js";
import { readIntent } from "./intent.js";
import { Flood } from "./flood.js";
import { PULSE_EVERY_MS, type Pulse } from "./freshness.js";
import type { BotAct, Minds, Play, Where } from "./contract.js";
import { seatPoint } from "./ring.js";

/**
 * Где крупье выкладывает стопку: перед собой, но НЕ НА МЕСТЕ КОЛОДЫ — колода живёт у него же, и
 * стопка, положенная в ту же точку, смешалась бы с ней на глаз.
 */
const LAYOUT_RADIUS = 4;
import { readCommand } from "./routes.js";
import { roomIsSigned } from "./roomIds.js";
import { Chronicle } from "./chronicle.js";
import { cleanWitnessed, Witnesses } from "./witness.js";
import { Table, type TableDump } from "./table.js";
import type { Brain, BotView, Move, Profile } from "./bots/brain.js";
import { fromList } from "./bots/brain.js";
import { best } from "./bots/greedy.js";
import { brainOf, OUTSIDE_BRAIN } from "./bots/brains.js";
import { PROFILE_KEYS, profileOf } from "./bots/profiles.js";
import { nextLook, ready, stirs } from "./bots/nudge.js";
import { chosen, looked, type Looked, type Played } from "./bots/outside.js";
import { moveSays } from "./bots/say.js";
import { botSeen, type BotsSeen, type BotTrack } from "./bots/watch.js";
import { mayReturnRing } from "./crewRing.js";

/** Имена игроков без человека — чтобы за столом сидели не «Бот 1», а кто-то. */
/** Столько стол должен молчать, чтобы его слепок записался. */
const KEEP_AFTER_MS = 1500;
const BOT_NAMES = ["Айдос", "Батыр", "Ержан", "Санжар", "Данияр", "Тимур", "Алия", "Мадина"] as const;
/** Больше этого за стол не сажают: мест всё-таки шестнадцать, и половину стоит оставить людям. */
const BOTS_MOST = 8;
/** Сколько бот думает над ходом, прежде чем за него сходит запасной. */
const BOT_THINK_MS = 4000;
/** Пауза перед тем, как крупье уберёт круг: реплику просящего надо успеть прочесть. */
const CROUPIER_HAND_MS = 1400;


export class TableRoom extends Room {
  /** Слоты выстрелов стикерами; окно чуть короче клиентского — на запаздывание сети. */
  private shots = new Shots(SHOT_MS - 150);
  /** Кто на что смотрит: открытые окна стопок и стульев. Живёт, пока человек в комнате. */
  private eyes = new Eyes();
  private signals = new Signals();
  /** Сколько рассказов о себе прислал каждый экран: больше предела журнал не берёт. */
  private witnesses = new Witnesses();
  /** Мера на всё, что человек шлёт комнате: намерения, палец, речь, взгляды, команды (`flood.ts`). */
  private flood = new Flood();
  maxClients = 16;

  private table!: Table;
  /** Летопись комнаты. Создаётся вместе с комнатой и переживает её ровно до последнего сброса. */
  private book!: Chronicle;
  /** Записан ли первый кадр. Пишется один раз за жизнь комнаты. */
  private filmed = false;
  private room = "";
  /**
   * СУДЬЯ ПАРТИИ, если у рода стола партия есть (`desks.ts`). Какая это игра, комната не знает: она
   * зовёт судью, когда раздали, когда сходили и когда спрашивают, что сейчас в игре.
   */
  private referee: Referee | null = null;
  /**
   * БОТЫ ЗА СТОЛОМ. Мозг у каждого свой экземпляр: упадёт один — остальные играют. Характер
   * закреплён за ключом бота, поэтому переживает перезапуск, не будучи записанным в слепок.
   */
  private brains = new Map<string, Brain>();
  /**
   * ЧТО ЗАКАЗАЛИ ЭТОМУ БОТУ — мозг и характер из команды `bots`. Хранится по ключу бота, а не по
   * стулу: бота пересаживают, и характер должен ехать с ним.
   */
  private botOrders = new Map<string, { brain?: string; profile?: string }>();
  /** Кто уже думает: пока ответа нет, второй толчок этому боту ничего не делает. */
  private thinking = new Set<string>();
  /**
   * ЧТО С КАЖДЫМ БОТОМ — для наблюдения снаружи (`bots/watch.ts`). Журнал отвечает задним числом, а
   * «почему он не ходит» спрашивают, пока он молчит.
   */
  private tracks = new Map<string, BotTrack>();
  /** Когда стол шевелился в последний раз — от этого отсчитывается тишина. */
  private stirredAt = 0;
  /** Живой таймер следующего заглядывания. */
  private botTimer: { clear(): void } | null = null;
  /**
   * КОМНАТЫ БОЛЬШЕ НЕТ. Взводится при закрытии и обрывает всё, что боты успели начать: думающий
   * мозг бросает работу, додуманный ход не кладётся на стол, которого уже нет.
   */
  private gone = new AbortController();
  /**
   * ЧЕМ ОБОРВАТЬ МЫСЛЬ ОДНОГО БОТА — свой сигнал на каждого думающего. Общего на комнату мало:
   * админ обрывает зависшего, а не всех сразу, и соседи должны додумать своё.
   */
  private minds = new Map<string, AbortController>();
  /**
   * ЧТО КРУПЬЕ УНЁС С КРУГА ПРОШЛЫЙ РАЗ — чтобы вернуть ровно это, если нажали не туда.
   *
   * Помнится одно последнее сгребание: отмена — это «ой, не то», а не история ходов. Журнал помнит
   * всё, и разбирать по нему.
   */
  private swept: { zone: string; ids: string[] } | null = null;
  /** Сессия → ключ человека. Один человек может сидеть с двух устройств: ключ у них общий. */
  private seats = new Map<string, string>();

  /** Человек, каким его знает стол сейчас, — со стулом, на который он сел. */
  /**
   * СТОЛ ИЗ СЛЕПКА, если комната уже жила до этого процесса. Слепок не поднялся (другой формат, битый
   * JSON) — стол начинается заново: потерянная раскладка лучше комнаты, в которую нельзя войти.
   */
  private raised(): Table | null {
    const json = keptStateOf(this.room);
    if (json === null) return null;
    try {
      const kept = JSON.parse(json) as { table: TableDump; match?: unknown };
      const table = Table.restore(kept.table, creatorOf(this.room), deskOf(kindOf(this.room), () => this.judgeView()));
      this.referee?.load(kept.match ?? null);
      this.book.tell("room.raised", undefined, { v: table.version });
      return table;
    } catch (err) {
      this.book.tell("room.raise-failed", undefined, { почему: String(err).slice(0, 200) });
      return null;
    }
  }

  private keeping: ReturnType<typeof setTimeout> | undefined;
  /** Слепок пишется, когда стол ЗАТИХ, а не на каждый ход: перетаскивание — десятки патчей в секунду. */
  private keepSoon(): void {
    if (this.keeping !== undefined) return;
    this.keeping = setTimeout(() => this.keepNow(), KEEP_AFTER_MS);
    this.keeping.unref?.();
  }

  private keepNow(): void {
    if (this.keeping !== undefined) clearTimeout(this.keeping);
    this.keeping = undefined;
    // Посреди команды бота стол не пишется: половина раздачи — не состояние, в которое стоит вернуться.
    if (this.table.busy) return void this.keepSoon();
    keepStateOf(this.room, JSON.stringify({ table: this.table.dump(), match: this.referee?.dump() ?? null }));
  }

  /** Как бы комната ни кончилась — опустела, закрыта ботом, сервер останавливают, — журнал дописан. */
  onDispose(): void {
    // СПЕРВА ОБОРВАТЬ БОТОВ. Думающий мозг — живой чужой процесс; без этого он доводит ответ до
    // конца и умирает только по своему сроку, до минуты спустя, впустую тратя деньги у платного.
    this.gone.abort();
    this.botTimer?.clear();
    this.botTimer = null;
    if (!this.table.busy) this.keepNow();
    this.book.flush();
  }

  /** Стол целиком глазами этого человека — при входе и когда у него разошлись версии (`sync`). */
  private welcomeFor(me: Person): Welcome {
    return { you: me, snapshot: this.table.seenBy(me.key), title: titleOf(this.room), carries: this.table.carriesSeenBy(me.key), eyes: this.eyes.all(), now: Date.now(), crew: [...crewOf(crewKind(this.room)).acts], deals: [...(deskOf(kindOf(this.room)).deals ?? (Object.keys(DEAL_PRESETS) as DealRule[]))], desk: kindOf(this.room), ice: iceServers() };
  }

  private personOf(session: string): Person | undefined {
    const key = this.seats.get(session);
    return key === undefined ? undefined : this.table.here.find((one) => one.key === key);
  }

  onCreate(options: Partial<JoinOptions>): void {
    const { secret } = tableConfig();
    if (!secret || !roomIsSigned(options.room, secret)) throw new Error("unsigned room");
    this.room = options.room;
    this.book = new Chronicle(this.room);
    this.book.tell("room.open", undefined, { kind: kindOf(this.room), title: titleOf(this.room), by: creatorOf(this.room) });
    this.autoDispose = false;
    // КОМНАТА, ОТКРЫТАЯ ВХОДОМ, А НЕ БОТОМ: inline-карточка, чьё сообщение бот ещё не записал.
    openEntry(this.room, { kind: "inline", message: "" }, "");
    // АДМИН — ТОТ, КТО ОТКРЫЛ КОМНАТУ В БОТЕ. Спрашивается при открытии: запись к этому моменту есть.
    // РОД СТОЛА берётся у комнаты: его записал тот, кто её открыл. Стол сам про род не знает —
    // он получает правила и работает с ними, как с любыми другими.
    // СУДЬЯ ЖИВЁТ В КОМНАТЕ, а правила спрашивают его через это окошко: чей ход и кто закрыл круг.
    // Партии нет — окно отдаёт `null`, и стол ведёт себя как песочница.
    this.referee = refereeOf(kindOf(this.room));
    this.table = this.raised() ?? new Table(deal(), creatorOf(this.room), deskOf(kindOf(this.room), () => this.judgeView()));
    // СОСТОЯНИЕ ПАРТИИ В СНИМКЕ: стол её не судит, он только возит то, что скажет комната.
    this.table.play = (viewer) => this.playFor(viewer);
    this.table.setAdmins(adminsOf(this.room));
    attach(this.room, {
      people: () => this.table.here.filter((p) => !p.bot),
      seats: () => this.seatCards(),
      deck: () => this.deckCard(),
      close: () => {
        this.book.tell("room.close", undefined);
        this.book.flush();
        void this.disconnect();
      },
      run: (by, command) => this.run(by, command),
      // ВНЕШНИЙ ИГРОК (MCP): смотрит и ходит теми же дверями, что человек.
      look: (by) => this.lookFor(by),
      bots: () => this.botsSeen(),
      play: (by, n) => this.playFor_(by, n),
      claim: (by) => this.spread(this.table.claim(by)),
      // РОД СМЕНИЛИ НА ХОДУ: стол берёт другие правила, а карты и люди остаются на местах. Партия
      // старого рода при этом кончается — судить её стало нечем.
      recrew: () => this.resend(),
      // РАСПОРЯДИТЕЛЯ ВЫДАЛИ ИЛИ ЗАБРАЛИ — права меняются у всех сразу, стол шлёт их заново.
      admins: (keys) => {
        this.table.setAdmins(keys);
        this.resend();
      },
      recast: (kind) => {
        this.referee = refereeOf(kind);
        this.table.recast(deskOf(kind, () => this.judgeView()));
        this.resend();
      },
    });

    // КРУПЬЕ СИДИТ С САМОГО НАЧАЛА: он часть стола, а не гость. Админ уводит его сам, если не нужен.
    void this.seatCroupier();

    this.onMessage(MSG.hello, (client) => {
      const me = this.personOf(client.sessionId);
      if (!me) return;
      client.send(MSG.welcome, this.welcomeFor(me));
    });

    this.onMessage(MSG.intent, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const intent = readIntent(raw);
      if (!me || !intent || !this.flood.take(me.key, "intent", Date.now())) return;
      // ЧЕЛОВЕК ТРОНУЛ ВЕЩИ — тишина сначала. Именно вещи: замок на чужой руке, поза, выделение и
      // взгляд стол не двигают, и боту пережидать их незачем (`stirs`).
      if (stirs(intent)) this.stirredAt = Date.now();
      if (intent.t === "sync") {
        client.send(MSG.welcome, this.welcomeFor(me));
        return;
      }
      // ДЕЛО КРУПЬЕ — не ход по столу, а состав стола: его исполняет комната.
      if (intent.t === "crew") return void this.crewAct(me.key, intent.act);
      // УПРАВЛЕНИЕ ИГРОКОМ БЕЗ ЧЕЛОВЕКА — тоже дело комнаты: стол о мозгах не знает.
      if (intent.t === "bot") return void this.botAct(me.key, intent.chair, intent.act);
      const result = this.table.act(me.key, intent, Date.now());
      if ("refused" in result) {
        // ОТКАЗ — САМОЕ ЦЕННОЕ В ЖУРНАЛЕ: человек пробовал, а стол не дал. Жалобы приходят именно
        // отсюда, и без записи причину потом не назвать.
        this.book.tell("refused", me.key, { intent, why: result.refused });
        client.send(MSG.refused, { intent, why: result.refused });
        if (result.ops?.length) this.spread(result.ops);
      } else {
        this.book.tell("act", me.key, { intent });
        this.spread(result.ops);
        if (this.referee?.follow(this.seats_(), me.key, intent)) this.resend();
        // Человек сходил — теперь очередь может быть уже за ботом. Ждать он начнёт с этого мига.
        this.nudgeBots();
      }
    });

    // ПАЛЕЦ В ВОЗДУХЕ — остальным, каждому своими глазами; отправителю не возвращается.
    this.onMessage(MSG.carry, (client, out: CarryOut) => {
      const me = this.personOf(client.sessionId);
      if (!me || !this.flood.take(me.key, "carry", Date.now()) || "refused" in this.table.carry(me.key, out, Date.now())) return;
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
      if (!me?.seat || !out || !this.flood.take(me.key, "say", Date.now())) return;
      this.saySpread({ ...out, by: me.key });
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
      if (!me || !spots || !this.flood.take(me.key, "eyes", Date.now())) return;
      if (this.eyes.look(me.key, spots, Date.now())) this.spreadEyes();
    });

    // КОМАНДА КНОПКОЙ — то же, что из бота: проверка админа внутри `run`, исполняет крупье или бот.
    this.onMessage(MSG.command, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const command = readCommand(raw);
      if (!me || !command || !this.flood.take(me.key, "command", Date.now())) return;
      void this.run(me.key, command);
    });

    // МИКРОФОН ВКЛЮЧИЛСЯ — остальным: у них на его аватаре пульсирует микрофон. Отмена — тот же `off`.
    this.onMessage(MSG.mic, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const out = cleanMic(raw);
      if (!me?.seat || !out || !this.flood.take(me.key, "mic", Date.now())) return;
      const mic: Mic = { ...out, by: me.key };
      this.book.tell("mic", me.key, { on: out.on, ...(out.to === undefined ? {} : { to: out.to }) });
      for (const other of this.clients) {
        const key = this.seats.get(other.sessionId);
        if (key !== undefined && key !== me.key) other.send(MSG.mic, mic);
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

    // ЧТО ВИДЕЛ ЭКРАН — прямо в журнал, рядом с правдой стола. Ответа нет: рассказ ни на что не
    // влияет, и единственное, что с ним может случиться, — он не поместится в предел и пропадёт.
    this.onMessage(MSG.log, (client, raw: unknown) => {
      const me = this.personOf(client.sessionId);
      const told = cleanWitnessed(raw);
      if (!told || !this.witnesses.take(me?.key ?? client.sessionId, Date.now())) return;
      this.book.heard(told.seen, me?.key);
    });

    this.onMessage(MSG.stickers, (client) => {
      const me = this.personOf(client.sessionId);
      if (me) client.send(MSG.stickers, stickersOf(me.key));
    });

    this.clock.setInterval(() => this.spread(this.table.sweep(Date.now())), 1000);
    this.clock.setInterval(() => this.broadcast(MSG.pulse, { v: this.table.version } satisfies Pulse), PULSE_EVERY_MS);
  }

  /** Стол глазами судьи: стулья с руками и лицо карты. */
  private seats_(): Seats {
    const at = this.table.layout();
    return { chairs: at.chairs, faceOf: (card) => this.table.faceOf(card), pile: (id) => at.piles.find((p) => p.id === id)?.cards ?? [] };
  }

  /**
   * ЧТО СЕЙЧАС В ИГРЕ — ГЛАЗАМИ ЭТОГО ЧЕЛОВЕКА. Из этого экран рисует подсветку: какие карты лягут,
   * можно ли взять, чей ход. Не кнопки и не правила — состояние; правила у обоих концов одни.
   */
  private playFor(viewer: string): Play | null {
    return this.referee?.play(this.seats_(), viewer) ?? null;
  }

  /** Что правила видят о партии: очередь и закрывший — В КЛЮЧАХ ЛЮДЕЙ, потому что правам нужны люди. */
  private judgeView(): { turn: string | null; closer: string | null } | null {
    return this.referee?.view(this.seats_()) ?? null;
  }

  /**
   * РАЗДАЛИ — ПАРТИЯ НАЧАЛАСЬ, если у игры она есть. Отдельной кнопки «начать» нет: раздача и есть
   * начало. Снимок уходит каждому целиком, а не дифом: версия стола от хода судьи не меняется, и диф
   * чужой версии клиент справедливо не примет.
   */
  private openMatch(dealer: string | null): void {
    if (!this.referee) return;
    this.referee.start(this.seats_(), dealer);
    this.resend();
    // Первый ход может оказаться за ботом: шестёрка буби легла ему. Отсчёт его паузы — отсюда.
    this.stir();
  }

  /**
   * КОМАНДА АДМИНА ИЗ БОТА. Проверка и план — сразу, ответ боту — сразу; ходы идут потом, с паузами, и
   * их видят все сидящие. Бот садится за стол, когда впервые понадобился, и дальше сидит без стула.
   */
  async run(by: string, order: TableCommand): Promise<RunResult> {
    // ПРАВО, А НЕ ЛИЧНОСТЬ: команду ведёт тот, кому выдан этот доступ (`access.ts`).
    // Забрать карты со стула — та же сборка, и право у неё то же: раздающему она тоже нужна.
    const right = order.t === "seat" ? (order.do === "sweep" ? "table.collect" : "table.seats") : RUN_RIGHTS[order.t];
    if (right && !this.table.may(by, right)) return { error: "not-admin" };
    // СОСТАВ СТОЛА — не ход по сукну: стулья ставятся и пустеют сразу, даже посреди раздачи.
    if (order.t === "seat") return this.seatDo(order);
    // ПЕРЕРАЗДАЧА — обычная раздача с памятью: те же стулья, те же правила, начало — от нажавшего.
    const again = order.t === "redeal" ? this.again(by) : null;
    if (again && "error" in again) return again;
    const command: TableCommand = again ? again.command : order;
    // ВИД КОЛОДЫ — не ход, а правило: меняется сразу, даже посреди раздачи, и бот за стол не садится.
    if (command.t === "look") {
      const steps = plan(this.table, command, [], by);
      if ("steps" in steps) for (const step of steps.steps) if (step.t === "rules") this.spread(this.table.setRules(step.rules));
      return { ok: true };
    }
    // ИГРОКИ БЕЗ ЧЕЛОВЕКА — тоже состав стола, а не ход. Садятся и уходят сразу.
    if (command.t === "bots") {
      if (command.n <= 0) {
        this.spread(this.table.dropBots());
        return { ok: true };
      }
      const было = this.table.here.filter((one) => one.bot === true && one.seat !== undefined).length;
      for (let i = было; i < Math.min(было + command.n, BOTS_MOST); i += 1) {
        const key = `bot:игрок${i + 1}`;
        // Мозг и характер запоминаются ДО посадки: бот садится уже собой, а не переучивается после.
        if (command.brain !== undefined || command.profile !== undefined) {
          this.botOrders.set(key, {
            ...(command.brain === undefined ? {} : { brain: command.brain }),
            ...(command.profile === undefined ? {} : { profile: command.profile }),
          });
          this.brains.delete(key);
        }
        const brain = this.botOrders.get(key)?.brain ?? "greedy";
        this.spread(this.table.seatBot({ key, name: BOT_NAMES[i % BOT_NAMES.length]!, ink: this.freeInk(), door: "guest", brain }));
      }
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
    if (p.deal) this.lastDeal = p.deal;
    const actor = p.actor === "bot" ? BOT_KEY : p.actor;
    void execute(this.table, p.steps, actor, this.io()).then(() => {
      // Раздача кончилась — собираем судью из того, что легло в руки. Раздающий у этой игры ходит
      // последним, но первым ходит тот, у кого шестёрка козыря, — это решает сам судья.
      if (command.t === "deal") this.openMatch(this.table.layout().chairs.find((c) => c.owner === by)?.id ?? null);
    });
    return { ok: true };
  }

  /**
   * ЧЕМ ИГРАЮТ — ПО КАРТАМ, А НЕ ПО ПАМЯТИ О ВЫБОРЕ. Размер считается по тому, сколько карт на столе
   * всего, джокеры — по тому, есть ли они среди них: отметка в меню тогда не может соврать.
   */
  private deckCard(): { size: 36 | 52; jokers: boolean } {
    const at = this.table.layout();
    const ids = [...at.deck, ...at.felt.map((f) => f.id), ...at.piles.flatMap((p) => p.cards), ...at.chairs.flatMap((c) => c.hand)];
    const jokers = ids.some((id) => this.table.faceOf(id)?.rank === "JK");
    return { size: ids.length - (jokers ? 2 : 0) > 36 ? 52 : 36, jokers };
  }

  /** Руки, которыми играются шаги: дифы — всем, палец над картой — каждому своими глазами. */
  private io(): Parameters<typeof execute>[3] {
    return {
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
      // Что у команды не вышло — в журнал: молчаливая раздача на одного из трёх уже случалась.
      failed: (step, why, what) => this.book.tell("crew.failed", undefined, { шаг: step, почему: why, ...(what === undefined ? {} : { что: what }) }),
    };
  }

  /**
   * РАССАДКА РУКОЙ. Выгнанный уходит ровно так же, как ушёл бы сам: стул с картами остаётся его
   * ждать, пустой — уходит по общему правилу стола. Карты не пропадают ни в одном из случаев.
   */
  private seatDo(order: Extract<TableCommand, { t: "seat" }>): RunResult {
    if (order.do === "add") {
      this.spread(this.table.addChair());
      return { ok: true };
    }
    if (order.do === "place") {
      const known = new Set(this.table.layout().chairs.filter((c) => !c.croupier).map((c) => c.id));
      for (const one of order.chairs) if (known.has(one.chair)) this.spread(this.table.turnChair(one.chair, one.angle));
      return { ok: true };
    }
    const chair = this.table.layout().chairs.find((c) => c.id === order.chair && !c.croupier);
    if (!chair) return { error: "no-dealer" };
    if (order.do === "swap") {
      const other = this.table.layout().chairs.find((c) => c.id === order.with && !c.croupier);
      if (!other) return { error: "no-dealer" };
      this.spread(this.table.swapChairs(chair.id, other.id));
      return { ok: true };
    }
    if (order.do === "kick") {
      if (chair.owner === null) return { ok: true };
      const key = chair.owner;
      // Сперва из комнаты Colyseus, потом со стола: иначе выгнанный тут же сядет обратно сам собой.
      for (const one of [...this.clients]) if (this.seats.get(one.sessionId) === key) void one.leave();
      this.spread(this.table.leave(key));
      return { ok: true };
    }
    if (order.do === "dealer") {
      if (chair.owner === null) return { error: "no-dealer" };
      this.spread(this.table.handDealer(chair.owner));
      return { ok: true };
    }
    // SWEEP — карты этого стула в руку крупье, по одной, как это делает сборка.
    const hands = this.table.croupierSeat();
    if (!hands || chair.hand.length === 0) return { ok: true };
    if (this.table.busy) return { error: "busy" };
    let i = this.table.layout().chairs.find((c) => c.id === hands)?.hand.length ?? 0;
    const steps = [...chair.hand].reverse().map((id) => ({ t: "move" as const, id, to: { in: "hand" as const, chair: hands, i: i++ }, ms: 80 }));
    void execute(this.table, steps, BOT_KEY, this.io());
    return { ok: true };
  }

  /**
   * РАССАДКА ДЛЯ МЕНЮ В ЧАТЕ — игровые стулья по часовой. Стула крупье здесь нет: он не играет, карт
   * не получает и в списке получателей ему делать нечего.
   */
  private seatCards(): SeatCard[] {
    const admins = new Set(adminsOf(this.room));
    const dealer = this.table.dealerKey;
    return this.table.layout().chairs
      .filter((c) => !c.croupier)
      .sort((a, b) => a.angle - b.angle)
      .map((c) => {
        const who = c.owner === null ? undefined : this.table.here.find((p) => p.key === c.owner);
        return {
          id: c.id,
          ...(who ? { who: { key: who.key, name: who.name } } : {}),
          cards: c.hand.length,
          ...(c.owner !== null && admins.has(c.owner) ? { admin: true as const } : {}),
          ...(c.owner !== null && c.owner === dealer ? { dealer: true as const } : {}),
        };
      });
  }

  /** Чем была прошлая раздача — из неё растёт перераздача. Живёт, пока жива комната. */
  private lastDeal: DealMemo | null = null;

  /**
   * ПЕРЕРАЗДАЧА — ОДНО НАЖАТИЕ. Правила и стулья те же, что в прошлый раз: кого не стало — тому не
   * раздают, кто пришёл после — тоже (он войдёт в игру со следующей полной раздачи).
   *
   * Начало считается ОТ НАЖАВШЕГО: первая карта ложится следующему за ним по часовой. Нажал не
   * сидящий за столом — начинаем с прошлого начального стула; нет и его — спрашиваем, с какого стула
   * начать (`pick-seat`), а не гадаем молча.
   */
  private again(by: string): { command: TableCommand } | { error: RunError } {
    const last = this.lastDeal;
    if (!last) return { error: "no-deal-yet" };
    const playable = this.table.layout().chairs.filter((c) => !c.croupier);
    const seats = last.seats.filter((id) => playable.some((c) => c.id === id));
    if (seats.length === 0) return { error: "not-enough-players" };
    const mine = playable.find((c) => c.owner === by)?.id;
    const from = mine !== undefined
      ? clockwise(playable, mine, last.dir).slice(1).concat(clockwise(playable, mine, last.dir)[0]!).find((c) => seats.includes(c.id))?.id
      : seats.includes(last.from) ? last.from : undefined;
    if (from === undefined) return { error: "pick-seat" };
    // Карты на столе с прошлой партии — их собирают и мешают без лишнего вопроса: в этом и смысл одного нажатия.
    return { command: { t: "deal", rule: last.rule, ...(last.n === undefined ? {} : { n: last.n }), seats, from, dir: last.dir, force: true } };
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
    // СОБРАТЬ КРУГ — закрытая куча уходит крупье в руки, и стол снова чист.
    if (act === "ring") return void this.sweepRing(by, chair.id);
    if (act === "ring-back") return void this.unsweepRing(by, chair.id);
    // СОСТАВ КОЛОДЫ — разница, а не пересборка: недостающие карты летят крупье в руки, лишние уходят.
    if (act === "deck" || act === "jokers") {
      const now = this.deckCard();
      const want = act === "deck" ? deckOf(now.size === 36 ? 52 : 36, now.jokers) : deckOf(now.size, !now.jokers);
      const steps = tuneSteps(this.table, want);
      if (steps.length === 0) return;
      return void execute(this.table, steps, by, this.io());
    }
    const steps = act === "collect" ? collectSteps(this.table) : [];
    if (steps.length === 0) return;
    void execute(this.table, steps, by, this.io());
  }

  /**
   * КРУГ — В РУКИ КРУПЬЕ. Одним движением: стопка целиком, её не носят по карте.
   *
   * Зону сгребает крупье, а не закрывший: у закрывшего в руках своя игра, а куча посреди стола —
   * хозяйство, и за настоящим столом её убирает тот, кто за стол отвечает.
   *
   * Какая именно зона — спрашивается у рода стола, а не пишется здесь: комната игры не знает
   * (`room.knows-no-game`). Зон нет — и собирать нечего.
   */
  private sweepRing(by: string, seat: string): void {
    const zones = deskOf(kindOf(this.room)).zones ?? [];
    const at = this.table.layout();
    for (const zone of zones) {
      const pile = at.piles.find((p) => p.id === zone.id);
      if (!pile || pile.cards.length === 0) continue;
      // ЗАПОМНИТЬ, ЧТО ИМЕННО УНЕСЛИ, — чтобы можно было вернуть ровно это, если нажали не туда.
      this.swept = { zone: pile.id, ids: [...pile.cards] };
      const out = this.table.act(by, { t: "pileDrop", pile: pile.id, to: { in: "hand", chair: seat, i: 0 } }, Date.now());
      if (!("refused" in out)) this.spread(out.ops);
    }
  }

  /**
   * ВЕРНУТЬ КРУГ — отмена для того, кто нажал не туда.
   *
   * ТОЛЬКО В ПУСТОЙ КРУГ, и это не придирка: успел кто-то положить карту — круг уже новый, и
   * вернуть в него прошлую кучу значило бы подменить чужой ход. Сперва освободи круг.
   *
   * Возвращается ровно то, что унесли, и только пока эти карты у крупье в руке: раздали их дальше —
   * возвращать нечего, и молчание тут честнее половинчатого возврата.
   */
  private unsweepRing(by: string, seat: string): void {
    const было = this.swept;
    const at = this.table.layout();
    const ring = было ? (at.piles.find((p) => p.id === было.zone)?.cards ?? []) : [];
    const hand = at.chairs.find((c) => c.id === seat)?.hand ?? [];
    const нельзя = mayReturnRing(было, ring, hand);
    if (нельзя !== null || !было) return void this.book.tell("crew.refused", by, { дело: "ring-back", почему: нельзя });
    // Порядок тот же, каким лежали: снизу вверх, карта за картой.
    const out = this.table.act(by, { t: "gather", ids: [...было.ids], side: "keep", to: { pile: было.zone } }, Date.now());
    if ("refused" in out) return;
    this.spread(out.ops);
    this.swept = null;
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
    if (options.protocol !== undefined && options.protocol !== PROTOCOL) throw new Error(STALE_CLIENT);
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
    // ПЕРВЫЙ КАДР ЗАПИСИ — здесь, а не при создании комнаты. Дифы рассказывают, что ИЗМЕНИЛОСЬ, и
    // без кадра, от которого они считаются, партию не прокрутить: колода роздана до первой записи.
    //
    // Почему не раньше: сразу после создания стол ещё собирается — крупье садится, встают зоны рода
    // (круг хода и прочее). Снятый в ту секунду кадр выходил то с кругом, то без, как повезёт с
    // порядком. К первому вошедшему стол собран целиком, и это самый ранний момент, когда снимок
    // означает то, что означает.
    //
    // Пишется правдой: закрытая карта в записи не рассказывает ничего, а наружу снимок не уходит.
    if (!this.filmed) {
      this.filmed = true;
      this.book.tell("table.first", undefined, { snapshot: this.table.seenBy("", true) });
    }

    this.seats.set(client.sessionId, person.key);
    this.book.tell("join", person.key, { name: person.name, again: sitting !== undefined, windows: [...this.seats.values()].filter((k) => k === person.key).length });
    this.spread(this.table.join(person));
  }

  onLeave(client: Client): void {
    const key = this.seats.get(client.sessionId);
    this.seats.delete(client.sessionId);
    if (key === undefined) return;
    // С ДРУГОГО УСТРОЙСТВА ОН ЕЩЁ ЗДЕСЬ — тогда не уходит никто.
    if ([...this.seats.values()].includes(key)) {
      this.book.tell("window.close", key, { left: [...this.seats.values()].filter((k) => k === key).length });
      return;
    }
    this.book.tell("leave", key);
    if (this.eyes.forget(key)) this.spreadEyes();
    this.signals.forget(key);
    this.witnesses.forget(key);
    this.flood.forget(key);
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

  // ── БОТЫ ────────────────────────────────────────────────────────────────────────────────────
  //
  // Бот ходит В ТУ ЖЕ ДВЕРЬ, ЧТО ЧЕЛОВЕК: `table.act` → судья → дифы по экранам. Не через команду
  // стола: команда ставит `busy` и запирает руки людей, а бот — игрок, а не раздача.

  /** Стол шевельнулся — отсчёт тишины сначала. */
  private stir(now = Date.now()): void {
    this.stirredAt = now;
    this.nudgeBots();
  }

  /**
   * ХАРАКТЕР БОТА. Выводится из его ключа, а не хранится: ключ (`bot:игрок2`) переживает и
   * перезапуск, и рестор комнаты, поэтому бот после перезапуска остаётся собой. Характеры
   * раздаются по кругу — за столом из четырёх ботов все четыре разные.
   */
  private profileFor(key: string): Profile {
    const asked = this.botOrders.get(key)?.profile;
    if (asked !== undefined) return profileOf(asked);
    const n = [...this.table.here].filter((one) => one.bot === true).findIndex((one) => one.key === key);
    return profileOf(PROFILE_KEYS[(n < 0 ? 0 : n) % PROFILE_KEYS.length]);
  }

  /** Мозг бота: свой экземпляр на каждого, чтобы падение одного не трогало остальных. */
  private brainFor(key: string): Brain {
    const kept = this.brains.get(key);
    if (kept) return kept;
    const made = brainOf(this.botOrders.get(key)?.brain);
    this.brains.set(key, made);
    return made;
  }

  /**
   * ЗАГЛЯНУТЬ: не пора ли кому-то из ботов сходить. Зовётся после каждого движения стола и по
   * таймеру — второй раз потому, что тишина наступает не от события, а от его отсутствия.
   */
  private nudgeBots(): void {
    this.botTimer?.clear();
    this.botTimer = null;
    if (!this.referee?.bot) return;
    // Крупье — не игрок: он раздаёт и сгребает, но ходов у него нет.
    const desks = new Set(this.table.layout().chairs.filter((c) => c.croupier === true).map((c) => c.id));
    const bots = this.table.here.filter((one) => one.bot === true && one.seat !== undefined && !desks.has(one.seat));
    if (bots.length === 0) return;
    const now = Date.now();
    const quiet = { busy: this.table.busy, handsOn: this.table.handsOn, stirredAt: this.stirredAt, now };
    const waits: number[] = [];
    for (const bot of bots) {
      const profile = this.profileFor(bot.key);
      waits.push(profile.waitMs);
      // ЗА НЕГО ДУМАЮТ СНАРУЖИ. Стул, имя и цвет — как у всех, но своего мозга нет: ход придёт от
      // агента через MCP, когда тот решит. Толчок по тишине его не касается, иначе стол сходил бы
      // за него первым и агенту осталось бы смотреть.
      if (this.botOrders.get(bot.key)?.brain === OUTSIDE_BRAIN) continue;
      if (this.thinking.has(bot.key)) continue;
      // ДУМАТЬ МОЖНО ВО ВРЕМЯ ПАУЗЫ, А НЕ ПОСЛЕ НЕЁ. Пауза нужна, чтобы бот не лез под руку
      // человеку, — а не чтобы он сидел без дела: мысль занимает секунды, и начатая вместе с паузой
      // она к её концу готова. Ход ложится в тот же миг, но раньше по часам на всю длину паузы.
      //
      // Порог здесь нулевой: стол должен быть свободен (никто не держит карту, не идёт команда), но
      // ждать своей паузы, чтобы ПОДУМАТЬ, незачем — она про то, когда ходить.
      if (!ready(quiet, 0)) continue;
      const brief = this.referee.bot(this.seats_(), bot.seat!);
      if (brief === null) continue;
      void this.botPlays(bot.key, brief, profile);
    }
    const wait = Math.max(120, nextLook(quiet, waits));
    this.botTimer = this.clock.setTimeout(() => this.nudgeBots(), wait);
  }

  /**
   * ХОД ОДНОГО БОТА. Мозг может упасть, зависнуть или назвать ход не из списка — тогда ходит
   * скриптовый запасной: бот, из-за которого встал стол, хуже отсутствия бота.
   */
  private async botPlays(key: string, brief: { legal: readonly Move[]; view: BotView }, profile: Profile): Promise<void> {
    this.thinking.add(key);
    const track = this.trackOf(key);
    const t0 = Date.now();
    track.since = t0;
    delete track.lastWhy;
    // Оборвать можно и стол целиком (`gone`), и одного бота (кнопкой админа) — мозг слушает оба.
    const свой = new AbortController();
    this.minds.set(key, свой);
    const stop = AbortSignal.any([this.gone.signal, свой.signal]);
    this.spreadMinds();
    try {
      let move: Move;
      try {
        const brain = this.brainFor(key);
        const picked = await brain.choose(brief.legal, brief.view, profile, brain.thinkMs ?? BOT_THINK_MS, stop);
        // Ответ не из списка — запасной. Сам список собран сервером, поэтому подлога быть не может.
        move = fromList(brief.legal, picked) ?? best(brief.legal, brief.view, profile);
      } catch (err) {
        // Упал, завис, ответил чушью — ходит запасной. Стол из-за бота не встаёт.
        const why = String(err).slice(0, 200);
        this.book.tell("bot.failed", key, { почему: why });
        track.failed += 1;
        track.lastWhy = why;
        move = best(brief.legal, brief.view, profile);
      }
      track.lastMs = Date.now() - t0;
      track.lastSays = moveSays(move);
      // КОМНАТЫ УЖЕ НЕТ — ход некуда класть. Мозг мог ответить за миг до закрытия либо оказаться
      // скриптовым, которого не обрывают вовсе.
      if (this.gone.signal.aborted) return;
      // ДОДЕРЖАТЬ ПАУЗУ, если мысль оказалась быстрее неё. Скриптовый мозг отвечает мгновенно, и без
      // этого он клал бы карту в тот же миг, что и человек, — стол читался бы как машина.
      //
      // Ждём ОБЫЧНЫМ таймером, а не часами комнаты: часы закрытой комнаты не идут, и ожидание на
      // них не кончилось бы никогда — эта задача осталась бы висеть вместе со всем, что держит.
      const left = profile.waitMs - (Date.now() - this.stirredAt);
      if (left > 0) await new Promise((done) => setTimeout(done, left).unref?.());
      if (this.gone.signal.aborted) return;
      // Пока думали, стол мог зашевелиться: человек взял карту, пошла раздача. Тогда ход отменяется
      // и назначается заново — свежей мыслью по новому столу, а не этой, уже устаревшей.
      if (!ready({ busy: this.table.busy, handsOn: this.table.handsOn, stirredAt: this.stirredAt, now: Date.now() }, profile.waitMs)) {
        return void this.nudgeBots();
      }
      this.botMoves(key, move);
      track.moves += 1;
    } finally {
      this.thinking.delete(key);
      this.minds.delete(key);
      delete track.since;
      this.spreadMinds();
    }
  }

  /**
   * АДМИН УПРАВЛЯЕТ ИГРОКОМ БЕЗ ЧЕЛОВЕКА. Право то же, что на посадку: кто сажал, тот и распоряжается.
   *
   *   `nudge`  — походи сейчас: тишина считается выдержанной, пауза не ждётся;
   *   `cancel` — брось мысль; мозг обрывается, и за него тут же ходит запасной;
   *   `kick`   — уведи со стула.
   */
  private botAct(by: string, chair: string, act: BotAct): void {
    if (!this.table.may(by, "table.seats")) return;
    const seat = this.table.layout().chairs.find((c) => c.id === chair);
    const key = seat?.owner;
    if (!key || !this.table.here.some((one) => one.key === key && one.bot === true)) return;
    this.book.tell("bot.order", by, { кому: key, дело: act });
    if (act === "kick") {
      this.brains.delete(key);
      this.botOrders.delete(key);
      this.tracks.delete(key);
      this.spread(this.table.leave(key));
      return void this.spreadMinds();
    }
    // ОБРЫВ МЫСЛИ — своим сигналом на этого бота: чужие думают дальше, их обрывать не за что.
    if (act === "cancel") {
      this.minds.get(key)?.abort();
      this.minds.delete(key);
      return;
    }
    // ТОЛЧОК: тишина считается выдержанной прямо сейчас, и ближайший осмотр застанет бота готовым.
    this.stirredAt = 0;
    this.nudgeBots();
  }

  /**
   * СЛОВО ОТ СТУЛА — остальным. Одно место и для человека, и для игрока без человека: если бы бот
   * говорил своим путём, его слова однажды разошлись бы с людскими — другой вид, другой лимит,
   * другая рассылка.
   */
  private saySpread(say: Say): void {
    for (const other of this.clients) {
      const key = this.seats.get(other.sessionId);
      if (key !== undefined && key !== say.by) other.send(MSG.say, say);
    }
  }

  /**
   * ИГРОК БЕЗ ЧЕЛОВЕКА ГОВОРИТ. Только на ЗНАЧИМОЕ — закрыл круг, взял, вышел: обычный ход виден и
   * так, а стол, где три машины отчитываются за каждую карту, читать невозможно.
   *
   * Номер строки растёт: у каждой реплики свой, иначе они затирают друг друга на экране.
   */
  private botLines = new Map<string, number>();
  private botSays(key: string, text: string): void {
    const n = (this.botLines.get(key) ?? 0) + 1;
    this.botLines.set(key, n);
    this.saySpread({ by: key, n, pieces: [{ t: "text", text: text.slice(0, LINE_MAX) }], done: true });
  }

  /**
   * ЧТО БОТ СКАЖЕТ И ПОПРОСИТ ПОСЛЕ СВОЕГО ХОДА.
   *
   * ЗАКРЫЛ КРУГ — просит крупье убрать кучу, и крупье убирает. Сгребает не закрывший: у него в
   * руках своя игра, а куча посреди стола — хозяйство, и за настоящим столом её уносит тот, кто за
   * стол отвечает. Человек, закрывший круг, жмёт ту же кнопку сам.
   *
   * ВЗЯЛ ИЗ КРУГА — говорит: это признание слабости, и за столом его произносят вслух.
   *
   * Обычный ход — молча: он виден и так, и лежит в журнале.
   */
  private afterBotMove(key: string, move: Move, closerWas: string | null): void {
    if (move.t === "take") return void this.botSays(key, "Беру");
    const closer = this.judgeView()?.closer ?? null;
    if (closer === null || closer !== key || closer === closerWas) return;
    this.botSays(key, "Круг мой — крупье, забери");
    // Крупье убирает не мгновенно: реплику надо успеть прочесть, да и рука у стола не машина.
    const seat = this.table.layout().chairs.find((c) => c.croupier);
    if (!seat) return;
    this.clock.setTimeout(() => {
      if (this.gone.signal.aborted) return;
      this.crewAct(BOT_KEY, "ring");
    }, CROUPIER_HAND_MS);
  }

  private trackOf(key: string): BotTrack {
    const had = this.tracks.get(key);
    if (had) return had;
    const made: BotTrack = { moves: 0, failed: 0 };
    this.tracks.set(key, made);
    return made;
  }

  /**
   * ЧТО С БОТАМИ ПРЯМО СЕЙЧАС — наружу. Отвечает на вопрос, который задают, ПОКА бот молчит:
   * чем он думает, думает ли вот сейчас и сколько уже, чем кончилась прошлая мысль.
   */
  botsSeen(): BotsSeen {
    const now = Date.now();
    const chairs = this.table.layout().chairs;
    const desks = new Set(chairs.filter((c) => c.croupier === true).map((c) => c.id));
    const turn = this.referee?.view(this.seats_())?.turn ?? null;
    const bots = this.table.here
      .filter((one) => one.bot === true && one.seat !== undefined && !desks.has(one.seat))
      .map((one) =>
        botSeen(
          {
            key: one.key,
            name: one.name,
            chair: one.seat!,
            brain: this.botOrders.get(one.key)?.brain ?? "greedy",
            profile: this.profileFor(one.key).key,
            waitMs: this.profileFor(one.key).waitMs,
            turn: turn === one.key,
          },
          this.tracks.get(one.key),
          now,
        ),
      );
    // Стол ещё ни разу не шевелился — тишина не «с начала эпохи», а просто ноль: иначе на странице
    // светится пятидесятилетнее число, и первое, что человек видит, — враньё.
    const quietMs = this.stirredAt === 0 ? 0 : Math.max(0, now - this.stirredAt);
    return { turn, busy: this.table.busy, handsOn: this.table.handsOn, quietMs, bots };
  }

  /** Довести ход до стола теми же намерениями, какими его шлёт палец человека. */
  private botMoves(key: string, move: Move): void {
    const now = Date.now();
    // КОМНАТА НЕ ЗНАЕТ ИГРЫ: и карту, и место назвал судья. Здесь только два жеста — те же, что
    // делает палец человека.
    const { id, to } = move;
    const grab = this.table.act(key, { t: "grab", id }, now);
    if ("refused" in grab) return void this.book.tell("bot.refused", key, { шаг: "grab", why: grab.refused });
    this.spread(grab.ops);
    const drop = this.table.act(key, { t: "drop", id, to }, now);
    if ("refused" in drop) {
      // Положить не вышло — карту надо ОТПУСТИТЬ, иначе она останется в кулаке бота навсегда и
      // стол замрёт: никто другой её уже не возьмёт.
      this.book.tell("bot.refused", key, { шаг: "drop", why: drop.refused });
      const back = this.table.act(key, { t: "release", id }, now);
      if (!("refused" in back)) this.spread(back.ops);
      return;
    }
    this.book.tell("bot.act", key, { move: move.t, id });
    this.spread(drop.ops);
    const было = this.judgeView()?.closer ?? null;
    if (this.referee?.follow(this.seats_(), key, { t: "drop", id, to })) this.resend();
    this.afterBotMove(key, move, было);
    this.stir(now);
  }

  // ── ВНЕШНИЙ ИГРОК ───────────────────────────────────────────────────────────────────────────
  //
  // Агент снаружи (MCP) спрашивает стол и ходит сам. Своего мозга у комнаты для него нет и толчок по
  // тишине его не касается: он человек, просто набранный из букв.

  /** Стул этого игрока — по ключу, как у всех. */
  private chairOfKey(key: string): string | null {
    return this.table.layout().chairs.find((c) => c.owner === key)?.id ?? null;
  }

  /** ЧТО ВИДНО ВНЕШНЕМУ ИГРОКУ. Чужих карт здесь нет — взгляд тот же, что у бота. */
  lookFor(key: string): Looked {
    const turn = this.referee?.view(this.seats_())?.turn ?? null;
    const chair = this.chairOfKey(key);
    const brief = chair === null ? null : (this.referee?.bot?.(this.seats_(), chair) ?? null);
    return looked(turn, turn === key && brief !== null, brief?.legal ?? [], brief?.view ?? null);
  }

  /** СХОДИТЬ ЗА ВНЕШНЕГО ИГРОКА — теми же жестами и с теми же отказами, что у всех. */
  playFor_(key: string, n: unknown): Played {
    const chair = this.chairOfKey(key);
    if (chair === null) return { ok: false, why: "no-match", says: "Ты не за этим столом" };
    const brief = this.referee?.bot?.(this.seats_(), chair) ?? null;
    if (brief === null) return { ok: false, why: "not-your-turn", says: "Сейчас не твой ход" };
    const move = chosen(brief.legal, n);
    if (move === null) return { ok: false, why: "no-such-move", says: `Такого хода нет: назови число от 1 до ${brief.legal.length}` };
    const now = Date.now();
    const grab = this.table.act(key, { t: "grab", id: move.id }, now);
    if ("refused" in grab) return { ok: false, why: "refused", says: `Стол не дал взять карту: ${grab.refused}` };
    this.spread(grab.ops);
    const drop = this.table.act(key, { t: "drop", id: move.id, to: move.to }, now);
    if ("refused" in drop) {
      const back = this.table.act(key, { t: "release", id: move.id }, now);
      if (!("refused" in back)) this.spread(back.ops);
      return { ok: false, why: "refused", says: `Стол не принял ход: ${drop.refused}` };
    }
    this.book.tell("outside.act", key, { move: move.t, id: move.id });
    this.spread(drop.ops);
    if (this.referee?.follow(this.seats_(), key, { t: "drop", id: move.id, to: move.to })) this.resend();
    this.stir(now);
    return { ok: true, did: moveSays(move) };
  }

  /**
   * ЧТО С ИГРОКАМИ БЕЗ ЧЕЛОВЕКА — всем. Шлётся, когда меняется: начал думать, сходил, сорвался.
   *
   * Мимо версий стола: это не карты, а состояние игроков, и меняется оно чаще. Одинаково всем —
   * тут нечего скрывать: чем думает машина, видно и так на её табличке.
   */
  private mindsTold = "";
  private spreadMinds(): void {
    const minds: Minds = this.botsSeen().bots.map((one) => ({
      key: one.key,
      chair: one.chair,
      brain: one.brain,
      profile: one.profile,
      waitMs: one.waitMs,
      thinkingMs: one.thinkingMs,
      moves: one.moves,
      failed: one.failed,
      ...(one.lastSays === undefined ? {} : { lastSays: one.lastSays }),
      ...(one.lastWhy === undefined ? {} : { lastWhy: one.lastWhy }),
    }));
    // «Думает 3 с» и «думает 4 с» — одно и то же событие: сравниваем БЕЗ счётчика времени, иначе
    // рассылка шла бы каждый кадр. Экран сам считает, сколько прошло.
    const line = JSON.stringify(minds.map((one) => ({ ...one, thinkingMs: one.thinkingMs === null ? null : 0 })));
    if (line === this.mindsTold) return;
    this.mindsTold = line;
    this.broadcast(MSG.minds, minds);
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
      client.send(MSG.welcome, this.welcomeFor(me));
    }
  }

  /**
   * ЧТО С ПАРТИЕЙ — в журнал, при каждом изменении.
   *
   * Партия не едет дифами: чей ход и что кому можно, стол считает для каждого зрителя заново, при
   * каждом снимке. Для игры этого довольно, а для записи — нет: отказ «сейчас не твой ход» в ней
   * виден, а чей ход был на самом деле — нет, и разобрать жалобу нечем. Один раз это уже случилось.
   */
  private matchTold = "";
  private tellMatch(): void {
    if (!this.referee) return;
    const now = this.referee.told();
    const line = JSON.stringify(now);
    if (line === this.matchTold) return;
    this.matchTold = line;
    this.book.tell("match", undefined, now);
  }

  /** Разослать дифы — каждому, какими их видно ему. */
  private spread(ops: Op[]): void {
    if (ops.length === 0) return;
    const v = this.table.version;
    // ЛЕНТА ПРОИГРЫВАТЕЛЯ ПИШЕТСЯ ЗДЕСЬ — в единственном месте, через которое уходит любое изменение
    // стола. Не в обработчике хода: ходом стол меняют не только руки игрока, но и команда админа,
    // крупье и смена рода, и лента, собранная по рукам, окажется дырявой.
    //
    // Пишется ПРАВДА стола, а не то, что видно каждому: реплей должен показывать партию как она шла.
    // Но пройти через `seenOp` обязана и она: там к карте прибавляется номер её места в зоне, без
    // которого круг хода рисуется стопкой посередине.
    this.book.tell("patch", undefined, { v, ops: ops.map((op) => this.table.seenOp(op, "", true)) });
    this.tellMatch();
    this.keepSoon();
    for (const client of this.clients) {
      const key = this.seats.get(client.sessionId);
      if (key !== undefined) client.send(MSG.patch, { v, ops: ops.map((op) => this.table.seenOp(op, key)) });
    }
  }
}
