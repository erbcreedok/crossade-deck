// ЗВУК СТОЛА — записи Kenney «Casino Audio» (CC0, `sounds/LICENSE-kenney-casino-audio.txt`), по месту на экране.
//
// Слушатель — камера: что левее середины экрана, звучит слева; что ниже середины (ближе к себе, «за спиной»
// камеры) — сзади, что выше — спереди. Это `PannerNode` с HRTF: в наушниках перед и зад различимы, в динамике
// телефона остаётся лево-право. Чужое звучит тише своего.
//
// Браузер не даёт играть звук до первого касания — контекст будится на первом `pointerdown`.

import type { CueKind } from "../src/table/cues.js";
import { HOST } from "./host.js";
import custom from "./soundsCustom.json";

// Файлы: drop — card-place-1, turn — card-place-2, sort — card-place-4, hand — card-slide-1, merge — card-fan-1,
// shuffle — card-shuffle, gather — card-shove-1/2/4.
/**
 * ЕЩЁ ЗАПИСИ ТОГО ЖЕ НАБОРА (Kenney, CC0), лежат в папке, но в случайный выбор столом НЕ входят: из вариантов для каждого повода владелец выбрал одну запись (`SOUND_OF`), и стол играет её.
 * Здесь они — для галереи звуков и для движений на стенде (`feel.ts`): их можно послушать и назначить.
 */
export const EXTRA_TRACKS = ["drop-2", "drop-3", "drop-4", "hand-2", "hand-3", "merge-2", "turn-2", "turn-3"] as const;

const FILES = { drop: 1, hand: 1, turn: 1, gather: 3, merge: 1, shuffle: 1, sort: 1 } as const;
/** Все дорожки по имени: записи стола (`FILES`) и дополнительные (`EXTRA_TRACKS`). */
const ALL_TRACKS: string[] = [...Object.entries(FILES).flatMap(([kind, n]) => Array.from({ length: n }, (_, i) => `${kind}-${i + 1}`)), ...EXTRA_TRACKS, ...(custom as { names: string[] }).names];
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
  /** Все дорожки, что играет стол: `drop-1`, `gather-1`… */
  readonly tracks: string[];
  /** Новая дорожка, собранная на стенде (`soundsCustom.json`), появилась прямо сейчас: добавить в список без перезагрузки страницы. */
  addTrack(name: string): void;
  /** Загрузить дорожку (одна загрузка на имя): `true`, когда готова. Для страниц, что грузят по нажатию, а не заранее. */
  ensure(name: string): Promise<boolean>;
  /** Декодированная запись дорожки (нет — ещё не загружена) и сколько секунд тишины срезается в начале. */
  buffer(name: string): { audio: AudioBuffer; onset: number } | undefined;
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
  /** Точная дорожка (`drop-1`, `gather-2`…) вместо случайной из группы `file`. */
  track?: string;
  /** Играть с самого начала файла, не срезая тишину (чтобы услышать разницу). */
  raw?: boolean;
  /** С какой секунды играть запись: перекрывает автоматический срез тишины (`onsetOf`). */
  from?: number;
  /** Сдвиг высоты, полутона (0 — как есть). */
  pitch?: number;
  /** Скорость `rate` меняет и высоту (как пластинка; по умолчанию да). Нет — высота своя (`pitch`), скорость отдельно, запись растягивается (`stretchBuffer`). */
  tie?: boolean;
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
  /** Сколько записей уже декодировано и готово играть. */
  loaded: number;
  /** Сколько секунд тишины срезано в начале каждой записи. */
  onsets: Record<string, number>;
  /** Какие дорожки сейчас грузятся. */
  loading: string[];
  /** За сколько миллисекунд загрузилась (скачалась и декодировалась) каждая дорожка. */
  loadMs: Record<string, number>;
  /** Сколько раз пришлось растягивать запись во времени (кэш считает один раз на дорожку и растяжение). */
  stretches: number;
}

/**
 * РАСТЯНУТЬ ЗАПИСЬ ВО ВРЕМЕНИ, НЕ МЕНЯЯ ВЫСОТЫ (наложение зёрен): запись режется на окна по 40 мс с половинным перекрытием и собирается заново с другим шагом.
 * `T` — во сколько раз длиннее (меньше 1 — короче). Простейший способ: для коротких ударов и шелеста годится, для длинных тонов даёт лёгкую «дрожь».
 * Скорость без смены высоты = растянуть на `T = высота / скорость` и играть с `playbackRate = высота`.
 */
export function stretchBuffer(ctx: { createBuffer(channels: number, length: number, rate: number): AudioBuffer }, buf: AudioBuffer, T: number): AudioBuffer {
  const sr = buf.sampleRate, grain = Math.max(64, Math.floor(sr * 0.04)), hop = grain >> 1, ana = hop / T;
  const outLen = Math.ceil(buf.length * T) + grain;
  const out = ctx.createBuffer(buf.numberOfChannels, outLen, sr);
  const win = new Float32Array(grain);
  for (let i = 0; i < grain; i += 1) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / grain);
  for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
    const src = buf.getChannelData(ch), dst = out.getChannelData(ch), norm = new Float32Array(outLen);
    for (let g = 0; ; g += 1) {
      const a = Math.floor(g * ana), o = g * hop;
      if (a >= buf.length || o + grain > outLen) break;
      for (let i = 0; i < grain; i += 1) {
        const idx = a + i;
        dst[o + i]! += (idx < buf.length ? src[idx]! : 0) * win[i]!;
        norm[o + i]! += win[i]!;
      }
    }
    for (let i = 0; i < outLen; i += 1) if (norm[i]! > 1e-3) dst[i]! /= norm[i]!;
  }
  return out;
}

/** Где в записи на самом деле начинается звук: первый отсчёт заметнее порога (5% от пика, не меньше 0,5%). Не дальше 120 мс — дальше уже не тишина, а тихое начало самого звука. */
export function onsetOf(buf: AudioBuffer): number {
  const data = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]!));
  const limit = Math.max(0.005, peak * 0.05), cap = Math.floor(buf.sampleRate * 0.12);
  for (let i = 0; i < Math.min(data.length, cap); i += 1) if (Math.abs(data[i]!) >= limit) return i / buf.sampleRate;
  return 0;
}

export function tableSound(opts: { lazy?: boolean } = {}): TableSound {
  let ctx: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  /** Сколько секунд в начале каждой записи тишина (и «разгон» кодека AAC): с неё не играем, звук должен начинаться ровно в момент команды. */
  const onsets = new Map<string, number>();
  /** Растянутые во времени копии записей: ключ — дорожка и растяжение. */
  const stretched = new Map<string, AudioBuffer>();
  const log: Played[] = ((globalThis as { __tableSounds?: Played[] }).__tableSounds = []);

  /** Создать звуковую машину и загрузить записи — до первого касания: контекст спит, но файлы уже декодируются, и первый звук не ждёт загрузки. */
  const boot = (): boolean => {
    if (ctx) return true;
    const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    try {
      ctx = new Ctx({ latencyHint: "interactive" });
    } catch {
      ctx = new Ctx();
    }
    holdAudio(ctx);
    if (!opts.lazy) for (const name of ALL_TRACKS) void load(name);
    return true;
  };
  const wake = () => {
    // Выключенный звук не будит аудио вовсе: открытая аудиосессия iOS может глушить вибрацию.
    if (!sound.on && !sound.voiceOn) return;
    if (!boot()) return;
    if (ctx!.state === "suspended") void ctx!.resume();
  };
  /** Дорожка в пути: одна загрузка на имя, сколько бы раз ни просили. */
  const pending = new Map<string, Promise<boolean>>();
  const load = (name: string): Promise<boolean> => {
    const was = pending.get(name);
    if (was) return was;
    const t0 = performance.now();
    health.loading.push(name);
    // Запись берётся у игрового сервера; нет у него (новую собрали на стенде, а он её ещё не знает) — у dev-сервера стенда (`/__sounds/`).
    const one = fetch(`${HOST}/table/sounds/${name}.m4a`)
      .then((r) => (r.ok ? r : fetch(`/__sounds/${name}.m4a`)))
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.arrayBuffer(); })
      .then((bytes) => ctx!.decodeAudioData(bytes))
      .then((buf) => {
        buffers.set(name, buf);
        onsets.set(name, onsetOf(buf));
        health.loaded = buffers.size;
        health.onsets[name] = +onsets.get(name)!.toFixed(4);
        health.loadMs[name] = Math.round(performance.now() - t0);
        return true;
      })
      .catch(() => { pending.delete(name); return false; })
      .finally(() => { health.loading = health.loading.filter((n) => n !== name); });
    pending.set(name, one);
    return one;
  };
  addEventListener("pointerdown", wake, { capture: true });

  const health: SoundHealth = { state: "none", asked: 0, played: 0, silent: 0, loaded: 0, onsets: {}, loading: [], loadMs: {}, stretches: 0 };

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
    addTrack: (name) => { if (!ALL_TRACKS.includes(name)) ALL_TRACKS.push(name); },
    ensure: (name) => (buffers.has(name) ? Promise.resolve(true) : boot() ? load(name) : Promise.resolve(false)),
    tracks: ALL_TRACKS,
    buffer: (name) => { const audio = buffers.get(name); return audio ? { audio, onset: onsets.get(name) ?? 0 } : undefined; },
    voice(spec) {
      health.asked += 1;
      if (!sound.on) { health.silent += 1; health.why = "off"; return; }
      const mine = spec.mine !== false;
      const gain = (mine ? GAIN.mine : GAIN.other) * (sound.prefs.volume / 100) * (spec.gain ?? 1);
      const x = sound.prefs.spatial ? (spec.x ?? 0) : 0, z = sound.prefs.spatial ? (spec.z ?? 0) : 0;
      // Дорожка, которую ещё не загружали (не была назначена при открытии страницы), — загрузится в фоне; сейчас промолчит, в следующий раз сыграет.
      if (spec.track && !buffers.has(spec.track)) void load(spec.track);
      const file = spec.file ?? null, exact = spec.track && buffers.has(spec.track) ? spec.track : null;
      log.push({ kind: (file ?? "drop") as CueKind, file: exact ?? file ?? "synth", x: +x.toFixed(2), z: +z.toFixed(2), gain, ...(spec.cutMs ? { cutMs: spec.cutMs } : {}) });
      if (log.length > 50) log.shift();
      if (!ctx || ctx.state !== "running") { health.silent += 1; health.why = "asleep"; return; }
      const audio = ctx;
      health.played += 1;
      // Все голоса одного звука идут через одну панораму. Лево-право — дешёвым стерео-панорамером: объёмный HRTF на телефоне съедает задержку, а у телефонного динамика перед-зад всё равно нет.
      const out = audio.createGain();
      out.gain.value = 1;
      if (sound.prefs.spatial && audio.createStereoPanner) {
        const pan = audio.createStereoPanner();
        pan.pan.value = Math.max(-1, Math.min(1, x));
        out.connect(pan).connect(audio.destination);
      } else out.connect(audio.destination);
      const t0 = audio.currentTime;
      if (file || exact) {
        const pick = exact ?? `${file}-${1 + Math.floor(Math.random() * FILES[file!])}`, buf = buffers.get(pick);
        if (buf) {
          const src = audio.createBufferSource(), vol = audio.createGain();
          // Скорость и высота: с `tie` — как пластинка (одно число); без — запись растягивается на `высота / скорость` и играет с `playbackRate = высота`.
          const speed = spec.rate ?? 1, shift = 2 ** ((spec.pitch ?? 0) / 12), tie = spec.tie !== false;
          const rate = tie ? speed * shift : shift, stretch = tie ? 1 : shift / speed;
          let use = buf;
          if (Math.abs(stretch - 1) > 0.02) {
            const key = `${pick}:${stretch.toFixed(3)}`;
            let cached = stretched.get(key);
            if (!cached) { cached = stretchBuffer(audio, buf, stretch); stretched.set(key, cached); health.stretches += 1; }
            use = cached;
          }
          src.buffer = use;
          src.playbackRate.value = rate;
          vol.gain.value = gain;
          src.connect(vol).connect(out);
          src.start(t0, (spec.from ?? (spec.raw ? 0 : onsets.get(pick) ?? 0)) * (use === buf ? 1 : stretch));
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
      const pick = `${file}-${1 + Math.floor(Math.random() * FILES[file])}`, buf = buffers.get(pick);
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
      src.start(0, onsets.get(pick) ?? 0);
      if (cutMs) {
        // Обрыв с хвостом в 15 мс — без щелчка.
        const end = ctx.currentTime + cutMs / 1000;
        vol.gain.setValueAtTime(gain, end - 0.015);
        vol.gain.linearRampToValueAtTime(0, end);
        src.stop(end);
      }
    },
  };
  if (sound.on) boot();
  return sound;
}
