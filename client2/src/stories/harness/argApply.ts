// ЧИСТОЕ правило «живьём или пересобрать». Контролы Storybook — это значения, а компоненты у нас
// императивные: часть опций правится сеттером на живом экземпляре (setValue/setConcealed/setState),
// часть зашита в конструктор (рубашка, стиль лица, размер) и требует пересобрать граф сцены.
//
// ВАЖНО: «пересобрать» = пересобрать СОДЕРЖИМОЕ сцены. Pixi-приложение и WebGL-контекст при этом
// не пересоздаются никогда — см. canvasPool.ts.

/** Применить значение к живому экземпляру. Вернуть "rebuild", если живьём не вышло. */
export type Applier<T, A> = (el: T, value: A[keyof A]) => void | "rebuild";

/** План на компонент: ключ аргумента → живой сеттер ИЛИ прямое требование пересборки. */
export type ApplyPlan<T, A> = Partial<Record<keyof A, Applier<T, A> | "rebuild">>;

export interface ApplyStep<T, A> {
  key: keyof A;
  apply: Applier<T, A>;
  value: A[keyof A];
}

export interface Plan<T, A> {
  /** Что применить к живому экземпляру, в порядке ключей плана. Пусто, если rebuild. */
  live: ApplyStep<T, A>[];
  rebuild: boolean;
}

/**
 * Разложить изменение аргументов на «живые правки» и «нужна пересборка».
 *
 * Неизвестный ключ (в аргументах есть, в плане нет) трактуется как пересборка — падаем ЗАКРЫТО.
 * Молча проигнорировать его значило бы показывать в каталоге не то состояние, которое выбрано
 * контролом; каталог, который врёт, хуже отсутствующего.
 */
export function planFor<T, A extends object>(
  prev: A | undefined,
  next: A,
  plan: ApplyPlan<T, A>,
): Plan<T, A> {
  // Первый прогон: экземпляра ещё нет, «живых правок» применять не к чему.
  if (!prev) return { live: [], rebuild: true };

  const changed = new Set<keyof A>();
  for (const k of Object.keys(next) as (keyof A)[]) if (!Object.is(prev[k], next[k])) changed.add(k);
  for (const k of Object.keys(prev) as (keyof A)[]) if (!(k in next)) changed.add(k);
  if (changed.size === 0) return { live: [], rebuild: false };

  for (const k of changed) {
    const rule = plan[k];
    if (rule === undefined || rule === "rebuild") return { live: [], rebuild: true };
  }

  // Порядок — по ключам ПЛАНА, а не по порядку правок: одинаковый вход должен давать одинаковую
  // последовательность вызовов, иначе поведение зависит от того, какой контрол крутили раньше.
  const live: ApplyStep<T, A>[] = [];
  for (const k of Object.keys(plan) as (keyof A)[]) {
    if (!changed.has(k)) continue;
    const rule = plan[k];
    if (typeof rule === "function") live.push({ key: k, apply: rule, value: next[k] });
  }
  return { live, rebuild: false };
}
