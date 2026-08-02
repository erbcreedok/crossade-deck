// ЖЕСТЫ ПО КАНВАСУ для сценариев `play()`.
//
// Панель Interactions показывает СЦЕНАРИЙ: что нажали, куда повели, что получилось. У обычного
// компонента для этого хватает ролей и текста, у нас же всё живёт на канвасе — ни узлов, ни ролей.
// Поэтому жест собирается руками из pointer-событий, а координаты берутся в КОНТЕНТЕ витрины и
// переводятся камерой: канвас занимает весь кадр, витрина стоит по центру и при нехватке места
// ужимается, так что «где предмет» и «куда ткнуть пальцем» — разные числа.

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Pt {
  x: number;
  y: number;
}

interface SceneLike {
  viewport: { x: number; y: number; zoom: number };
  testHooks(): { elements: { id: string }[] };
  element(id: string): { body: { px: number; py: number } } | undefined;
}

/** Витрина текущего кадра. Дев-хук — единственная дверь внутрь канваса (как `__fd` у песочницы). */
export function scene(canvasElement: HTMLElement): SceneLike {
  const w = canvasElement.ownerDocument.defaultView as unknown as { __kit?: { scene?: SceneLike } };
  const s = w.__kit?.scene;
  if (!s) throw new Error("витрина не поднята: нет window.__kit.scene");
  return s;
}

/**
 * Дождаться, пока витрина соберётся и в ней появится нужный элемент.
 *
 * Сценарий стартует сразу после рендера React-хоста, а канвас поднимается асинхронно (пул витрин,
 * текстуры) — без ожидания первый же шаг падал с «нет элемента».
 */
export async function waitForElement(canvasElement: HTMLElement, id: string, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      if (scene(canvasElement).element(id)) return;
    } catch {
      // витрина ещё не поднялась — это нормальное состояние первых кадров
    }
    if (Date.now() - started > timeoutMs) throw new Error(`витрина не собралась: нет элемента ${id}`);
    await wait(50);
  }
}

/** Где предмет ЛЕЖИТ — в координатах контента (их же печатает раскладка секции). */
export function elementAt(canvasElement: HTMLElement, id: string): Pt {
  const el = scene(canvasElement).element(id);
  if (!el) throw new Error(`нет элемента ${id}`);
  return { x: el.body.px, y: el.body.py };
}

const toScreen = (canvasElement: HTMLElement, p: Pt): Pt => {
  const cv = canvasElement.querySelector("canvas")!;
  const r = cv.getBoundingClientRect();
  const v = scene(canvasElement).viewport;
  return { x: r.x + v.x + p.x * v.zoom, y: r.y + v.y + p.y * v.zoom };
};

const fire = (canvasElement: HTMLElement, type: string, p: Pt): void => {
  const cv = canvasElement.querySelector("canvas")!;
  cv.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true, buttons: type === "pointerup" ? 0 : 1 }));
};


/**
 * Перетащить: нажать в одной точке КОНТЕНТА, довести до другой, отпустить.
 *
 * Шагов много и они мелкие не для красоты: движок отличает тап от драга по сдвигу пальца, а тело
 * едет пружиной — «прыжок» одним событием не проходит ни через порог, ни через хит-тест зоны.
 * Пауза в конце — чтобы пружина доехала: сразу после отпускания предмет ещё в полёте.
 */
export async function dragOnCanvas(canvasElement: HTMLElement, from: Pt, to: Pt, steps = 10): Promise<void> {
  const a = toScreen(canvasElement, from);
  const b = toScreen(canvasElement, to);
  fire(canvasElement, "pointerdown", a);
  await wait(40);
  for (let i = 1; i <= steps; i++) {
    fire(canvasElement, "pointermove", { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
    await wait(20);
  }
  fire(canvasElement, "pointerup", b);
  await wait(900);
}
