// ГОЛОСА НАПРЯМУЮ — с каждым за столом своя связь, речь мимо сервера. Сервер сводит и уходит (`rtc.ts`).
//
// Почему не через стол, как куски: стол носит речь по TCP, а тот не имеет права терять — потерялся пакет, и
// всё, что за ним, ЖДЁТ его. Для речи ожидание хуже потери: пауза слышна, а пропавшая сотня миллисекунд —
// нет. Здесь речь идёт по UDP и сжатой (Opus): дыра слышится шорохом, а не провалом, и весит вдесятеро
// меньше — узкий исходящий канал телефона перестаёт захлёбываться.
//
// МИКРОФОН БЕРЁТСЯ НА ПЕРВОМ СЛОВЕ и отпускается через `MIC_IDLE_MS` молчания: держать его открытым всё
// время — значит жечь оранжевую точку на телефоне, пока человек просто играет в карты.
//
// КОМУ СЛЫШНО, РЕШАЕТ ДОРОЖКА, А НЕ СЕРВЕР: наведён на сукно — она включена всем, на стул — только ему.

import { callsFirst } from "../src/table/rtc.js";

/**
 * Молчит столько — микрофон отпускаем, и точка записи на телефоне гаснет. Секунды хватает, чтобы не брать
 * его заново между двумя фразами подряд; всё, что дольше, человек читает как «он меня слушает».
 */
export const MIC_IDLE_MS = 1500;

/** Куда стучаться за своим адресом. Свой TURN появится, когда найдётся первый, кого не пустит его NAT. */
const ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

export interface MeshSend {
  (note: { to: string; kind: "offer" | "answer" | "ice" | "bye"; body: string }): void;
}

export interface TableMesh {
  readonly able: boolean;
  /** Кто сейчас звучит — по нему пульсирует аватар; `null` — тишина. */
  readonly speaking: string | null;
  readonly loudness: number;
  /** С кем сводимся: список тех, кто за столом, кроме меня. Ушедшие — отпускаются. */
  keep(people: string[], me: string): void;
  /** Записка от того, с кем сводимся. */
  hear(note: { from: string; kind: string; body: string }): void;
  /** Открыть микрофон. Не вышло — говорит, почему. */
  open(): Promise<"no-mic" | "denied" | null>;
  /** Кому слышно прямо сейчас: `undefined` — всем, ключ — лично ему, `null` — никому. */
  aim(to: string | null | undefined): void;
  /** Жест кончился: замолкаем и вскоре отдаём микрофон системе. */
  rest(): void;
  /** Отпустить всех и погасить микрофон. */
  close(): void;
  /** Как идут дела со связью у каждого: это видно человеку в настройках, когда голоса нет. */
  links(): { who: string; state: string }[];
  /**
   * Сколько РЕЧИ пришло от каждого — накопленная звуковая энергия, а не байты: снятая дорожка всё равно
   * шлёт тишину, и по байтам молчание неотличимо от разговора.
   */
  stats(): Promise<Record<string, number>>;
  onChange(fn: () => void): void;
}

interface Peer {
  pc: RTCPeerConnection;
  /**
   * Мой отправитель ему. Молчание — снятая дорожка (`replaceTrack(null)`), а НЕ флажок `enabled`: флажок
   * живёт на самой дорожке, одной на всех, и «лично ему» через него не сказать — замолчишь сразу всем.
   * Подмена дорожки мгновенна и не требует нового согласования.
   */
  mine: RTCRtpSender | null;
  sound: HTMLAudioElement | null;
  meter: AnalyserNode | null;
  /** Его предложение пришло, пока я слал своё: вежливый уступает (glare). */
  polite: boolean;
}

export function tableMesh(send: MeshSend, sound: { voiceGain(mine: boolean): number; muted(key: string): boolean }): TableMesh {
  const listeners: (() => void)[] = [];
  const tell = () => {
    for (const fn of listeners) fn();
  };
  const log = { peers: 0, open: false, aimed: null as string | null | undefined, heard: 0, talking: [] as string[], retired: false, mine: false, links: [] as string[] };
  (globalThis as { __tableMesh?: unknown }).__tableMesh = log;

  const peers = new Map<string, Peer>();
  /** Кому не дали заиграть до касания: пробуем снова на первом же. */
  const waiting = new Set<HTMLAudioElement>();
  const nudge = () => {
    for (const el of [...waiting]) {
      void el.play().then(() => void waiting.delete(el)).catch(() => {});
    }
    if (ctx?.state === "suspended") void ctx.resume();
  };
  if (typeof addEventListener === "function") {
    addEventListener("pointerdown", nudge, { capture: true });
    addEventListener("touchstart", nudge, { capture: true });
  }
  let stream: MediaStream | null = null;
  let mineTrack: MediaStreamTrack | null = null;
  let mineKey = "";
  /** Этому окну голос больше не принадлежит: человек открыл стол в новом. Назад не возвращается. */
  let retired = false;
  let aimed: string | null | undefined = null;
  let idle: ReturnType<typeof setTimeout> | null = null;
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

  /** Аватар дышит под того, кто громче: громкость берётся с его же дорожки. */
  const watch = () => {
    let loud = 0, who: string | null = null;
    for (const [key, peer] of peers) {
      if (!peer.meter) continue;
      const data = new Uint8Array(peer.meter.frequencyBinCount);
      peer.meter.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      if (peak > loud) {
        loud = peak;
        who = key;
      }
    }
    if (who !== speaking || Math.abs(loud - loudness) > 0.02) {
      speaking = loud > 0.02 ? who : null;
      loudness = loud;
      tell();
    }
    if (peers.size > 0) requestAnimationFrame(watch);
  };

  function peerOf(key: string): Peer {
    const had = peers.get(key);
    if (had) return had;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const peer: Peer = { pc, mine: null, sound: null, meter: null, polite: !callsFirst(mineKey, key) };
    peers.set(key, peer);
    log.peers = peers.size;
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ to: key, kind: "ice", body: JSON.stringify(e.candidate) });
    };
    pc.ontrack = (e) => {
      const track = e.streams[0] ?? new MediaStream([e.track]);
      // ЭЛЕМЕНТ ЗВУКА ЖИВЁТ В СТРАНИЦЕ, а не в переменной: оторванный от документа `Audio` в webview айфона
      // молчит — система открывает вывод только тому, что есть на экране. Ещё ему нужен `playsinline`,
      // иначе iOS норовит забрать звук в свой проигрыватель.
      const el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "");
      el.style.display = "none";
      el.srcObject = track;
      el.volume = sound.muted(key) ? 0 : sound.voiceGain(false);
      document.body.appendChild(el);
      peer.sound = el;
      // ИГРАТЬ МОЖЕТ НЕ ДАТЬ ДО КАСАНИЯ — тогда ждём ближайшего и пробуем снова, а не молчим навсегда.
      void el.play().catch(() => void waiting.add(el));
      const ac = audio();
      if (ac) {
        try {
          const meter = ac.createAnalyser();
          meter.fftSize = 256;
          ac.createMediaStreamSource(track).connect(meter);
          peer.meter = meter;
        } catch {
          // Web Audio не взял чужой поток (бывает на айфоне) — звук всё равно идёт элементом, без пульса.
        }
      }
      log.heard += 1;
      requestAnimationFrame(watch);
      tell();
    };
    pc.onnegotiationneeded = () => void call(key);
    pc.onconnectionstatechange = () => {
      log.links = [...peers].map(([who, one]) => `${who}:${one.pc.connectionState}`);
      if (pc.connectionState === "failed") void pc.restartIce();
      tell();
    };
    // МЕСТО ПОД ГОЛОС ГОТОВИМ СРАЗУ, ещё до первого слова: тогда тот, кто только слушает, всё равно
    // договаривается о связи. Иначе молчун не согласуется ни с кем и не слышит никого.
    peer.mine = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    // Дорожку новому пиру даёт ТОЛЬКО наводка: подсунуть её здесь — значит дать услышать личное тому, кто
    // подсел, пока я говорю на ухо другому.
    apply();
    return peer;
  }

  async function call(key: string): Promise<void> {
    const peer = peers.get(key);
    if (!peer) return;
    try {
      await peer.pc.setLocalDescription();
      send({ to: key, kind: "offer", body: JSON.stringify(peer.pc.localDescription) });
    } catch {
      // Не сложилось — следующая попытка придёт с новым согласованием.
    }
  }

  /** Дорожку получает ровно тот, на кого наведён микрофон; остальным — тишина, то есть ничего. */
  function apply(): void {
    log.aimed = aimed === undefined ? "all" : aimed;
    log.mine = mineTrack !== null;
    for (const [key, peer] of peers) {
      const hears = mineTrack !== null && aimed !== null && (aimed === undefined || aimed === key);
      void peer.mine?.replaceTrack(hears ? mineTrack : null);
    }
    // Кому отдана дорожка — по нашему решению: `sender.track` меняется не сразу, и читать его тут рано.
    // Правда о самой речи — не здесь, а у слушателя: сколько звуковой энергии до него дошло (`stats`).
    log.talking = mineTrack === null || aimed === null ? [] : [...peers.keys()].filter((key) => aimed === undefined || aimed === key);
    tell();
  }

  const mesh: TableMesh = {
    get able() {
      return typeof RTCPeerConnection === "function" && Boolean(navigator.mediaDevices?.getUserMedia);
    },
    get speaking() {
      return speaking;
    },
    get loudness() {
      return loudness;
    },
    keep(people, me) {
      if (retired) return;
      mineKey = me;
      for (const key of people) if (key !== me) peerOf(key);
      for (const [key, peer] of peers) {
        if (people.includes(key)) continue;
        peer.pc.close();
        peer.sound?.pause();
        peer.sound?.remove();
        peers.delete(key);
      }
      log.peers = peers.size;
    },
    async hear(note) {
      // ВЕСТЬ ОТ СЕБЯ САМОГО — я открыл стол в новом окне: это окно старое, и голос теперь не его. Отставка
      // навсегда: без неё `keep` заведёт связи заново на следующей же перемене стола, и человек снова
      // услышит всё дважды.
      if (note.from === mineKey) {
        retired = true;
        log.retired = true;
        mesh.close();
        return;
      }
      const peer = peerOf(note.from);
      try {
        if (note.kind === "bye") {
          peer.pc.close();
          peers.delete(note.from);
          log.peers = peers.size;
          return;
        }
        if (note.kind === "ice") {
          await peer.pc.addIceCandidate(JSON.parse(note.body) as RTCIceCandidateInit);
          return;
        }
        const sdp = JSON.parse(note.body) as RTCSessionDescriptionInit;
        // ОБА ПОЗВАЛИ РАЗОМ: уступает вежливый — тот, чей ключ больше. Иначе согласование схлопнется.
        const busy = peer.pc.signalingState !== "stable";
        if (sdp.type === "offer" && busy && !peer.polite) return;
        if (sdp.type === "offer" && busy) await peer.pc.setLocalDescription({ type: "rollback" });
        await peer.pc.setRemoteDescription(sdp);
        if (sdp.type === "offer") {
          await peer.pc.setLocalDescription();
          send({ to: note.from, kind: "answer", body: JSON.stringify(peer.pc.localDescription) });
        }
      } catch {
        // Записка не легла — связь пересоберётся следующим согласованием.
      }
    },
    async open() {
      if (retired) return "no-mic";
      if (idle) clearTimeout(idle);
      if (stream) return null;
      if (!mesh.able) return "no-mic";
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch {
        return "denied";
      }
      log.open = true;
      mineTrack = stream.getAudioTracks()[0]!;
      apply();
      return null;
    },
    aim(to) {
      aimed = to;
      // Наводка только решает, кому слышно. Микрофон при этом остаётся в руке: палец ещё держит кнопку, и
      // отпустить его посреди жеста — значит онеметь на следующей же наводке.
      if (to !== null && idle) {
        clearTimeout(idle);
        idle = null;
      }
      apply();
    },
    rest() {
      // ЖЕСТ КОНЧИЛСЯ — микрофон отдаём системе, и точка записи на телефоне гаснет. Не сразу: две фразы
      // подряд не должны каждый раз заново просить доступ.
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => {
        for (const t of stream?.getTracks() ?? []) t.stop();
        stream = null;
        mineTrack = null;
        log.open = false;
        apply();
      }, MIC_IDLE_MS);
    },
    links() {
      return [...peers].map(([who, peer]) => ({ who, state: peer.pc.connectionState }));
    },
    async stats() {
      const out: Record<string, number> = {};
      for (const [key, peer] of peers) {
        let got = 0;
        const report = await peer.pc.getStats().catch(() => null);
        report?.forEach((one) => {
          if (one.type === "inbound-rtp" && one.kind === "audio") got += (one as { totalAudioEnergy?: number }).totalAudioEnergy ?? 0;
          if (one.type === "media-source" || one.type === "track") got += 0;
        });
        out[key] = got;
      }
      return out;
    },
    close() {
      aimed = null;
      if (idle) clearTimeout(idle);
      for (const t of stream?.getTracks() ?? []) t.stop();
      stream = null;
      mineTrack = null;
      log.open = false;
      for (const [key, peer] of peers) {
        send({ to: key, kind: "bye", body: "" });
        peer.pc.close();
        peer.sound?.pause();
        peer.sound?.remove();
      }
      peers.clear();
      log.peers = 0;
    },
    onChange: (fn) => void listeners.push(fn),
  };
  // Прогонам нужна правда о самом потоке: услышать его в безголовом браузере нельзя.
  (globalThis as { __tableFlow?: unknown }).__tableFlow = () => mesh.stats();
  return mesh;
}
