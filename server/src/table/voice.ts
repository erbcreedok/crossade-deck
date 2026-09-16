// МИКРОФОН — кто сейчас говорит. Сама речь идёт кусками (`live.ts`) и нигде не хранится; здесь только весть
// «начал/кончил» и разбор байтов из сети, общий для обоих.

/**
 * Клиент → сервер: начал или кончил писать И КОМУ. Сервер → остальным: он же, с автором.
 *
 * `to` — ключ того, кому говорят лично; его нет вовсе, когда говорят на стол. Адрес нужен не ради звука
 * (тот идёт мимо сервера и сам знает, кому), а ради картинки: каждый за столом должен видеть, куда течёт
 * чужая речь — на общее сукно или кому-то одному на ухо.
 */
export interface MicOut {
  on: boolean;
  to?: string;
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
  if (typeof out.on !== "boolean") return null;
  // МОЛЧАНИЕ АДРЕСА НЕ ИМЕЕТ, и пустая строка — не адрес: иначе выключенный микрофон нарисуют кому-то в ухо.
  if (!out.on) return { on: false };
  if (out.to === undefined) return { on: true };
  return typeof out.to === "string" && out.to.length > 0 && out.to.length <= MIC_TO_MAX ? { on: true, to: out.to } : null;
};

/** Ключ человека длиннее этого не бывает: всё, что длиннее, — не адрес, а попытка нагрузить чужой экран. */
export const MIC_TO_MAX = 64;
