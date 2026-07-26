import { Application } from "pixi.js";

// Общие куски жизненного цикла канвас-движков (DRY для menu/freeDesk/table).

// Pixi рисует текст в текстуру ОДИН раз при создании — ждём веб-шрифты (VT323) ДО отрисовки,
// иначе берётся узкий фолбэк и раскладка/размеры плывут (на устройстве шрифт из кэша шире).
// NB: у VT323 НЕТ кириллицы — русский текст всегда идёт фолбэком monospace (на устройстве системный
// моно, в headless-Linux — сериф). Если нужен пиксельный вид кириллицы — нужен кириллический пиксель-шрифт.
export async function ensureFonts(): Promise<void> {
  const f = (document as unknown as { fonts?: FontFaceSet }).fonts;
  if (!f) return;
  try {
    await Promise.all([f.load("16px VT323"), f.load('16px "Press Start 2P"')]);
    await f.ready;
  } catch {
    /* оффлайн — рисуем фолбэком, лучше чем зависнуть */
  }
}

// Создать и проинициализировать Pixi-приложение (единые опции). null — если init упал.
export async function createPixiApp(width: number, height: number): Promise<Application | null> {
  const app = new Application();
  try {
    await app.init({
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      autoStart: false,
      preference: "webgl",
    });
  } catch {
    return null;
  }
  return app;
}
