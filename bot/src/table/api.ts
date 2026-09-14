// БОТ ↔ СЕРВЕР СТОЛА. Где сервер сейчас, бот не знает и не хранит: спрашивает реле на Fly
// (`/relay/table`), и оно отвечает адресом, который мак прислал последним маяком. Для разработки на
// одной машине реле можно обойти — `TABLE_SERVER_URL` смотрит прямо на сервер.
//
// Контракт — тот же файл, что читают сервер и клиент (`server/src/table/contract.ts`).

import { SECRET_HEADER, type Home, type RelayStatus, type RoomCard, type RunResult, type TableCommand } from "../../../server/src/table/contract.js";

export interface TableEnv {
  secret: string;
  relayUrl?: string;
  serverUrl?: string;
  /** Короткое имя Mini App стола в BotFather: `t.me/<бот>/<app>?startapp=<комната>`. */
  appName?: string;
}

export function tableEnv(source: NodeJS.ProcessEnv = process.env): TableEnv | undefined {
  const secret = source.TABLE_SECRET;
  if (!secret || (!source.TABLE_RELAY_URL && !source.TABLE_SERVER_URL)) return undefined;
  return {
    secret,
    ...(source.TABLE_RELAY_URL ? { relayUrl: trim(source.TABLE_RELAY_URL) } : {}),
    ...(source.TABLE_SERVER_URL ? { serverUrl: trim(source.TABLE_SERVER_URL) } : {}),
    ...(source.TABLE_APP_NAME ? { appName: source.TABLE_APP_NAME } : {}),
  };
}

const trim = (url: string) => url.replace(/\/+$/, "");

/** Жив ли стол и какой это запуск. Никакого ответа — «не жив»: врать комнатой нельзя. */
export type Where = { up: true; url: string; boot: string } | { up: false };

export class TableApi {
  constructor(
    private readonly env: TableEnv,
    private readonly http: typeof fetch = fetch,
  ) {}

  async where(): Promise<Where> {
    try {
      if (this.env.serverUrl) {
        const res = await this.http(`${this.env.serverUrl}/table/health`);
        if (!res.ok) return { up: false };
        return { up: true, url: this.env.serverUrl, boot: ((await res.json()) as { boot: string }).boot };
      }
      const res = await this.http(`${this.env.relayUrl}/relay/table`);
      if (!res.ok) return { up: false };
      const s = (await res.json()) as RelayStatus;
      return s.up && s.url && s.boot ? { up: true, url: s.url, boot: s.boot } : { up: false };
    } catch {
      return { up: false };
    }
  }

  /** Постоянный адрес стола в браузере — через реле, чтобы ссылка пережила смену адреса мака. */
  openUrl(room: string): string {
    return `${this.env.relayUrl ?? this.env.serverUrl}/${this.env.relayUrl ? "t" : "table"}/?room=${encodeURIComponent(room)}`;
  }

  get appName(): string | undefined {
    return this.env.appName;
  }

  open(home: Home, by: string, title?: string, room?: string) {
    return this.call<RoomCard>("POST", "/table/rooms", { home, by, ...(title ? { title } : {}), ...(room ? { room } : {}) });
  }

  list(chat: string) {
    return this.call<RoomCard[]>("GET", `/table/rooms?chat=${encodeURIComponent(chat)}`);
  }

  /** Столы, открытые этим человеком, где бы они ни жили. */
  listBy(by: string) {
    return this.call<RoomCard[]>("GET", `/table/rooms?by=${encodeURIComponent(by)}`);
  }

  run(room: string, by: string, command: TableCommand) {
    return this.call<RunResult>("POST", `/table/rooms/${room}/run`, { by, command });
  }

  rename(room: string, title: string) {
    return this.call<RoomCard>("PATCH", `/table/rooms/${room}`, { title });
  }

  rehome(room: string, home: Home) {
    return this.call<RoomCard>("PATCH", `/table/rooms/${room}`, { home });
  }

  close(room: string) {
    return this.call<{ ok: true }>("DELETE", `/table/rooms/${room}`);
  }

  /** `down` — сервера нет; `missing` — сервер есть, комнаты нет. */
  private async call<T>(method: string, path: string, body?: unknown): Promise<T | "down" | "missing"> {
    const at = await this.where();
    if (!at.up) return "down";
    try {
      const res = await this.http(`${at.url}${path}`, {
        method,
        headers: { "content-type": "application/json", [SECRET_HEADER]: this.env.secret },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 404) return "missing";
      if (!res.ok) return "down";
      return (await res.json()) as T;
    } catch {
      return "down";
    }
  }
}
