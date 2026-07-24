import { useEffect, useRef } from "react";
import { Path2Scene } from "./game/path2Scene";

// POC-страница Пути 2 (открывается по #path2). Тап по карте перегоняет её в следующий бокс —
// это ТОТ ЖЕ спрайт, летящий пружиной, а не пересоздание. Проверка ядра единого пула вживую.
export function Path2Demo() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new Path2Scene();
    void scene.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => scene.destroy();
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 12px", fontFamily: "VT323, monospace", color: "#cdb98f" }}>
        Путь 2 — POC единого пула. Тапай карты: колода→рука→зона→сброс→колода (один спрайт летит).
      </div>
      <div ref={hostRef} style={{ flex: 1, touchAction: "none" }} />
    </div>
  );
}
