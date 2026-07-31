import { useEffect, useRef, useState } from "react";
import { SolitaireApp } from "./game/solitaire/app";
import { goApp } from "./nav";

// Хост «Косынки» (issue #97+#98): меню → игра → выигрыш/проигрыш, тем же паттерном, что и
// Playground.tsx монтирует свой движок — useRef на host-div, `new` в useEffect, mount/destroy.
// Канвас (SolitaireApp) поднимается ТОЛЬКО в фазе "playing" (условный useEffect ниже) — до
// «Новой игры» рисовать нечего, а после победы/поражения полю всё равно нечего больше принимать.
type Phase = "menu" | "playing" | "won" | "lost";

export function SolitaireGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<SolitaireApp | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [moves, setMoves] = useState(0);

  useEffect(() => {
    if (phase !== "playing") return;
    const host = hostRef.current;
    if (!host) return;

    const app = new SolitaireApp();
    appRef.current = app;
    app.engine.resetGame();
    setMoves(0);
    const onMove = () => setMoves(app.engine.getState().movesCount);
    const onWin = () => setPhase("won");
    const onLose = () => setPhase("lost");
    app.engine.on("move", onMove);
    app.engine.on("win", onWin);
    app.engine.on("lose", onLose);

    void app.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => {
      app.engine.off("move", onMove);
      app.engine.off("win", onWin);
      app.engine.off("lose", onLose);
      app.destroy();
      appRef.current = null;
    };
  }, [phase]);

  const handleNewGame = (): void => setPhase("playing");

  if (phase === "menu") {
    return (
      <div className="table-screen solitaire-screen">
        <button className="fd-btn" onClick={() => goApp("")}>
          ← в меню
        </button>
        <div className="solitaire-panel">
          <h1 className="solitaire-title">Косынка</h1>
          <button className="fd-btn fd-btn-lg" onClick={handleNewGame}>
            Новая игра
          </button>
        </div>
      </div>
    );
  }

  if (phase === "won" || phase === "lost") {
    return (
      <div className="table-screen solitaire-screen">
        <div className="solitaire-panel">
          <h1 className="solitaire-title">{phase === "won" ? "🎉 Вы выиграли!" : "⚠️ Нет ходов"}</h1>
          <p className="solitaire-moves">Ходов: {moves}</p>
          <button className="fd-btn fd-btn-lg" onClick={handleNewGame}>
            Новая игра
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="table-screen playground">
      <div className="fd-topbar">
        <button className="fd-btn" onClick={() => goApp("")}>
          ← в меню
        </button>
        <span className="solitaire-counter">Ходов: {moves}</span>
      </div>
      <div ref={hostRef} className="table-host" />
    </div>
  );
}
