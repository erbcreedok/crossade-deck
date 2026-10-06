// ОДИН «СЕТЕВОЙ» СЛОЙ ДЛЯ ВСЕХ СТЕНДОВ С ДВУМЯ СЦЕНАМИ (сверху и от первого лица над одним столом). Страницы сцен его не переписывают: подключают и всё.
//
// Что он делает вместо сети. Каждая сцена видит стол из места своего наблюдателя, а двигает всё от имени выбранного игрока (`controller`). Слова «что несёт мой палец» доходят до соседней сцены
// с пингом и дрожанием (`lat`, `jit`, мс), как через сервер: пакетами и по порядку. Что именно несут — решает `carryOf` (`tape.ts`, он же кормит реплей): одна карта — это `carries`, всё целиком
// (стопка, рука стула и всякая будущая вещь, которую `carryOf` научится нести) — `stacks`. Страницам про вид вещи знать не нужно: новая вещь на стенде — это строка в `carryOf`, а не правка каждой страницы.

const CTL_KEYS = new Set(["body", "say", "shoot", "mic", "log", "rtc", "askStickers", "watch"]);
/** Сколько мс слову про одну карту верят после последнего (замолчал — отпустили); целой вещи верят, пока её держат (замок), но не дольше. */
const FRESH = { one: 400, whole: 2500 };

export function standNet({ views, controller, viewpointOf, carryOf }) {
  const lat = { top: 0, first: 0 }, jit = { top: 0, first: 0 };
  const sendAt = { top: 0, first: 0 };
  const inbox = { top: null, first: null }, lastAt = { top: 0, first: 0 }, hear = { top: [], first: [] };
  const otherOf = (which) => (which === "top" ? "first" : "top");
  // Слова доходят по порядку (как по сокету): задержавшиеся приходят пачкой, а между ними пауза — вещь у соседа стоит, потом прыгает.
  const note = (who, out) => {
    const other = otherOf(who);
    const at = Math.max(lastAt[other] + 1, performance.now() + lat[who] + lat[other] + Math.random() * (jit[who] + jit[other]));
    lastAt[other] = at;
    setTimeout(() => { inbox[other] = { out, at: performance.now() }; for (const l of hear[other]) l(); }, at - performance.now());
  };
  const live = (who, ms) => { const e = inbox[who]; return e && e.out && performance.now() - e.at < ms ? e.out : null; };
  /** Хранилище сцены: читает стол из места наблюдателя, а намерения шлёт от имени выбранного игрока, через пинг сцены. */
  const asPlayer = (viewpoint, which) => {
    const other = otherOf(which);
    const carried = (ms) => { const out = live(which, ms); return { out, c: out ? carryOf(viewpoint.state, out.id, viewpointOf[other], out.over) : null }; };
    return new Proxy(viewpoint, { get: (t, k) => {
      if (k === "send") return (intent) => { if (intent.t === "drop" || intent.t === "unpick") note(which, null); const at = Math.max(sendAt[which] + 1, performance.now() + lat[which] + Math.random() * jit[which]); sendAt[which] = at; setTimeout(() => views[controller[which]].send(intent), at - performance.now()); };
      if (k === "actor") return views[controller[which]].me;
      if (k === "command") return (c) => setTimeout(() => views[controller[which]].command(c), lat[which] + Math.random() * jit[which]);
      if (k === "carry") return (out) => note(which, out);
      if (k === "onChange") return (l) => { hear[which].push(l); viewpoint.onChange(l); };
      if (k === "carries") { const { out, c } = carried(FRESH.one); return c && !c.whole ? [{ ...c, ...(out.flip ? { flip: out.flip } : {}), ...(out.tilt ? { tilt: out.tilt } : {}), ...(out.spin ? { spin: out.spin } : {}), ...(out.fx ? { fx: out.fx } : {}), ...(out.merge ? { merge: out.merge } : {}) }] : []; }
      if (k === "stacks") { const { out, c } = carried(FRESH.whole); return c && c.whole && viewpoint.state.locks[out.id] ? [{ ...c, ...(out.merge ? { merge: out.merge } : {}) }] : []; }
      if (CTL_KEYS.has(k)) return (...a) => views[controller[which]][k](...a);
      return Reflect.get(t, k, t);
    } });
  };
  return { asPlayer, lat, jit };
}
