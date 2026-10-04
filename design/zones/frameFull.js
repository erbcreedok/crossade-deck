// КНОПКА «НА ВЕСЬ ЭКРАН» У КАЖДОЙ СЦЕНЫ СТЕНДА: кадр растягивается на всё окно (на айфоне настоящего полноэкранного режима у обычных элементов нет —
// там кадр просто занимает весь вьюпорт), где можно — ещё и `requestFullscreen` (мак, андроид, iPad). Сцена сама подстраивается под размер сцены.
const css = `.frame.full { position: fixed !important; inset: 0; width: 100vw !important; height: 100dvh !important; z-index: 1000; border-radius: 0 !important; box-shadow: none !important; }
.frame:fullscreen { width: 100vw !important; height: 100% !important; border-radius: 0 !important; }
.fsbtn { position: absolute; right: 8px; top: 8px; z-index: 20; width: 30px; height: 30px; border: 0; padding: 0; cursor: pointer; background: #3a2a1d; color: #f5ead0; box-shadow: 0 0 0 2px #0b0704; font: 400 16px 'Tiny5', monospace; opacity: .85; }
.frame.full .fsbtn { top: calc(8px + env(safe-area-inset-top)); right: calc(8px + env(safe-area-inset-right)); }`;

export function addFullscreen(frame, stage) {
  if (!document.getElementById("fs-css")) { const st = document.createElement("style"); st.id = "fs-css"; st.textContent = css; document.head.append(st); }
  const btn = document.createElement("button");
  btn.className = "fsbtn"; btn.textContent = "⛶"; btn.title = "на весь экран";
  frame.append(btn);
  let saved = null;
  const enter = () => {
    saved = stage.style.cssText;
    stage.style.cssText = "left:0;top:0;width:100%;height:100%";
    frame.classList.add("full");
    btn.textContent = "✕";
    (frame.requestFullscreen ?? frame.webkitRequestFullscreen)?.call(frame)?.catch?.(() => {});
  };
  const leave = () => {
    if (saved === null) return;
    stage.style.cssText = saved; saved = null;
    frame.classList.remove("full");
    btn.textContent = "⛶";
  };
  btn.onclick = (e) => { e.stopPropagation(); if (saved === null) enter(); else { (document.fullscreenElement ? document.exitFullscreen() : Promise.resolve()).catch(() => {}); leave(); } };
  // Вышли клавишей Esc или жестом — вернуть кадр.
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && saved !== null) leave(); });
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  return { enter, leave, get on() { return saved !== null; } };
}
