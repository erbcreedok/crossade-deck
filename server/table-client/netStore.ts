// СТОЛ ИЗ СЕТИ — комната Colyseus, в которую входят подписанным id и одной из дверей.
//
// Снимок приходит один раз (`welcome`), дальше — только дифы. Диф не следующей версии значит, что
// что-то потерялось по дороге: клиент не угадывает, а просит стол целиком (`sync`).
//
// СТОЛ ЧИНИТ СЕБЯ САМ, без перезагрузки страницы:
//   отстал в тишине      сервер называет версию пульсом; она впереди и патч не долетел — `sync`
//   попросил и не дали   просит снова (`Freshness`)
//   вкладка была в фоне  вернулась — `sync`: телефон мог заморозить и таймеры, и сокет
//   связь оборвалась     входит заново той же дверью; новый `welcome` и есть свежий стол
// Хранилище при этом одно и то же: слушатели живут в нём, а не на сокете, и сокет под ним меняется.

import { Client, type Room } from "colyseus.js";
import { MSG, PROTOCOL, TABLE_ROOM, type Carry, type CarryOut, type Intent, type JoinOptions, type Patch, type Refused, type Snapshot, type Welcome } from "../src/table/contract.js";
import { Freshness, type Pulse } from "../src/table/freshness.js";
import { applyPatch, needsSync } from "../src/table/patch.js";
import type { Eye } from "../src/table/eyes.js";
import type { Say, SayOut, Shot, ShotOut } from "../src/table/say.js";
import type { TableStore } from "./store.js";
import { HOST } from "./host.js";

/** Комнату закрыл сервер (`room.disconnect()`): стола больше нет, возвращаться некуда. */
const CLOSED_BY_SERVER = 4000;
/** Паузы между попытками вернуться. Кончились — стола нет. */
const RETRY_MS = [300, 1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000];

type Listener = (msg: never) => void;

export async function netStore(options: JoinOptions): Promise<TableStore> {
  const endpoint = HOST.replace(/^http/, "ws");
  const join = () => new Client(endpoint).joinOrCreate(TABLE_ROOM, { ...options, protocol: PROTOCOL } satisfies JoinOptions);

  const changed: (() => void)[] = [];
  const gone: (() => void)[] = [];
  const linked: ((up: boolean) => void)[] = [];
  /** Кто что слушает — по имени сообщения. Переживает смену сокета. */
  const heard = new Map<string, Listener[]>();
  const listen = <T>(type: string, listener: (msg: T) => void) => void heard.set(type, [...(heard.get(type) ?? []), listener as Listener]);

  let room: Room;
  let state: Snapshot | null = null;
  let welcome: Welcome | null = null;
  let up = false;
  const fresh = new Freshness();
  /** На сколько часы сервера впереди моих. */
  let skew = 0;
  const early: Patch[] = [];
  /** Чужие пальцы в воздухе — по id карты. Держится, пока карта заблокирована тем же человеком. */
  let carries = new Map<string, Carry>();
  let eyes: Eye[] = [];
  const stillHeld = () => {
    if (!state) return;
    for (const [id, c] of carries) if (state.locks[id] !== c.by) carries.delete(id);
  };

  const tell = () => {
    for (const listener of changed) listener();
  };

  /** Сокет мог закрыться между проверкой и отправкой — потерянное намерение вернёт свежий стол. */
  const post = (type: string, body?: unknown) => {
    if (!up) return;
    try {
      room.send(type, body);
    } catch {
      // Связь рвётся — этим займётся `onLeave`.
    }
  };

  const take = (patch: Patch) => {
    if (!state) return void early.push(patch);
    if (patch.v <= state.v) return;
    if (needsSync(state, patch)) return void fresh.gap(Date.now());
    state = applyPatch(state, patch);
    stillHeld();
    tell();
  };

  listen<Patch>(MSG.patch, take);
  listen<Carry>(MSG.carry, (c) => {
    // Пришёл раньше своей блокировки или позже её снятия — не показывается.
    if (!state || state.locks[c.id] !== c.by) return;
    carries.set(c.id, c);
    tell();
  });
  listen<Eye[]>(MSG.eyes, (all) => {
    eyes = Array.isArray(all) ? all : [];
    tell();
  });
  listen<Pulse>(MSG.pulse, (pulse) => {
    if (state && Number.isFinite(pulse?.v)) fresh.pulse(pulse.v, state.v, Date.now());
  });

  let welcomed: (() => void) | null = null;
  listen<Welcome>(MSG.welcome, (msg) => {
    welcome = msg;
    if (Number.isFinite(msg.now)) skew = msg.now - Date.now();
    state = msg.snapshot;
    carries = new Map((msg.carries ?? []).map((c) => [c.id, c]));
    eyes = msg.eyes ?? [];
    stillHeld();
    fresh.welcomed();
    // Дифы, пришедшие раньше снимка, догоняются по порядку; старше снимка — выбрасываются.
    for (const patch of early.splice(0)) take(patch);
    welcomed?.();
    tell();
  });

  function attach(next: Room): void {
    room = next;
    up = true;
    for (const type of Object.values(MSG)) {
      next.onMessage(type, (msg: never) => {
        for (const listener of heard.get(type) ?? []) listener(msg);
      });
    }
    next.onLeave((code) => {
      if (next !== room) return;
      up = false;
      if (code === CLOSED_BY_SERVER) return void gone.forEach((listener) => listener());
      void comeBack();
    });
    post(MSG.hello);
  }

  async function comeBack(): Promise<void> {
    for (const listener of linked) listener(false);
    for (const wait of RETRY_MS) {
      await new Promise((r) => setTimeout(r, wait));
      try {
        attach(await join());
        for (const listener of linked) listener(true);
        return;
      } catch {
        // Сети ещё нет или сервер поднимается — следующая попытка.
      }
    }
    for (const listener of gone) listener();
  }

  const first = new Promise<void>((resolve) => (welcomed = resolve));
  attach(await join());
  await first;
  welcomed = null;

  // Раз в секунду: пора ли просить стол целиком.
  setInterval(() => {
    const now = Date.now();
    if (!up || !fresh.due(now)) return;
    fresh.asked(now);
    post(MSG.intent, { t: "sync" } satisfies Intent);
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fresh.doubt(Date.now());
  });

  return {
    get me() {
      return welcome!.you;
    },
    get title() {
      return welcome!.title;
    },
    get ice() {
      return welcome?.ice ?? [];
    },
    get desk() {
      return welcome!.desk ?? "sandbox";
    },
    get crew() {
      return welcome!.crew ?? [];
    },
    get state() {
      return state!;
    },
    send: (intent) => post(MSG.intent, intent),
    get carries() {
      return [...carries.values()];
    },
    get eyes() {
      return eyes;
    },
    watch: (spots) => post(MSG.eyes, { spots }),
    carry: (out: CarryOut) => post(MSG.carry, out),
    command: (command) => post(MSG.command, command),
    log: (seen) => post(MSG.log, { seen }),
    rtc: (out) => post(MSG.rtc, out),
    onRtc: (listener) => listen<{ from: string; kind: string; body: string }>(MSG.rtc, listener),
    mic: (on, to) => post(MSG.mic, to === undefined ? { on } : { on, to }),
    onMic: (listener) => listen<{ by: string; on: boolean; to?: string }>(MSG.mic, listener),
    say: (out: SayOut) => post(MSG.say, out),
    onSay: (listener) => listen<Say>(MSG.say, listener),
    askStickers: () => post(MSG.stickers, {}),
    shoot: (out: ShotOut) => post(MSG.shot, out),
    onShot: (listener) => listen<Shot>(MSG.shot, listener),
    onStickers: (listener) => listen<string[]>(MSG.stickers, listener),
    now: () => Date.now() + skew,
    onChange: (listener) => void changed.push(listener),
    onRefused: (listener) => listen<Refused>(MSG.refused, (msg) => listener(msg.intent, msg.why)),
    onGone: (listener) => void gone.push(listener),
    onLink: (listener) => void linked.push(listener),
  };
}
