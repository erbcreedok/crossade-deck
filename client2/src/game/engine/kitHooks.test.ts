import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { kitHooks } from "./kitHooks";
import type { SceneApi } from "./sceneContract";
import type { KitPlaced } from "./kitPlaced";

// Камера витрины наружу — только ДЕВ-ХУКОМ. Пока сцены были классами с наследованием, `viewport`
// был их публичным полем, и все, кто ведёт палец в точку КОНТЕНТА (e2e витрины, сценарии `play()`),
// читали его прямо у сцены. С переходом на композицию камера уехала к движку, поле исчезло — и эти
// читатели молча сломались: tsc их не видит (page.evaluate — строка для браузера), юниты про
// браузер не знают, а e2e просто покраснел и остался красным. Оба сторожа ниже — про это.

const CAMERA = { x: 12, y: 34, zoom: 0.5 };

function fakeApi(): SceneApi {
  return {
    contentToScreen: (x: number, y: number) => ({ x: CAMERA.x + x * CAMERA.zoom, y: CAMERA.y + y * CAMERA.zoom }),
    contentSize: () => ({ w: 200, h: 100 }),
    viewport: () => CAMERA,
    buttonsRef: () => [],
    grabbersList: () => [],
    markersList: () => [],
  } as unknown as SceneApi;
}

const placedWith = (px: number, py: number): KitPlaced =>
  ({
    list: () => [{ el: { id: "c1", body: { px, py }, state: "rest", faceUp: true } }],
  }) as unknown as KitPlaced;

describe("дев-хуки витрины", () => {
  it("отдают камеру (сдвиг и масштаб) — по ней палец переводит контентную точку в экранную", () => {
    const h = kitHooks(fakeApi(), placedWith(100, 40), []);
    expect(h.camera).toEqual(CAMERA);
    // И та же камера согласована с экранными координатами предметов: иначе жест и хук разошлись бы.
    expect(h.elements[0]).toMatchObject({ id: "c1", x: CAMERA.x + 100 * CAMERA.zoom, y: CAMERA.y + 40 * CAMERA.zoom });
  });
});

/** Все файлы дерева с указанными расширениями. */
function walk(dir: string, ext: readonly string[], out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (ext.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

describe("камера не читается полем у сцены", () => {
  // Внутри движка `e.viewport` — его собственное поле, это законно. Снаружи камеру берут либо
  // вызовом `api.viewport()`, либо из дев-хука; `.viewport` полем снаружи значит «читаем у сцены».
  const ENGINE = join(process.cwd(), "src/game/engine");
  const roots = ["src", "e2e"].map((d) => join(process.cwd(), d));

  it("ни в исходниках, ни в e2e никто не обращается к `.viewport` как к полю", () => {
    const bad: string[] = [];
    for (const root of roots) {
      for (const file of walk(root, [".ts", ".tsx"])) {
        if (file.startsWith(ENGINE)) continue;
        const src = readFileSync(file, "utf8");
        src.split("\n").forEach((line, i) => {
          // `.viewport(` — законный вызов через SceneApi; `.viewport` без скобок — чтение поля.
          if (/\.viewport\b(?!\s*\()/.test(line)) bad.push(`${file.slice(process.cwd().length + 1)}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(bad, "камера наружу — только через api.viewport() или дев-хук testHooks().camera").toEqual([]);
  });
});
