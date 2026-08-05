// ПЕСОЧНИЦА-LIVE — отдельная комната (не CardRoom): общий стол без правил и без админов.
// Сервер здесь НЕ исполняет команды борды (мок и геометрия живут в client2): действующий клиент
// применяет команду у себя и присылает КОМАНДУ + ГОТОВЫЙ СНИМОК состояния; комната хранит
// последний снимок (для поздних гостей) и ретранслирует остальным. Это тот же канон, что у v1
// («клиент считает, сервер раздаёт»), только для песочницы сервер и не проверяет — физический
// стол: правила в головах игроков, приватности рук пока нет.
//
// Присутствие — здесь: лок «кто первый схватил» (единственная очередь сообщений решает гонку),
// курсоры, профили (смена цвета, если свободен). Вход — БЕЗ токена: аноним получает ник
// «Красная панда» (sandboxNames.ts); старый аккаунт первого клиента (accountId+name) едет как есть.

import { Room, Client } from "@colyseus/core";
import { registerInviteCode, releaseInviteCode } from "./inviteCodes.js";
import { guestIdentity, MEMBER_COLORS } from "./sandboxNames.js";

export const SANDBOX_MAX_CLIENTS = 12; // временный потолок; переполнение → matchmaker откроет новый рум
const SANDBOX_SEATS = 4; // мест за столом в спеке песочницы; остальные входят призраками

interface JoinOptions {
  accountId?: string;
  name?: string;
}

export interface SandboxMember {
  id: string; // sessionId
  name: string;
  color: number;
  /** Место за столом ("p1".."pN") или null — призрак-наблюдатель. */
  seat: string | null;
}

export class SandboxRoom extends Room {
  maxClients = SANDBOX_MAX_CLIENTS;

  private code = "";
  private members = new Map<string, SandboxMember>();
  private locks = new Map<string, string>(); // el → sessionId держателя
  private lastState: unknown = null; // последний снимок борды — для поздних гостей
  private lastSettings: unknown = null; // последние настройки борды (меню песочницы) — им же

  onCreate(): void {
    this.code = registerInviteCode(this.roomId);
    this.setMetadata({ code: this.code });

    // Рукопожатие: welcome уходит ПО ЗАПРОСУ клиента, а не из onJoin — сообщение, отправленное до
    // того, как клиент повесил onMessage, colyseus.js молча роняет (гонка проявлялась на живом ws).
    this.onMessage("hello", (client) => {
      const member = this.members.get(client.sessionId);
      if (!member) return;
      client.send("welcome", {
        you: member,
        code: this.code,
        roomId: this.roomId,
        seats: SANDBOX_SEATS,
        state: this.lastState,
        settings: this.lastSettings,
        roster: this.roster(),
      });
    });

    // Настройки борды (меню песочницы): как cmd — сервер не толкует, запоминает и раздаёт всем
    // остальным вместе с мигрированным снимком (стол у всех одинаковый, поздние гости — из welcome).
    this.onMessage("settings", (client, msg: { settings: unknown; state: unknown }) => {
      if (!msg || typeof msg !== "object" || msg.settings === undefined) return;
      this.lastSettings = msg.settings;
      if (msg.state !== undefined) this.lastState = msg.state;
      this.broadcast("settings", { from: client.sessionId, settings: msg.settings, state: msg.state }, { except: client });
    });

    // Команда борды: снимок запоминаем, остальным ретранслируем (эхо автору не шлём — он уже применил).
    this.onMessage("cmd", (client, msg: { cmd: unknown; state: unknown }) => {
      if (!msg || typeof msg !== "object") return;
      this.lastState = msg.state;
      this.broadcast("cmd", { from: client.sessionId, cmd: msg.cmd, state: msg.state }, { except: client });
    });

    // Лок «кто первый схватил»: гонку решает порядок сообщений (Colyseus обрабатывает по одному).
    this.onMessage("grab", (client, msg: { el?: string }) => {
      const el = typeof msg?.el === "string" ? msg.el : null;
      if (!el) return;
      const owner = this.locks.get(el);
      if (owner && owner !== client.sessionId) {
        client.send("grab_denied", { el });
        return;
      }
      this.locks.set(el, client.sessionId);
      this.broadcastPresence();
    });
    this.onMessage("release", (client, msg: { el?: string }) => {
      const el = typeof msg?.el === "string" ? msg.el : null;
      if (!el || this.locks.get(el) !== client.sessionId) return;
      this.locks.delete(el);
      this.broadcastPresence();
    });

    // Курсоры — ретрансляция без хранения (потерянный кадр не жалко).
    this.onMessage("cursor", (client, msg: { at?: { x: number; y: number } | null }) => {
      this.broadcast("cursor", { who: client.sessionId, at: msg?.at ?? null }, { except: client });
    });

    // Драг-стрим: позиция таскаемой карты, тот же канон, что курсор (ретрансляция, не храним).
    this.onMessage("drag", (client, msg: { el?: string; at?: { x: number; y: number } | null; block?: boolean }) => {
      const el = typeof msg?.el === "string" ? msg.el : null;
      if (!el) return;
      this.broadcast("drag", { who: client.sessionId, el, at: msg?.at ?? null, block: msg?.block === true }, { except: client });
    });

    // Профиль: сменить цвет, если он свободен.
    this.onMessage("profile", (client, msg: { color?: number }) => {
      const me = this.members.get(client.sessionId);
      const color = typeof msg?.color === "number" ? msg.color : null;
      if (!me || color === null) return;
      const taken = [...this.members.values()].some((m) => m.id !== me.id && m.color === color);
      if (taken) {
        client.send("profile_denied", { color });
        return;
      }
      me.color = color;
      this.broadcastRoster();
    });
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    // Старый аккаунт первого клиента — как есть; бестокенный гость — «Красная панда».
    const guest = guestIdentity(client.sessionId);
    const named = typeof options.name === "string" && options.name.trim() ? options.name.trim() : null;
    const usedColors = new Set([...this.members.values()].map((m) => m.color));
    const freeColor = MEMBER_COLORS.find((c) => !usedColors.has(c)) ?? guest.color;
    const member: SandboxMember = {
      id: client.sessionId,
      name: named ?? guest.name,
      color: named ? freeColor : guest.color,
      seat: this.nextFreeSeat(),
    };
    this.members.set(client.sessionId, member);
    this.broadcastRoster();
  }

  onLeave(client: Client): void {
    this.members.delete(client.sessionId);
    for (const [el, owner] of this.locks) if (owner === client.sessionId) this.locks.delete(el);
    this.broadcastRoster();
    this.broadcastPresence();
    this.broadcast("cursor", { who: client.sessionId, at: null });
    this.broadcast("drag", { who: client.sessionId, el: null, at: null }); // оборванный драг не виснет
  }

  onDispose(): void {
    releaseInviteCode(this.code);
  }

  private nextFreeSeat(): string | null {
    const taken = new Set([...this.members.values()].map((m) => m.seat));
    for (let i = 1; i <= SANDBOX_SEATS; i++) if (!taken.has(`p${i}`)) return `p${i}`;
    return null; // мест нет — заходит призраком
  }

  private roster(): SandboxMember[] {
    return [...this.members.values()];
  }

  private broadcastRoster(): void {
    this.broadcast("roster", { members: this.roster() });
  }

  private broadcastPresence(): void {
    this.broadcast("held", { held: Object.fromEntries(this.locks) });
  }
}
