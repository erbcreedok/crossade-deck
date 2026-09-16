// ЖИВОЙ ГОЛОС НА ЭТОМ УСТРОЙСТВЕ — микрофон кусками наружу и чужие куски в уши, без хранения.
//
// Речь идёт ровно пока палец наведён на сукно или на стул: `aim` ставит адресата, `aim(null)` — молчание.
// Сказанное мимо наводки НЕ КОПИТСЯ: живой разговор, догонять нечем.
//
// ЧУЖУЮ РЕЧЬ НЕЛЬЗЯ ИГРАТЬ ПО ПРИХОДУ КУСКА: сеть приносит их неровно, и стык был бы слышен щелчком. Каждый
// кусок ставится в очередь СВОЕГО говорящего и звучит ровно там, где кончился прошлый, — а пока копится
// `JITTER_MS`, не звучит вовсе. Отстал больше, чем на `LATE_MS`, — догоняем, а не тянем хвост.

import { floatsOf, LIVE_FRAME, LIVE_FRAME_MS, LIVE_RATE, resample, shortsOf } from "../src/table/live.js";
import { holdAudio, type TableSound } from "./sound.js";

/** Сколько речи копим, прежде чем открыть рот: меньше — быстрее, но слышны дыры. */
const JITTER_MS = 180;
/** Отстали от живого больше — бросаем накопленное и начинаем с сейчас. */
const LATE_MS = 900;

export interface LiveClip {
  by: string;
  seq: number;
  bytes: Uint8Array;
}

export interface TableLive {
  /** Есть ли микрофон у этого устройства вообще. */
  readonly able: boolean;
  /** Кто сейчас звучит — по нему пульсирует аватар; `null` — тишина. */
  readonly speaking: string | null;
  /** Насколько громко звучит сейчас, 0…1. */
  readonly loudness: number;
  /** Открыть микрофон. `false` — нечем или не дали. Речь наружу не идёт, пока не наведён. */
  open(send: (frame: { seq: number; bytes: Uint8Array; to?: string }) => void): Promise<boolean>;
  /** Куда говорю прямо сейчас: `undefined` — всему столу, ключ — лично ему, `null` — никуда. */
  aim(to: string | null | undefined): void;
  /** Закрыть микрофон: дорожка гаснет, счётчик кусков обнуляется. */
  close(): void;
  /** Чужой кусок — в очередь его говорящего. */
  hear(clip: LiveClip, where: () => { x: number; z: number }): void;
  /** Замолчал: очередь этого человека догорает и гаснет. */
  hush(by: string): void;
  onChange(fn: () => void): void;
}

export function tableLive(sound: TableSound, host = ""): TableLive {
  // ЖУРНАЛ ДЛЯ ПРОГОНОВ: безголовый браузер речи не слышит, и правда о ней — только здесь.
  const log = { sent: 0, heard: 0, to: null as string | null | undefined };
  (globalThis as { __tableLive?: unknown }).__tableLive = log;
  const listeners: (() => void)[] = [];
  const tell = () => {
    for (const fn of listeners) fn();
  };
  let ctx: AudioContext | null = null;
  const audio = () => {
    if (!ctx) {
      const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = Ctx ? new Ctx() : null;
      if (ctx) holdAudio(ctx);
    }
    if (ctx?.state === "suspended") void ctx.resume();
    return ctx;
  };

  // МОЙ МИКРОФОН.
  let stream: MediaStream | null = null;
  let node: AudioWorkletNode | null = null;
  let aimed: string | null | undefined = null;
  let seq = 0;

  // ЧУЖИЕ ГОЛОСА — по очереди на каждого: у кого своя нить времени.
  const mouths = new Map<string, { next: number; gain: GainNode; meter: AnalyserNode; alive: number }>();
  let speaking: string | null = null;
  let loudness = 0;

  const watch = () => {
    let loud = 0, who: string | null = null;
    const now = audio()?.currentTime ?? 0;
    for (const [by, mouth] of mouths) {
      if (mouth.next < now - 0.1 && mouth.alive < now) {
        mouth.gain.disconnect();
        mouths.delete(by);
        continue;
      }
      const data = new Uint8Array(mouth.meter.frequencyBinCount);
      mouth.meter.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      if (peak > loud) {
        loud = peak;
        who = by;
      }
    }
    if (who !== speaking || Math.abs(loud - loudness) > 0.02) {
      speaking = who;
      loudness = loud;
      tell();
    }
    if (mouths.size > 0) requestAnimationFrame(watch);
    else if (speaking !== null) {
      speaking = null;
      loudness = 0;
      tell();
    }
  };

  const live: TableLive = {
    get able() {
      return Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioWorkletNode === "function";
    },
    get speaking() {
      return speaking;
    },
    get loudness() {
      return loudness;
    },
    async open(send) {
      if (!live.able) return false;
      const ac = audio();
      if (!ac) return false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        await ac.audioWorklet.addModule(`${host}/table/live-worklet.js`);
      } catch {
        live.close();
        return false;
      }
      // Пока звали микрофон, палец мог уже отпустить кнопку.
      if (!stream) return false;
      seq = 0;
      const size = Math.round((ac.sampleRate * LIVE_FRAME_MS) / 1000);
      node = new AudioWorkletNode(ac, "live-mic", { processorOptions: { size }, numberOfOutputs: 0 });
      node.port.onmessage = (e) => {
        // НЕ НАВЕДЁН — речь пропадает: наводка решает, кому говоришь, а не «куда сложить сказанное».
        if (aimed === null) return;
        const floats = resample(floatsOf(new Uint8Array((e.data as Int16Array).buffer)), ac.sampleRate, LIVE_RATE);
        log.sent += 1;
        send({ seq: seq++, bytes: shortsOf(floats), ...(aimed ? { to: aimed } : {}) });
      };
      ac.createMediaStreamSource(stream).connect(node);
      return true;
    },
    aim(to) {
      aimed = to;
      log.to = to;
    },
    close() {
      aimed = null;
      node?.port.close();
      node?.disconnect();
      node = null;
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
    },
    hear(clip, where) {
      log.heard += 1;
      const gain = sound.voiceGain(false);
      const ac = gain > 0 ? audio() : null;
      if (!ac) return;
      const floats = floatsOf(clip.bytes);
      const buf = ac.createBuffer(1, floats.length, LIVE_RATE);
      buf.getChannelData(0).set(floats);
      let mouth = mouths.get(clip.by);
      if (!mouth) {
        const vol = ac.createGain();
        vol.gain.value = gain;
        const meter = ac.createAnalyser();
        meter.fftSize = 256;
        let chain: AudioNode = vol.connect(meter);
        if (sound.prefs.spatial) {
          const at = where();
          const pan = ac.createPanner();
          pan.panningModel = "HRTF";
          pan.distanceModel = "inverse";
          pan.refDistance = 1;
          pan.rolloffFactor = 0.25;
          const px = Math.max(-1, Math.min(1, at.x)) * 2, pz = Math.max(-1, Math.min(1, at.z)) * 2;
          if (pan.positionX) {
            pan.positionX.value = px;
            pan.positionY.value = 0;
            pan.positionZ.value = pz;
          } else pan.setPosition(px, 0, pz);
          chain.connect(pan).connect(ac.destination);
        } else chain.connect(ac.destination);
        mouth = { next: ac.currentTime + JITTER_MS / 1000, gain: vol, meter, alive: 0 };
        mouths.set(clip.by, mouth);
        if (mouths.size === 1) requestAnimationFrame(watch);
      }
      // Отстали — бросаем накопленное отставание и говорим с «сейчас», иначе хвост растёт и не сходится.
      if (mouth.next < ac.currentTime || mouth.next > ac.currentTime + LATE_MS / 1000) {
        mouth.next = ac.currentTime + JITTER_MS / 1000;
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(mouth.gain);
      src.start(mouth.next);
      mouth.next += buf.duration;
      mouth.alive = mouth.next;
    },
    hush(by) {
      const mouth = mouths.get(by);
      // Гасим не сейчас, а когда догорит уже поставленное: обрыв на полуслове слышен щелчком.
      if (mouth) mouth.alive = mouth.next;
    },
    onChange: (fn) => void listeners.push(fn),
  };
  return live;
}

export { LIVE_FRAME };
