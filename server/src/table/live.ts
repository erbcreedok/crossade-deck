// ЖИВОЙ ГОЛОС — речь идёт кусками, пока палец держит кнопку, и звучит у остальных сразу. Как и запись, он
// НИГДЕ НЕ ХРАНИТСЯ: сервер пересылает кусок тем, кто сейчас за столом, и забывает его.
//
// Почему не `MediaRecorder`, которым сделана запись: он режет поток на куски, из которых сам по себе
// разбирается только ПЕРВЫЙ — в нём заголовок, — а `decodeAudioData` берёт только самостоятельный кусок.
// Поэтому кусок здесь — не сжатый файл, а сырые отсчёты: `LIVE_RATE` герц, моно, знаковые 16 бит. Их не надо
// разбирать вовсе, они кладутся в `AudioBuffer` как есть.
//
// КУДА ИДЁТ РЕЧЬ, РЕШАЕТ ПАЛЕЦ, ПОКА ГОВОРИШЬ: наведён на сукно — слышно всем, на стул — только тому, кто на
// нём сидит, ни на что — не слышно никому и нигде не копится. Поэтому у куска есть адресат, как у записи.
//
// ПОТОК — НЕ ПОСЫЛКА, и закон у него свой. Предел записи («две за двадцать секунд») тут не годится: кусков
// идут десятки в секунду. Вместо него — сколько кусков в секунду человек вправе прислать, и сколько подряд
// он может говорить, чтобы забытая в кармане кнопка не вещала часами.

/** Отсчётов в секунду. Речи хватает с избытком, а весит вчетверо меньше студийных 44 100. */
export const LIVE_RATE = 16000;
/** Сколько речи в одном куске: меньше — дробнее задержка, больше — реже посылки. */
export const LIVE_FRAME_MS = 120;
/** Столько отсчётов в куске, и вдвое больше байт: знаковые 16 бит. */
export const LIVE_FRAME = (LIVE_RATE * LIVE_FRAME_MS) / 1000;
/** Кусок толще — не от нашего клиента: запас вдвое на случай, если он шлёт реже и длиннее. */
export const LIVE_MAX_BYTES = LIVE_FRAME * 2 * 2;
/** Больше кусков в секунду от человека не принимаем: при `LIVE_FRAME_MS` их выходит около восьми. */
export const LIVE_FRAMES_PER_SEC = 16;
/** Дольше говорить подряд нельзя: кнопка, забытая нажатой, замолкает сама. */
export const LIVE_MAX_MS = 60_000;

/** Клиент → сервер: кусок речи. Сервер → остальным: он же, с автором. */
export interface LiveOut {
  /** Номер куска по порядку от начала речи: по нему слышно пропажу и слышен новый заход. */
  seq: number;
  bytes: ArrayBuffer | Uint8Array;
  /** Кому лично: ключ человека, на чей стул наведён микрофон. Пусто — слышно всем за столом. */
  to?: string;
}
export interface Live extends LiveOut {
  by: string;
}

import { bytesOf } from "./voice.js";

/** Разбор куска из сети: номер по порядку и вес не больше предела. */
export function cleanLive(raw: unknown): { seq: number; bytes: Uint8Array; to?: string } | null {
  const out = (raw ?? {}) as Partial<LiveOut>;
  const bytes = bytesOf(out.bytes);
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > LIVE_MAX_BYTES) return null;
  // Нечётная длина — это не знаковые 16 бит, а что-то чужое.
  if (bytes.byteLength % 2 !== 0) return null;
  if (typeof out.seq !== "number" || !Number.isInteger(out.seq) || out.seq < 0) return null;
  const to = typeof out.to === "string" && out.to && out.to.length <= 64 ? out.to : undefined;
  return { seq: out.seq, bytes, ...(to ? { to } : {}) };
}

/**
 * КТО СКОЛЬКО ГОВОРИТ. Слово никто не отбирает: говорить разом вправе все. Считается только поток каждого —
 * сколько кусков в секунду и как долго подряд, — и лишнее молча не пересылается.
 */
export class LiveTalk {
  private byWho = new Map<string, { frames: number[]; from: number }>();

  /** Пропустить кусок: `false` — шлёт чаще, чем вправе, или говорит дольше предела. */
  take(by: string, now: number): boolean {
    const had = this.byWho.get(by);
    // Секунда тишины — речь считается новой, и время подряд отсчитывается заново.
    const fresh = !had || now - (had.frames[had.frames.length - 1] ?? 0) > 1000;
    const one = fresh ? { frames: [], from: now } : had!;
    this.byWho.set(by, one);
    if (now - one.from > LIVE_MAX_MS) return false;
    one.frames = one.frames.filter((t) => now - t < 1000);
    if (one.frames.length >= LIVE_FRAMES_PER_SEC) return false;
    one.frames.push(now);
    return true;
  }

  forget(by: string): void {
    this.byWho.delete(by);
  }
}

/** Знаковые 16 бит обратно в доли -1…1, как их держит `AudioBuffer`. */
export function floatsOf(bytes: Uint8Array): Float32Array {
  const n = bytes.byteLength >> 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

/**
 * Пересчёт частоты — линейно, по соседним отсчётам. Микрофон отдаёт на частоте звукового потока (48 000 у
 * телефона), а по сети ходит `LIVE_RATE`: без пересчёта та сторона услышала бы ускоренную речь.
 */
export function resample(from: Float32Array, rate: number, to: number): Float32Array {
  if (Math.abs(rate - to) < 1) return from;
  const out = new Float32Array(Math.max(1, Math.round((from.length * to) / rate)));
  const step = from.length / out.length;
  for (let i = 0; i < out.length; i += 1) {
    const at = i * step;
    const left = Math.floor(at);
    const right = Math.min(from.length - 1, left + 1);
    out[i] = from[left]! + (from[right]! - from[left]!) * (at - left);
  }
  return out;
}

export const shortsOf = (floats: Float32Array): Uint8Array => {
  const out = new Uint8Array(floats.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < floats.length; i += 1) {
    const v = Math.max(-1, Math.min(1, floats[i]!));
    view.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return out;
};

/**
 * ОДНО УХО НА ЧЕЛОВЕКА. Стол нарочно пускает одного человека с нескольких устройств — и это правильно для
 * карт. Но живая речь, разосланная в каждое окно, звучит у него столько раз, сколько окон открыто, со
 * сдвигом в доли секунды: слышится как эхо, и виноватым выглядит говорящий.
 *
 * Слушает ПОСЛЕДНЕЕ пришедшее окно: человек ушёл в новое, а старое осталось висеть в фоне — говорить надо
 * туда, куда он смотрит.
 */
export function ear(sessions: readonly string[]): string | null {
  return sessions.length === 0 ? null : sessions[sessions.length - 1]!;
}

/** Сколько речи копим, прежде чем открыть рот, и докуда растём, если сеть рвёт. */
export const JITTER_MIN = 0.18, JITTER_MAX = 0.6;
/** Очередь длиннее — мы отстали безнадёжно: бросаем поставленное и начинаем с «сейчас». */
export const LATE = 0.9;

export interface Mouth {
  /** Время, на которое поставлен следующий кусок, в часах звукового потока. */
  next: number;
  /** Сколько сейчас копим: растёт, когда речь рвётся, и не падает обратно до конца речи. */
  jitter: number;
}

/**
 * КУДА ПОСТАВИТЬ КУСОК. Куски приходят неровно, и вся слышимость держится на этом расчёте:
 *
 * — кусок встаёт ВПЛОТНУЮ за прошлым, иначе на стыке щелчок;
 * — речь кончилась и началась заново (`fresh`) — копим заново;
 * — прошлый уже отзвучал, а новый только пришёл (`next <= now`) — это дыра: копим ДОЛЬШЕ, чтобы не рваться
 *   на каждом чихе сети, до `JITTER_MAX`;
 * — очередь разрослась больше `LATE` — мы безнадёжно отстали; тогда `flush`: поставленное впрок надо СНЯТЬ,
 *   а не просто переставить часы. Без снятия старые куски продолжают звучать поверх новых — это и слышно
 *   как эхо и наложение.
 */
export function schedule(was: Mouth, now: number, dur: number, fresh = false): { at: number; flush: boolean; mouth: Mouth } {
  let { next, jitter } = was;
  let flush = false;
  if (fresh) {
    flush = true;
    next = now + jitter;
  } else if (next <= now) {
    jitter = Math.min(JITTER_MAX, jitter * 1.5);
    next = now + jitter;
  } else if (next > now + LATE) {
    flush = true;
    next = now + jitter;
  }
  return { at: next, flush, mouth: { next: next + dur, jitter } };
}

/**
 * ОТСЧЁТЫ ИЗ СЕТИ — единственная дверь на приёме. Colyseus кладёт байты обычным объектом с числовыми
 * ключами, а не `Uint8Array`: у такого нет ни `buffer`, ни `byteOffset`, и разбор молча падал. Той же
 * ценой мы однажды заплатили за голосовые — поэтому дверь одна и с проверкой.
 */
export function samplesOf(raw: unknown): Float32Array | null {
  const bytes = bytesOf(raw);
  if (!bytes || bytes.byteLength < 2) return null;
  return floatsOf(bytes);
}

/**
 * СЧЁТ ЖИВОЙ РЕЧИ — сколько кусков дошло до сервера, сколько он разобрал и сколько разослал. Речь идёт мимо
 * истории стола, и когда её не слышно, спросить нечего: эти три числа отвечают, на чьей стороне обрыв.
 */
export const liveTally = { got: 0, bad: 0, sent: 0, last: 0 };
