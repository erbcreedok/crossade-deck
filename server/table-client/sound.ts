// ЗВУК СТОЛА — записи Kenney «Casino Audio» (CC0, `sounds/LICENSE-kenney-casino-audio.txt`), по месту на экране.
//
// Слушатель — камера: что левее середины экрана, звучит слева; что ниже середины (ближе к себе, «за спиной»
// камеры) — сзади, что выше — спереди. Это `PannerNode` с HRTF: в наушниках перед и зад различимы, в динамике
// телефона остаётся лево-право. Чужое звучит тише своего.
//
// Браузер не даёт играть звук до первого касания — контекст будится на первом `pointerdown`.

import type { CueKind } from "../src/table/cues.js";

const FILES: Record<CueKind, number> = { drop: 4, hand: 3, turn: 3, gather: 3, merge: 2, shuffle: 1 };
/** Громкость своего и чужого. */
export const GAIN = { mine: 1, other: 0.6 } as const;

const ON_KEY = "crossade.table.sound";

export function readSoundOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeSoundOn(on: boolean): void {
  try {
    localStorage.setItem(ON_KEY, on ? "on" : "off");
  } catch {
    // Нет хранилища — живёт, пока открыт экран.
  }
}

export interface Played {
  kind: CueKind;
  /** Где звук: −1 слева … 1 справа; −1 спереди (верх экрана) … 1 сзади (низ). */
  x: number;
  z: number;
  gain: number;
}

export interface TableSound {
  on: boolean;
  /** `x`, `z` — место на экране в долях от середины (см. `Played`). */
  play(kind: CueKind, x: number, z: number, mine: boolean): void;
}

export function tableSound(): TableSound {
  let ctx: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const log: Played[] = ((globalThis as { __tableSounds?: Played[] }).__tableSounds = []);

  const wake = () => {
    if (!ctx) {
      const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      for (const [kind, n] of Object.entries(FILES)) for (let i = 1; i <= n; i += 1) load(`${kind}-${i}`);
    }
    if (ctx.state === "suspended") void ctx.resume();
  };
  const load = (name: string) => {
    fetch(`/table/sounds/${name}.m4a`)
      .then((r) => r.arrayBuffer())
      .then((bytes) => ctx!.decodeAudioData(bytes))
      .then((buf) => void buffers.set(name, buf))
      .catch(() => {});
  };
  addEventListener("pointerdown", wake, { capture: true });

  const sound: TableSound = {
    on: readSoundOn(),
    play(kind, x, z, mine) {
      if (!sound.on) return;
      const gain = mine ? GAIN.mine : GAIN.other;
      log.push({ kind, x: +x.toFixed(2), z: +z.toFixed(2), gain });
      if (log.length > 50) log.shift();
      const buf = buffers.get(`${kind}-${1 + Math.floor(Math.random() * FILES[kind])}`);
      if (!ctx || !buf || ctx.state !== "running") return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.95 + Math.random() * 0.1;
      const vol = ctx.createGain();
      vol.gain.value = gain;
      const pan = ctx.createPanner();
      pan.panningModel = "HRTF";
      pan.distanceModel = "inverse";
      pan.refDistance = 1;
      pan.rolloffFactor = 0.25;
      // Слушатель смотрит в −z: верх экрана — впереди, низ — позади.
      const px = Math.max(-1, Math.min(1, x)) * 2, pz = Math.max(-1, Math.min(1, z)) * 2;
      if (pan.positionX) {
        pan.positionX.value = px;
        pan.positionY.value = 0;
        pan.positionZ.value = pz;
      } else pan.setPosition(px, 0, pz);
      src.connect(vol).connect(pan).connect(ctx.destination);
      src.start();
    },
  };
  return sound;
}
