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
    app.newGame();
    setMoves(0);
    const onMove = () => setMoves(app.engine.getState().movesCount);
    const onWin = () => setPhase("won");
    const onLose = () => setPhase("lost");
    app.engine.on("move", onMove);
    app.engine.on("win", onWin);
    app.engine.on("lose", onLose);

    // Дев-хук для e2e и ручной отладки — тот же приём, что `__fd` у песочницы (Playground.tsx).
    // Без него проверить игру можно только «на глаз»: канвас не отдаёт ни DOM-узлов, ни ролей, и
    // ровно на этом однажды прошла мимо неработающая раскладка — драг «не сломал доску» просто
    // потому, что не делал ничего.
    if (import.meta.env.DEV) (window as unknown as { __sol?: SolitaireApp }).__sol = app;

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
    // Свой класс, а не заимствованный `playground`: пасьянс не должен наследовать правила стенда
    // и ломаться от их правки. Сама эта обвязка временна — экраны Косынки переезжают на канвас
    // (ui/TopBar.ts) вместе с переписью её визуального слоя, см. SOLITAIRE-REBUILD-HANDOFF §3.
    <div className="table-screen solitaire-play">
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
