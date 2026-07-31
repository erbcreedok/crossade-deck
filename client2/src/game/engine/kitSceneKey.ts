import { SANDBOX_CARD_H } from "./constants";
import { SB_MARGIN } from "./sandboxLayout";
import type { CameraConfig } from "./sceneEngine";

// Ключ пула витрин и его обратная сторона — РАЗБОР ключа обратно в опции.
//
// Файл отдельный и БЕЗ Pixi намеренно: ключ обязан быть обратимым (пул создаёт витрину, имея на
// руках только строку ключа), а «обязан» без теста — это пожелание. Пока ключ жил внутри KitScene,
// проверить его в node было нечем, и он молча разъехался: ключом был МАССИВ значений, а пул делал
// `new KitScene(JSON.parse(key))` и получал массив вместо объекта опций. Никакой ошибки при этом не
// возникало — просто КАЖДАЯ опция стори (высота карты, паддинг, камера) тихо заменялась дефолтом.

export interface KitSceneOptions {
  cardHeight?: number;
  camera?: CameraConfig;
  padding?: number;
  /** Вписать витрину в экран зумом при сборке (дефолт true — витрина должна быть видна целиком). */
  fitOnBuild?: boolean;
}

/** Опции витрины со всеми дефолтами на месте. Ровно это и сериализуется в ключ. */
export interface NormalKitOptions {
  cardHeight: number;
  padding: number;
  fitOnBuild: boolean;
  camera: CameraConfig | null;
}

export function normalizeKitOptions(o: KitSceneOptions = {}): NormalKitOptions {
  return {
    cardHeight: o.cardHeight ?? SANDBOX_CARD_H,
    padding: o.padding ?? SB_MARGIN,
    fitOnBuild: o.fitOnBuild ?? true,
    camera: o.camera ?? null,
  };
}

/** Ключ пула: витрины с разными опциями не должны переиспользовать друг друга. */
export function kitSceneKey(o: KitSceneOptions = {}): string {
  return JSON.stringify(normalizeKitOptions(o));
}

/** Разобрать ключ обратно в опции. Ключ не наш (или битый) — честные дефолты, без исключения. */
export function parseKitSceneKey(key: string): KitSceneOptions {
  try {
    const v = JSON.parse(key) as Partial<NormalKitOptions>;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return {
      cardHeight: typeof v.cardHeight === "number" ? v.cardHeight : undefined,
      padding: typeof v.padding === "number" ? v.padding : undefined,
      fitOnBuild: typeof v.fitOnBuild === "boolean" ? v.fitOnBuild : undefined,
      camera: v.camera ?? undefined,
    };
  } catch {
    return {};
  }
}
