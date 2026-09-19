// ЧТО ВИДЕЛ ЭКРАН — ловля. Здесь браузер, поэтому здесь же и всё, что про него: нажатия, падения,
// уход вкладки в фон и правда о звуке.
//
// Ловится СНАРУЖИ, не внутри экрана. Ни `screen.ts`, ни `sound.ts` не знают, что за ними записывают:
// нажатия снимаются с окна, действия — обёрткой вокруг хранилища. Иначе журнал расползётся по всему
// клиенту сотней вызовов, и первая же правка экрана начнёт ронять записи.
//
// ПРО ЗВУК ОТДЕЛЬНО. Слышит ли человек — не знает никто: между нашим кодом и его ухом системная
// громкость, наушники и переключатель «без звука» на айфоне, который глушит веб-звук молча. Зато всё
// ДО колонки видно целиком, и почти каждое «не слышу» объясняется именно оттуда:
//   • браузер не пустил звук, пока человек не коснулся экрана (`state: "suspended"`);
//   • звук заглушён своими же настройками;
//   • чужой голос не доехал — счётчик пришедшей звуковой энергии стоит на нуле.
// Поэтому пишется не «слышит / не слышит», а всё, что измеримо, и вывод делается потом, при разборе.

import type { Intent, Seen } from "../src/table/contract.js";
import type { SoundHealth } from "./sound.js";
import type { TableStore } from "./store.js";
import { tableWitness, type Witness } from "../src/table/telling.js";

/** Через сколько после нажатия жест считается безрезультатным. */
export const IDLE_MS = 600;
/** Как часто снимается состояние звука и голоса. */
export const HEALTH_EVERY_MS = 15_000;

const clock = {
  now: () => Date.now(),
  later: (run: () => void, ms: number) => setTimeout(run, ms),
  stop: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** За что человек ткнул: ярлык элемента, `felt` — сукно, `none` — мимо всего. */
function hitOf(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "none";
  if (target.tagName === "CANVAS") return "felt";
  const marked = target.closest<HTMLElement>("[data-g],[data-card],[data-stand],[data-tip],[data-chair]");
  if (!marked) return "none";
  const { g, card, chair } = marked.dataset;
  return g ?? (card === undefined ? undefined : "card") ?? (chair === undefined ? undefined : "chair") ?? marked.tagName.toLowerCase();
}

/**
 * Обернуть хранилище так, чтобы оно попутно рассказывало о себе. Экран получает обёртку и ничего не
 * замечает: наружу это то же самое хранилище.
 */
export function witnessed(store: TableStore, w: Witness): TableStore {
  return {
    ...store,
    // Геттеры у хранилища живые (`state`, `carries`, `eyes`, `title`), и через `...` они бы застыли
    // на своём первом значении. Поэтому обёртка их переобъявляет, а не копирует.
    get state() {
      return store.state;
    },
    get carries() {
      return store.carries;
    },
    get eyes() {
      return store.eyes;
    },
    get title() {
      return store.title;
    },
    send(intent: Intent) {
      w.saw("act", { t: intent.t });
      store.send(intent);
    },
    onRefused(listener) {
      store.onRefused((intent, why) => {
        w.saw("refused", { t: intent.t, why });
        listener(intent, why);
      });
    },
    onGone(listener) {
      store.onGone(() => {
        w.saw("gone");
        w.tell();
        listener();
      });
    },
  };
}

/** Чем экран отвечает журналу, когда тот спрашивает про звук. */
export interface ScreenHealth {
  sound(): SoundHealth;
  voice(): Promise<Record<string, number>>;
}

export interface Watched {
  /** Опрошенное состояние звука; `null` — экран ещё не собран. */
  sound?: () => SoundHealth | null;
  /** Сколько звуковой энергии дошло от каждого собеседника. */
  voice?: () => Promise<Record<string, number>> | null;
}

/**
 * Начать наблюдение за окном. Возвращает свидетеля — тем же, которым оборачивается хранилище.
 */
export function watchScreen(send: (seen: readonly Seen[]) => void, watched: Watched = {}): Witness {
  const w = tableWitness(send, clock);
  let acts = 0;
  /** Тот же свидетель, но считающий ушедшие действия: по ним видно нажатие впустую. */
  const told: Witness = {
    get heap() {
      return w.heap;
    },
    saw(kind, what) {
      if (kind === "act") acts += 1;
      w.saw(kind, what);
    },
    tell: () => w.tell(),
  };

  // ЧТО ЧЕЛОВЕК УВИДЕЛ, ОТКРЫВ СТОЛ. Размер экрана — чтобы верстку разбирать по его телефону, а не по
  // своему; `dpr` отличает настоящий маленький экран от уменьшенного окна.
  told.saw("open", {
    w: innerWidth,
    h: innerHeight,
    dpr: Math.round(devicePixelRatio * 100) / 100,
    tg: Boolean((globalThis as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp),
    lang: navigator.language,
  });

  // НАЖАТИЯ. Тут же ловится самое ценное — нажатие ВПУСТУЮ: ткнул, и за время, за которое любое
  // действие успевает уйти на стол, не ушло ничего. Это и есть «жму, а ничего не происходит»,
  // единственная жалоба, которую по одним только серверным записям не разобрать никогда: на сервере
  // её попросту нет.
  addEventListener(
    "pointerdown",
    (e) => {
      const g = hitOf(e.target);
      const was = acts;
      told.saw("press", { g });
      setTimeout(() => {
        if (acts === was) told.saw("press.idle", { g });
      }, IDLE_MS);
    },
    { capture: true },
  );

  // ПАДЕНИЯ. Оба вида: брошенная ошибка и непойманный отказ обещания.
  addEventListener("error", (e) => {
    const err = e as ErrorEvent;
    told.saw("boom", { text: String(err.message ?? "?").slice(0, 300), at: `${err.filename ?? "?"}:${err.lineno ?? 0}` });
    told.tell();
  });
  addEventListener("unhandledrejection", (e) => {
    const why = (e as PromiseRejectionEvent).reason;
    told.saw("boom", { text: String(why instanceof Error ? why.message : why).slice(0, 300), kind: "promise" });
    w.tell();
  });

  // ВКЛАДКА УШЛА В ФОН. Отсюда видно «вышел на минуту» и отсюда же уходит последнее накопленное:
  // закрытую вкладку уже ни о чём не спросишь.
  addEventListener("visibilitychange", () => {
    told.saw(document.hidden ? "hide" : "show");
    if (document.hidden) w.tell();
  });
  addEventListener("pagehide", () => w.tell());

  // ЗВУК И ГОЛОС — по часам, а не по событию: состояние важно само по себе, даже когда ничего не
  // происходит. Записывается только то, что ИЗМЕНИЛОСЬ: неизменное состояние каждые пятнадцать секунд
  // — это шум, в котором тонет момент перемены.
  let lastHealth = "";
  const look = (): void => {
    const health = watched.sound?.() ?? null;
    if (health) {
      const now = JSON.stringify({ state: health.state, on: health.silent, why: health.why });
      if (now !== lastHealth) {
        lastHealth = now;
        told.saw("sound", { state: health.state, asked: health.asked, played: health.played, silent: health.silent, ...(health.why === undefined ? {} : { why: health.why }) });
      }
    }
    const heard = watched.voice?.();
    void heard
      ?.then((energy) => {
        const talking = Object.entries(energy).filter(([, e]) => e > 0).length;
        const mute = Object.entries(energy).filter(([, e]) => e === 0).map(([who]) => who);
        // Собеседник есть, а энергии от него ноль — его голос до этого экрана не доезжает.
        if (mute.length > 0) told.saw("voice.silent", { mute, talking });
      })
      .catch(() => {});
  };
  setInterval(look, HEALTH_EVERY_MS);

  return told;
}
