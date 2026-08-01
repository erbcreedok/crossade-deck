import { useEffect, useRef, useState } from "react";
import type { KitBuild, KitScene, KitSceneOptions } from "../../game/engine/kitScene";
import { fitCanvas } from "../../game/engine/kitExtent";
import { acquireSlot, releaseSlot } from "./kitPool";
import { planFor, type ApplyPlan } from "./argApply";
import { useReducedMotion } from "../../useReducedMotion";
import { useReduceFlash } from "../../useReduceFlash";

// React-хост витрины. Тот же паттерн, что у Playground.tsx (ref на div, движок в useEffect,
// mount/destroy), с одним отличием: движок берётся из ПУЛА и переживает переключение стори.
//
// Стилей из theme.css тут нет намеренно: он ставит html,body{height:100%;overflow:hidden}, что
// уместно приложению во весь экран и вредно странице сторибука. Инлайн-стили — ровно то, что
// нужно канвасу, и ни байтом больше.

export interface CanvasStageProps<T, A extends object> {
  /** Что построить. Получает контекст витрины и текущие аргументы панели. */
  build: (ctx: Parameters<KitBuild>[0], args: A) => void;
  args: A;
  /** Как применять правку аргумента: живьём или пересборкой (см. argApply.ts). */
  apply?: ApplyPlan<T, A>;
  /** По какому элементу применять живые правки. По умолчанию — первый расставленный. */
  target?: (scene: KitScene) => T | undefined;
  /**
   * Донастроить СЦЕНУ перед сборкой. Нужен тому, что настраивается не у элемента, а у сцены:
   * пресет анимации (расписание переворота пачки — её дело, не карты). Зовётся до build и до
   * каждой пересборки, иначе карты родились бы по старому филу.
   */
  onScene?: (scene: KitScene, args: A) => void;
  opts?: KitSceneOptions;
  /** ПОТОЛОК высоты, а не высота: на docs-странице канвас ужимается до нужного витрине. */
  height?: number | string;
}

/**
 * Открыт ли кадр на вкладке Docs, а не в режиме стори.
 *
 * Нужно не только вёрстке. Docs — это ЧИТАЮТ: там уместна галерея всех видов рядом, потому что
 * вопрос «какой из них главный» решается только сравнением. В режиме стори тот же раздел
 * ОТЛАЖИВАЮТ, и лишние соседи мешают: там нужна ровно одна вещь, которую крутит панель.
 *
 * Режим берём из адреса кадра — сторибук ставит `viewMode` сам, и это единственный признак,
 * доступный компоненту внутри превью.
 */
export function isDocsMode(): boolean {
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).get("viewMode") === "docs";
}

export function CanvasStage<T, A extends object>({
  build,
  args,
  apply,
  target,
  onScene,
  opts,
  // 100vh, а НЕ 100%: при layout:"fullscreen" у корня сторибука нет заданной высоты, и «100%»
  // разрешается в auto — хост разрастался до 2276px, канвас печатался во всю эту высоту, а
  // витрина оказывалась ниже видимой области. Внутри iframe 100vh — это ровно окно превью.
  height = "100vh",
}: CanvasStageProps<T, A>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Габарит витрины (сообщает сцена) и место, которое даёт страница. Коробка канваса — их
  // произведение через fitCanvas. Меряем ФРЕЙМ, а не сам хост: хост мы и сжимаем, и мерить его
  // значило бы кормить расчёт его же результатом.
  const [extent, setExtent] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const box = extent && frame ? fitCanvas(extent, frame) : null;
  const sceneRef = useRef<KitScene | null>(null);
  const prevArgs = useRef<A | undefined>(undefined);
  // Держим свежие build/args в ref: эффект монтирования должен сработать ОДИН раз на стори,
  // иначе каждая правка контрола пересоздавала бы витрину и «живые» правки не имели бы смысла.
  const buildRef = useRef(build);
  buildRef.current = build;
  const argsRef = useRef(args);
  argsRef.current = args;
  const onSceneRef = useRef(onScene);
  onSceneRef.current = onScene;

  const reduceMotion = useReducedMotion();
  const reduceFlash = useReduceFlash();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { key, slot } = acquireSlot(opts ?? {});
    sceneRef.current = slot.scene;
    // Дев-хук на ТЕКУЩУЮ витрину — та же идиома, что `__fd` у песочницы и `__sol` у Косынки:
    // канвас не отдаёт ни DOM-узлов, ни ролей, и проверить руками/из e2e его иначе нечем.
    if (import.meta.env.DEV) {
      const g = globalThis as unknown as { __kit?: { scene?: unknown } };
      if (g.__kit) g.__kit.scene = slot.scene;
    }
    const run: KitBuild = (ctx) => buildRef.current(ctx, argsRef.current);
    sceneRef.current && onSceneRef.current?.(slot.scene, argsRef.current);
    // Витрина пулится, слушатель — нет: он про ЭТОТ хост. Снимаем его в cleanup, иначе следующая
    // стори получала бы габарит от предыдущей.
    slot.scene.onExtent = (e) => setExtent(e);

    if (!slot.mounted) {
      slot.mounted = true;
      slot.scene.setBuild(run);
      void slot.scene.mount(host, host.clientWidth || 640, host.clientHeight || 420);
    } else {
      // Канвас уже живой — переносим его сюда и меняем только содержимое. Нового
      // WebGL-контекста не появляется, ради этого всё и затевалось.
      slot.scene.reattach(host, host.clientWidth || 640, host.clientHeight || 420);
      slot.scene.rebuild(run);
    }
    prevArgs.current = undefined; // первый прогон аргументов после (пере)сборки — не диффим

    return () => {
      slot.scene.onExtent = null;
      sceneRef.current = null;
      releaseSlot(key);
    };
    // opts сериализуется в ключ пула; сравнивать объект по ссылке нельзя — он литерал в meta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(opts ?? {})]);

  // Правка аргументов: живьём, где можно, пересборкой — где нельзя.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const prev = prevArgs.current;
    prevArgs.current = args;
    if (!prev) return; // сцену только что собрали этими же аргументами

    onSceneRef.current?.(scene, args);
    const plan = planFor<T, A>(prev, args, apply ?? {});
    if (plan.rebuild) {
      scene.rebuild((ctx) => buildRef.current(ctx, args));
      return;
    }
    const el = target ? target(scene) : (scene.element(scene.testHooks().elements[0]?.id ?? "") as unknown as T);
    if (!el) return;
    // Сеттер вправе сказать «живьём не вышло» уже по значению (например переворот запрещённой
    // к перевороту карты) — тогда честнее пересобрать, чем показать не то, что выбрано.
    for (const step of plan.live) {
      if (step.apply(el, step.value) === "rebuild") {
        scene.rebuild((ctx) => buildRef.current(ctx, args));
        return;
      }
    }
    scene.poke();
  }, [args, apply, target]);

  useEffect(() => {
    sceneRef.current?.setReduceMotion(reduceMotion);
  }, [reduceMotion]);
  useEffect(() => {
    sceneRef.current?.setReduceFlash(reduceFlash);
  }, [reduceFlash]);

  // Сколько места даёт страница. Следим наблюдателем, а не разово: окно меняют руками, панель
  // рычагов раскрывают и закрывают, и канвас, посчитанный по прежней ширине, уезжал бы за кромку.
  useEffect(() => {
    const frameEl = frameRef.current;
    if (!frameEl) return;
    // На Docs высота фрейма — это высота САМОГО канваса (страница там растёт вниз), и мерить её
    // значило бы кормить расчёт его же результатом: коробка ужимала бы себя на каждом кадре.
    // Потолком там служит окно — витрина не должна занимать больше экрана, даже если место есть.
    const measure = () => setFrame({ w: frameEl.clientWidth, h: isDocsMode() ? window.innerHeight : frameEl.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frameEl);
    return () => ro.disconnect();
  }, []);

  return (
    // Фрейм — место, которое даёт страница; канвас внутри него занимает РОВНО витрину и стоит по
    // центру. Раньше канвас растягивался на весь фрейм, и под одной картой лежало пол-экрана
    // сукна, а широкий раздел на узком окне уходил за кромку без всякой возможности его достать.
    <div
      ref={frameRef}
      style={{
        width: "100%",
        height: isDocsMode() ? "auto" : height,
        display: "flex",
        justifyContent: "center",
        alignItems: isDocsMode() ? "flex-start" : "center",
      }}
    >
      <div
        ref={hostRef}
        style={{
          // До первой сборки габарит витрины неизвестен — занимаем фрейм целиком: смонтироваться
          // в нулевую коробку значит потерять первый кадр.
          width: box ? box.w : "100%",
          height: box ? box.h : height,
          minHeight: box ? 0 : 320,
          background: "#2f3d34",
          touchAction: "none",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
