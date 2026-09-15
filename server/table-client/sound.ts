// ЗВУК СТОЛА — записи Kenney «Casino Audio» (CC0, `sounds/LICENSE-kenney-casino-audio.txt`), по месту на экране.
//
// Слушатель — камера: что левее середины экрана, звучит слева; что ниже середины (ближе к себе, «за спиной»
// камеры) — сзади, что выше — спереди. Это `PannerNode` с HRTF: в наушниках перед и зад различимы, в динамике
// телефона остаётся лево-право. Чужое звучит тише своего.
//
// Браузер не даёт играть звук до первого касания — контекст будится на первом `pointerdown`.

import type { CueKind } from "../src/table/cues.js";
import { HOST } from "./host.js";

// Файлы: drop — card-place-1, turn — card-place-2, hand — card-slide-1, merge — card-fan-1, shuffle — card-shuffle,
// gather — card-shove-1/2/4.
const FILES = { drop: 1, hand: 1, turn: 1, gather: 3, merge: 1, shuffle: 1 } as const;
/** Какой файл на какой повод: в руку — стук (place-1), из руки на сукно — скольжение (slide-1). */
export const SOUND_OF: Record<CueKind, keyof typeof FILES> = { drop: "drop", hand: "drop", out: "hand", turn: "turn", gather: "gather", merge: "merge", shuffle: "shuffle" };
/** Громкость своего и чужого. */
export const GAIN = { mine: 1, other: 0.6 } as const;

const KEY = "crossade.table.sound";
/** Громкость — лесенкой: 0…100 шагом `VOLUME_STEP`. */
export const VOLUME_STEP = 10;

export interface SoundPrefs {
  volume: number;
  muted: boolean;
  /** Объёмный звук: лево-право и перед-зад по месту на экране. Выключен — всё посередине. */
  spatial: boolean;
}

export function readSoundPrefs(): SoundPrefs {
  const plain: SoundPrefs = { volume: 100, muted: false, spatial: true };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "off") return { ...plain, muted: true };
    const o = JSON.parse(raw ?? "null") as Partial<SoundPrefs> | null;
    if (!o || typeof o !== "object") return plain;
    const volume = typeof o.volume === "number" ? Math.max(0, Math.min(100, Math.round(o.volume / VOLUME_STEP) * VOLUME_STEP)) : plain.volume;
    return { volume, muted: o.muted === true, spatial: o.spatial !== false };
  } catch {
    return plain;
  }
}

export function writeSoundPrefs(prefs: SoundPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Нет хранилища — живёт, пока открыт экран.
  }
}

export interface Played {
  kind: CueKind;
  file: string;
  /** Где звук: −1 слева … 1 справа; −1 спереди (верх экрана) … 1 сзади (низ). */
  x: number;
  z: number;
  gain: number;
  cutMs?: number;
}

export interface TableSound {
  prefs: SoundPrefs;
  /** Слышно ли хоть что-то: не заглушено и громкость больше нуля. */
  readonly on: boolean;
  save(): void;
  /** `x`, `z` — место на экране в долях от середины (см. `Played`). */
  /** `cutMs` — звук обрывается, когда кончилась анимация, которую он озвучивает. */
  play(kind: CueKind, x: number, z: number, mine: boolean, cutMs?: number): void;
}

export function tableSound(): TableSound {
  let ctx: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const log: Played[] = ((globalThis as { __tableSounds?: Played[] }).__tableSounds = []);

  const wake = () => {
    // Выключенный звук не будит аудио вовсе: открытая аудиосессия iOS может глушить вибрацию.
    if (!sound.on) return;
    if (!ctx) {
      const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      for (const [kind, n] of Object.entries(FILES)) for (let i = 1; i <= n; i += 1) load(`${kind}-${i}`);
    }
    if (ctx.state === "suspended") void ctx.resume();
  };
  const load = (name: string) => {
    fetch(`${HOST}/table/sounds/${name}.m4a`)
      .then((r) => r.arrayBuffer())
      .then((bytes) => ctx!.decodeAudioData(bytes))
      .then((buf) => void buffers.set(name, buf))
      .catch(() => {});
  };
  addEventListener("pointerdown", wake, { capture: true });

  const sound: TableSound = {
    prefs: readSoundPrefs(),
    get on() {
      return !sound.prefs.muted && sound.prefs.volume > 0;
    },
    save: () => writeSoundPrefs(sound.prefs),
    play(kind, x, z, mine, cutMs) {
      if (!sound.on) return;
      const gain = (mine ? GAIN.mine : GAIN.other) * (sound.prefs.volume / 100);
      if (!sound.prefs.spatial) x = z = 0;
      const file = SOUND_OF[kind];
      log.push({ kind, file, x: +x.toFixed(2), z: +z.toFixed(2), gain, ...(cutMs ? { cutMs } : {}) });
      if (log.length > 50) log.shift();
      const buf = buffers.get(`${file}-${1 + Math.floor(Math.random() * FILES[file])}`);
      if (!ctx || !buf || ctx.state !== "running") return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
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
      if (sound.prefs.spatial) src.connect(vol).connect(pan).connect(ctx.destination);
      else src.connect(vol).connect(ctx.destination);
      src.start();
      if (cutMs) {
        // Обрыв с хвостом в 15 мс — без щелчка.
        const end = ctx.currentTime + cutMs / 1000;
        vol.gain.setValueAtTime(gain, end - 0.015);
        vol.gain.linearRampToValueAtTime(0, end);
        src.stop(end);
      }
    },
  };
  return sound;
}
