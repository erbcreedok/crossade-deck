import { Application } from "pixi.js";

// Общие куски жизненного цикла канвас-движков (DRY для menu/playground/table).

// Pixi рисует текст в текстуру ОДИН раз при создании — ждём веб-шрифт (Handjet) ДО отрисовки, иначе
// берётся фолбэк и раскладка/размеры плывут. Google Fonts отдаёт Handjet ПОДМНОЖЕСТВАМИ по unicode-range:
// load без текста тянет только латиницу, а UI кириллический (+казахский) → передаём образец, чтобы
// скачались нужные подмножества ДО первого рендера (иначе кириллица моргает фолбэком на канвасе).
const FONT_SAMPLE = "AZaz09абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГ ӘәҒғҚқҢңӨөҰұҮүҺһІі";
export async function ensureFonts(): Promise<void> {
  const f = (document as unknown as { fonts?: FontFaceSet }).fonts;
  if (!f) return;
  try {
    await f.load("16px Handjet", FONT_SAMPLE);
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
