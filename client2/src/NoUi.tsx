import { useEffect, useState } from "react";
import { createDeck52, makeRng, shuffle } from "./game/board/solitaireDeck";
import { FOUNDATION_KEYS, TABLEAU_KEYS, type SolitaireGameState } from "./game/board/solitaireState";
import { SolitaireGameEngine, type ActionResult } from "./game/solitaire/engine";

// Дебаг-стенд БЕЗ канваса/Pixi — просто читаемые объекты и кнопки, чтобы глазами поймать
// баги в чистой игровой логике до того, как она обрастёт UI. По одной секции на пласт задач:
// #83 (колода/тасовка), #84–89 (state/reducer/queries/engine — единый живой движок, играбельный
// кликами). Секция следующей задачи добавляется рядом, не вместо.

function isPermutation(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function hasDuplicates(a: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of a) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

function CardRow({ cards, highlightDiffFrom }: { cards: string[]; highlightDiffFrom?: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontFamily: "monospace", fontSize: 14 }}>
      {cards.map((c, i) => {
        const moved = highlightDiffFrom !== undefined && highlightDiffFrom[i] !== c;
        return (
          <span
            key={i}
            title={`индекс ${i}`}
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              background: moved ? "#5a3d1c" : "#3a4a3f",
              color: (c.endsWith("♥") || c.endsWith("♦")) ? "#e08a8a" : "#cdb98f",
              border: moved ? "1px solid #d99a3f" : "1px solid #4a5a4f",
            }}
          >
            {c}
          </span>
        );
      })}
    </div>
  );
}

function DeckSection() {
  const [deck, setDeck] = useState<string[]>(() => createDeck52());
  const [seed, setSeed] = useState(42);
  const [shuffled, setShuffled] = useState<string[] | null>(null);
  const [prevShuffle, setPrevShuffle] = useState<string[] | null>(null);
  const [repeatCheck, setRepeatCheck] = useState<"idle" | "match" | "mismatch">("idle");

  const dupes = hasDuplicates(deck);

  function handleCreateDeck() {
    const d = createDeck52();
    setDeck(d);
    setShuffled(null);
    setPrevShuffle(null);
    setRepeatCheck("idle");
  }

  function handleShuffle() {
    const before = deck.slice();
    const result = shuffle(deck, makeRng(seed));
    // проверяем, что shuffle не мутировал вход
    const inputUnchanged = before.every((v, i) => v === deck[i]);
    if (!inputUnchanged) {
      console.error("[no-ui] shuffle МУТИРОВАЛ входной массив!", { before, after: deck });
    }
    setShuffled(result);
    setPrevShuffle(null);
    setRepeatCheck("idle");
  }

  function handleRepeatShuffle() {
    if (!shuffled) return;
    const again = shuffle(deck, makeRng(seed));
    const match = again.every((v, i) => v === shuffled[i]);
    setPrevShuffle(shuffled);
    setShuffled(again);
    setRepeatCheck(match ? "match" : "mismatch");
  }

  return (
    <section style={{ marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid #4a5a4f" }}>
      <h2>#83 — createDeck52 / makeRng / shuffle</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={handleCreateDeck}>Создать новую колоду (52)</button>
        <label>
          seed:{" "}
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
        <button onClick={handleShuffle}>Перемешать(deck, makeRng(seed))</button>
        <button onClick={handleRepeatShuffle} disabled={!shuffled}>
          Повторить с тем же seed (проверка детерминизма)
        </button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <b>Колода (as-is), {deck.length} карт.</b>{" "}
        {deck.length !== 52 && <span style={{ color: "#e08a8a" }}>⚠ ожидалось 52!</span>}{" "}
        {dupes.length > 0 && (
          <span style={{ color: "#e08a8a" }}>⚠ дубликаты: {dupes.join(", ")}</span>
        )}
      </div>
      <CardRow cards={deck} />

      {shuffled && (
        <>
          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <b>После shuffle (seed={seed}).</b>{" "}
            Перестановка того же набора:{" "}
            {isPermutation(deck, shuffled) ? (
              <span style={{ color: "#8fcf8f" }}>да ✓</span>
            ) : (
              <span style={{ color: "#e08a8a" }}>НЕТ — потеря/дубль карт! ⚠</span>
            )}
            {"  "}
            Порядок изменился:{" "}
            {shuffled.some((c, i) => c !== deck[i]) ? (
              <span style={{ color: "#8fcf8f" }}>да ✓</span>
            ) : (
              <span style={{ color: "#e08a8a" }}>нет (подозрительно для 52 карт) ⚠</span>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
            подсвечены карты, чья позиция отличается от исходной колоды выше
          </div>
          <CardRow cards={shuffled} highlightDiffFrom={deck} />
        </>
      )}

      {prevShuffle && (
        <div style={{ marginTop: 12 }}>
          <b>Повтор с тем же seed:</b>{" "}
          {repeatCheck === "match" && <span style={{ color: "#8fcf8f" }}>совпал полностью ✓ (детерминизм ОК)</span>}
          {repeatCheck === "mismatch" && (
            <span style={{ color: "#e08a8a" }}>⚠ РАСХОДИТСЯ — makeRng/shuffle НЕ детерминированы!</span>
          )}
        </div>
      )}
    </section>
  );
}

const ALL_SLOTS = ["stock", "waste", ...FOUNDATION_KEYS, ...TABLEAU_KEYS];

type Picked = { slot: string; fromIndex: number; cards: string[] };

// Индекс «верха» внутри слота зависит от смысла слота: waste/found/tableau копятся с конца
// (members[последний] — то, что видно/берётся), а stock раздаёт с ПЕРЕДА (members[0] — то, что
// уйдёт следующим через dealStock()). Смешать эти два понятия в одном кликабельном ряду —
// показать пользователю неверную карту как «активную». У stock клика по карте поэтому нет вовсе:
// единственный реальный способ её тронуть — кнопка dealStock(), как и в настоящем солитёре.
//
// allowRun (только tableau): движок умеет moveStack — переносить не только верхнюю карту, а
// целый «ран» подряд идущих. Кликабельна ЛЮБАЯ карта колонки — выбор захватывает её и всё, что
// выше (к хвосту массива). Легальность рана (чередование цвета, убывание ранга) проверяет сам
// движок при таргете и ответит отказом, если ран внутри себя невалиден — тут ничего не фильтруем
// заранее, чтобы такие невалидные попытки тоже можно было проверить на этом стенде.
function Slot({
  slotKey,
  cards,
  selectedCard,
  onPick,
  onTarget,
  pickable = true,
  allowRun = false,
  isFaceUp,
}: {
  slotKey: string;
  cards: string[];
  selectedCard: Picked | null;
  onPick: (slot: string, fromIndex: number, cards: string[]) => void;
  onTarget: (slot: string) => void;
  pickable?: boolean;
  allowRun?: boolean;
  /** #100 — движок теперь знает, какая карта видна, а какая ещё не раскрыта; стенд обязан это
   *  честно рисовать, а не показывать реальное лицо любой карты, лежащей в state. */
  isFaceUp: (card: string) => boolean;
}) {
  const isTargetable = selectedCard !== null && selectedCard.slot !== slotKey;
  return (
    <div
      style={{
        border: isTargetable ? "1px dashed #d99a3f" : "1px solid #4a5a4f",
        borderRadius: 6,
        padding: 6,
        minWidth: 120,
        minHeight: 40,
        cursor: isTargetable ? "pointer" : "default",
        background: isTargetable ? "#3a2f1c" : "transparent",
      }}
      onClick={() => isTargetable && onTarget(slotKey)}
      title={isTargetable ? `цель: перенести ${selectedCard!.cards.join(",")} сюда` : undefined}
    >
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
        {slotKey} ({cards.length}) {!pickable && cards.length > 0 && "· следующая раздача: " + cards[0]}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {cards.map((c, i) => {
          const isActive = pickable && (allowRun || i === cards.length - 1);
          const picked = selectedCard?.slot === slotKey && i >= selectedCard.fromIndex;
          const faceUp = isFaceUp(c);
          return (
            <button
              key={i}
              disabled={!isActive}
              title={faceUp ? c : `${c} (рубашкой вверх, ещё не раскрыта)`}
              onClick={(e) => {
                e.stopPropagation();
                if (isActive) onPick(slotKey, i, cards.slice(i));
              }}
              style={{
                padding: "2px 6px",
                fontFamily: "monospace",
                fontSize: 13,
                borderRadius: 4,
                background: picked ? "#d99a3f" : faceUp ? (isActive ? "#3a4a3f" : "#2a3a2f") : "#1c2721",
                color: picked
                  ? "#2f3d34"
                  : !faceUp
                    ? "#5a6a5f"
                    : c.endsWith("♥") || c.endsWith("♦")
                      ? "#e08a8a"
                      : "#cdb98f",
                border: i === 0 && !pickable ? "1px solid #d99a3f" : "1px solid #4a5a4f",
                opacity: isActive || (i === 0 && !pickable) ? 1 : 0.55,
                cursor: isActive ? "pointer" : "default",
              }}
            >
              {faceUp ? c : "🂠"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EngineSection() {
  const [engine] = useState(() => new SolitaireGameEngine());
  const [state, setState] = useState<SolitaireGameState>(() => engine.getState());
  const [seed, setSeed] = useState(1);
  const [selected, setSelected] = useState<Picked | null>(null);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [eventLog, setEventLog] = useState<string[]>([]);

  // Подписка на реальную событийную шину движка (#91) — отдельно от ручного sync() выше,
  // чтобы глазами видеть, что move/win/lose реально стреляют, а не просто верить sync().
  useEffect(() => {
    const onMove = (action: { type: string }) => setEventLog((prev) => [`event move: ${action.type}`, ...prev].slice(0, 12));
    const onWin = () => setEventLog((prev) => [`event win 🏆`, ...prev].slice(0, 12));
    const onLose = () => setEventLog((prev) => [`event lose 💀`, ...prev].slice(0, 12));
    engine.on("move", onMove);
    engine.on("win", onWin);
    engine.on("lose", onLose);
    return () => {
      engine.off("move", onMove);
      engine.off("win", onWin);
      engine.off("lose", onLose);
    };
  }, [engine]);

  function sync(actionLabel: string, result?: ActionResult) {
    setState({ ...engine.getState() });
    if (result) setLastResult(result);
    setLog((prev) => [`${actionLabel}${result ? (result.valid ? " → ok" : ` → отклонено: ${result.error}`) : ""}`, ...prev].slice(0, 12));
  }

  function handleReset(withSeed: boolean) {
    engine.resetGame(withSeed ? seed : undefined);
    setSelected(null);
    setLastResult(null);
    sync(withSeed ? `resetGame(${seed})` : "resetGame(случайно)");
  }

  function handleDealStock() {
    const r = engine.dealStock();
    sync("dealStock()", r);
  }

  function handlePick(slot: string, fromIndex: number, cards: string[]) {
    setSelected((prev) => (prev?.slot === slot && prev.fromIndex === fromIndex ? null : { slot, fromIndex, cards }));
  }

  function handleTarget(toSlot: string) {
    if (!selected) return;
    // moveStack сам делегирует в moveCard при одной карте — единый вызов что для одиночной
    // карты (waste/found/верх tableau), что для рана (несколько карт из tableau).
    const r = engine.moveStack(selected.slot, toSlot, selected.cards);
    sync(`moveStack(${selected.slot} → ${toSlot}, [${selected.cards.join(",")}])`, r);
    setSelected(null);
  }

  // note: read via `state` too, только чтобы React перерисовал секцию при его смене (методы
  // движка сами читают приватный this.state, не принимают аргумент).
  void state;
  const win = engine.isWinning();
  const canMove = engine.canMakeMove();
  const moves = engine.getPossibleMoves();

  return (
    <section style={{ marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid #4a5a4f" }}>
      <h2>#84–89 — SolitaireGameEngine (state + reducer + queries + методы)</h2>
      <p style={{ opacity: 0.7, fontSize: 13, maxWidth: 700 }}>
        Живой движок: кликни карту (кроме stock — её берут только кнопкой). В waste/found —
        только верхняя; в tableau — ЛЮБАЯ карта колонки, выбор захватывает её и весь ран выше
        (несколько карт сразу, как реальный перенос стопки). Выбор подсветится жёлтым; затем
        кликни слот-цель (пунктирная рамка) — вызовется <code>engine.moveStack</code> (сама
        сводится к <code>moveCard</code> для одной карты). «Взять» триггерит{" "}
        <code>dealStock()</code> (сама решает раздать или рециклить); карта, которую она возьмёт
        следующей, подсвечена в stock отдельно.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => handleReset(true)}>resetGame(seed)</button>
        <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 70 }} />
        <button onClick={() => handleReset(false)}>resetGame(случайно)</button>
        <button onClick={handleDealStock}>dealStock() — взять / рециклить</button>
        {selected && (
          <span style={{ color: "#d99a3f" }}>
            выбрано: [{selected.cards.join(", ")}] из {selected.slot} — кликни цель
          </span>
        )}
      </div>

      <div style={{ marginBottom: 8, fontSize: 13 }}>
        <b>phase:</b> {state.phase} &nbsp; <b>movesCount:</b> {state.movesCount} &nbsp;
        <b>isWinning():</b> {win ? <span style={{ color: "#8fcf8f" }}>true ✓</span> : "false"} &nbsp;
        <b>canMakeMove():</b> {canMove ? <span style={{ color: "#8fcf8f" }}>true</span> : <span style={{ color: "#e08a8a" }}>false — тупик</span>}
        &nbsp; <b>getPossibleMoves():</b> {moves.length}
        {lastResult && !lastResult.valid && (
          <div style={{ color: "#e08a8a", marginTop: 4 }}>⚠ последний ход отклонён: {lastResult.error}</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <Slot slotKey="stock" cards={state.board.slots.stock?.members ?? []} selectedCard={selected} onPick={handlePick} onTarget={handleTarget} pickable={false} isFaceUp={(c) => engine.isFaceUp(c)} />
        <Slot slotKey="waste" cards={state.board.slots.waste?.members ?? []} selectedCard={selected} onPick={handlePick} onTarget={handleTarget} isFaceUp={(c) => engine.isFaceUp(c)} />
        {FOUNDATION_KEYS.map((k) => (
          <Slot key={k} slotKey={k} cards={state.board.slots[k]?.members ?? []} selectedCard={selected} onPick={handlePick} onTarget={handleTarget} isFaceUp={(c) => engine.isFaceUp(c)} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {TABLEAU_KEYS.map((k) => (
          <Slot key={k} slotKey={k} cards={state.board.slots[k]?.members ?? []} selectedCard={selected} onPick={handlePick} onTarget={handleTarget} allowRun isFaceUp={(c) => engine.isFaceUp(c)} />
        ))}
      </div>

      <details>
        <summary style={{ cursor: "pointer" }}>getPossibleMoves() — сырой список ({moves.length})</summary>
        <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{JSON.stringify(moves, null, 2)}</pre>
      </details>

      <div style={{ display: "flex", gap: 24, marginTop: 12, fontSize: 12 }}>
        <div>
          <b>Журнал действий (UI):</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
        <div>
          <b>Журнал событий движка (#91: on/off):</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {eventLog.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer" }}>Все ключи слотов (для сверки, {ALL_SLOTS.length})</summary>
        <pre style={{ fontSize: 12 }}>{ALL_SLOTS.join(", ")}</pre>
      </details>
    </section>
  );
}

export function NoUiPage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        padding: 20,
        background: "#2f3d34",
        color: "#cdb98f",
      }}
    >
      <h1>/no-ui — дебаг-стенд игровой логики (без канваса)</h1>
      <p style={{ opacity: 0.8, maxWidth: 700 }}>
        Читаемые данные + кнопки-триггеры для каждой чистой функции движка, по одной секции на
        задачу. Цель — ловить баги логики глазами до того, как она обрастёт визуалом, и находить
        места, где спецификация задачи не продумана.
      </p>
      <DeckSection />
      <EngineSection />
    </div>
  );
}
