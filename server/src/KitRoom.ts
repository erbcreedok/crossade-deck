import { Room, Client } from "@colyseus/core";
import { joined, openRoom, sessionEnded } from "./rooms.js";
import { setPeople, setTurn } from "./roomPeople.js";
import { guestIdentity } from "./sandboxNames.js";
import { accountColor, accountFace, accountName, paintAccount } from "./accounts.js";
import { inksApart } from "./profileInks.js";
import { accountById } from "./db/accountsRepo.js";
import { randomUUID } from "node:crypto";
import {
  ADMISSIONS,
  closeRoom,
  forkRoom,
  membersOf,
  newcomerOf,
  passRoom,
  removeMember,
  roleOf,
  roomById,
  ROOM_LIMIT,
  setChair,
  setRole,
  setRoomCode,
  setRoomConfig,
  setSession,
  VISIBILITIES,
  MODES,
  type Admission,
  type Mode,
  type Newcomer,
  type Visibility,
} from "./db/roomsRepo.js";
import { isDeed, isRoomDeed, may, modeIsReady, needsVote, powerOf, type Deed, type Someone } from "./roomRights.js";

/** Сколько ждёт снятая админом вечность — сутки, чтобы хозяин успел увидеть и вернуть. */
const FOREVER_GRACE_MS = 24 * 60 * 60 * 1000;
import { chairsAreFixed } from "./rooms.js";

export interface KitJoinOptions {
  accountId?: string;
  name?: string;
  /** Сколько стульев за этим столом. Столько их у сессии и будет. */
  chairs?: number;
  /** Сколько человек комната держит. Не больше 32 — предел самой комнаты. */
  capacity?: number;
  /** С каким уровнем комната встречает нового. */
  newcomer?: Newcomer;
  /** Даёт ли она новому стул. */
  newcomerChair?: boolean;
  game?: string;
  /** Чья это комната — та самая вечная запись. Сессия без неё бывает только в тестах. */
  room?: string;
  code?: string;
}

export interface KitRosterItem {
  seat: string | null;
  accountId?: string;
  name: string;
  /**
   * ЦВЕТ ЧЕЛОВЕКА, А НЕ ЕГО МЕСТА. Раньше экраны красили каждый по-своему: сукно и полоса — по
   * номеру стула, список — по профилю, и один человек оказывался трёх разных цветов сразу.
   */
  color?: string;
  /** Его лицо, как он его выбрал. Пусто — лица нет, и рисуется первая буква имени. */
  face?: string;
  away?: boolean;
}

export class KitRoom extends Room {
  private code = "";
  /**
   * СТУЛЬЕВ ЗА СТОЛОМ. Их число — дело стола: в картах их наплодят сколько нужно, в шахматах их
   * всегда два, потому что это правило игры. Со счётом людей в комнате оно не связано ничем.
   */
  private chairs = 2;
  /** Сколько человек комната держит — все, кто в ней состоит, а не только сидящие. */
  private capacity = ROOM_LIMIT;
  /** С каким уровнем эта комната встречает нового. */
  private newcomer: Newcomer = "player";
  /** Даёт ли она ему стул. Нет — он входит смотреть, и это не понижение уровня. */
  private newcomerChair = true;
  private game?: string;
  /** Запись комнаты, сессией которой эта комната является. */
  private record?: string;
  private rev = 0;
  private tree: unknown = null;
  private members: KitRosterItem[] = [];
  private clientMemberMap = new Map<string, KitRosterItem>();

  onCreate(options: KitJoinOptions = {}): void {
    if (typeof options?.chairs === "number" && options.chairs > 0) {
      this.chairs = Math.floor(options.chairs);
    }
    if (typeof options?.capacity === "number" && options.capacity > 0) {
      this.capacity = Math.min(ROOM_LIMIT, Math.floor(options.capacity));
    }
    if (options?.newcomer) this.newcomer = newcomerOf(options.newcomer);
    if (typeof options?.newcomerChair === "boolean") this.newcomerChair = options.newcomerChair;
    if (typeof options?.game === "string") this.game = options.game;

    // КОД И КОМНАТА ПРИХОДЯТ ИЗВНЕ: их выдала запись в базе, сессия их только носит. Когда записи
    // не дали (прямой `client.create` в тестах), сессия заводит её сама — стол без записи не
    // существует, а значит и кода у него взяться неоткуда.
    if (typeof options?.room === "string" && typeof options.code === "string") {
      this.record = options.room;
      this.code = options.code;
      setSession(this.record, this.roomId);
    } else {
      const made = openRoom({ game: this.game ?? "cards", ...(options?.accountId ? { ownerAccount: options.accountId } : {}) });
      if (!made?.code) throw new Error("no_free_code");
      this.record = made.id;
      this.code = made.code;
      setSession(this.record, this.roomId);
    }
    this.setMetadata({ code: this.code });
    // ...и сразу расходятся по столу: занятые ими места — такая же часть ростера, как живые.
    this.seatMocks();
    this.broadcastRoster();

    this.onMessage("hello", (client) => {
      const member = this.clientMemberMap.get(client.sessionId);
      if (!member) return;
      client.send("welcome", {
        you: {
          seat: member.seat,
          accountId: member.accountId,
          name: member.name,
        },
        code: this.code,
        roomId: this.roomId,
        ...(this.game ? { game: this.game } : {}),
        rev: this.rev,
        tree: this.tree,
        roster: this.roster(),
      });
    });

    this.onMessage("set", (client, msg: { baseRev?: number; tree?: unknown }) => {
      if (!msg || typeof msg !== "object") return;
      const { baseRev, tree } = msg;
      if (typeof baseRev !== "number") return;
      if (typeof tree !== "object" || tree === null || typeof (tree as Record<string, unknown>).id !== "string") {
        return;
      }

      if (baseRev !== this.rev) {
        client.send("stale", { rev: this.rev, tree: this.tree });
        return;
      }

      this.rev += 1;
      this.tree = tree;
      const member = this.clientMemberMap.get(client.sessionId);
      const fromSeat = member ? member.seat : null;
      this.broadcast("tree", { rev: this.rev, tree: this.tree, from: fromSeat }, { except: client });
    });

    // A GESTURE IS NOT A TREE. A hand still in the air and where somebody is looking are worth
    // nothing a second later, so they are passed on as they are — the tree is not touched and `rev`
    // does not move, or every mouse move would be a revision the next real change had to lose to.
    // The room only says WHO it came from: a seat cannot be claimed by the sender.
    // ЧЕЙ ХОД — ГОВОРИТ ИГРА, А НЕ КОМНАТА. Комната не знает правил и знать не должна: она
    // запоминает названное место и переводит его в человека, которого ждут. Нужно это списку
    // комнат: метка «твой ход» — единственное, ради чего его открывают заново.
    this.onMessage("turn", (_client, msg: { seat?: string | null }) => {
      const seat = typeof msg?.seat === "string" ? msg.seat : null;
      const waiting = seat ? this.members.find((one) => one.seat === seat) : undefined;
      if (this.record) setTurn(this.record, waiting?.accountId ?? null);
    });

    /**
     * ЧТО ДЕЛАЮТ С ЧЕЛОВЕКОМ ЗА СТОЛОМ — стул, права, цвет, кик.
     *
     * Здесь, а не по HTTP, потому что СТУЛ ЖИВЁТ В СЕССИИ: место за столом существует ровно столько,
     * сколько идёт партия, и раздавать его надо там же, где его видно. Роли и цвет при этом пишутся
     * в базу — они переживают сессию.
     *
     * Право проверяется ТУТ, а не на экране: кнопка, нарисованная клиентом, — это надпись, и стол,
     * верящий ей на слово, отдаёт себя первому, кто открыл консоль.
     */
    this.onMessage("deed", (client, msg: { deed?: unknown; whom?: unknown; colour?: unknown; value?: unknown }) => {
      const asked = msg?.deed;
      if (!isDeed(asked) || !this.record) return;
      const me = this.someone(this.clientMemberMap.get(client.sessionId)?.accountId);
      if (!me) return client.send("denied", { deed: asked, why: "тебя нет за этим столом" });
      // У ДЕЙСТВИЯ НАД СТОЛОМ И НАД КОМНАТОЙ НЕТ «КОГО»: спрашивающий и есть тот, о ком речь.
      // Имя, присланное для такого действия, ничего не значит — и пустое имя тут не ошибка клиента.
      const aboutRoom = isRoomDeed(asked) || asked === "seat:add";
      const named = typeof msg?.whom === "string" && msg.whom ? msg.whom : undefined;
      const whom = named ?? (aboutRoom ? me.account : undefined);
      if (!whom) return;
      const them = aboutRoom ? me : this.someone(whom);
      if (!them) return client.send("denied", { deed: asked, why: "его нет за этим столом" });
      const room = roomById(this.record);
      const table = {
        chairs: this.chairs,
        capacity: this.capacity,
        ...(room && chairsAreFixed(room.game) !== undefined ? { chairsFixed: chairsAreFixed(room.game)! } : {}),
      };
      const verdict = may(asked, me, them, room?.mode ?? "free", table);
      if (verdict !== true) return client.send("denied", { deed: asked, why: verdict });
      // ГОЛОСОВАНИЯ ЕЩЁ НЕТ, И МОЛЧА ДЕЛАТЬ ВМЕСТО НЕГО НЕЛЬЗЯ: в совете и вече это действие —
      // предложение, а предложение без голосов — самоуправство.
      if (needsVote(asked, me, powerOf(me, room?.mode ?? "free"))) {
        return client.send("denied", { deed: asked, why: "тут решают голосованием, а голосования ещё нет" });
      }
      const failed = this.doDeed(
        asked,
        them,
        typeof msg?.colour === "string" ? msg.colour : undefined,
        typeof msg?.value === "string" ? msg.value : undefined,
        me,
        client,
      );
      if (failed) return client.send("denied", { deed: asked, why: failed });
      this.broadcastRoster();
    });

    this.onMessage("relay", (client, msg: Record<string, unknown>) => {
      if (!msg || typeof msg !== "object" || typeof msg.kind !== "string") return;
      const member = this.clientMemberMap.get(client.sessionId);
      this.broadcast("relay", { ...msg, from: member ? member.seat : null }, { except: client });
    });
  }

  onJoin(client: Client, options: KitJoinOptions = {}): void {
    // КОМНАТА ПОЛНА — ЭТО ПРО ЛЮДЕЙ, А НЕ ПРО СТУЛЬЯ. Стульев может не быть вовсе: пришедший станет
    // зрителем. А вот когда в комнате уже столько народу, сколько она держит, входить некуда —
    // и место освободит только тот, кто из неё ВЫЙДЕТ.
    const returning = options?.accountId !== undefined && this.members.some((m) => m.accountId === options.accountId);
    if (!returning && this.members.length >= this.capacity) throw new Error("room_full");
    if (options?.accountId) {
      const existing = this.members.find((m) => m.accountId === options.accountId);
      if (existing) {
        existing.away = false;
        // ИМЯ ЗА СТОЛОМ — ИЗ АККАУНТА, А НЕ ИЗ ТОГО, ЧТО ПРИСЛАЛ КЛИЕНТ. Иначе за столом сидит
        // кто угодно под каким угодно именем, а профиль, который человек правит, ничего не решает.
        const mine = accountName(options.accountId);
        if (mine) existing.name = mine;
        // ВЕРНУЛСЯ БЕЗ СТУЛА — САДИТСЯ, ЕСЛИ ЕСТЬ КУДА. Стула он мог не получить, когда комната
        // встречала зрителями, а роль ему с тех пор дали другую: без этой строки стул ему не
        // достался бы до конца сессии, сколько бы пустых мест за столом ни стояло.
        // ВЕРНУЛСЯ БЕЗ СТУЛА — САДИТСЯ, ЕСЛИ ЕСТЬ КУДА И ЕСЛИ СТУЛ ЕМУ ПОЛОЖЕН. Уровень тут ни при
        // чём: смотреть приходят и админы.
        if (existing.seat === null && this.chairFor(options.accountId)) existing.seat = this.nextFreeSeat();
        this.clientMemberMap.set(client.sessionId, existing);
        this.remember(options.accountId);
        this.broadcastRoster();
        return;
      }
    }

    // У кого есть аккаунт — зовётся так, как зовётся его аккаунт. `options.name` остаётся дверью
    // для того, у кого аккаунта нет вовсе, и последним — кличка по сессии.
    const fromAccount = options?.accountId ? accountName(options.accountId) : undefined;
    const named = typeof options?.name === "string" && options.name.trim() ? options.name.trim() : null;
    const guest = guestIdentity(client.sessionId);
    const memberName = fromAccount ?? named ?? guest.name;
    // ЗРИТЕЛЮ СТУЛ НЕ ПОЛАГАЕТСЯ — за тем и приходят, чтобы смотреть. Остальным стул даётся, если
    // он есть: дальше их двигает панель людей, а не то, кто успел войти раньше.
    //
    // РОЛЬ СВОЯ БЬЁТ НАСТРОЙКУ ВСТРЕЧИ: «кем встречают» — про того, кого комната видит впервые.
    // Зритель, которого уже записали зрителем, не становится игроком, зайдя заново, а разжалованный
    // не возвращает себе стул перезаходом.
    // СТУЛ — ПО ЧЛЕНСТВУ, А НЕ ПО ВСТРЕЧЕ: лишённый стула не возвращает его перезаходом, а комната
    // говорит своё слово только про того, кого видит впервые.
    const seat = this.chairFor(options?.accountId) ? this.nextFreeSeat() : null;

    const member: KitRosterItem = {
      seat,
      ...(options?.accountId ? { accountId: options.accountId } : {}),
      name: memberName,
    };

    this.members.push(member);
    this.clientMemberMap.set(client.sessionId, member);
    if (options?.accountId) this.remember(options.accountId);
    this.broadcastRoster();
  }

  async onLeave(client: Client, consented?: boolean): Promise<void> {
    const member = this.clientMemberMap.get(client.sessionId);
    if (!member) return;

    if (!member.accountId || consented) {
      this.removeMember(member);
      this.clientMemberMap.delete(client.sessionId);
      this.broadcastRoster();
      return;
    }

    member.away = true;
    this.broadcastRoster();

    try {
      await this.allowReconnection(client, 120);
      member.away = false;
      this.broadcastRoster();
    } catch {
      if (member.away && this.clientMemberMap.get(client.sessionId) === member) {
        this.removeMember(member);
        this.clientMemberMap.delete(client.sessionId);
        this.broadcastRoster();
      }
    }
  }

  // СЕССИЯ КОНЧИЛАСЬ — СТОЛ ОСТАЛСЯ. Код не отпускается: он принадлежит комнате, а не этой
  // получасовой встрече, и ссылка на него завтра приведёт сюда же, а не за новый пустой стол.
  onDispose(): void {
    if (this.record) sessionEnded(this.record);
  }

  /** Сел за стол — стал членом этой комнаты, и она появилась в списке его комнат. */
  /**
   * СЕЛ ЗА СТОЛ — СТАЛ ЧЛЕНОМ ЭТОЙ КОМНАТЫ, и роль ему даёт её настройка (`newcomer`). Уже
   * записанному она не меняется: «кем встречают» — про порог, а не про тех, кто внутри, и человек,
   * которого сделали админом, не должен разжаловываться собственным перезаходом.
   */
  private remember(accountId: string): void {
    if (this.record) joined(this.record, accountId, this.newcomer, this.newcomerChair);
  }

  /**
   * МОК-ЮЗЕРЫ САДЯТСЯ САМИ, КАК ТОЛЬКО СТОЛ ПОДНЯЛСЯ. За ними нет клиента и сокета: они и заведены
   * затем, чтобы за столом было кого показать, пока экран собирается.
   *
   * Садятся ПО РОЛИ, которая записана за ними в комнате: хозяин, админ и игрок занимают стулья,
   * зритель остаётся без стула — он и есть «без стула». Живых членов комнаты это не касается:
   * посадить отсутствующего человека значило бы нарисовать ему место, за которым его нет.
   */
  private seatMocks(): void {
    if (!this.record) return;
    let seated = false;
    for (const member of membersOf(this.record)) {
      const account = accountById(member.accountId);
      if (!account?.bot) continue;
      this.members.push({
        // МОК САДИТСЯ, ЕСЛИ ЕМУ ПОЛОЖЕН СТУЛ. Зритель — это игрок без стула, и его место в комнате,
        // а не за столом.
        seat: member.chair ? this.nextFreeSeat() : null,
        accountId: account.id,
        name: account.name,
      });
      seated = true;
    }
    // СТОЛ С МОК-ЮЗЕРАМИ НЕ СНОСИТСЯ ПУСТЫМ. Клиентов у них нет, и Colyseus закрывает такую сессию
    // в ту же секунду, в какую она поднялась: человек приходит — а за столом снова никого, потому
    // что стол уже третий по счёту. Посадили мока — стол стоит и ждёт живых.
    if (seated) this.autoDispose = false;
  }

  /**
   * СВОБОДНЫЙ СТУЛ, ЕСЛИ ОН ЕСТЬ. Нет — человек всё равно за столом, просто без стула: это зритель,
   * а не отказ во входе. Отказывает комната, и по другому счёту — по числу людей в ней.
   */
  private nextFreeSeat(): string | null {
    const takenSeats = new Set(this.members.map((m) => m.seat));
    for (let i = 1; i <= this.chairs; i++) {
      const seatName = `p${i}`;
      if (!takenSeats.has(seatName)) return seatName;
    }
    return null;
  }

  private removeMember(member: KitRosterItem): void {
    const idx = this.members.indexOf(member);
    if (idx !== -1) this.members.splice(idx, 1);
  }

  /** Положен ли этому человеку стул: своё членство, а для незнакомого — слово комнаты. */
  private chairFor(accountId?: string): boolean {
    if (!accountId || !this.record) return this.newcomerChair;
    const known = membersOf(this.record).find((one) => one.accountId === accountId);
    return known ? known.chair : this.newcomerChair;
  }

  /** Человек за столом, как его видит правило: роль из базы, стул — из идущей сессии. */
  private someone(accountId?: string): Someone | undefined {
    if (!accountId || !this.record) return undefined;
    const role = roleOf(this.record, accountId);
    if (!role) return undefined;
    return {
      account: accountId,
      role,
      seated: this.members.some((m) => m.accountId === accountId && m.seat !== null),
      here: this.members.some((m) => m.accountId === accountId),
    };
  }

  /**
   * Исполнить разрешённое. Право уже проверено — здесь только последствие, и только одна причина
   * отказа остаётся: САЖАТЬ НЕКУДА. Право говорит «ты вправе раздавать места», а стульев за столом
   * может не быть ни одного — это не про право, а про мебель, и сказать это надо вслух.
   */
  private doDeed(
    deed: Deed,
    them: Someone,
    colour?: string,
    value?: string,
    me?: Someone,
    client?: Client,
  ): string | undefined {
    const record = this.record!;
    const member = this.members.find((m) => m.accountId === them.account);
    switch (deed) {
      case "seat:add":
        // СТУЛ ПОЯВЛЯЕТСЯ И В СЕССИИ, И В ЗАПИСИ: сессия рассаживает по нему сейчас, запись помнит
        // его завтра — стол, у которого мебель живёт только до конца партии, назавтра снова тесен.
        this.chairs += 1;
        setRoomConfig(record, { chairs: this.chairs });
        break;
      case "seat:give": {
        const free = this.nextFreeSeat();
        if (!free) return "за столом нет свободного стула";
        // СТУЛ ЗАПИСЫВАЕТСЯ В ЧЛЕНСТВО И ЗАНИМАЕТСЯ В СЕССИИ: первое переживает партию, второе её
        // и есть. Уровень не трогается — посадили, а не повысили.
        setChair(record, them.account, true);
        if (member) member.seat = free;
        break;
      }
      case "seat:take":
        // ЛИШИЛИ СТУЛА — НЕ РАЗЖАЛОВАЛИ: уровень остаётся тот же, человек просто больше не играет.
        setChair(record, them.account, false);
        if (member) member.seat = null;
        break;
      case "admin:grant":
        setRole(record, them.account, "admin");
        break;
      case "admin:revoke":
        setRole(record, them.account, "player");
        break;
      case "owner:pass":
        passRoom(record, them.account);
        break;
      case "kick":
        // ВЫГНАННЫЙ УХОДИТ ИЗ КОМНАТЫ ЦЕЛИКОМ, а не только со стула: иначе он вернётся сам, как
        // всякий, кто в ней числится.
        removeMember(record, them.account);
        if (member) this.removeMember(member);
        for (const [session, one] of this.clientMemberMap) {
          if (one.accountId !== them.account) continue;
          this.clientMemberMap.delete(session);
          this.clients.find((c) => c.sessionId === session)?.leave(4000);
        }
        break;
      case "colour":
        if (colour) paintAccount(them.account, colour);
        break;

      // ---- КОМНАТА ----
      //
      // ССЫЛКУ СЕРВЕР НЕ ДЕЛАЕТ: код у экрана уже есть, и адрес собирается там, где известно, по
      // какому адресу открыт стол. Право на неё есть, потому что право спрашивают и о ней.
      case "room:link":
        break;
      case "room:code": {
        // ПРОСЯТ СВОЙ КОД ИЛИ НОВЫЙ — РАЗНИЦА ТОЛЬКО В ТОМ, НАЗВАН ЛИ ОН. Занятый чужим отдать
        // нельзя, и стол получает выданный: отказывать тут не за что, код у стола будет в любом
        // случае, просто не тот, который просили.
        const after = setRoomCode(record, value);
        if (!after?.code) return "код сменить не вышло";
        this.code = after.code;
        this.broadcast("room", { code: after.code });
        break;
      }
      case "room:public":
        if (!(VISIBILITIES as readonly string[]).includes(value ?? "")) return "такой видимости нет";
        setRoomConfig(record, { visibility: value as Visibility });
        break;
      case "room:access":
        if (!(ADMISSIONS as readonly string[]).includes(value ?? "")) return "такого допуска нет";
        setRoomConfig(record, { admission: value as Admission });
        break;
      case "room:mode": {
        if (!(MODES as readonly string[]).includes(value ?? "")) return "такого уклада нет";
        // СОВЕТ И ВЕЧЕ ЖДУТ ГОЛОСОВАНИЯ. Пустить в них комнату сейчас значит запереть её: в них
        // всякое действие — предложение, а предлагать пока некому. Отказ стоит ЗДЕСЬ, а не только
        // на экране: кнопка, посчитанная клиентом, — это надпись.
        if (!modeIsReady(value as Mode)) return "совет и вече — скоро: голосования ещё нет";
        setRoomConfig(record, { mode: value as Mode });
        break;
      }
      case "room:forever": {
        const room = roomById(record);
        if (!room) return "комната закрылась";
        // ВЕРНУТЬ ГАЛОЧКУ МОЖЕТ КТО УГОДНО ИЗ РАСПОРЯЖАЮЩИХСЯ, И ЭТО ПЕРВОЕ, ЧТО ДЕЛАЕТ КНОПКА,
        // ПОКА ИДЁТ ОТСРОЧКА: иначе «отменить» пришлось бы искать в другом месте, чем «снять».
        if (room.foreverDropAt !== null) {
          setRoomConfig(record, { foreverDropAt: null, forever: true });
          break;
        }
        if (!room.forever) {
          setRoomConfig(record, { forever: true, foreverDropAt: null });
          break;
        }
        // ХОЗЯИН СНИМАЕТ ВЕЧНОСТЬ СРАЗУ, АДМИН — С СУТКАМИ ОТСРОЧКИ. Снятие вечности это назначенный
        // столу снос, и сутки нужны, чтобы хозяин успел увидеть и вернуть.
        if (me?.role === "owner") setRoomConfig(record, { forever: false, foreverDropAt: null });
        else setRoomConfig(record, { foreverDropAt: Date.now() + FOREVER_GRACE_MS });
        break;
      }
      case "room:fork": {
        const copy = forkRoom(record, them.account, randomUUID());
        if (!copy?.code) return "копия не вышла";
        // КТО СДЕЛАЛ КОПИЮ, ТОТ В НЕЁ И ИДЁТ: «сделал свою и остался за чужим столом» — это не
        // ответ на «хочу быть хозяином», а вторая комната, о которой некому вспомнить.
        client?.send("deed:done", { deed, code: copy.code });
        break;
      }
      case "room:close":
        // СТОЛ ЗАКРЫВАЕТСЯ НАСОВСЕМ, И КОД ВОЗВРАЩАЕТСЯ В ОБОРОТ. Сидящие узнают об этом тем же
        // путём, каким узнают о всяком закрытии: сессия под ними кончается.
        closeRoom(record);
        this.broadcast("closed", {});
        void this.disconnect();
        break;
    }
    return undefined;
  }

  private roster(): KitRosterItem[] {
    // ЦВЕТА ЗА ОДНИМ СТОЛОМ РАЗВОДЯТСЯ ЗДЕСЬ, а не на экранах: разойдись экраны в этом сами, один
    // и тот же человек оказался бы разного цвета у разных соседей.
    const inks = inksApart(
      this.members.map((m) => ({ id: m.accountId ?? m.name, color: m.accountId ? accountColor(m.accountId) : null })),
    );
    return this.members.map((m) => ({
      seat: m.seat,
      ...(m.accountId ? { accountId: m.accountId } : {}),
      name: m.name,
      color: inks.get(m.accountId ?? m.name)!,
      ...(m.accountId && accountFace(m.accountId) ? { face: accountFace(m.accountId)! } : {}),
      ...(m.away ? { away: true } : {}),
    }));
  }

  private broadcastRoster(): void {
    const roster = this.roster();
    this.broadcast("roster", { roster });
    // КТО ЗА СТОЛОМ — ЭТО ЖЕ И ТО, ЧТО ВИДНО В СПИСКЕ КОМНАТ. Одна правда: строка «2/4» и три лица
    // берутся из того же ростера, что разослан игрокам, а не из отдельного счётчика, который
    // однажды разойдётся с ним.
    if (this.record) {
      setPeople(
        this.record,
        roster.map((one) => ({
          name: one.name,
          // МЕСТО И АККАУНТ ЕДУТ ВМЕСТЕ С ИМЕНЕМ: по ним список за столом отличает сидящего от
          // числящегося и сшивается с членством, а не с одинаковыми именами.
          seat: one.seat,
          ...(one.accountId ? { accountId: one.accountId } : {}),
          color: one.color ?? null,
          ...(one.face ? { face: one.face } : {}),
          ...(one.away ? { away: true } : {}),
        })),
      );
    }
  }
}
