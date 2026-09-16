// ГОЛОСОВЫЕ — как палец в воздухе: поток мимо версий и истории стола, и НИГДЕ НЕ ХРАНИТСЯ. Сервер только
// пересылает запись тем, кто сейчас за столом; переслушать её потом нельзя ни у кого.
//
// Жест записи нарочно длинный (зажать кнопку, дотянуть до микрофона, бросить на стол), и сверх него стоит
// предел: не больше `VOICE_MAX` записей за `VOICE_WINDOW_MS` от человека. Клиент не даёт начать, сервер режет —
// у всех одна и та же правда.

/** Дольше записывать нельзя: запись встаёт и ждёт броска или отпускания. */
export const VOICE_MAX_MS = 6000;
/** Шесть секунд речи в opus — десятки килобайт; всё, что толще, не от нашего клиента. */
export const VOICE_MAX_BYTES = 200_000;
export const VOICE_MAX = 2;
export const VOICE_WINDOW_MS = 20_000;

/** Клиент → сервер: запись целиком. Сервер → остальным: она же, с автором. */
export interface VoiceOut {
  /** Сколько миллисекунд записано — по нему зритель рисует пульс, не дожидаясь разбора звука. */
  ms: number;
  bytes: ArrayBuffer | Uint8Array;
  /** Кому лично: ключ человека, на чей стул бросили. Пусто — слышно всем за столом. */
  to?: string;
}
export interface Voice extends VoiceOut {
  by: string;
}

/** Клиент → сервер: начал или кончил писать. Сервер → остальным: он же, с автором. */
export interface MicOut {
  on: boolean;
}
export interface Mic extends MicOut {
  by: string;
}

/**
 * БАЙТЫ ИЗ СЕТИ. Colyseus кладёт их в сообщение как обычный объект с числовыми ключами (`{0:1,1:2,…}`),
 * а не как `Uint8Array` — поэтому одной проверки `instanceof` мало, и запись молча пропадала.
 */
export const bytesOf = (raw: unknown): Uint8Array | null => {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Array.isArray(raw) && raw.every((n) => typeof n === "number")) return Uint8Array.from(raw);
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown> & { data?: unknown };
    if (Array.isArray(o.data)) return bytesOf(o.data);
    const keys = Object.keys(o);
    if (keys.length > 0 && keys.every((k) => /^[0-9]+$/.test(k) && typeof o[k] === "number")) {
      const out = new Uint8Array(keys.length);
      for (const k of keys) out[Number(k)] = o[k] as number;
      return out;
    }
  }
  return null;
};

/** Разбор записи из сети: известная длина и вес не больше предела. */
export function cleanVoice(raw: unknown): { ms: number; bytes: Uint8Array; to?: string } | null {
  const out = (raw ?? {}) as Partial<VoiceOut>;
  const bytes = bytesOf(out.bytes);
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > VOICE_MAX_BYTES) return null;
  const ms = typeof out.ms === "number" && out.ms > 0 ? Math.min(VOICE_MAX_MS, Math.round(out.ms)) : VOICE_MAX_MS;
  const to = typeof out.to === "string" && out.to && out.to.length <= 64 ? out.to : undefined;
  return { ms, bytes, ...(to ? { to } : {}) };
}

export const cleanMic = (raw: unknown): MicOut | null => {
  const out = (raw ?? {}) as Partial<MicOut>;
  return typeof out.on === "boolean" ? { on: out.on } : null;
};

/** Сколько голосовых человек уже отправил за окно — и можно ли ещё. */
export class Voices {
  private byWho = new Map<string, number[]>();

  private live(by: string, now: number): number[] {
    const list = (this.byWho.get(by) ?? []).filter((t) => now - t < VOICE_WINDOW_MS);
    this.byWho.set(by, list);
    return list;
  }

  /** Сколько записей ещё можно сейчас. */
  free(by: string, now: number): number {
    return VOICE_MAX - this.live(by, now).length;
  }

  /** Занять слот: `false` — предел, запись не уходит никуда. */
  send(by: string, now: number): boolean {
    const list = this.live(by, now);
    if (list.length >= VOICE_MAX) return false;
    list.push(now);
    return true;
  }

  forget(by: string): void {
    this.byWho.delete(by);
  }
}
