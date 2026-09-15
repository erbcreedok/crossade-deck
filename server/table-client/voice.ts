// ГОЛОСОВЫЕ НА ЭТОМ УСТРОЙСТВЕ — запись микрофоном и очередь воспроизведения.
//
// Ничего не хранится: записанное уходит сразу и тут же забывается, пришедшее играется один раз. Очередь одна
// на всех: два голосовых, пришедшие разом, звучат по очереди, а не кашей. Громкость своего голоса тише чужого
// (`sound.voiceGain`), место — стул автора, как у звуков стола.

import { VOICE_MAX_MS } from "../src/table/voice.js";
import type { TableSound } from "./sound.js";

export interface VoiceClip {
  by: string;
  ms: number;
  bytes: Uint8Array;
}

export interface Recording {
  /** Остановить и получить запись; `null` — записывать было нечем или нечего. */
  stop(): Promise<{ ms: number; bytes: Uint8Array } | null>;
  /** Бросить запись: ничего не возвращается и никуда не уходит. */
  cancel(): void;
}

export interface TableVoice {
  /** Есть ли микрофон у этого устройства вообще. */
  readonly able: boolean;
  /** Кто сейчас звучит — по нему аватар пульсирует; `null` — тишина. */
  readonly speaking: string | null;
  /** Насколько громко звучит сейчас, 0…1 — на столько раздувается аватар. */
  readonly loudness: number;
  start(): Promise<Recording | null>;
  /** Поставить пришедшее в очередь; играется, когда дойдёт черёд. */
  play(clip: VoiceClip, where: () => { x: number; z: number }, mine: boolean): void;
  /** Что-то изменилось: кто говорит или насколько громко. */
  onChange(fn: () => void): void;
}

export function tableVoice(sound: TableSound): TableVoice {
  const listeners: (() => void)[] = [];
  const tell = () => {
    for (const fn of listeners) fn();
  };
  const queue: { clip: VoiceClip; where: () => { x: number; z: number }; mine: boolean }[] = [];
  let playing = false;
  let speaking: string | null = null;
  let loudness = 0;
  let ctx: AudioContext | null = null;
  const audio = () => {
    if (!ctx) {
      const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = Ctx ? new Ctx() : null;
    }
    if (ctx?.state === "suspended") void ctx.resume();
    return ctx;
  };

  async function next(): Promise<void> {
    if (playing) return;
    const one = queue.shift();
    if (!one) {
      speaking = null;
      loudness = 0;
      tell();
      return;
    }
    playing = true;
    speaking = one.clip.by;
    tell();
    const gain = sound.voiceGain(one.mine);
    const ac = gain > 0 ? audio() : null;
    const done = () => {
      playing = false;
      void next();
    };
    if (!ac) {
      // Слушать нечем или голосовые выключены — запись всё равно «проходит» очередь: пульс у всех одинаковый.
      setTimeout(done, one.clip.ms);
      return;
    }
    try {
      const copy = one.clip.bytes.slice();
      const buf = await ac.decodeAudioData(copy.buffer as ArrayBuffer);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const vol = ac.createGain();
      vol.gain.value = gain;
      // ПУЛЬС АВАТАРА — по настоящей громкости: анализатор отдаёт её кадрами, пока играет.
      const meter = ac.createAnalyser();
      meter.fftSize = 256;
      const data = new Uint8Array(meter.frequencyBinCount);
      const at = one.where();
      let chain: AudioNode = src.connect(vol);
      chain = chain.connect(meter);
      if (sound.prefs.spatial) {
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
      const pulse = () => {
        if (!playing) return;
        meter.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        loudness = peak;
        tell();
        requestAnimationFrame(pulse);
      };
      src.onended = done;
      src.start();
      requestAnimationFrame(pulse);
    } catch {
      setTimeout(done, one.clip.ms);
    }
  }

  const voice: TableVoice = {
    get able() {
      return typeof MediaRecorder === "function" && Boolean(navigator.mediaDevices?.getUserMedia);
    },
    get speaking() {
      return speaking;
    },
    get loudness() {
      return loudness;
    },
    async start() {
      if (!voice.able) return null;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return null;
      }
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => void chunks.push(e.data);
      rec.start();
      const began = performance.now();
      const shut = () => {
        for (const track of stream.getTracks()) track.stop();
      };
      return {
        async stop() {
          if (rec.state === "inactive") {
            shut();
            return null;
          }
          const ended = new Promise<void>((resolve) => void (rec.onstop = () => resolve()));
          rec.stop();
          await ended;
          shut();
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          if (blob.size === 0) return null;
          return { ms: Math.min(VOICE_MAX_MS, Math.round(performance.now() - began)), bytes: new Uint8Array(await blob.arrayBuffer()) };
        },
        cancel() {
          if (rec.state !== "inactive") {
            rec.onstop = null;
            rec.stop();
          }
          chunks.length = 0;
          shut();
        },
      };
    },
    play(clip, where, mine) {
      queue.push({ clip, where, mine });
      void next();
    },
    onChange: (fn) => void listeners.push(fn),
  };
  return voice;
}
