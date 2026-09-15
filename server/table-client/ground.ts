// ФОН ЗА СТОЛОМ — сукно хаба: трилистники ползут, поверх — приглушённые ромбики мерцают. Те же плитки
// (`look/src/feltTiles.ts`), те же цвета и те же скорости, что у хаба, когда в нём идёт игра.
//
// Слой DOM под холстом, не холст: фон не зависит от камеры и не перерисовывает стол каждый кадр.

import { clubTile, diamondTile } from "../../look/src/feltTiles.js";
import { PALETTE } from "../../look/src/palette.js";
import { twinkleLevel, twinkleStep } from "../../apps/hub/src/hub/twinkle.js";
import { AT_REST, DRIFT, DRIFT_DIAMONDS, driftStep } from "../../apps/hub/src/hub/drift.js";

/** Хаб кладёт 9.2 единицы на ширину экрана, плитка трилистника — 9.2/18 единицы: ширина / 18. */
const CLUBS_ACROSS = 18;
/** Плитка ромбиков — в 340/72 раза крупнее плитки трилистника (`SPARK_U`). */
const SPARK_SCALE = 340 / 72;
/** Приглушённые ромбики стола (`SPARKLE_DIM`). */
const SPARK_OPACITY = 0.55;

export function mountGround(stage: HTMLElement): void {
  const felt = document.createElement("div");
  const spark = document.createElement("div");
  felt.dataset.g = "ground";
  spark.dataset.g = "sparkle";
  const layer = "position:absolute;inset:0;pointer-events:none;background-repeat:repeat;";
  felt.style.cssText = layer + `background-color:${PALETTE.felt};background-image:url("${clubTile(PALETTE.feltDark)}");`;
  spark.style.cssText = layer + `background-image:url("${diamondTile(PALETTE.sparkleDim)}");`;
  stage.prepend(felt, spark);

  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let clubs = AT_REST;
  let diamonds = AT_REST;
  let phase = 0;
  let last = performance.now();
  const paint = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    if (!still) {
      clubs = driftStep(clubs, dt, 1, DRIFT);
      diamonds = driftStep(diamonds, dt, 1, DRIFT_DIAMONDS);
      phase = twinkleStep(phase, dt, 1);
    }
    const tile = stage.clientWidth / CLUBS_ACROSS;
    const sparkTile = tile * SPARK_SCALE;
    felt.style.backgroundSize = `${tile}px ${tile}px`;
    felt.style.backgroundPosition = `${clubs.x * tile}px ${clubs.y * tile}px`;
    spark.style.backgroundSize = `${sparkTile}px ${sparkTile}px`;
    spark.style.backgroundPosition = `${diamonds.x * sparkTile}px ${diamonds.y * sparkTile}px`;
    // Мерцание хаба — сукно, наплывающее на ромбики (`wash`): здесь то же самое — прозрачность.
    spark.style.opacity = String(SPARK_OPACITY * (1 - twinkleLevel(phase)));
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}
