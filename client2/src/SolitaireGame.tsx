import { useEffect, useRef, useState } from "react";
import { SolitaireScene } from "./game/solitaire/scene";
import { goApp } from "./nav";

// Хост «Косынки»: меню → игра → выигрыш/проигрыш, тем же паттерном, что Playground.tsx монтирует
// свой движок — useRef на host-div, `new` в useEffect, mount/destroy. Канвас поднимается ТОЛЬКО в
// фазе "playing": до «Новой игры» рисовать нечего.
//
// Внутри игры HTML не осталось: топбар («в меню» / «новая» / счётчик ходов) рисует сам движок
// (ui/TopBar на канвасе). Экраны фаз пока React — они переезжают на канвас следующим шагом
// (SOLITAIRE-REBUILD-HANDOFF §4).
type Phase = "menu" | "playing" | "won" | "lost";

export function SolitaireGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [moves, setMoves] = useState(0);

  useEffect(() => {
    if (phase !== "playing") return;
    const host = hostRef.current;
    if (!host) return;

    const scene = new SolitaireScene({ onBack: () => goApp("") });
    scene.newGame();
    setMoves(0);
    const onMove = () => setMoves(scene.engine.getState().movesCount);
    const onWin = () => setPhase("won");
    const onLose = () => setPhase("lost");
    scene.engine.on("move", onMove);
    scene.engine.on("win", onWin);
    scene.engine.on("lose", onLose);

    // Дев-хук для e2e и ручной отладки — тот же приём, что `__fd` у песочницы. Без него проверить
    // игру можно только «на глаз»: канвас не отдаёт ни DOM-узлов, ни ролей, и ровно на этом
    // однажды прошла мимо неработающая раскладка (драг «не сломал доску» просто потому, что не
    // делал ничего). См. §6 хендоффа — обязательный минимум ручной проверки идёт через него.
    if (import.meta.env.DEV) (window as unknown as { __sol?: SolitaireScene }).__sol = scene;

    void scene.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => {
      scene.engine.off("move", onMove);
      scene.engine.off("win", onWin);
      scene.engine.off("lose", onLose);
      scene.destroy();
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
    <div className="table-screen solitaire-play">
      <div ref={hostRef} className="table-host" />
    </div>
  );
}
