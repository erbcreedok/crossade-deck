// ЗВУК СТОЛА — записи Kenney «Casino Audio» (CC0, `sounds/LICENSE-kenney-casino-audio.txt`), по месту на экране.
//
// Слушатель — камера: что левее середины экрана, звучит слева; что ниже середины (ближе к себе, «за спиной»
// камеры) — сзади, что выше — спереди. Это `PannerNode` с HRTF: в наушниках перед и зад различимы, в динамике
// телефона остаётся лево-право. Чужое звучит тише своего.
//
// Браузер не даёт играть звук до первого касания — контекст будится на первом `pointerdown`.

import type { CueKind } from "../src/table/cues.js";
import { HOST } from "./host.js";

// Файлы: drop — card-place-1, turn — card-place-2, sort — card-place-4, hand — card-slide-1, merge — card-fan-1,
// shuffle — card-shuffle, gather — card-shove-1/2/4.
const FILES = { drop: 1, hand: 1, turn: 1, gather: 3, merge: 1, shuffle: 1, sort: 1 } as const;
/** Какой файл на какой повод: в руку — стук (place-1), из руки на сукно — скольжение (slide-1), перестановка в руке — place-4. */
export const SOUND_OF: Record<CueKind, keyof typeof FILES> = { drop: "drop", hand: "drop", out: "hand", turn: "turn", gather: "gather", merge: "merge", shuffle: "shuffle", sort: "sort", slam: "drop" };
/**
 * УДАР БРОШЕННОЙ КАРТЫ — тот же стук, но ниже, громче и с низким «бумом» под ним: своего файла нет,
 * удар собирается из стука. `rate` — во сколько раз медленнее (ниже), `gain` — во сколько громче,
 * `boom` — низкий тон удара: с какой частоты, до какой, сколько длится и какой громкости.
 */
export const SLAM = { rate: 0.72, gain: 1.8, boom: { from: 95, to: 42, ms: 140, gain: 0.9 } } as const;
/** Громкость своего и чужого. */
export const GAIN = { mine: 1, other: 0.6 } as const;
/** Голосовые: своё — фоном, чужое — в полный голос. */
export const VOICE_GAIN = { mine: 0.35, other: 1 } as const;

const KEY = "crossade.table.sound";
/** Громкость — лесенкой: 0…100 шагом `VOLUME_STEP`. */
export const VOLUME_STEP = 10;

export interface SoundPrefs {
  /** Громкость звуков стола. */
  volume: number;
  /** Без звука вообще: и стол, и голосовые. */
  muted: boolean;
  /** Отключены только звуки стола. */
  uiMuted: boolean;
  /** Отключены только голосовые. */
  voiceMuted: boolean;
  /** Громкость голосовых — своим ползунком. */
  voiceVolume: number;
  /** Объёмный звук: лево-право и перед-зад по месту на экране. Выключен — всё посередине. */
  spatial: boolean;
}

export function readSoundPrefs(): SoundPrefs {
  const plain: SoundPrefs = { volume: 100, muted: false, uiMuted: false, voiceMuted: false, voiceVolume: 100, spatial: true };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "off") return { ...plain, muted: true };
    const o = JSON.parse(raw ?? "null") as Partial<SoundPrefs> | null;
    if (!o || typeof o !== "object") return plain;
    const step = (v: unknown, or: number) => (typeof v === "number" ? Math.max(0, Math.min(100, Math.round(v / VOLUME_STEP) * VOLUME_STEP)) : or);
    return {
      volume: step(o.volume, plain.volume),
      voiceVolume: step(o.voiceVolume, plain.voiceVolume),
      muted: o.muted === true,
      uiMuted: o.uiMuted === true,
      voiceMuted: o.voiceMuted === true,
      spatial: o.spatial !== false,
    };
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

/**
 * КЛАВИША PLAY/PAUSE НА КЛАВИАТУРЕ — НЕ ПРО НАС. Браузер считает открытый аудиоконтекст «проигрывателем»
 * и по системной кнопке усыпляет его: за столом от этого пропадали и звуки, и голосовые. Забираем команды
 * пульта на себя пустыми обработчиками и, если контекст всё же уснул не по нашей воле, будим обратно.
 */
export function holdAudio(ctx: AudioContext): void {
  const session = (navigator as { mediaSession?: MediaSession }).mediaSession;
  if (session) {
    session.playbackState = "none";
    for (const action of ["play", "pause", "stop", "previoustrack", "nexttrack"] as const) {
      try {
        session.setActionHandler(action, () => {});
      } catch {
        // Эту команду браузер не знает — не беда.
      }
    }
  }
  ctx.addEventListener("statechange", () => {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  });
  (globalThis as { __tableAudio?: AudioContext }).__tableAudio = ctx;
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
  /** Слышно ли звуки стола: не заглушено (ни общим, ни своим) и громкость больше нуля. */
  readonly on: boolean;
  /** Слышны ли голосовые. */
  readonly voiceOn: boolean;
  /** Громкость голосового, каким его играть: 0 — не играть вовсе. */
  voiceGain(mine: boolean): number;
  save(): void;
  /** `x`, `z` — место на экране в долях от середины (см. `Played`). */
  /** `cutMs` — звук обрывается, когда кончилась анимация, которую он озвучивает. */
  play(kind: CueKind, x: number, z: number, mine: boolean, cutMs?: number): void;
  /** Голос по описанию (`VoiceSpec`): запись и слои синтеза. */
  voice(spec: VoiceSpec): void;
  /**
   * ЧТО СО ЗВУКОМ НА САМОМ ДЕЛЕ. Дальше колонки не видно никому, но всё до неё — видно, и «не
   * слышу» почти всегда объясняется именно здесь: браузер не пустил (`state` не `running`, пока
   * человек не коснулся экрана), звук заглушён своими настройками, или файл ещё не доехал.
   */
  readonly health: SoundHealth;
}

/** Один слой синтезированного звука поверх (или вместо) записи. `boom` — низкий тон с падением частоты; `tick` — короткий щелчок; `noise` — шум через полосовой фильтр (шелест, скольжение). */
export interface VoiceLayer {
  kind: "boom" | "tick" | "noise";
  /** Частота (для `noise` — центр полосы), Гц. */
  from: number;
  /** Куда падает частота `boom`/`tick`; нет — не падает. */
  to?: number;
  ms: number;
  gain: number;
  /** Добротность полосы у `noise`. */
  q?: number;
}

/**
 * ГОЛОС НЕ ПО ПОВОДУ СТОЛА, А ПО ОПИСАНИЮ: запись (если есть) с высотой `rate` и громкостью `gain`, плюс слои синтеза, по месту `x`, `z`. Так звучит то, чего столу
 * сказать нечем: взяли, повернули, отказ. Подбирается ручками на стенде (`feel.ts`), в игре читает тот же пресет.
 */
export interface VoiceSpec {
  file?: keyof typeof FILES | null;
  rate?: number;
  gain?: number;
  x?: number;
  z?: number;
  cutMs?: number;
  layers?: VoiceLayer[];
  /** Своё громче чужого (`GAIN`). */
  mine?: boolean;
}

export interface SoundHealth {
  /** Состояние звуковой машины: `none` — её ещё не создавали, `suspended` — браузер не пустил. */
  state: "none" | AudioContextState;
  /** Сколько раз стол просил звук. */
  asked: number;
  /** Сколько из них прозвучало. */
  played: number;
  /** Сколько промолчало — и почему промолчало последнее. */
  silent: number;
  why?: "off" | "asleep" | "no-file";
}

export function tableSound(): TableSound {
  let ctx: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const log: Played[] = ((globalThis as { __tableSounds?: Played[] }).__tableSounds = []);

  const wake = () => {
    // Выключенный звук не будит аудио вовсе: открытая аудиосессия iOS может глушить вибрацию.
    if (!sound.on && !sound.voiceOn) return;
    if (!ctx) {
      const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      holdAudio(ctx);
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

  const health: SoundHealth = { state: "none", asked: 0, played: 0, silent: 0 };

  const sound: TableSound = {
    prefs: readSoundPrefs(),
    get health() {
      health.state = ctx?.state ?? "none";
      return health;
    },
    get on() {
      return !sound.prefs.muted && !sound.prefs.uiMuted && sound.prefs.volume > 0;
    },
    get voiceOn() {
      return !sound.prefs.muted && !sound.prefs.voiceMuted && sound.prefs.voiceVolume > 0;
    },
    // СВОЁ ГОЛОСОВОЕ СЛЫШНО ТИШЕ: чтобы автор знал, что ушло, но не слушал себя в полный голос.
    voiceGain: (mine) => (sound.voiceOn ? (mine ? VOICE_GAIN.mine : VOICE_GAIN.other) * (sound.prefs.voiceVolume / 100) : 0),
    save: () => writeSoundPrefs(sound.prefs),
    voice(spec) {
      health.asked += 1;
      if (!sound.on) { health.silent += 1; health.why = "off"; return; }
      const mine = spec.mine !== false;
      const gain = (mine ? GAIN.mine : GAIN.other) * (sound.prefs.volume / 100) * (spec.gain ?? 1);
      const x = sound.prefs.spatial ? (spec.x ?? 0) : 0, z = sound.prefs.spatial ? (spec.z ?? 0) : 0;
      const file = spec.file ?? null;
      log.push({ kind: (file ?? "drop") as CueKind, file: file ?? "synth", x: +x.toFixed(2), z: +z.toFixed(2), gain, ...(spec.cutMs ? { cutMs: spec.cutMs } : {}) });
      if (log.length > 50) log.shift();
      if (!ctx || ctx.state !== "running") { health.silent += 1; health.why = "asleep"; return; }
      const audio = ctx;
      health.played += 1;
      // Все голоса одного звука идут через одну панораму.
      const out = audio.createGain();
      out.gain.value = 1;
      if (sound.prefs.spatial) {
        const pan = audio.createPanner();
        pan.panningModel = "HRTF"; pan.distanceModel = "inverse"; pan.refDistance = 1; pan.rolloffFactor = 0.25;
        const px = Math.max(-1, Math.min(1, x)) * 2, pz = Math.max(-1, Math.min(1, z)) * 2;
        if (pan.positionX) { pan.positionX.value = px; pan.positionY.value = 0; pan.positionZ.value = pz; } else pan.setPosition(px, 0, pz);
        out.connect(pan).connect(audio.destination);
      } else out.connect(audio.destination);
      const t0 = audio.currentTime;
      if (file) {
        const buf = buffers.get(`${file}-${1 + Math.floor(Math.random() * FILES[file])}`);
        if (buf) {
          const src = audio.createBufferSource(), vol = audio.createGain();
          src.buffer = buf;
          src.playbackRate.value = spec.rate ?? 1;
          vol.gain.value = gain;
          src.connect(vol).connect(out);
          src.start(t0);
          if (spec.cutMs) {
            const end = t0 + spec.cutMs / 1000;
            vol.gain.setValueAtTime(gain, end - 0.015);
            vol.gain.linearRampToValueAtTime(0, end);
            src.stop(end);
          }
        } else { health.silent += 1; health.why = "no-file"; }
      }
      for (const layer of spec.layers ?? []) {
        const end = t0 + layer.ms / 1000, env = audio.createGain();
        env.gain.setValueAtTime(Math.max(0.0001, gain * layer.gain), t0);
        env.gain.exponentialRampToValueAtTime(0.0001, end);
        if (layer.kind === "noise") {
          const len = Math.max(1, Math.floor(audio.sampleRate * (layer.ms / 1000)));
          const nb = audio.createBuffer(1, len, audio.sampleRate), data = nb.getChannelData(0);
          for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
          const src = audio.createBufferSource(), band = audio.createBiquadFilter();
          src.buffer = nb;
          band.type = "bandpass"; band.frequency.value = layer.from; band.Q.value = layer.q ?? 1.2;
          src.connect(band).connect(env).connect(out);
          src.start(t0);
        } else {
          const osc = audio.createOscillator();
          osc.type = layer.kind === "tick" ? "triangle" : "sine";
          osc.frequency.setValueAtTime(layer.from, t0);
          if (layer.to) osc.frequency.exponentialRampToValueAtTime(layer.to, end);
          osc.connect(env).connect(out);
          osc.start(t0);
          osc.stop(end + 0.02);
        }
      }
    },
    play(kind, x, z, mine, cutMs) {
      health.asked += 1;
      if (!sound.on) {
        health.silent += 1;
        health.why = "off";
        return;
      }
      const gain = (mine ? GAIN.mine : GAIN.other) * (sound.prefs.volume / 100);
      if (!sound.prefs.spatial) x = z = 0;
      const file = SOUND_OF[kind];
      log.push({ kind, file, x: +x.toFixed(2), z: +z.toFixed(2), gain, ...(cutMs ? { cutMs } : {}) });
      if (log.length > 50) log.shift();
      const buf = buffers.get(`${file}-${1 + Math.floor(Math.random() * FILES[file])}`);
      if (!ctx || !buf || ctx.state !== "running") {
        health.silent += 1;
        health.why = !buf ? "no-file" : "asleep";
        return;
      }
      health.played += 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const vol = ctx.createGain();
      const slam = kind === "slam";
      if (slam) src.playbackRate.value = SLAM.rate;
      vol.gain.value = slam ? gain * SLAM.gain : gain;
      if (slam) {
        // НИЗКИЙ «БУМ» ПОД СТУКОМ — стол отозвался на удар. Короткий, со спадом, без щелчка в конце.
        const boom = ctx.createOscillator();
        const env = ctx.createGain();
        const t0 = ctx.currentTime;
        const end = t0 + SLAM.boom.ms / 1000;
        boom.frequency.setValueAtTime(SLAM.boom.from, t0);
        boom.frequency.exponentialRampToValueAtTime(SLAM.boom.to, end);
        env.gain.setValueAtTime(gain * SLAM.boom.gain, t0);
        env.gain.exponentialRampToValueAtTime(0.0001, end);
        boom.connect(env).connect(ctx.destination);
        boom.start(t0);
        boom.stop(end + 0.02);
      }
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
