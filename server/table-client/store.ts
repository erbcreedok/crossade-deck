// ХРАНИЛИЩЕ СТОЛА — то единственное, с чем говорит экран.
//
// Экрану всё равно, откуда стол: из сети (`netStore`) или из этой же вкладки, где за столом боты
// (`localStore`, стенд). Он читает снимок, шлёт намерения и слушает, когда снимок сменился. Отказ
// сервера приходит тем же путём: снимок снова тот, что был, — и экран просто рисует его.

import type { Carry, CarryOut, Intent, Person, Refusal, Snapshot, TableCommand } from "../src/table/contract.js";
import type { Eye, Spot } from "../src/table/eyes.js";
import type { Say, SayOut, Shot, ShotOut } from "../src/table/say.js";

export interface TableStore {
  readonly me: Person;
  readonly title: string;
  readonly state: Snapshot;
  send(intent: Intent): void;
  /** Что сейчас в воздухе у других — только то, что ещё держат (по `state.locks`). */
  readonly carries: readonly Carry[];
  /** Кто на что смотрит сейчас — со своим глазом; свой отсеивает экран. */
  readonly eyes: readonly Eye[];
  /** Что открыто у меня — остальным. Без ответа, как палец. */
  watch(spots: Spot[]): void;
  /** Часы сервера сейчас — по ним считается «10 сек назад» у следов карт. */
  now(): number;
  /** Мой палец в воздухе — над чем он. Без ответа: это поток, а не намерение. */
  carry(out: CarryOut): void;
  /** Моё слово у стула — остальным. Без ответа, как палец. */
  say(out: SayOut): void;
  /** Чужое слово пришло. */
  onSay(listener: (say: Say) => void): void;
  /** Команда стола от админа — кнопкой, как из бота. */
  command(command: TableCommand): void;
  /** Моё голосовое — остальным. Нигде не хранится. */
  /** Кусок речи наружу: наведён на стул — `to`, на сукно — без него. */
  live(out: { seq: number; bytes: Uint8Array; to?: string }): void;
  /** Чужое голосовое пришло. */
  onLive(listener: (clip: { by: string; seq: number; bytes: Uint8Array }) => void): void;
  /** Я включил или выключил микрофон — остальным: они видят это на моём аватаре. */
  mic(on: boolean): void;
  /** Кто-то включил или выключил микрофон. */
  onMic(listener: (mic: { by: string; on: boolean }) => void): void;
  /** Мой набор стикеров — спросить заново; ответ приходит в `onStickers`. */
  askStickers(): void;
  /** Мой стикер выстрелом — остальным. */
  shoot(out: ShotOut): void;
  onShot(listener: (shot: Shot) => void): void;
  onStickers(listener: (ids: string[]) => void): void;
  /** Снимок сменился (дифом, синком или отказом) или сдвинулся чужой палец в воздухе. */
  onChange(listener: () => void): void;
  /** Намерение не случилось — экран отпускает то, что держал. */
  onRefused(listener: (intent: Intent, why: Refusal) => void): void;
  /** Стола больше нет: его закрыли в боте, или сервер ушёл. */
  onGone(listener: () => void): void;
}
