// СТОЛ НА МЕТКЕ — плоская картинка, которую AR натягивает на плоскость.
//
// Это и есть проверка шва «рисуем как сейчас, а 3D только несёт картинку»: стол рисуется в обычный
// 2D-canvas в своих пикселях, three.js кладёт его текстурой на плоскость, а тап приходит обратно
// точкой в тех же пикселях (луч → uv → px). Здесь ни слова про камеру и метку.
//
// Что на столе: колода, стопка сброса и четыре места. Тап по колоде — сдать карту рубашкой на
// свободное место; тап по карте — перевернуть; карта из руки ложится в сброс. Последний тап
// оставляет кольцо — видно, куда на самом деле попал палец.

export const TW = 1024, TH = 704;

const T = {
  felt: "#173d2d", feltHi: "#1b4835", rim: "#3a2a1d", rimHi: "#6b4d2c", black: "#0b0704",
  gold: "#f2c14e", ink: "#f5ead0", stock: "#f7f1e6", red: "#b3221f", back: "#9c2f2a",
};
const CW = 118, CH = 168;
const SUITS = [["♠", T.black], ["♥", T.red], ["♦", T.red], ["♣", T.black]];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createTable() {
  const deck = [];
  for (const s of SUITS.keys()) for (const r of RANKS.keys()) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const slots = [0, 1, 2, 3].map((i) => ({ x: 200 + i * 160, y: 440, card: null, face: false }));
  return { deck, slots, pile: [], tap: null };
}

const deckRect = () => ({ x: 280, y: 150, w: CW, h: CH });
const pileRect = () => ({ x: 626, y: 150, w: CW, h: CH });
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Тап в пикселях стола → что случилось (строка для журнала) или null. */
export function tapTable(t, p) {
  t.tap = { x: p.x, y: p.y, at: performance.now() };
  if (inside(p, deckRect())) {
    const free = t.slots.find((s) => !s.card);
    if (!free || !t.deck.length) return "колода: мест нет";
    free.card = t.deck.pop(); free.face = false;
    return "сдал карту";
  }
  for (const s of t.slots) {
    if (s.card && inside(p, { x: s.x, y: s.y, w: CW, h: CH })) { s.face = !s.face; return s.face ? `открыл ${name(s.card)}` : "закрыл карту"; }
  }
  if (inside(p, pileRect()) && t.pile.length) {
    for (const s of t.slots) if (s.card) { t.pile.push(s.card); s.card = null; }
    return "собрал стол в сброс";
  }
  return null;
}

export function throwToPile(t, card) { t.pile.push(card); }
export const name = (c) => RANKS[c.r] + SUITS[c.s][0];
export const SUIT_OF = (c) => SUITS[c.s];
export const RANK_OF = (c) => RANKS[c.r];

function box(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function card(g, x, y, c, face) {
  box(g, x + 4, y + 6, CW, CH, 10); g.fillStyle = "rgba(0,0,0,.35)"; g.fill();
  box(g, x, y, CW, CH, 10); g.fillStyle = face ? T.stock : T.ink; g.fill();
  g.lineWidth = 3; g.strokeStyle = T.black; g.stroke();
  if (!face) {
    box(g, x + 9, y + 9, CW - 18, CH - 18, 6); g.fillStyle = T.back; g.fill();
    g.strokeStyle = "rgba(245,234,208,.35)"; g.lineWidth = 2;
    for (let k = -CH; k < CW; k += 14) { g.beginPath(); g.moveTo(x + 9 + Math.max(0, k), y + 9 + Math.max(0, -k)); g.lineTo(x + 9 + Math.min(CW - 18, k + CH - 18), y + 9 + Math.min(CH - 18, CH - 18 - k)); g.stroke(); }
    return;
  }
  const [glyph, colour] = SUITS[c.s];
  g.fillStyle = colour; g.textAlign = "left"; g.textBaseline = "top";
  g.font = "bold 34px Georgia, serif"; g.fillText(RANKS[c.r], x + 10, y + 8);
  g.font = "30px Georgia, serif"; g.fillText(glyph, x + 10, y + 44);
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = "72px Georgia, serif"; g.fillText(glyph, x + CW / 2, y + CH / 2 + 18);
}

/** Рисует стол в canvas TW×TH. `now` — для угасания кольца тапа; true, если кольцо ещё видно. */
export function drawTable(g, t, now) {
  g.clearRect(0, 0, TW, TH);
  box(g, 6, 6, TW - 12, TH - 12, 90); g.fillStyle = T.rim; g.fill();
  g.lineWidth = 6; g.strokeStyle = T.black; g.stroke();
  box(g, 34, 34, TW - 68, TH - 68, 66);
  const grad = g.createRadialGradient(TW / 2, TH / 2, 60, TW / 2, TH / 2, TW / 1.6);
  grad.addColorStop(0, T.feltHi); grad.addColorStop(1, T.felt); g.fillStyle = grad; g.fill();
  g.lineWidth = 4; g.strokeStyle = T.rimHi; g.stroke();

  g.fillStyle = "rgba(242,193,78,.55)"; g.font = "22px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "alphabetic";
  const d = deckRect(), pr = pileRect();
  g.fillText(`колода · ${t.deck.length}`, d.x + CW / 2, d.y - 14);
  g.fillText(`сброс · ${t.pile.length}`, pr.x + CW / 2, pr.y - 14);
  for (let i = Math.min(4, t.deck.length) - 1; i >= 0; i -= 1) card(g, d.x - i * 2, d.y - i * 2, null, false);
  box(g, pr.x, pr.y, CW, CH, 10); g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeStyle = "rgba(242,193,78,.5)"; g.stroke(); g.setLineDash([]);
  const top = t.pile.slice(-3);
  top.forEach((c, i) => card(g, pr.x + (i - top.length + 1) * 6, pr.y + (i - top.length + 1) * 4, c, true));
  for (const s of t.slots) {
    if (s.card) card(g, s.x, s.y, s.card, s.face);
    else { box(g, s.x, s.y, CW, CH, 10); g.setLineDash([8, 8]); g.lineWidth = 2; g.strokeStyle = "rgba(245,234,208,.25)"; g.stroke(); g.setLineDash([]); }
  }

  if (!t.tap) return false;
  const age = (now - t.tap.at) / 900;
  if (age >= 1) return false;
  g.beginPath(); g.arc(t.tap.x, t.tap.y, 14 + age * 30, 0, Math.PI * 2);
  g.lineWidth = 5; g.strokeStyle = `rgba(242,193,78,${1 - age})`; g.stroke();
  g.beginPath(); g.arc(t.tap.x, t.tap.y, 5, 0, Math.PI * 2); g.fillStyle = T.gold; g.fill();
  return true;
}
