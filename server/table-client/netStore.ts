// СТОЛ ИЗ СЕТИ — комната Colyseus, в которую входят подписанным id и одной из дверей.
//
// Снимок приходит один раз (`welcome`), дальше — только дифы. Диф не следующей версии значит, что
// что-то потерялось по дороге: клиент не угадывает, а просит стол целиком (`sync`).

import { Client } from "colyseus.js";
import { MSG, TABLE_ROOM, type Carry, type CarryOut, type Intent, type JoinOptions, type Patch, type Refused, type Snapshot, type Welcome } from "../src/table/contract.js";
import { applyPatch, needsSync } from "../src/table/patch.js";
import type { Eye } from "../src/table/eyes.js";
import type { Say, SayOut, Shot, ShotOut } from "../src/table/say.js";
import type { TableStore } from "./store.js";
import { HOST } from "./host.js";

export async function netStore(options: JoinOptions): Promise<TableStore> {
  const endpoint = HOST.replace(/^http/, "ws");
  const room = await new Client(endpoint).joinOrCreate(TABLE_ROOM, options);

  const changed: (() => void)[] = [];
  const refused: ((intent: Intent, why: Refused["why"]) => void)[] = [];
  let state: Snapshot | null = null;
  let welcome: Welcome | null = null;
  let asked = false;
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

  const take = (patch: Patch) => {
    if (!state) return void early.push(patch);
    if (patch.v <= state.v) return;
    if (needsSync(state, patch)) {
      if (!asked) room.send(MSG.intent, { t: "sync" } satisfies Intent);
      asked = true;
      return;
    }
    state = applyPatch(state, patch);
    stillHeld();
    tell();
  };

  room.onMessage(MSG.patch, take);
  room.onMessage(MSG.carry, (c: Carry) => {
    // Пришёл раньше своей блокировки или позже её снятия — не показывается.
    if (!state || state.locks[c.id] !== c.by) return;
    carries.set(c.id, c);
    tell();
  });
  const said: ((say: Say) => void)[] = [];
  room.onMessage(MSG.eyes, (all: Eye[]) => {
    eyes = Array.isArray(all) ? all : [];
    tell();
  });
  room.onMessage(MSG.say, (say: Say) => {
    for (const listener of said) listener(say);
  });
  room.onMessage(MSG.refused, (msg: Refused) => {
    for (const listener of refused) listener(msg.intent, msg.why);
  });

  const first = new Promise<Welcome>((resolve) => {
    room.onMessage(MSG.welcome, (msg: Welcome) => {
      welcome = msg;
      if (Number.isFinite(msg.now)) skew = msg.now - Date.now();
      state = msg.snapshot;
      carries = new Map((msg.carries ?? []).map((c) => [c.id, c]));
      eyes = msg.eyes ?? [];
      stillHeld();
      asked = false;
      // Дифы, пришедшие раньше снимка, догоняются по порядку; старше снимка — выбрасываются.
      for (const patch of early.splice(0)) take(patch);
      resolve(msg);
      tell();
    });
  });
  room.send(MSG.hello);
  await first;

  return {
    get me() {
      return welcome!.you;
    },
    get title() {
      return welcome!.title;
    },
    get state() {
      return state!;
    },
    send: (intent) => room.send(MSG.intent, intent),
    get carries() {
      return [...carries.values()];
    },
    get eyes() {
      return eyes;
    },
    watch: (spots) => room.send(MSG.eyes, { spots }),
    carry: (out: CarryOut) => room.send(MSG.carry, out),
    command: (command) => room.send(MSG.command, command),
    live: (out) => room.send(MSG.live, out),
    onLive: (listener) => void room.onMessage(MSG.live, (clip: { by: string; seq: number; bytes: Uint8Array }) => listener(clip)),
    mic: (on) => room.send(MSG.mic, { on }),
    onMic: (listener) => void room.onMessage(MSG.mic, (mic: { by: string; on: boolean }) => listener(mic)),
    say: (out: SayOut) => room.send(MSG.say, out),
    onSay: (listener) => void said.push(listener),
    askStickers: () => room.send(MSG.stickers, {}),
    shoot: (out: ShotOut) => room.send(MSG.shot, out),
    onShot: (listener) => void room.onMessage(MSG.shot, (shot: Shot) => listener(shot)),
    onStickers: (listener) => void room.onMessage(MSG.stickers, (ids: string[]) => listener(ids)),
    now: () => Date.now() + skew,
    onChange: (listener) => void changed.push(listener),
    onRefused: (listener) => void refused.push(listener),
    onGone: (listener) => void room.onLeave(() => listener()),
  };
}
