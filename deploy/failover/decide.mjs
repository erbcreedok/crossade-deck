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

/**
 * Пороги можно задать узлу свои: запасной на Fly — последняя ступень, и ждёт дольше мака, чтобы мак,
 * если он включён, успел подхватить первым.
 * @typedef {{ failAfter: number, recoverAfter: number }} Limits
 */
/** @type {Limits} */
const DEFAULT_LIMITS = { failAfter: FAIL_AFTER, recoverAfter: RECOVER_AFTER };

export const fresh = () => ({ table: { on: false, bad: 0, good: 0 }, bot: { on: false, bad: 0, good: 0 } });

/**
 * @param {{ on: boolean, bad: number, good: number }} side
 * @param {{ down: boolean, up: boolean }} proof  оба false — доказательства нет, ничего не меняем
 * @returns {[{ on: boolean, bad: number, good: number }, "start" | "stop" | null]}
 */
function step(side, proof, limits) {
  if (!side.on) {
    if (proof.up) return [{ on: false, bad: 0, good: 0 }, null];
    if (!proof.down) return [side, null];
    const bad = side.bad + 1;
    return bad >= limits.failAfter ? [{ on: true, bad: 0, good: 0 }, "start"] : [{ on: false, bad, good: 0 }, null];
  }
  if (proof.down) return [{ on: true, bad: 0, good: 0 }, null];
  if (!proof.up) return [side, null];
  const good = side.good + 1;
  return good >= limits.recoverAfter ? [{ on: false, bad: 0, good: 0 }, "stop"] : [{ on: true, bad: 0, good }, null];
}

/**
 * @param {ReturnType<typeof fresh>} state
 * @param {{ voyagerTable: boolean, relayUp: boolean | null, liveBot: { other: boolean } | null }} probe
 *   (`voyagerTable` — «кто-то другой, не этот узел, отдаёт стол»: у мака это прямая проба Voyager, у Fly — запись в реестре)
 *   voyagerTable — отвечает ли стол Voyager напрямую; relayUp — видят ли стол люди через постоянный адрес
 *   (null — реле не ответило); liveBot — есть ли в реестре живой бот НЕ с этой машины (null — реестр не ответил).
 */
export function decide(state, probe, limits = DEFAULT_LIMITS) {
  // Стол упал только тогда, когда он молчит напрямую И люди через реле его тоже не видят: обрыв связи
  // одного мака с Voyager сам по себе не повод поднимать второй стол.
  const tableProof = { down: !probe.voyagerTable && probe.relayUp !== true, up: probe.voyagerTable };
  const botProof = probe.liveBot === null ? { down: false, up: false } : { down: !probe.liveBot.other, up: probe.liveBot.other };
  const [table, tableAction] = step(state.table, tableProof, limits);
  const [bot, botAction] = step(state.bot, botProof, limits);
  return { state: { table, bot }, actions: { table: tableAction, bot: botAction } };
}

/**
 * ЧТО СКАЗАЛ РЕЕСТР УЗЛОВ — для узла, у которого нет прямой пробы основного (Fly).
 *
 * «Другой стол жив» — это свежее сообщение стола с ДРУГИМ именем, а не его флаг `serving`: флаг стоит только у того
 * стола, что отвечает на этот запрос, и пока реле прыгает между двумя столами, чужой всегда выглядит «не отвечающим».
 * @param {{ id: string, role: string, up: boolean, polling?: boolean | null }[] | null} nodes  null — реестр не ответил
 * @param {string} selfId
 */
export function readRegistry(nodes, selfId) {
  if (!nodes) return { otherTable: false, liveBot: null };
  return {
    otherTable: nodes.some((n) => n.role === "table" && n.up && n.id !== selfId),
    liveBot: { other: nodes.some((n) => n.role === "bot" && n.up && n.polling && n.id !== selfId) },
  };
}
