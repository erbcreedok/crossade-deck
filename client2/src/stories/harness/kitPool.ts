import { KitScene, type KitSceneOptions } from "../../game/engine/kitScene";
import { ResourcePool } from "./canvasPool";

// Пул живых витрин. Единственная его задача — чтобы переключение стори было ПЕРЕИСПОЛЬЗОВАНИЕМ
// канваса, а не созданием нового. Браузер держит около 16 живых WebGL-контекстов; наивный подход
// («каждая стори монтирует свой Application») упирается в потолок через десяток переключений, и
// тогда чернеет ВСЁ разом, включая уже открытое.

export interface Slot {
  scene: KitScene;
  /** Смонтирована ли уже: первый раз — mount() (поднимает контекст), дальше — reattach(). */
  mounted: boolean;
}

/**
 * Пул живёт на globalThis, а НЕ в области модуля. При HMR модуль переоценивается, и модульная
 * переменная начала бы новую жизнь, забыв про уже созданный контекст — это и есть классическая
 * утечка «Pixi в сторибуке»: правишь файл, счётчик контекстов ползёт, через десяток правок всё
 * чернеет.
 */
const KEY = "__cdKitPool";
type Holder = { [KEY]?: ResourcePool<string, Slot> };

function makePool(cap: number): ResourcePool<string, Slot> {
  return new ResourcePool<string, Slot>({
    create: (key) => ({ scene: new KitScene(JSON.parse(key) as KitSceneOptions), mounted: false }),
    dispose: (slot) => slot.scene.destroy(),
    cap,
  });
}

export function kitPool(cap = 3): ResourcePool<string, Slot> {
  const g = globalThis as Holder;
  g[KEY] ??= makePool(cap);
  return g[KEY];
}

export function acquireSlot(opts: KitSceneOptions): { key: string; slot: Slot } {
  const key = KitScene.key(opts);
  return { key, slot: kitPool().acquire(key) };
}

export function releaseSlot(key: string): void {
  kitPool().release(key);
}

// HMR: без этого каждая правка файла адаптера оставляла бы прежний контекст висеть.
// stats() рядом с пулом наружу — чтобы утечка ловилась одной строкой в консоли, а не гаданием:
//   __kit.pool.stats()   →   { live, idle, created, disposed }
// Здоровый признак: обойти десяток стори и увидеть created === 1.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    kitPool().disposeAll();
    delete (globalThis as Holder)[KEY];
  });
}

if (import.meta.env.DEV) {
  (globalThis as unknown as { __kit?: unknown }).__kit = {
    pool: {
      stats: () => kitPool().stats(),
      disposeAll: () => kitPool().disposeAll(),
    },
  };
}
