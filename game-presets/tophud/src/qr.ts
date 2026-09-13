// КОД, КОТОРЫЙ НАВОДЯТ КАМЕРОЙ — QR из адреса стола, посчитанный здесь и целиком.
//
// Зачем свой, а не библиотека: полоса рисуется НАД игрой и грузится с ней вместе, а стол зовут
// друг друга за одним столом — то есть часто без интернета вовсе, с телефона на телефон. Картинка,
// которую пришлось бы просить у чужого сервера, в этот момент не приходит, и кнопка «QR» становится
// пустым квадратом ровно тогда, когда она нужна.
//
// Сделано ровно столько, сколько нужно адресу комнаты: байтовый режим, уровень коррекции M и версии
// с первой по десятую — это до 271 знака, а ссылка на стол вдвое короче. Всё остальное из стандарта
// (числовой и буквенно-цифровой режимы, версии до сороковой, ECI) сюда не входит и не притворяется.
//
// Проверяется сторожем по чужим образцам: QR, посчитанный неверно, выглядит как настоящий.

/** Полином Галуа GF(256) — таблицы степеней и логарифмов, по которым считается коррекция. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
})();

const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

/** Порождающий полином на `n` байт коррекции. */
function generator(n: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < n; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      // Старший коэффициент стоит первым, поэтому умножение на x — это сдвиг НА МЕСТЕ, а
      // умножение на α^i уезжает на разряд вниз. Перепутать эти две строки местами — значит
      // получить другой полином и коррекцию, которая выглядит как настоящая.
      next[j] = (next[j]! ^ poly[j]!) & 0xff;
      next[j + 1] = (next[j + 1]! ^ mul(poly[j]!, EXP[i]!)) & 0xff;
    }
    poly = next;
  }
  return poly;
}

/** Байты коррекции для блока данных. */
function ecBytes(data: Uint8Array, n: number): Uint8Array {
  const gen = generator(n);
  const out = new Uint8Array(data.length + n);
  out.set(data);
  for (let i = 0; i < data.length; i += 1) {
    const lead = out[i]!;
    if (lead === 0) continue;
    for (let j = 0; j < gen.length; j += 1) out[i + j] = (out[i + j]! ^ mul(gen[j]!, lead)) & 0xff;
  }
  return out.slice(data.length);
}

/**
 * ВЕРСИИ 1–10 ПРИ УРОВНЕ КОРРЕКЦИИ M: сколько всего байт, сколько их на коррекцию, и на сколько
 * блоков делятся данные. Цифры — из стандарта; выдумать их нельзя, и потому они лежат таблицей.
 */
const VERSIONS: readonly { total: number; ecPerBlock: number; group1: number; group2: number }[] = [
  { total: 26, ecPerBlock: 10, group1: 1, group2: 0 },
  { total: 44, ecPerBlock: 16, group1: 1, group2: 0 },
  { total: 70, ecPerBlock: 26, group1: 1, group2: 0 },
  { total: 100, ecPerBlock: 18, group1: 2, group2: 0 },
  { total: 134, ecPerBlock: 24, group1: 2, group2: 0 },
  { total: 172, ecPerBlock: 16, group1: 4, group2: 0 },
  { total: 196, ecPerBlock: 18, group1: 4, group2: 0 },
  { total: 242, ecPerBlock: 22, group1: 2, group2: 2 },
  { total: 292, ecPerBlock: 22, group1: 3, group2: 2 },
  { total: 346, ecPerBlock: 26, group1: 4, group2: 1 },
];

/** Где стоят выравнивающие квадраты, по версиям. Первая версия обходится без них. */
const ALIGN: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Готовые 15 бит формата для уровня M и каждой из восьми масок. */
const FORMAT_M = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
] as const;

/** Квадрат из нулей и единиц: `1` — чёрный модуль. */
export type QrMatrix = readonly (readonly number[])[];

const MASKS: readonly ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/**
 * ПОСЧИТАТЬ QR ДЛЯ ЭТОЙ СТРОКИ. `undefined` — строка длиннее, чем сюда влезает: врать квадратом,
 * который не читается, нельзя.
 */
export function qrMatrix(text: string): QrMatrix | undefined {
  const bytes = new TextEncoder().encode(text);
  const version = VERSIONS.findIndex((v) => {
    const dataBytes = v.total - v.ecPerBlock * (v.group1 + v.group2);
    // Байтовый режим: 4 бита режима + счётчик (8 бит до версии 10) + сами байты.
    return dataBytes >= bytes.length + 2;
  });
  if (version < 0) return undefined;
  const spec = VERSIONS[version]!;
  const blocks = spec.group1 + spec.group2;
  const dataBytes = spec.total - spec.ecPerBlock * blocks;

  // ---- БИТЫ ДАННЫХ ----
  const bits: number[] = [];
  const push = (value: number, width: number): void => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) push(byte, 8);
  // Хвост: до четырёх нулей, дополнение до байта, дальше два чередующихся заполнителя.
  push(0, Math.min(4, dataBytes * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data = new Uint8Array(dataBytes);
  for (let i = 0; i < bits.length / 8; i += 1) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i * 8 + b]!;
    data[i] = byte;
  }
  for (let i = Math.ceil(bits.length / 8); i < dataBytes; i += 1) data[i] = i % 2 === 0 ? 0xec : 0x11;

  // ---- БЛОКИ И ЧЕРЕДОВАНИЕ ----
  const short = Math.floor(dataBytes / blocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let at = 0;
  for (let i = 0; i < blocks; i += 1) {
    const size = i < spec.group1 ? short : short + 1;
    const block = data.slice(at, at + size);
    at += size;
    dataBlocks.push(block);
    ecBlocks.push(ecBytes(block, spec.ecPerBlock));
  }
  const stream: number[] = [];
  for (let i = 0; i < short + 1; i += 1) {
    for (const block of dataBlocks) if (i < block.length) stream.push(block[i]!);
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) stream.push(block[i]!);
  }

  // ---- ПОЛОТНО ----
  const size = 17 + 4 * (version + 1);
  const grid: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const fixed: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const put = (r: number, c: number, dark: number): void => {
    grid[r]![c] = dark;
    fixed[r]![c] = true;
  };

  const finder = (top: number, left: number): void => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const y = top + r;
        const x = left + c;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        const ring = r >= 0 && r <= 6 && (c === 0 || c === 6) ? 1 : 0;
        const bar = c >= 0 && c <= 6 && (r === 0 || r === 6) ? 1 : 0;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4 ? 1 : 0;
        put(y, x, ring || bar || core ? 1 : 0);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    put(6, i, i % 2 === 0 ? 1 : 0);
    put(i, 6, i % 2 === 0 ? 1 : 0);
  }

  for (const r of ALIGN[version]!) {
    for (const c of ALIGN[version]!) {
      if (fixed[r]![c] === true) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const edge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          put(r + dr, c + dc, edge || (dr === 0 && dc === 0) ? 1 : 0);
        }
      }
    }
  }

  // Тёмный модуль и места под формат — заняты до того, как по полотну пойдут данные.
  put(size - 8, 8, 1);
  for (let i = 0; i < 9; i += 1) {
    if (fixed[8]![i] !== true) put(8, i, 0);
    if (fixed[i]![8] !== true) put(i, 8, 0);
  }
  for (let i = 0; i < 8; i += 1) {
    if (fixed[8]![size - 1 - i] !== true) put(8, size - 1 - i, 0);
    if (fixed[size - 1 - i]![8] !== true) put(size - 1 - i, 8, 0);
  }

  // ---- ДАННЫЕ ЗМЕЙКОЙ СНИЗУ СПРАВА ----
  let bit = 0;
  const nextBit = (): number => {
    const byte = stream[bit >> 3];
    const value = byte === undefined ? 0 : (byte >> (7 - (bit & 7))) & 1;
    bit += 1;
    return value;
  };
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = up ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (fixed[row]![c] === true) continue;
        grid[row]![c] = nextBit();
      }
    }
    up = !up;
  }

  // ---- МАСКА: ТА, ЧТО ЧИТАЕТСЯ ЛУЧШЕ ----
  let best = 0;
  let bestScore = Infinity;
  let bestGrid = grid;
  for (let m = 0; m < MASKS.length; m += 1) {
    const tried = grid.map((row, r) => row.map((v, c) => (fixed[r]![c] === true ? v : v ^ (MASKS[m]!(r, c) ? 1 : 0))));
    // ШТРАФ СЧИТАЕТСЯ ДО ТОГО, КАК ЛЯЖЕТ ФОРМАТ: пятнадцать бит формата СВОИ У КАЖДОЙ МАСКИ, и
    // сравнивать маски вместе с ними значит сравнивать их по разному полотну. Тёмный модуль тоже
    // ставится потом — он часть той же пятнашки, и при сравнении его нет.
    tried[size - 8]![8] = 0;
    const score = penalty(tried);
    tried[size - 8]![8] = 1;
    if (score < bestScore) {
      bestScore = score;
      best = m;
      bestGrid = tried;
    }
  }
  writeFormat(bestGrid, FORMAT_M[best]!);
  return bestGrid;
}

/** Пятнадцать бит формата ложатся дважды — рядом с каждым из углов. */
function writeFormat(grid: number[][], format: number): void {
  const size = grid.length;
  const at = (i: number): number => (format >> i) & 1;
  for (let i = 0; i < 15; i += 1) {
    const bit = at(i);
    // Столбец у левого верхнего угла — и ряд, обойдя тайминг на шестой линии.
    if (i < 6) grid[i]![8] = bit;
    else if (i < 8) grid[i + 1]![8] = bit;
    else grid[size - 15 + i]![8] = bit;
    // ...и те же пятнадцать бит вторым экземпляром: у правого верхнего и левого нижнего углов.
    if (i < 8) grid[8]![size - i - 1] = bit;
    else if (i < 9) grid[8]![15 - i] = bit;
    else grid[8]![14 - i] = bit;
  }
}

/**
 * ШТРАФ ЗА НЕРОВНОСТЬ. Из восьми масок берётся та, у которой он меньше: маска — это не украшение,
 * а то, что разбивает большие одноцветные пятна, по которым камера теряется.
 *
 * Считается ровно так, как считает давно проверенная чужая реализация, по которой снят сторож:
 * первый штраф — за одинаковых соседей вокруг каждого модуля, второй — за одноцветные квадраты
 * два на два, третий — за полоску, похожую на угловой квадрат, четвёртый — за перекос чёрного к
 * белому по всему полю.
 */
function penalty(grid: readonly (readonly number[])[]): number {
  const size = grid.length;
  let score = 0;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      let same = 0;
      const dark = grid[row]![col]!;
      for (let r = -1; r <= 1; r += 1) {
        for (let c = -1; c <= 1; c += 1) {
          if (r === 0 && c === 0) continue;
          const y = row + r;
          const x = col + c;
          if (y < 0 || y >= size || x < 0 || x >= size) continue;
          if (grid[y]![x] === dark) same += 1;
        }
      }
      if (same > 5) score += 3 + same - 5;
    }
  }

  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const count = grid[row]![col]! + grid[row + 1]![col]! + grid[row]![col + 1]! + grid[row + 1]![col + 1]!;
      if (count === 0 || count === 4) score += 3;
    }
  }

  const FALSE_FINDER = [1, 0, 1, 1, 1, 0, 1];
  const isFinderish = (at: (i: number) => number): boolean => FALSE_FINDER.every((v, j) => at(j) === v);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size - 6; col += 1) {
      if (isFinderish((j) => grid[row]![col + j]!)) score += 40;
    }
  }
  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row < size - 6; row += 1) {
      if (isFinderish((j) => grid[row + j]![col]!)) score += 40;
    }
  }

  let dark = 0;
  for (const row of grid) for (const v of row) dark += v;
  score += (Math.abs((100 * dark) / (size * size) - 50) / 5) * 10;
  return score;
}

/**
 * QR КАРТИНКОЙ — SVG во всю отведённую ширину, с полями: квадрат, прижатый к краю, камера не берёт.
 * `undefined` — строка не влезла, и рисовать нечего.
 */
export function qrSvg(text: string, px: number, dark: string, light: string): string | undefined {
  const grid = qrMatrix(text);
  if (!grid) return undefined;
  const quiet = 4;
  const side = grid.length + quiet * 2;
  const cells = grid
    .map((row, r) =>
      row
        .map((v, c) => (v === 1 ? `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>` : ""))
        .join(""),
    )
    .join("");
  return (
    `<svg viewBox="0 0 ${side} ${side}" width="${px}" height="${px}" shape-rendering="crispEdges" ` +
    `style="display:block;border-radius:8px">` +
    `<rect width="${side}" height="${side}" fill="${light}"/><g fill="${dark}">${cells}</g></svg>`
  );
}
