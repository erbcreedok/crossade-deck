// РЕШЕНИЯ ЗАПАСНОГО УЗЛА — чистая логика, без сети и без launchd, чтобы её можно было проверить тестом.
//
// Два независимых «плеча»: стол и бот. Каждое либо ВЫКЛЮЧЕНО (основной — Voyager — работает, мак молчит),
// либо ВКЛЮЧЕНО (мак подхватил). Переключение — только после нескольких проверок подряд: одна неудавшаяся
// проба не повод ни поднимать мак, ни тем более его гасить.
//
// «Основной упал» и «основной жив» — это ДОКАЗАТЕЛЬСТВА, а не отсутствие вестей: если проба сама не удалась
// (реестр не ответил), доказательства нет ни за одно, и счётчики держатся как были.

/** Проб подряд (по 15 с), чтобы признать основной упавшим. */
export const FAIL_AFTER = 4;
/** Проб подряд, чтобы признать, что основной вернулся. */
export const RECOVER_AFTER = 4;

export const fresh = () => ({ table: { on: false, bad: 0, good: 0 }, bot: { on: false, bad: 0, good: 0 } });

/**
 * @param {{ on: boolean, bad: number, good: number }} side
 * @param {{ down: boolean, up: boolean }} proof  оба false — доказательства нет, ничего не меняем
 * @returns {[{ on: boolean, bad: number, good: number }, "start" | "stop" | null]}
 */
function step(side, proof) {
  if (!side.on) {
    if (proof.up) return [{ on: false, bad: 0, good: 0 }, null];
    if (!proof.down) return [side, null];
    const bad = side.bad + 1;
    return bad >= FAIL_AFTER ? [{ on: true, bad: 0, good: 0 }, "start"] : [{ on: false, bad, good: 0 }, null];
  }
  if (proof.down) return [{ on: true, bad: 0, good: 0 }, null];
  if (!proof.up) return [side, null];
  const good = side.good + 1;
  return good >= RECOVER_AFTER ? [{ on: false, bad: 0, good: 0 }, "stop"] : [{ on: true, bad: 0, good }, null];
}

/**
 * @param {ReturnType<typeof fresh>} state
 * @param {{ voyagerTable: boolean, relayUp: boolean | null, liveBot: { other: boolean } | null }} probe
 *   voyagerTable — отвечает ли стол Voyager напрямую; relayUp — видят ли стол люди через постоянный адрес
 *   (null — реле не ответило); liveBot — есть ли в реестре живой бот НЕ с этой машины (null — реестр не ответил).
 */
export function decide(state, probe) {
  // Стол упал только тогда, когда он молчит напрямую И люди через реле его тоже не видят: обрыв связи
  // одного мака с Voyager сам по себе не повод поднимать второй стол.
  const tableProof = { down: !probe.voyagerTable && probe.relayUp !== true, up: probe.voyagerTable };
  const botProof = probe.liveBot === null ? { down: false, up: false } : { down: !probe.liveBot.other, up: probe.liveBot.other };
  const [table, tableAction] = step(state.table, tableProof);
  const [bot, botAction] = step(state.bot, botProof);
  return { state: { table, bot }, actions: { table: tableAction, bot: botAction } };
}
