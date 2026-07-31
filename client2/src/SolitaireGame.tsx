import { useEffect, useRef } from "react";
import { SolitaireScene } from "./game/solitaire/scene";
import { goApp } from "./nav";

// Хост «Косынки» — тонкий: канвас поднимается один раз и живёт до ухода со страницы. Ни фаз, ни
// экранов, ни топбара в React нет: меню, счётчик ходов и экраны победы/поражения рисует сам
// движок (ui/TopBar + ui/OverlayPanel на канвасе). Решение владельца — HTML в приложении быть не
// должно, всё рисует движок: так оно переносится на платформы без DOM и вёрстка не разъезжается
// между экраном игры и экраном итога.
export function SolitaireGame() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new SolitaireScene({ onBack: () => goApp("") });

    // Дев-хук для e2e и ручной отладки — тот же приём, что `__fd` у песочницы. Без него проверить
    // игру можно только «на глаз»: канвас не отдаёт ни DOM-узлов, ни ролей, и ровно на этом
    // однажды прошла мимо неработающая раскладка (драг «не сломал доску» просто потому, что не
    // делал ничего). См. §6 хендоффа — обязательный минимум ручной проверки идёт через него.
    if (import.meta.env.DEV) (window as unknown as { __sol?: SolitaireScene }).__sol = scene;

    void scene.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => scene.destroy();
  }, []);

  return (
    <div className="table-screen">
      <div ref={hostRef} className="table-host" />
    </div>
  );
}
