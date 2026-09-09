// ОДНО РИСОВАНИЕ КАРТЫ НА ВСЕ СТРАНИЦЫ КИТА — копия `card-kit.js` из проекта дизайна, дословно.
// Классический вид из Колоды.dc.html: масти-маски из cards-opt/suits/, фигуры из cards-baked/courts/,
// сетка пипсов, зеркальные индексы, карта 243/167.
(function (root) {
  const T = {
    bg: "#173d2d", bgGlyph: "#123124",
    feltHi: "#1b4835", feltMid: "#123527", feltLo: "#0a2117",
    rimHi: "#6b4d2c", rimMid: "#3a2a1d", rimLo: "#1d1409",
    gold: "#f2c14e", goldHi: "#f8d885", goldLo: "#b08a26",
    ink: "#f5ead0", inkDim: "#cdb98f",
    black: "#0b0704", red: "#b3221f", stock: "#f7f1e6", stockDim: "#d9d0bd",
  };

  const ASPECT = 243 / 167;
  const SUIT = { d: ["d", T.red], h: ["h", T.red], s: ["s", T.black], c: ["c", T.black] };
  const SUIT_F = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
  const COURT_F = { J: "jack", Q: "queen", K: "king" };

  const svgURI = (body, w, h) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;

  const PLAID_BG = "#f7f2e4";
  const PLAID = (() => {
    const P = 46;
    const bars = [[0, 3.4, "#3f8c78", .9], [5, 1, "#2f5a4a", .8], [9.5, 2.2, "#b07d5c", .85], [13.5, 1, "#3f8c78", .55],
      [20, 1.2, "#b07d5c", .5], [24, 2.8, "#3f8c78", .8], [28.4, 1, "#2f5a4a", .7], [33, 2.2, "#b07d5c", .8], [37, 1, "#3f8c78", .5]];
    const set = bars.map(([x, w2, c, o]) => `<rect x="${x}" width="${w2}" height="${P}" fill="${c}" opacity="${o}"/>`).join("");
    const defs = `<pattern id="kp" width="${P}" height="${P}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">${set}</pattern>`
      + `<pattern id="kq" width="${P}" height="${P}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">${set}</pattern>`;
    return svgURI(`<defs>${defs}</defs><rect width="200" height="291" fill="${PLAID_BG}"/>`
      + `<rect width="200" height="291" fill="url(#kp)" opacity=".72"/><rect width="200" height="291" fill="url(#kq)" opacity=".72"/>`, 200, 291);
  })();

  const FOUR_ART = { s: 1, d: 1 };
  const courtFile = (rank, k, four) => COURT_F[rank]
    && `${four && FOUR_ART[k] ? "cards-baked/courts-4c" : "cards-baked/courts"}/${COURT_F[rank]}_of_${SUIT_F[k]}.svg`;
  const courtArt = (rank, k, four) => courtFile(rank, k, four) || "";
  const loadCourts = () => Promise.resolve();
  const courtsReady = true;

  const pipMask = (k, fill, size) => `width:${size}px;height:${size}px;background:${fill};`
    + `-webkit-mask:url("cards-opt/suits/${SUIT_F[k]}.svg") center/contain no-repeat;`
    + `mask:url("cards-opt/suits/${SUIT_F[k]}.svg") center/contain no-repeat;`;

  const cornerSt = (w, flip) => `position:absolute;${flip ? "right" : "left"}:${Math.round(w * 0.09)}px;`
    + `${flip ? "bottom" : "top"}:${Math.round(w * 0.07)}px;display:flex;flex-direction:column;align-items:center;gap:${Math.max(1, Math.round(w * 0.02))}px;`
    + (flip ? "transform:rotate(180deg);" : "");

  const pipSpots = (rank) => {
    const L = 0.33, C = 0.5, R = 0.67, t = 0.225, m = 0.5, b = 0.775;
    const r4 = [0.27, 0.43, 0.57, 0.73];
    const sides = (rows) => rows.flatMap((y) => [[L, y, y > 0.5], [R, y, y > 0.5]]);
    return {
      A: [[C, m]],
      "2": [[C, t], [C, b, 1]],
      "3": [[C, t], [C, m], [C, b, 1]],
      "4": [[L, t], [R, t], [L, b, 1], [R, b, 1]],
      "5": [[L, t], [R, t], [C, m], [L, b, 1], [R, b, 1]],
      "6": sides([t, m, b]),
      "7": [...sides([t, m, b]), [C, (t + m) / 2]],
      "8": [...sides([t, m, b]), [C, (t + m) / 2], [C, (m + b) / 2, 1]],
      "9": [...sides(r4), [C, m]],
      "10": [...sides(r4), [C, 0.316], [C, 0.684, 1]],
    }[rank] || [];
  };

  const DUST = (() => {
    const S = 64;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let body = "";
    for (let i = 0; i < 900; i++) {
      const x = (rnd() * S).toFixed(1), y = (rnd() * S).toFixed(1);
      const hue = Math.round(rnd() * 360);
      const sz = rnd() < 0.25 ? 1.4 : 0.9;
      body += `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" fill="hsl(${hue},85%,${55 + Math.round(rnd() * 25)}%)" opacity="${(0.5 + rnd() * 0.5).toFixed(2)}"/>`;
    }
    return svgURI(body, S, S);
  })();

  const LOCK_ICON = "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z";

  const scrambled = (w) => {
    const slots = [[0.33, 0.26], [0.67, 0.26], [0.33, 0.5], [0.67, 0.5], [0.33, 0.74], [0.67, 0.74]];
    const kinds = [["d", "#b3221f"], ["s", "#2f6fb0"], ["h", "#d97a1f"], ["c", "#1f5a3a"], ["d", "#0b0704"], ["h", "#b3221f"]];
    const size = Math.round(w * 0.17);
    return slots.map(([fx, fy], i) => {
      const [k, ink] = kinds[i];
      const dx = fx - 0.5, dy = fy - 0.5;
      const a = 0.9 + i * 0.7;
      const rx = dx * Math.cos(a) - dy * Math.sin(a);
      const ry = dx * Math.sin(a) + dy * Math.cos(a);
      return {
        st: `position:absolute;left:${((0.5 + rx) * 100).toFixed(1)}%;top:${((0.5 + ry) * 100).toFixed(1)}%;`
          + `margin:${-size / 2}px 0 0 ${-size / 2}px;transform:rotate(${Math.round(a * 57)}deg);opacity:.9;`
          + pipMask(k, ink, size),
      };
    });
  };

  const face = (w, rank, suit, opts = {}) => {
    const { tilt = 0, lift = 0, state = "face", four = false } = opts;
    const h = Math.round(w * ASPECT);
    const k = SUIT[suit] ? suit : "d";
    const ink = SUIT[k][1];
    const chosen = state === "chosen";
    const back = state === "back";
    const locked = state === "locked";
    const hidden = state === "hidden";
    const blank = back;
    const R = Math.round(w * 0.1);
    const size = rank === "A" ? Math.round(w * 0.44) : Math.round(w * 0.16);
    return {
      rank: hidden ? "" : rank,
      wrap: `position:relative;width:${w}px;height:${h}px;transform:translateY(${-lift}px) rotate(${tilt}deg);`,
      faceSt: `position:absolute;inset:0;border-radius:${R}px;background:${back ? `${PLAID_BG} url("${PLAID}") 0 0/100% 100% no-repeat` : T.stock};`
        + (back
          ? `box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 4px ${T.stock}`
          : `box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 5px ${T.stock},inset 0 0 0 6px rgba(11,7,4,.2)`)
        + `${chosen ? `,0 0 0 3px ${T.gold}` : ""},4px ${5 + lift}px 0 rgba(0,0,0,.5);`,
      corner: blank || hidden ? "display:none;" : cornerSt(w, false),
      cornerB: blank || hidden ? "display:none;" : cornerSt(w, true),
      rankSt: `font:400 ${Math.max(8, Math.round(w * (rank === "10" ? 0.12 : 0.16)))}px/1 'Press Start 2P',monospace;color:${ink};`,
      pipSt: pipMask(k, ink, Math.max(6, Math.round(w * 0.12))),
      pips: blank || hidden || COURT_F[rank] ? [] : pipSpots(rank).map(([x, y, flip]) => ({
        st: `position:absolute;left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%;`
          + `margin:${-size / 2}px 0 0 ${-size / 2}px;${flip ? "transform:rotate(180deg);" : ""}`
          + pipMask(k, ink, size),
      })),
      figure: !blank && !hidden && COURT_F[rank]
        ? `position:absolute;inset:6px;border-radius:${Math.max(2, R - 6)}px;overflow:hidden;`
          + `background:url("${courtArt(rank, k, four)}") center/contain no-repeat;`
        : "display:none;",
      scramble: hidden ? scrambled(w) : [],
      veil: hidden
        ? `position:absolute;inset:0;border-radius:${R}px;overflow:hidden;`
          + `background:url("${DUST}") 0 0/${Math.round(w * 0.5)}px ${Math.round(w * 0.5)}px repeat;`
        : "display:none;",
      lockSt: locked
        ? `position:absolute;right:${Math.round(w * 0.06)}px;bottom:${Math.round(w * 0.06)}px;width:${Math.round(w * 0.3)}px;height:${Math.round(w * 0.3)}px;`
          + `border-radius:999px;display:flex;align-items:center;justify-content:center;background:${T.gold};box-shadow:inset 0 0 0 2px ${T.black};`
        : "display:none;",
      lockInk: T.black,
      lockIcon: LOCK_ICON,
    };
  };

  const pile = (w, o = {}) => {
    const {
      n = 4, look = "back", layout = "thick", pull = -1, gap = -1,
      accept = false, give = false, cap8 = false, zone = 358, neat = false,
      hover = -1, tap = -1, hold = -1, over = -1, insert = -1, spin = -1, stepPt = 0, reserve = 0, lift = -1,
      seq = [["9", "d"], ["K", "s"]], four = false,
    } = o;
    const h = Math.round(w * ASPECT);
    const R = Math.round(w * 0.1);
    const drift = Math.min(w * 0.03, (w * 0.18) / Math.max(1, n - 1));
    const step = stepPt > 0 && layout !== "thick" ? stepPt
      : layout === "thick" ? drift
      : layout === "tight" ? Math.round(w * 0.22)
        : layout === "open" ? Math.round(w * 0.72)
          : layout === "fan" ? Math.round(w * 0.34)
            : Math.min(w + 5, (zone - w) / Math.max(1, n - 1));
    const spread = layout !== "thick" && layout !== "heap";
    const noise = (i, k) => {
      const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return s - Math.floor(s);
    };
    const NEAT = [[0, 0, -7], [0.18, 0.06, 5], [0.09, -0.13, -14], [0.28, -0.04, 11], [-0.07, 0.09, 17], [0.21, 0.15, -4], [0.12, 0.02, 8]];
    const heapR = layout === "heap" ? (neat ? w * 0.2 : w * 0.34 * Math.sqrt(Math.max(1, n))) : 0;
    const hRad = ((neat ? 17 : 24) * Math.PI) / 180;
    const heapRY = heapR * 0.62;
    const heapHX = (w * Math.cos(hRad) + h * Math.sin(hRad)) / 2;
    const heapHY = (w * Math.sin(hRad) + h * Math.cos(hRad)) / 2;
    const m = layout === "heap" && neat ? Math.min(n, NEAT.length) : n;
    const reorder = spread && hold >= 0 && over >= 0;
    const anchor = hover >= 0 ? hover : tap >= 0 ? tap : -1;
    const slot = over >= 0 ? over : gap >= 0 ? gap : insert >= 0 ? insert : -1;
    const head = spread
      ? Math.round(h * Math.max(reserve, insert >= 0 ? 0.9 : hold >= 0 ? 0.62 : accept ? 0.55 : lift >= 0 ? 0.78 : anchor >= 0 ? 0.3 : 0))
      : layout === "heap" ? Math.ceil(heapR * 0.62)
        : Math.round(drift * (n - 1));
    const base = layout === "heap"
      ? Math.ceil(heapRY + heapHY - h / 2 + 4)
      : Math.round(h * 0.24) + head;
    const room = 0;
    const fanPad = layout === "fan" ? Math.ceil(2 * w * Math.sin(Math.PI / 6)) : 0;
    const width = spread
      ? Math.round(step * (n - 1) + w + (slot >= 0 && !reorder ? step : 0)) + 2 * room + 2 * fanPad
      : layout === "heap" ? Math.round(2 * heapR + 2 * heapHX + 8)
        : Math.round(w + drift * (n - 1) + 8);
    const cards = Array.from({ length: m }, (_, i) => {
      const faceUp = look === "up" || (look === "mix" && i % 3 !== 1);
      const top = i === m - 1;
      const shown = look === "up" ? true : look === "mix" ? faceUp : false;
      const isPull = i === pull, isHover = i === hover, isTap = i === tap, isHold = i === hold;
      const isSpin = Array.isArray(spin) ? spin.indexOf(i) >= 0 : i === spin;
      const flipped = isSpin;
      const shownFace = shown && !flipped;
      const past = !reorder && slot >= 0 && i >= slot ? step : 0;
      const others = i < hold ? i : i - 1;
      const vp = !reorder ? i : i === hold ? over : (others < over ? others : others + 1);
      const ld = lift >= 0 ? i - lift : 0;
      const la = lift >= 0 ? Math.abs(ld) : 99;
      const liftY = la === 0 ? -Math.round(h * 0.78) : la === 1 ? -Math.round(h * 0.52) : la === 2 ? -Math.round(h * 0.26) : 0;
      const push = 0;
      const peek = 0;
      const fa = layout === "fan" && n > 1 ? -30 + (60 * i) / (n - 1) : 0;
      const fr = (fa * Math.PI) / 180;
      const hp = layout !== "heap" ? null
        : neat
          ? [NEAT[i][0] * w * 0.7, NEAT[i][1] * w * 0.7, NEAT[i][2]]
          : [(noise(i, 1) * 2 - 1) * heapR, (noise(i, 2) * 2 - 1) * heapRY, Math.round((noise(i, 3) * 2 - 1) * 24)];
      const x = (hp ? Math.round(hp[0] + heapR + heapHX - w / 2 + 4)
        : spread
          ? (layout === "fan"
            ? Math.round((n - 1) / 2 * step + 2 * w * Math.sin(fr)) + fanPad
            : Math.round(vp * step + past)) + room
          : Math.round(i * drift)) + push;
      const y = hp ? Math.round(hp[1])
        : spread
        ? (la <= 2 ? liftY
          : isPull ? -Math.round(h * 0.22)
          : isHover || isTap ? -Math.round(h * 0.3)
            : isHold ? -Math.round(h * 0.62)
              : layout === "fan" ? Math.round(2 * w * (1 - Math.cos(fr))) + peek
                : peek)
        : -Math.round(i * drift);
      const ang = hp ? hp[2] : isHover || isTap || isSpin ? 0 : isHold ? 7 : layout === "fan" ? fa : isPull ? -4 : 0;
      const [rank, suitK] = seq[i % seq.length];
      const ink = SUIT[suitK][1];
      const buried = spread && n > 12 && step < w * 0.5 && !(top || isHover || isHold || isTap || isSpin || isPull || la <= 2);
      const size = rank === "A" ? Math.round(w * 0.44) : Math.round(w * 0.16);
      const layer = !spread && !top && layout !== "heap";
      return {
        rank: shownFace ? rank : "",
        st: `position:absolute;left:${x}px;top:${y + base}px;width:${w}px;height:${h}px;border-radius:${R}px;z-index:${isPull || isHold ? 99 : i};`
          + (layer
            ? `background:${T.stock};box-shadow:inset 0 0 0 1px rgba(11,7,4,.3)`
            : shownFace
            ? `background:${T.stock};box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 5px ${T.stock},inset 0 0 0 6px rgba(11,7,4,.2)`
            : `background:${PLAID_BG} url("${PLAID}") 0 0/100% 100% no-repeat;box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 4px ${T.stock}`)
          + (isPull ? `,0 0 0 3px ${T.gold},5px 9px 0 rgba(0,0,0,.5);`
            : isHold ? `,10px 18px 0 rgba(0,0,0,.55);`
              : isHover || la <= 2 ? `,5px 9px 0 rgba(0,0,0,.5);`
                : isTap ? `,1px 2px 0 rgba(0,0,0,.45);`
                  : spread || hp ? `,3px 4px 0 rgba(0,0,0,.4);`
                    : top ? `,1px 1px 0 rgba(0,0,0,.25);`
                      : i === 0 ? `,3px 4px 0 rgba(0,0,0,.4);`
                        : ";")
          + `transform:rotate(${ang}deg) translateY(${accept && top ? -Math.round(h * 0.55) : give && top ? Math.round(h * 0.3) : 0}px)`
          + `${give && top ? ` translateX(${Math.round(w * 0.55)}px)` : ""};`
          + (accept && top ? "opacity:.85;" : ""),
        corner: shownFace ? cornerSt(w, false) : "display:none;",
        cornerB: shownFace && !buried ? cornerSt(w, true) : "display:none;",
        rankSt: `font:400 ${Math.max(7, Math.round(w * (rank === "10" ? 0.12 : 0.16)))}px/1 'Press Start 2P',monospace;color:${ink};`,
        pipSt: pipMask(suitK, ink, Math.max(6, Math.round(w * 0.12))),
        pips: shownFace && !buried && !COURT_F[rank] ? pipSpots(rank).map(([px, py, flip]) => ({
          st: `position:absolute;left:${(px * 100).toFixed(1)}%;top:${(py * 100).toFixed(1)}%;`
            + `margin:${-size / 2}px 0 0 ${-size / 2}px;${flip ? "transform:rotate(180deg);" : ""}`
            + pipMask(suitK, ink, size),
        })) : [],
        tapSt: isHold
          ? `position:absolute;left:50%;top:50%;width:${Math.round(w * 0.62)}px;height:${Math.round(w * 0.62)}px;`
            + `margin:${-Math.round(w * 0.31)}px 0 0 ${-Math.round(w * 0.31)}px;border-radius:999px;box-sizing:border-box;`
            + `border:${Math.max(3, Math.round(w * 0.05))}px solid ${T.ink};background:rgba(11,7,4,.28);`
            + `box-shadow:0 0 0 ${Math.max(2, Math.round(w * 0.025))}px rgba(11,7,4,.55),inset 0 0 0 ${Math.max(2, Math.round(w * 0.025))}px rgba(11,7,4,.45);`
          : "display:none;",
        figure: shownFace && !buried && COURT_F[rank]
          ? `position:absolute;inset:6px;border-radius:${Math.max(2, R - 6)}px;overflow:hidden;`
            + `background:url("${courtArt(rank, suitK, four)}") center/contain no-repeat;`
          : "display:none;",
      };
    });
    if (insert >= 0 && spread) {
      const [rank, suitK] = seq[n % seq.length];
      const ink = SUIT[suitK][1];
      const size = rank === "A" ? Math.round(w * 0.44) : Math.round(w * 0.16);
      cards.push({
        rank,
        st: `position:absolute;left:${Math.round(slot * step) + room}px;top:${base - Math.round(h * 0.9)}px;`
          + `width:${w}px;height:${h}px;border-radius:${R}px;z-index:120;background:${T.stock};`
          + `box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 5px ${T.stock},inset 0 0 0 6px rgba(11,7,4,.2),12px 22px 0 rgba(0,0,0,.5);`
          + `transform:rotate(-6deg);`,
        corner: cornerSt(w, false),
        cornerB: cornerSt(w, true),
        rankSt: `font:400 ${Math.max(7, Math.round(w * (rank === "10" ? 0.12 : 0.16)))}px/1 'Press Start 2P',monospace;color:${ink};`,
        pipSt: pipMask(suitK, ink, Math.max(6, Math.round(w * 0.12))),
        tapSt: "display:none;",
        pips: COURT_F[rank] ? [] : pipSpots(rank).map(([px, py, flip]) => ({
          st: `position:absolute;left:${(px * 100).toFixed(1)}%;top:${(py * 100).toFixed(1)}%;`
            + `margin:${-size / 2}px 0 0 ${-size / 2}px;${flip ? "transform:rotate(180deg);" : ""}`
            + pipMask(suitK, ink, size),
        })),
        figure: COURT_F[rank]
          ? `position:absolute;inset:6px;border-radius:${Math.max(2, R - 6)}px;overflow:hidden;`
            + `background:url("${courtArt(rank, suitK, four)}") center/contain no-repeat;`
          : "display:none;",
      });
    }
    return {
      count: n, cards, step: Math.round(step), width,
      col: `display:flex;flex-direction:column;gap:8px;align-items:flex-start;max-width:${Math.max(190, width)}px;`,
      wrap: `position:relative;width:${Math.max(w + 12, width)}px;height:${layout === "heap" ? Math.round(2 * heapRY + 2 * heapHY + 8) : Math.round(h * 1.6) + head}px;`,
      zoneSt: n === 0
        ? `position:absolute;left:0;top:${base}px;width:${w}px;height:${h}px;border-radius:${R}px;box-shadow:inset 0 0 0 3px rgba(242,193,78,.35);`
        : cap8
          ? `position:absolute;left:-4px;top:${base - 4}px;width:${zone + 8}px;height:${h + 8}px;border-radius:${R}px;box-shadow:inset 0 0 0 2px rgba(242,193,78,.3);`
          : (over >= 0 || gap >= 0 || insert >= 0)
            ? `position:absolute;left:${Math.round(slot * step) + room}px;top:${base}px;width:${w}px;height:${h}px;border-radius:${R}px;box-sizing:border-box;border:2px dashed rgba(242,193,78,.5);`
            : hold >= 0
              ? `position:absolute;left:${Math.round(hold * step) + room}px;top:${base}px;width:${w}px;height:${h}px;border-radius:${R}px;box-sizing:border-box;border:2px dashed rgba(242,193,78,.5);`
              : "display:none;",
    };
  };

  root.CardKit = { T, ASPECT, SUIT, SUIT_F, COURT_F, PLAID, PLAID_BG, DUST, pipMask, pipSpots, cornerSt, scrambled, face, pile,
    loadCourts, courtArt, courtsReady };
})(window);
