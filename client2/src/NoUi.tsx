import { useState } from "react";
import { createDeck52, makeRng, shuffle } from "./game/board/solitaireDeck";

// Дебаг-стенд БЕЗ канваса/Pixi — просто читаемые объекты и кнопки, чтобы глазами поймать
// баги в чистой игровой логике до того, как она обрастёт UI. По одной секции на задачу
// (сейчас — #83, колода + тасовка). Секция следующей задачи добавляется рядом, не вместо.

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
    </div>
  );
}
