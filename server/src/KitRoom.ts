import { Room, Client } from "@colyseus/core";
import { joined, openRoom, sessionEnded } from "./rooms.js";
import { setPeople, setTurn } from "./roomPeople.js";
import { guestIdentity } from "./sandboxNames.js";
import { accountColor, accountName } from "./accounts.js";
import { accountById } from "./db/accountsRepo.js";
import { membersOf } from "./db/roomsRepo.js";
import { ROOM_LIMIT, setSession } from "./db/roomsRepo.js";

export interface KitJoinOptions {
  accountId?: string;
  name?: string;
  /** Сколько стульев за этим столом. Столько их у сессии и будет. */
  chairs?: number;
  /** Сколько человек комната держит. Не больше 32 — предел самой комнаты. */
  capacity?: number;
  game?: string;
  /** Чья это комната — та самая вечная запись. Сессия без неё бывает только в тестах. */
  room?: string;
  code?: string;
}

export interface KitRosterItem {
  seat: string | null;
  accountId?: string;
  name: string;
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
    const seat = this.nextFreeSeat();

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
  private remember(accountId: string): void {
    if (this.record) joined(this.record, accountId);
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
        seat: member.role === "spectator" ? null : this.nextFreeSeat(),
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

  private roster(): KitRosterItem[] {
    return this.members.map((m) => ({
      seat: m.seat,
      ...(m.accountId ? { accountId: m.accountId } : {}),
      name: m.name,
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
          color: one.accountId ? accountColor(one.accountId) : null,
          ...(one.away ? { away: true } : {}),
        })),
      );
    }
  }
}
