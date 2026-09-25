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
import { DEAL_PRESETS, MSG, PROTOCOL, TABLE_ROOM, type Carry, type DealRule, type CarryOut, type Intent, type JoinOptions, type Minds, type Op, type Patch, type Refused, type Snapshot, type Welcome } from "../src/table/contract.js";
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

  /** Кто слушает поток операций — журнал партии. */
  const opsHeard: Array<(ops: readonly Op[]) => void> = [];

  /**
   * ТЕМП ПОКАЗА ЧУЖИХ ХОДОВ.
   *
   * Стол шлёт ходы так быстро, как они случились, и два хода, разделённые на сервере секундой,
   * сливались на экране в один кадр: семёрка исчезла, валет появился, а реплика «беру» пришла
   * после. Человек видел не партию, а подмену — и не мог сказать, кто что сделал.
   *
   * Поэтому ЧУЖИЕ ходы встают в очередь и показываются по одному, не чаще такта. СВОИ показываются
   * мгновенно: собственный палец ждать не должен.
   *
   * Отставать бесконечно очередь не может: набежала толпа — такт сжимается, и стол догоняет.
   */
  const BEAT_MS = 700;
  const HURRY_AT = 4;
  const очередь: Patch[] = [];
  let показано = 0;
  let тикер: ReturnType<typeof setTimeout> | undefined;

  /** Мой ли это жест: хоть одна карта в патче двигалась моей рукой. */
  const мой = (patch: Patch): boolean =>
    welcome !== null && patch.ops.some((op) => (op.t === "move" || op.t === "turn") && op.trail?.by === welcome!.you.key);

  const применить = (patch: Patch) => {
    if (!state) return;
    if (patch.v <= state.v) return;
    if (needsSync(state, patch)) return void fresh.gap(Date.now());
    state = applyPatch(state, patch);
    показано = Date.now();
    stillHeld();
    tell();
    for (const heard of opsHeard) heard(patch.ops);
  };

  const качать = () => {
    тикер = undefined;
    const patch = очередь[0];
    if (patch === undefined) return;
    // Толпа накопилась — показываем без пауз, пока не разгребём: отставший стол хуже слитных ходов.
    const такт = очередь.length >= HURRY_AT ? 0 : BEAT_MS;
    const ждать = такт - (Date.now() - показано);
    if (ждать > 0) {
      тикер = setTimeout(качать, ждать);
      return;
    }
    очередь.shift();
    применить(patch);
    if (очередь.length > 0) тикер = setTimeout(качать, 0);
  };

  const take = (patch: Patch) => {
    if (!state) return void early.push(patch);
    // СВОЁ — СРАЗУ, и очередь при этом не ломается: всё, что уже ждёт, показывается перед ним.
    if (мой(patch)) {
      while (очередь.length > 0) применить(очередь.shift()!);
      return void применить(patch);
    }
    очередь.push(patch);
    if (тикер === undefined) качать();
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
    // СВЕЖЕСТЬ МЕРЯЕТСЯ ПОЛУЧЕННЫМ, А НЕ ПОКАЗАННЫМ. Очередь показа нарочно держит ходы по одному, и
    // считать эту задержку отставанием значило бы гнать стол на пересинхронизацию на ровном месте.
    const принято = очередь.length > 0 ? очередь[очередь.length - 1]!.v : (state?.v ?? 0);
    if (state && Number.isFinite(pulse?.v)) fresh.pulse(pulse.v, принято, Date.now());
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
    get deals() {
      return welcome!.deals ?? (Object.keys(DEAL_PRESETS) as DealRule[]);
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
    onOps: (listener) => opsHeard.push(listener),
    get recent() {
      return welcome?.recent ?? [];
    },
    onMinds: (listener) => listen<Minds>(MSG.minds, listener),
    onGone: (listener) => void gone.push(listener),
    onLink: (listener) => void linked.push(listener),
  };
}
