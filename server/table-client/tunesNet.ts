// ПРАВКИ ЧАСТЕЙ СКИНА СО СТОЛА (`/table/tunes`, `tunes.ts`): хозяин подкрутил часть на своей странице — экраны
// забирают правки при входе и раз в `TUNES_EVERY_MS`, и фигуры перерисовываются без перезахода.

import { setTunes, tunes, type Tunes } from "../src/table/tunes.js";
import { HOST } from "./host.js";

export const TUNES_EVERY_MS = 15_000;

/** Забрать правки; ответ — поменялись ли они. Стол молчит — остаются прежние, вход не ждёт дольше `wait`. */
export async function pullTunes(wait = 3_000): Promise<boolean> {
  try {
    const res = await fetch(`${HOST}/table/tunes`, { signal: AbortSignal.timeout(wait) });
    if (!res.ok) return false;
    const next = (await res.json()) as Tunes;
    if (next.at === tunes().at) return false;
    setTunes(next);
    return true;
  } catch {
    return false;
  }
}
