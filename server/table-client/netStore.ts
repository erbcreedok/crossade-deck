// СТОЛ ИЗ СЕТИ — комната Colyseus, в которую входят подписанным id и одной из дверей.
//
// Снимок приходит один раз (`welcome`), дальше — только дифы. Диф не следующей версии значит, что
// что-то потерялось по дороге: клиент не угадывает, а просит стол целиком (`sync`).

import { Client } from "colyseus.js";
import { MSG, TABLE_ROOM, type Carry, type CarryOut, type Intent, type JoinOptions, type Patch, type Refused, type Snapshot, type Welcome } from "../src/table/contract.js";
import { applyPatch, needsSync } from "../src/table/patch.js";
import type { TableStore } from "./store.js";

export async function netStore(options: JoinOptions): Promise<TableStore> {
  const endpoint = location.origin.replace(/^http/, "ws");
  const room = await new Client(endpoint).joinOrCreate(TABLE_ROOM, options);

  const changed: (() => void)[] = [];
  const refused: ((intent: Intent, why: Refused["why"]) => void)[] = [];
  let state: Snapshot | null = null;
  let welcome: Welcome | null = null;
  let asked = false;
  const early: Patch[] = [];
  /** Чужие пальцы в воздухе — по id карты. Держится, пока карта заблокирована тем же человеком. */
  let carries = new Map<string, Carry>();
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
  room.onMessage(MSG.refused, (msg: Refused) => {
    for (const listener of refused) listener(msg.intent, msg.why);
  });

  const first = new Promise<Welcome>((resolve) => {
    room.onMessage(MSG.welcome, (msg: Welcome) => {
      welcome = msg;
      state = msg.snapshot;
      carries = new Map((msg.carries ?? []).map((c) => [c.id, c]));
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
    carry: (out: CarryOut) => room.send(MSG.carry, out),
    onChange: (listener) => void changed.push(listener),
    onRefused: (listener) => void refused.push(listener),
    onGone: (listener) => void room.onLeave(() => listener()),
  };
}
