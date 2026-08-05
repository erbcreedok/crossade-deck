// «ПОДГЛЯДЕТЬ» — коллаборатор SceneEngine: сессии временного показа элементов (peekReveal → undo).
// Движок лишь зовёт start/step/resolve; КАК раскрывать и возвращать — знает сам элемент.

import type { Peekable, TableElement } from "./element";

/** Сколько секунд живёт показ (после — вернуть как было). */
export const PEEK_DUR = 3;

export interface PeeksHost {
  wake(): void;
  /** Отпустить элемент домой (истёк таймер и его НЕ держат). */
  releaseElement(el: TableElement): void;
}

export class ScenePeeks {
  private readonly peeking = new Map<string, { el: TableElement; undo: () => void; t: number; grabbed: boolean }>();

  constructor(private readonly host: PeeksHost) {}

  /** Есть ли у элемента что раскрыть — ЧИСТЫЙ предикат (armed-текст зоны читает без мутаций). */
  needs(el: TableElement): boolean {
    return "canPeek" in el ? (el as unknown as Peekable).canPeek : false;
  }

  /** true, если хоть один элемент реально ушёл в показ — это и есть consumed для драга:
   *  не начали ни одного → элемент(ы) летят домой как обычно. */
  start(els: readonly TableElement[]): boolean {
    let any = false;
    for (const el of els) {
      const undo = "peekReveal" in el ? (el as unknown as Peekable).peekReveal() : null;
      if (!undo) continue; // раскрывать нечего (уже видно) — элемент не поглощён, полетит домой
      this.peeking.set(el.id, { el, undo, t: 0, grabbed: false });
      any = true;
    }
    if (any) this.host.wake();
    return any;
  }

  /** Показанный элемент подхватили пальцем: таймер не отпускает его домой (увезёт обычный release). */
  markGrabbed(id: string): boolean {
    const p = this.peeking.get(id);
    if (!p) return false;
    p.grabbed = true;
    // Под пальцем элемент явно не «завис» — резонанс-парение ни к чему; скрытность НЕ трогаем.
    if ("peekBob" in p.el) (p.el as unknown as { peekBob: boolean }).peekBob = false;
    return true;
  }

  /** Конец драга: показанные, что держали, вернуть КАК БЫЛО, НЕ отпуская домой. Зовётся ДО
   *  диспатча дропа — повторный «подглядеть» должен раскрывать с базового вида. */
  resolveGrabbed(): void {
    for (const [id, p] of this.peeking) if (p.grabbed) this.end(id, false);
  }

  /** Шаг таймеров показа. true — есть живые сессии (циклу нельзя спать). */
  step(dt: number): boolean {
    if (this.peeking.size === 0) return false;
    for (const [id, p] of this.peeking) {
      p.t += dt;
      // Истёк показ: вернуть КАК БЫЛО. Держат (grabbed) — restore лишь возвращает вид;
      // не держат — отпускаем домой обычным releaseElement.
      if (p.t >= PEEK_DUR) this.end(id, !p.grabbed);
    }
    return true;
  }

  private end(id: string, releaseHome: boolean): void {
    const p = this.peeking.get(id);
    if (!p) return;
    this.peeking.delete(id);
    p.undo();
    if (releaseHome) this.host.releaseElement(p.el);
  }

  clear(): void {
    this.peeking.clear();
  }
}
