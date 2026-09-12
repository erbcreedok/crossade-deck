import { Client } from "colyseus.js";
import { fromSpec, node, revOf, setRev, toSpec, treeFromJson, type Node } from "game-kit";
import type { Account } from "./account.js";
import { serverUrl } from "./server.js";

/** One person in the room, as the server names them. */
export interface RosterItem {
  readonly seat: string | null;
  readonly name: string;
  /** Цвет ЧЕЛОВЕКА — тот же, каким он помечен в списке комнаты и в своём профиле. */
  readonly color?: string;
  /** Его лицо, как он его выбрал. Пусто — рисуется первая буква имени. */
  readonly face?: string;
  readonly accountId?: string;
  readonly away?: boolean;
}

/**
 * A MESSAGE THAT IS NOT A TREE — a hand still in the air, a view that moved. It carries its own
 * `kind` and whatever that kind means; `from` is the sender's seat, written by the room.
 */
export interface RelayMessage {
  readonly kind: string;
  readonly from?: string;
  readonly [field: string]: unknown;
}

export interface Table {
  readonly root: Node;
  readonly rev: number;
  readonly seat: string | null;
  readonly code: string;
  readonly roomId: string;
  /** Everybody at this table right now — the last roster the room sent. */
  readonly roster: readonly RosterItem[];
  send(next: Node): void;
  onTree(listener: (root: Node, from: string) => void): () => void;
  /**
   * SAY SOMETHING THAT IS NOT A CHANGE TO THE DESK. A gesture is worth nothing a second later, so
   * it never becomes a revision: the room passes it on as it stands and the tree does not move.
   */
  sendRelay(msg: RelayMessage): void;
  /**
   * ЧЕЙ СЕЙЧАС ХОД — комната должна это знать, потому что метку «твой ход» рисует не стол, а СПИСОК
   * комнат: человек открывает его именно затем, чтобы увидеть, где его ждут. Череду считает игра,
   * комната её только запоминает.
   */
  sendTurn(seat: string | undefined): void;
  /**
   * СДЕЛАТЬ ЧТО-ТО С ЧЕЛОВЕКОМ ЗА СТОЛОМ — дать стул, забрать, дать админа, выгнать, перекрасить.
   *
   * Просьба, а не приказ: право проверяет комната, и отказ приходит словами (`onDenied`). Кнопка,
   * нарисованная экраном, — надпись, и стол, верящий ей на слово, отдаёт себя первому встречному.
   */
  sendDeed(deed: string, whom: string, colour?: string): void;
  /** Комната не пустила — и сказала почему. Эти слова и показываются человеку. */
  onDenied(listener: (denial: { deed: string; why: string }) => void): () => void;
  onRelay(listener: (msg: RelayMessage) => void): () => void;
  onRoster(listener: (roster: readonly RosterItem[]) => void): () => void;
  leave(): void;
}

export interface JoinTableOptions {
  game: string;
  room?: string;
  account?: Account;
  seats?: number;
  /** Test seam: custom client */
  client?: any;
}

function parseTree(tree: unknown): Node {
  if (typeof tree === "string") return treeFromJson(tree);
  if (tree && typeof tree === "object") return fromSpec(tree as any);
  return node("desk");
}

export async function joinTable(opts: JoinTableOptions): Promise<Table> {
  const httpUrl = serverUrl();
  const wsUrl = httpUrl.replace(/^http/, "ws");
  const client = opts.client ?? new Client(wsUrl);

  const roomOptions: Record<string, unknown> = {};
  // ИМЯ НЕ ПОСЫЛАЕТСЯ: за столом человека зовут так, как он назван в своём аккаунте, и это знает
  // сервер. Присланное клиентом имя было бы способом сесть за стол под чужим.
  if (opts.account) {
    roomOptions.accountId = opts.account.id;
  }
  if (opts.seats) {
    roomOptions.seats = opts.seats;
  }

  const createRoom = async (): Promise<any> => {
    // A table with no code yet is one nobody has joined: the room is opened as a RECORD first (its
    // code, its rules, its owner), and the session this client joins is that record's session.
    const res = await fetch(`${httpUrl}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: opts.game,
        ...(opts.seats ? { seats: opts.seats } : {}),
        ...(opts.account ? { by: opts.account.id } : {}),
      }),
    });
    if (!res.ok) throw new Error("room_create_failed");
    const { roomId } = (await res.json()) as { roomId: string };
    return client.joinById(roomId, roomOptions);
  };

  let colyseusRoom: any;
  if (opts.room) {
    // КОД ВЕДЁТ В ТУ ЖЕ КОМНАТУ ИЛИ НИКУДА. Прежде мёртвый код молча открывал НОВЫЙ стол — человек
    // думал, что пришёл к друзьям, и сидел один. Теперь дверь говорит «стол закрылся», и показать
    // это — дело того, кто позвал.
    const res = await fetch(`${httpUrl}/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: opts.room }),
    });
    if (!res.ok) throw new Error("room_closed");
    const { roomId } = (await res.json()) as { roomId: string };
    colyseusRoom = await client.joinById(roomId, roomOptions);
  } else {
    colyseusRoom = await createRoom();
  }

  const relayListeners = new Set<(msg: RelayMessage) => void>();
  const deniedListeners = new Set<(denial: { deed: string; why: string }) => void>();
  const rosterListeners = new Set<(roster: readonly RosterItem[]) => void>();
  let currentRoster: readonly RosterItem[] = [];
  /**
   * WHETHER THE ROOM HAS ALREADY NAMED EVERYBODY — the roster in the `welcome` is a snapshot taken
   * when `hello` was answered, and somebody joining in that same breath is announced by a `roster`
   * message that can land FIRST. Registered before `hello` goes out for that reason; the older
   * snapshot must not then overwrite the newer list.
   */
  let heardRoster = false;

  colyseusRoom.onMessage("relay", (msg: RelayMessage) => {
    for (const listener of relayListeners) listener(msg);
  });

  colyseusRoom.onMessage("denied", (msg: { deed: string; why: string }) => {
    for (const listener of deniedListeners) listener(msg);
  });

  colyseusRoom.onMessage("roster", (msg: { roster: RosterItem[] }) => {
    heardRoster = true;
    currentRoster = msg.roster ?? [];
    for (const listener of rosterListeners) listener(currentRoster);
  });

  const welcomePromise = new Promise<{
    you: { seat: string | null; accountId?: string; name: string };
    code: string;
    roomId: string;
    rev: number;
    tree: unknown;
    roster: RosterItem[];
  }>((resolve) => {
    colyseusRoom.onMessage("welcome", (msg: any) => resolve(msg));
  });

  colyseusRoom.send("hello");
  const welcome = await welcomePromise;

  let currentRev = welcome.rev ?? 0;
  let currentRoot = parseTree(welcome.tree);
  setRev(currentRoot, currentRev);

  if (!heardRoster) currentRoster = welcome.roster ?? [];

  const listeners = new Set<(root: Node, from: string) => void>();

  colyseusRoom.onMessage("tree", (msg: { rev: number; tree: unknown; from: string }) => {
    currentRev = msg.rev;
    currentRoot = parseTree(msg.tree);
    setRev(currentRoot, currentRev);
    for (const listener of listeners) {
      listener(currentRoot, msg.from);
    }
  });

  colyseusRoom.onMessage("stale", (msg: { rev: number; tree: unknown }) => {
    currentRev = msg.rev;
    currentRoot = parseTree(msg.tree);
    setRev(currentRoot, currentRev);
    for (const listener of listeners) {
      listener(currentRoot, "server");
    }
  });

  const table: Table = {
    get root() {
      return currentRoot;
    },
    get rev() {
      return currentRev;
    },
    seat: welcome.you?.seat ?? null,
    code: welcome.code,
    roomId: colyseusRoom.id || welcome.roomId,
    get roster() {
      return currentRoster;
    },
    send(next: Node) {
      const baseRev = revOf(next) || currentRev;
      colyseusRoom.send("set", { baseRev, tree: toSpec(next) });
      currentRev = baseRev + 1;
      setRev(next, currentRev);
      currentRoot = next;
    },
    onTree(listener: (root: Node, from: string) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sendRelay(msg: RelayMessage) {
      colyseusRoom.send("relay", msg);
    },
    sendTurn(seat: string | undefined) {
      colyseusRoom.send("turn", { seat: seat ?? null });
    },
    sendDeed(deed: string, whom: string, colour?: string) {
      colyseusRoom.send("deed", { deed, whom, ...(colour ? { colour } : {}) });
    },
    onDenied(listener: (denial: { deed: string; why: string }) => void) {
      deniedListeners.add(listener);
      return () => {
        deniedListeners.delete(listener);
      };
    },
    onRelay(listener: (msg: RelayMessage) => void) {
      relayListeners.add(listener);
      return () => {
        relayListeners.delete(listener);
      };
    },
    onRoster(listener: (roster: readonly RosterItem[]) => void) {
      rosterListeners.add(listener);
      return () => {
        rosterListeners.delete(listener);
      };
    },
    leave() {
      colyseusRoom.leave();
    },
  };

  return table;
}
