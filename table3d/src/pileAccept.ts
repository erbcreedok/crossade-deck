// ПРИЁМКА СТОПКИ — что видит игрок, когда несёт карту к колоде. Один модуль и для игры, и для дизайн-страниц: страница не пишет свою копию, а подключает этот.
//
// Три правила стопки (`setPolicy`):
//   accept  — принимает: под колодой мягкое мятное свечение (рисует сцена, лежит на сукне в позе колоды), пока несёшь карту; палец над ней — ярче.
//   ask     — нужен апрув: у стопки текст «нужен апрув»; бросил карту — она остаётся висеть над стопкой (покачивается), над ней табличка с бегущими точками;
//             несколько карт висят в ряд; забрал карту пальцем — запрос отозван.
//   refuse  — не принимает: над стопкой знак «нельзя» и надпись «сюда нельзя»; брошенная карта ложится рядом.
// Цвета: свечение — мятное (не красный: красный бывает цветом игрока); «ждёт» и «нельзя» — бумажные, не свечение.
//
// От сцены нужен только `probe` (что несут, где карта на экране, повесить карту) и `aim` — решение игры, куда карту положат; модуль решает «над стопкой» ровно по нему.

export interface AcceptProbe {
  draggingId(): string | null;
  screenOf(id: string): { x: number; y: number } | null;
  cardWidth(id: string): number | null;
  depthOf(id: string): number | null;
  fovDeg(): number;
  heldAngle(): number | null;
  /** Повесить карту над стопкой (`pile` — какая) со сдвигом по столу; `null` — отпустить. */
  floatCard(id: string, pile: string | null, dx: number, dy: number, lift: number, da: number, up: boolean): void;
  setPileSnap(on: boolean): void;
  /** Свечение под колодой `pile` в её позе (мятное; `hot` ярче) или `null` — погасить. Рисует сцена, в перспективе. */
  setPileGlow(pile: string | null, level?: "hint" | "hot"): void;
}
export interface AcceptScene {
  aim(x: number, y: number): { in: string; pile?: string };
  probe: AcceptProbe;
}
export interface AcceptTable {
  state: { piles: { id: string; cards: { id: string }[] }[]; felt: { id: string; up: boolean }[] };
}
export interface AcceptView {
  scene: AcceptScene;
  /** Элемент, в котором стоит сцена (по нему считается размер картинки). */
  host: HTMLElement;
  /** Куда класть слой подсветки и подпись; тот же элемент или его родитель. */
  frame: HTMLElement;
  /** −1, если стол смотрят с противоположной стороны: ряд ждущих карт зеркален. */
  flip?: 1 | -1;
}
export type AcceptPolicy = "accept" | "refuse" | "ask";
export interface PileAccept {
  setPolicy(p: AcceptPolicy): void;
  policy(): AcceptPolicy;
  /** Сколько карт сейчас ждут ответа. */
  waiting(): number;
  dispose(): void;
}

export function mountPileAccept(opts: { table: AcceptTable; views: AcceptView[]; pileId?: () => string | undefined }): PileAccept {
  const { table } = opts;
  const pileId = opts.pileId ?? ((): string | undefined => [...table.state.piles].sort((a, b) => b.cards.length - a.cards.length)[0]?.id);
  let policy: AcceptPolicy = "accept", finger: { x: number; y: number } | null = null, pid = 1, note = "", noteAt = 0, alive = true, raf = 0;
  const waiting: string[] = [];
  const views = opts.views.map((v) => {
    if (getComputedStyle(v.frame).position === "static") v.frame.style.position = "relative";
    const cv = document.createElement("canvas");
    Object.assign(cv.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "5" });
    const say = document.createElement("div");
    Object.assign(say.style, { position: "absolute", zIndex: "9", transform: "translate(-50%, 0)", font: "400 12px 'Tiny5', monospace", color: "#f5ead0", background: "#3a2a1d", padding: "3px 8px", boxShadow: "0 0 0 2px #0b0704", pointerEvents: "none", whiteSpace: "nowrap", display: "none" });
    v.frame.append(cv, say);
    v.scene.probe.setPileSnap(false);
    return { ...v, flip: v.flip ?? 1, cv, say, rest: null as { id: string; x: number; y: number } | null, inside: false };
  });
  type View = (typeof views)[number];

  const draggingView = (): View | undefined => views.find((v) => v.scene.probe.draggingId());
  const restOf = (v: View): { id: string; x: number; y: number } | null => {
    const p = table.state.piles.find((x) => x.id === pileId());
    if (!p || !p.cards[0]) return null;
    // Место стопки — по нижней карте и запоминается, пока несут карту: подсветка не бежит за верхней.
    if (!v.scene.probe.draggingId() || !v.rest || v.rest.id !== p.id) { const at = v.scene.probe.screenOf(p.cards[0].id); if (at) v.rest = { id: p.id, x: at.x, y: at.y }; }
    return v.rest;
  };
  // «Над стопкой» — ровно по решению игры (`aim`), и над ждущими картами: они веером шире самой стопки.
  const hit = (v: View): boolean => {
    if (!finger) return false;
    const a = v.scene.aim(finger.x, finger.y);
    return (a.in === "deck" && a.pile === pileId()) || waiting.some((id) => { const c = v.scene.probe.screenOf(id); return !!c && Math.abs(finger!.x - c.x) < 38 && Math.abs(finger!.y - c.y) < 52; });
  };
  const fire = (type: string, x: number, y: number): void => { dispatchEvent(new PointerEvent(type, { pointerId: pid, clientX: x, clientY: y, bubbles: true, isPrimary: true, pointerType: "mouse", buttons: type === "pointerup" ? 0 : 1 })); };
  // Ждущие карты — в ряд над стопкой, последняя справа и выше всех; шаг по высоте больше размаха покачивания, чтобы не менялись местами.
  const settle = (): void => {
    const pile = pileId();
    for (const v of views) waiting.forEach((id, i) => v.scene.probe.floatCard(id, pile ?? null, v.flip * (i - (waiting.length - 1) / 2) * 1.05, -1.4, 0.12 + 0.22 * i, [-3, 2, -2, 3][i % 4]!, table.state.felt.find((c) => c.id === id)?.up ?? true));
  };

  const onMove = (e: PointerEvent): void => { pid = e.pointerId; if (e.isTrusted) finger = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent): void => {
    const v = draggingView();
    if (!e.isTrusted || !v) return;
    const id = v.scene.probe.draggingId()!, r = restOf(v);
    if (!r || !hit(v) || table.state.piles.some((p) => p.id === r.id && p.cards.some((c) => c.id === id))) return;
    if (policy === "refuse") { e.stopImmediatePropagation(); fire("pointermove", r.x, r.y + 100); fire("pointerup", r.x, r.y + 100); }
    if (policy === "ask") {
      e.stopImmediatePropagation();
      const fl = v.frame.getBoundingClientRect(), px = r.x + 100 < fl.right - 40 ? r.x + 100 : r.x - 100;
      fire("pointermove", px, r.y); fire("pointerup", px, r.y);
      waiting.splice(waiting.filter((w) => (v.scene.probe.screenOf(w)?.x ?? 0) < finger!.x).length, 0, id);
      settle();
    }
  };
  addEventListener("pointermove", onMove, true);
  addEventListener("pointerup", onUp, true);

  const cut = (g: CanvasRenderingContext2D, v: View, id: string, held: boolean): void => {
    const p = v.scene.probe, at = p.screenOf(id), cw = p.cardWidth(id), dz = p.depthOf(id);
    if (!at || !cw || !dz) return;
    const k = (v.host.clientHeight / 2 / Math.tan((p.fovDeg() * Math.PI) / 360)) / dz, w = cw * k + 2, h = cw * 1.4 * k + 2;
    g.save(); g.translate(at.x, at.y); g.rotate(held ? ((p.heldAngle() ?? 0) * Math.PI) / 180 : 0); g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill(); g.restore();
  };
  const tick = (): void => {
    if (!alive) return;
    const dv = draggingView();
    // Карту забрали пальцем — запрос отозван: она больше не висит, остальные перестраиваются.
    if (dv) { const id = dv.scene.probe.draggingId()!, i = waiting.indexOf(id); if (i >= 0) { waiting.splice(i, 1); for (const v of views) v.scene.probe.floatCard(id, null, 0, 0, 0, 0, true); settle(); note = "запрос отозван"; noteAt = performance.now(); } }
    const pile = table.state.piles.find((x) => x.id === pileId());
    for (const v of views) {
      const r = restOf(v), p = v.scene.probe, did = p.draggingId(), fl = v.frame.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      const own = !!did && !!r && table.state.piles.some((q) => q.id === r.id && q.cards.some((c) => c.id === did));
      const drag = !!did && !own, frozen = waiting.length > 0;
      let pend = false, deny = false, st = "", msg = note && performance.now() - noteAt < 1200 ? note : "";
      const over = r && drag ? hit(v) : false;
      if (r && drag && policy !== "refuse") {
        if (policy === "ask") { st = "hint"; if (over) msg = "нужен апрув"; if (!over && v.inside) { msg = "запрос отозван"; note = msg; noteAt = performance.now(); } v.inside = over; } else st = over ? "hot" : "hint";
      } else v.inside = false;
      if (r && drag && policy === "refuse" && over) { deny = true; msg = "сюда нельзя"; }
      if (frozen) { st = ""; pend = true; msg = ""; }
      if (v.cv.width !== Math.round(fl.width * dpr) || v.cv.height !== Math.round(fl.height * dpr)) { v.cv.width = Math.round(fl.width * dpr); v.cv.height = Math.round(fl.height * dpr); }
      const g = v.cv.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, -fl.left * dpr, -fl.top * dpr); g.clearRect(fl.left, fl.top, fl.width, fl.height);
      const top = pile?.cards[0] ? p.depthOf(pile.cards[0].id) : null;
      const PW = r && top ? (1.17 * (v.host.clientHeight / 2 / Math.tan((p.fovDeg() * Math.PI) / 360))) / top * 0.99 : 64, PH = PW * 1.4;
      const rr = (x: number, y: number, w: number, h: number, k: number): void => { g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, k); };
      // Свечение — в самой сцене (под колодой, в её позе); здесь только знаки поверх.
      p.setPileGlow(r && st ? pileId() ?? null : null, st === "hot" ? "hot" : "hint");
      if (r && pend) {
        const marks = waiting.map((id) => p.screenOf(id)).filter((m): m is { x: number; y: number } => !!m);
        const cx = marks.length ? marks.reduce((q, m) => q + m.x, 0) / marks.length : r.x, topY = marks.length ? Math.min(...marks.map((m) => m.y)) - 62 : r.y - PH / 2 - 22;
        const W = 46, H = 18, bx = cx - W / 2, by = topY - H / 2;
        g.fillStyle = "#0b0704"; g.fillRect(bx - 3, by - 3, W + 6, H + 6); g.fillStyle = "#3a2a1d"; g.fillRect(bx, by, W, H);
        const ph = Math.floor(performance.now() / 280) % 3;
        for (let i = 0; i < 3; i++) { g.fillStyle = i === ph ? "#f5ead0" : "rgba(245,234,208,.3)"; g.fillRect(bx + 9 + i * 12, by + 6, 6, 6); }
      }
      if (r && deny) {
        g.lineCap = "round"; const ix = r.x, iy = r.y - PH / 2 - 16, ir = 13, d = 9;
        for (const [col, lw] of [["#0b0704", 8], ["#f5ead0", 4]] as const) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(ix, iy, ir, 0, Math.PI * 2); g.moveTo(ix - d, iy - d); g.lineTo(ix + d, iy + d); g.stroke(); }
        g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000"; if (did) cut(g, v, did, true); g.globalCompositeOperation = "source-over";
      }
      if (r) { Object.assign(v.say.style, { left: `${r.x - fl.left}px`, top: `${r.y - fl.top - PH / 2 - 24 - (frozen ? 80 : 0) - (deny ? 32 : 0)}px`, display: msg ? "block" : "none" }); v.say.textContent = msg; }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    setPolicy(p) { policy = p; },
    policy: () => policy,
    waiting: () => waiting.length,
    dispose() {
      alive = false; cancelAnimationFrame(raf);
      removeEventListener("pointermove", onMove, true); removeEventListener("pointerup", onUp, true);
      for (const v of views) { v.cv.remove(); v.say.remove(); v.scene.probe.setPileSnap(true); v.scene.probe.setPileGlow(null); }
    },
  };
}
