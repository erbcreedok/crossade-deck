// ХРАНИЛИЩЕ СТОЛА — то единственное, с чем говорит экран.
//
// Экрану всё равно, откуда стол: из сети (`netStore`) или из этой же вкладки, где за столом боты
// (`localStore`, стенд). Он читает снимок, шлёт намерения и слушает, когда снимок сменился. Отказ
// сервера приходит тем же путём: снимок снова тот, что был, — и экран просто рисует его.

import type { IceServer, Carry, CarryOut, DealRule, Intent, Op, Person, Refusal, Seen, Snapshot, TableCommand } from "../src/table/contract.js";
import type { Eye, Spot } from "../src/table/eyes.js";
import type { Say, SayOut, Shot, ShotOut } from "../src/table/say.js";

export interface TableStore {
  readonly me: Person;
  readonly title: string;
  /** Что умеет крупье этой комнаты (`crews.ts`) — по этому списку рисуются кнопки в его окне. */
  readonly crew: readonly { id: string; name: string; adminOnly?: true }[];
  /** Род стола — по нему экран спрашивает правила игры сам, тем же кодом, что и сервер. */
  readonly desk: string;
  /** Какие раздачи предлагает род стола — окно раздачи показывает ровно их. */
  readonly deals: readonly DealRule[];
  /** Через что голосам искать друг друга: приходит с сервера, а не записано здесь (`config.ts`). */
  readonly ice: readonly IceServer[];
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
  /** Рассказать столу, что видел и делал этот экран. Ответа нет — рассказ идёт только в журнал. */
  log(seen: readonly Seen[]): void;
  /** Записка тому, с кем сводим голоса напрямую. */
  rtc(out: { to: string; kind: string; body: string }): void;
  onRtc(listener: (note: { from: string; kind: string; body: string }) => void): void;
  /**
   * Я включил или выключил микрофон и КОМУ говорю: `to` — ключ того, кому лично, ничего — на стол.
   * Остальные видят по этому, куда течёт моя речь.
   */
  mic(on: boolean, to?: string): void;
  /** Кто-то включил или выключил микрофон; `to` — кому лично, если не на стол. */
  onMic(listener: (mic: { by: string; on: boolean; to?: string }) => void): void;
  /** Мой набор стикеров — спросить заново; ответ приходит в `onStickers`. */
  askStickers(): void;
  /** Мой стикер выстрелом — остальным. */
  shoot(out: ShotOut): void;
  onShot(listener: (shot: Shot) => void): void;
  onStickers(listener: (ids: string[]) => void): void;
  /** Снимок сменился (дифом, синком или отказом) или сдвинулся чужой палец в воздухе. */
  onChange(listener: () => void): void;
  /**
   * ЧТО ПРОИЗОШЛО НА СТОЛЕ — теми же операциями, какими их прислал стол. Из них экран ведёт журнал
   * партии (`journal.ts`).
   *
   * Важно, что это ИМЕННО операции, а не снимок: операции уже прорезаны под зрителя (`seenOp`), и
   * лица карты, которой он не видел, в них нет. Собирая журнал из снимка, эту границу пришлось бы
   * проводить заново — и однажды провести неверно.
   */
  onOps?(listener: (ops: readonly Op[]) => void): void;
  /** Намерение не случилось — экран отпускает то, что держал. */
  onRefused(listener: (intent: Intent, why: Refusal) => void): void;
  /** Стола больше нет: его закрыли в боте, или сервер ушёл и вернуться не вышло. */
  onGone(listener: () => void): void;
  /** Связь со столом пропала (`false`) или вернулась (`true`) — стол при этом тот же. Есть только у сетевого стола. */
  onLink?(listener: (up: boolean) => void): void;
}
