// СТОЛ, СТУЛ, АВАТАР — общий вокабуляр страниц дизайна; копия `table-kit.js` из проекта дизайна.
(function (root) {
  const T = {
    bg: "#173d2d", bgGlyph: "#123124",
    feltHi: "#1b4835", feltMid: "#123527", feltLo: "#0a2117",
    rimHi: "#6b4d2c", rimMid: "#3a2a1d", rimLo: "#1d1409",
    gold: "#f2c14e", goldHi: "#f8d885", goldLo: "#b08a26",
    ink: "#f5ead0", inkDim: "#cdb98f",
    black: "#0b0704", red: "#b3221f", stock: "#f7f1e6", stockDim: "#d9d0bd",
  };

  const CLUB = ["..#..#...", ".##..##..", ".###.###.", ".#######.", "#########", ".#######.", "....#....", "....#....", "...###..."];
  const DIA = [".#.", "###", ".#."];
  const TILE = (() => {
    const CELL = 2, AT = 9, SIDE = 36;
    const put = (rows, ox, oy, fill, op) => rows.flatMap((r, y) => [...r].map((ch, x) => ch === "#"
      ? `<rect x="${ox + x * CELL}" y="${oy + y * CELL}" width="${CELL}" height="${CELL}" fill="${fill}"${op ? ` opacity="${op}"` : ""}/>` : "")).join("");
    const body = put(CLUB, AT, AT, T.bgGlyph) + put(DIA, SIDE / 2 + AT - 3, SIDE / 2 + AT - 3, "#f2c14e", ".2");
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}" viewBox="0 0 ${SIDE} ${SIDE}" shape-rendering="crispEdges">${body}</svg>`)}`;
  })();

  const seatInk = (q) => `hsl(${Math.round(200 + q * 250)}, 38%, 62%)`;
  const spin = (i, n) => seatInk(i / n);

  const chairSeat = (tone, dash) => `position:absolute;left:50%;top:50%;width:74px;height:74px;margin:-37px 0 0 -37px;border-radius:37px 37px 0 0;`
    + `background:radial-gradient(70% 70% at 50% 35%,rgba(107,77,44,.5),rgba(29,20,9,.5));`
    + `box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 6px ${tone},inset 0 -4px 10px rgba(0,0,0,.5)${dash ? "" : `,0 4px 0 rgba(11,7,4,.5)`};`
    + (dash ? `background:none;box-shadow:none;border:3px dashed ${tone};box-sizing:border-box;` : "");

  const chairStage = `position:relative;width:172px;height:126px;background:radial-gradient(80% 80% at 50% 30%,${T.feltHi},${T.feltLo});box-shadow:inset 0 0 0 3px ${T.black};`;

  const avParts = (ink, opts = {}) => {
    const { mine = false, state = "seated" } = opts;
    const adrift = state === "adrift";
    const turn = state === "turn";
    return {
      cone: state === "hidden" ? "display:none;" : `position:absolute;left:50%;top:67px;width:0;height:0;margin-left:-30px;`
        + `border-left:30px solid transparent;border-right:30px solid transparent;border-bottom:62px solid ${ink};opacity:.3;`
        + `transform:rotate(${adrift ? 214 : 180}deg);transform-origin:50% 0;`,
      halo: turn ? `position:absolute;left:50%;top:34px;width:66px;height:66px;margin-left:-33px;border-radius:999px;box-shadow:0 0 0 4px rgba(248,216,133,.55);` : "display:none;",
      ring: `position:absolute;left:50%;top:40px;width:54px;height:54px;margin-left:-27px;border-radius:999px;`
        + `background:${mine ? `linear-gradient(${T.goldHi},${T.goldLo})` : `linear-gradient(#3d4a3a,#1b2418)`};`
        + `box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 6px ${ink},0 4px 0 rgba(11,7,4,.6);`,
      mount: adrift ? "position:absolute;inset:0;transform:translate(16px,6px);" : "position:absolute;inset:0;",
      glyph: `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:400 17px/1 'Press Start 2P',monospace;color:${mine ? T.black : T.ink};`,
      plate: `position:absolute;left:50%;top:100px;transform:translateX(-50%);padding:3px 8px;background:${T.black};`
        + `box-shadow:inset 0 0 0 2px ${ink};font:400 8px/1.6 'Press Start 2P',monospace;color:${mine ? T.gold : T.ink};white-space:nowrap;`,
    };
  };

  const HAND_TOP = 4;
  const seatUnit = (o = {}) => {
    const { q = 0, mine = false, rot = 0, state = "seated", gaze = 0, turn = false, empty = false } = o;
    const tone = seatInk(q);
    const av = avParts(tone, { mine: false, state: turn ? "turn" : "seated" });
    const adrift = state === "adrift";
    const noAvatar = empty || state === "none";
    const rad = (gaze * Math.PI) / 180;
    const dx = adrift ? Math.round(20 * Math.sin(rad)) : 0;
    const dy = adrift ? -Math.round(20 * Math.cos(rad)) : 0;
    const move = adrift ? `translate(${dx}px,${dy}px) ` : "";
    const cone = noAvatar || state === "hidden" ? "display:none;"
      : `position:absolute;left:50%;top:67px;width:0;height:0;margin-left:-30px;`
        + `border-left:30px solid transparent;border-right:30px solid transparent;border-bottom:62px solid ${tone};opacity:.3;`
        + `transform:${move}rotate(${180 + gaze}deg);transform-origin:50% 0;`;
    return {
      tone,
      unit: `position:relative;width:172px;height:126px;transform:rotate(${rot}deg);transform-origin:50% 50%;`,
      cone,
      halo: noAvatar ? "display:none;" : av.halo + (adrift ? `transform:translate(${dx}px,${dy}px);` : ""),
      chair: empty
        ? chairSeat("rgba(205,185,143,.5)", true)
        : chairSeat(tone, false) + (mine ? `box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 6px ${tone},inset 0 -4px 10px rgba(0,0,0,.5),0 0 0 3px ${T.gold},0 4px 0 rgba(11,7,4,.5);` : ""),
      ring: noAvatar ? "display:none;" : av.ring + (adrift ? `transform:translate(${dx}px,${dy}px);` : ""),
      glyph: noAvatar ? "display:none;" : av.glyph + `transform:rotate(${-rot}deg);`,
      plate: noAvatar ? "display:none;" : av.plate.replace("top:100px;", "top:112px;") + `transform:translateX(-50%) translate(${dx}px,${dy}px) rotate(${-rot}deg);`,
    };
  };

  const ICON = {
    pin: "M9 3h6l-1 6h2l1 5H7l1-5h2L9 3zM12 14v7",
    lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
    hide: "M3 3l18 18M10.6 6.2A9 9 0 0 1 22 12s-1.5 2.6-4.3 4.5M6.4 7.6C3.9 9.3 2 12 2 12s4 7 10 7c1.5 0 2.9-.3 4.1-.9",
  };

  root.TableKit = { T, TILE, seatInk, spin, chairSeat, chairStage, avParts, seatUnit, HAND_TOP, ICON };
})(window);
