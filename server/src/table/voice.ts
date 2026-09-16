// МИКРОФОН — кто сейчас говорит. Сама речь идёт кусками (`live.ts`) и нигде не хранится; здесь только весть
// «начал/кончил» и разбор байтов из сети, общий для обоих.

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

export const cleanMic = (raw: unknown): MicOut | null => {
  const out = (raw ?? {}) as Partial<MicOut>;
  return typeof out.on === "boolean" ? { on: out.on } : null;
};
