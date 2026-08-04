import { useEffect, useMemo, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene";
import { createBoardTable } from "../../game/boards/boardTable";
import type { BoardDriver } from "../../game/boards/driver";
import { BOARD_LIBRARY, roundTableBoard, type BoardLibraryId } from "../../game/boards/library";
import type { RoundTableOpts } from "../../game/boards/library/roundTable";
import type { BoardCommand } from "../../game/boards/spec";

interface Args {
  board: BoardLibraryId;
  seats: number;
}

const onCommand = action("dispatch → мок-порт");

/** React-хост борды: один канвас, сцена generic, конкретная борда — данные из библиотеки.
 *  Паттерн CrossadeGame.tsx: ref на div, сцена в useEffect, destroy в cleanup. */
function BoardStage({ board, seats }: Args) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: BOARD_LIBRARY[board](), seats, onCommand: (cmd: BoardCommand) => onCommand(cmd) });
    const g = globalThis as unknown as { __board?: BoardScene };
    g.__board = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => {
      if (g.__board === scene) delete g.__board;
      scene.destroy();
    };
  }, [board, seats]);
  return <div ref={hostRef} style={{ width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />;
}

/**
 * БОРДА — самостоятельная сборка игрового стола: зоны (у каждой СВОЁ поле слотов со своей
 * раскладкой — грид, кольцо, стопка, цепочка), места игроков, панель действий и смарт-мок
 * вместо правил (`docs/BOARDS-DESIGN.md`).
 *
 * Конкретная игра — ДАННЫЕ (`game/boards/library/` — файл на игру), не подкласс: девять борд
 * не написали ни строчки движка. Правил игр нет НАМЕРЕННО: мок исполняет всё, что
 * не рушит структуру (политики зон merge/swap/capture/reject — работают), а правила живут в
 * головах игроков. Кнопки панели — те же команды порта, что и палец: панель Actions показывает
 * каждый ход обоих драйверов.
 *
 * Проверяется мышью: тащите фигуры, жмите кнопки, смотрите панель Actions.
 */
const meta: Meta<Args> = {
  title: "Mechanics/Boards",
  args: { board: "chess", seats: 4 },
  argTypes: {
    board: {
      name: "board",
      description:
        "какая борда собрана на столе — это ЦЕЛИКОМ данные (BoardSpec): шахматы — грид 8×8 с capture и выносом за борт; крестовый — цепочка отбоя, руки и раздача «дилеру меньше»; монополия — кольцо, фишки-токены и деньги",
      control: { type: "select" },
      options: Object.keys(BOARD_LIBRARY),
    },
    seats: {
      name: "seats",
      description: "сколько мест открыть — работает у бордов с динамическими местами (крестовый 2..8, монополия 2..6); у шахмат мест ровно два всегда",
      control: { type: "range", min: 2, max: 8, step: 1 },
    },
  },
  parameters: {
    layout: "fullscreen",
    code: (a: Record<string, unknown>) => `import { BoardScene } from "../../game/boards/scene";
import { BOARD_LIBRARY } from "../../game/boards/library";

// Борда — данные (BoardSpec): зоны со своими раскладками, места, панель действий, смарт-мок.
const scene = new BoardScene({ spec: BOARD_LIBRARY.${a.board}(), seats: ${a.seats} });
void scene.mount(host, width, height);

// Кнопки и палец — два драйвера ОДНОГО порта команд:
scene.dispatch({ t: "move", el: "lp0", from: "field:r6c0", to: "field:r4c0" });`,
  },
  render: (a) => <BoardStage board={a.board} seats={a.seats} />,
};
export default meta;

/**
 * Стол с бордой из библиотеки. Что покрутить:
 *   • `board: chess` — потащите пешку на чужую фигуру: capture, жертва уезжает в колонку за
 *     бортом. «Расставить» возвращает партию;
 *   • `board: krestovyi` — руки уже розданы (дилеру ♛ меньше — раздача «по кругу, себе
 *     последним»); ходите в цепочку: отбой ложится ПОВЕРХ звена, новое звено открывается само;
 *     «ход дальше»/«направление» гоняют золотой маркер по местам — индикация, не запрет;
 *   • `board: monopoly` — «бросить кубики», фишки по кольцу, деньги у мест;
 *   • вторая волна: дурак (пары стола maxSize 2 — третья карта в слот не лезет), белка (вся
 *     колода всегда на руках), УНО (реверсы), манчкин (двери/сокровища/уровни), покер (борд
 *     из пяти адресных слотов + банк), ДнД (энкаунтер-поле с миниатюрами и кубиками).
 */
export const Boards: StoryObj<Args> = {};

/** Отдельная строка в сайдбаре — но это ТА ЖЕ borda-стори: `board` в контролах остаётся,
 *  можно переключить на любую другую. Разница — только дефолт. */
export const Chess: StoryObj<Args> = { args: { board: "chess", seats: 2 } };

/** Белка: вся колода всегда на руках, места динамические. Дефолт другой, контрол `board` тот же. */
export const Belka: StoryObj<Args> = { args: { board: "belka", seats: 4 } };

/** Крестовый: цепочка отбоя, руки и раздача «дилеру меньше». Дефолт другой, контрол `board` тот же. */
export const Krestovyi: StoryObj<Args> = { args: { board: "krestovyi", seats: 4 } };

interface RoundArgs {
  shape: "circle" | "rect";
  table: "radial" | "grid";
  slots: "dynamic" | "fixed";
  slotCount: number;
  stacking: boolean;
  seats: number;
  dealt: number;
}

/** Тот же BoardStage-паттерн, но спека собирается из рычагов билдером roundTableBoard. */
function RoundStage(a: RoundArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const opts: RoundTableOpts = {
      shape: a.shape,
      table: a.table,
      slots: a.slots === "fixed" ? a.slotCount : "dynamic",
      stacking: a.stacking,
      seats: a.seats,
      dealt: a.dealt,
    };
    const scene = new BoardScene({ spec: roundTableBoard(opts), seats: a.seats, onCommand: (cmd: BoardCommand) => onCommand(cmd) });
    const g = globalThis as unknown as { __board?: BoardScene };
    g.__board = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => {
      if (g.__board === scene) delete g.__board;
      scene.destroy();
    };
  }, [a.shape, a.table, a.slots, a.slotCount, a.stacking, a.seats, a.dealt]);
  return <div ref={hostRef} style={{ width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />;
}

/**
 * КРУГЛЫЙ СТОЛ ПЕСОЧНИЦЫ — борда-круг (ровный, не овал), посадки вокруг, в центре стол карт.
 * Все рычаги — те же настройки, что позже крутит контекстное меню песочницы; дефолт владельца —
 * ВСЁ круг и динамично. Слоты `fixed` показывают пару ring/grid и политику стакинга
 * (можно/нельзя класть карты друг на друга); у динамики жители встраиваются в круг сами.
 */
export const Round: StoryObj<RoundArgs> = {
  name: "Round table",
  args: { shape: "circle", table: "radial", slots: "dynamic", slotCount: 8, stacking: true, seats: 4, dealt: 6 },
  argTypes: {
    shape: {
      name: "shape",
      description: "форма борды-бокса и стола: ровный круг (дефолт песочницы) или прямоугольник",
      control: { type: "inline-radio" },
      options: ["circle", "rect"],
    },
    table: {
      name: "table",
      description: "рассадка карт стола: по радиусу (круг растёт с числом карт) или сеткой",
      control: { type: "inline-radio" },
      options: ["radial", "grid"],
    },
    slots: {
      name: "slots",
      description: "слоты стола: динамичные (мест столько, сколько карт) или фиксированное число",
      control: { type: "inline-radio" },
      options: ["dynamic", "fixed"],
    },
    slotCount: {
      name: "slotCount",
      description: "сколько фикс-слотов разложить (кольцом при radial, сеткой при grid)",
      control: { type: "range", min: 2, max: 12, step: 1 },
      if: { arg: "slots", eq: "fixed" },
    },
    stacking: {
      name: "stacking",
      description: "можно ли класть карты друг на друга в фикс-слоте (merge) или слот один-жилец (reject)",
      control: { type: "boolean" },
      if: { arg: "slots", eq: "fixed" },
    },
    seats: {
      name: "seats",
      description: "посадочные места вокруг стола: свой слот снизу «перед тобой», остальные по кругу",
      control: { type: "range", min: 1, max: 8, step: 1 },
    },
    dealt: {
      name: "dealt",
      description: "сколько карт разложить на стол сразу — витрине нужно что показывать",
      control: { type: "range", min: 0, max: 12, step: 1 },
    },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import { BoardScene } from "../../game/boards/scene";
import { roundTableBoard } from "../../game/boards/library";

// Настройки-как-данные: те же рычаги потом крутит контекстное меню песочницы.
const spec = roundTableBoard({ shape: "${a.shape}", table: "${a.table}", slots: ${a.slots === "fixed" ? a.slotCount : '"dynamic"'}, stacking: ${a.stacking}, seats: ${a.seats} });
const scene = new BoardScene({ spec, seats: ${a.seats} });
void scene.mount(host, width, height);`,
  },
  render: (a) => <RoundStage {...a} />,
};

interface LiveArgs extends Args {
  latency: number;
}

/** Грид клиентов одной борды: ОДИН мастер (boardTable), у каждой ячейки свой канвас, своё место
 *  и свой драйвер. Сцена не знает, что мок общий, — тот же шов BoardDriver, что и standalone. */
function LiveBoardsStage({ board, seats, latency }: LiveArgs) {
  const table = useMemo(
    () => createBoardTable({ spec: BOARD_LIBRARY[board](), seats, latencyMs: latency, onCommand: (from, cmd) => onCommand({ from, ...cmd }) }),
    [board, seats, latency],
  );
  useEffect(() => () => table.destroy(), [table]);
  const cols = table.drivers.length <= 2 ? table.drivers.length : Math.ceil(table.drivers.length / 2);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, width: "100%", height: "100vh", boxSizing: "border-box", padding: 8, background: "#222b26" }}>
      {table.drivers.map((d) => (
        <LiveCell key={`${board}-${seats}-${latency}-${d.seat}`} board={board} driver={d} seat={d.seat} />
      ))}
    </div>
  );
}

function LiveCell({ board, driver, seat }: { board: BoardLibraryId; driver: BoardDriver; seat: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: BOARD_LIBRARY[board](), driver, selfSeat: seat });
    const g = globalThis as unknown as { __boards?: Record<string, BoardScene> };
    (g.__boards ??= {})[seat] = scene;
    void scene.mount(host, host.clientWidth || 480, host.clientHeight || 360);
    return () => {
      delete g.__boards?.[seat];
      scene.destroy();
    };
    // Ячейка живёт под key от родителя — входы стабильны на время её жизни.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ font: "12px monospace", color: "#9aa89f", padding: "2px 6px" }}>{seat}</div>
      <div ref={hostRef} style={{ flex: 1, minHeight: 220, background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />
    </div>
  );
}

/**
 * ЖИВАЯ БОРДА — та же библиотека, но N клиентов над ОДНИМ мастером (boardTable.ts): ход в любой
 * ячейке долетает всем (эхо автору включительно), политики зон решаются один раз мастером,
 * `latency` эмулирует оба плеча доставки. Каждый клиент видит СВОЮ руку лицом, чужие — рубашками
 * в полосе мест. Подключение реального сервера — замена boardTable, сцены и борды не меняются.
 */
export const BoardsLive: StoryObj<LiveArgs> = {
  name: "Live",
  args: { board: "krestovyi", seats: 3, latency: 0 },
  argTypes: {
    latency: {
      name: "latency",
      description: "задержка каждого плеча доставки (клиент→мастер и мастер→клиент), мс: свой ход возвращается эхом через 2×latency",
      control: { type: "range", min: 0, max: 600, step: 50 },
    },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import { createBoardTable } from "../../game/boards/boardTable";
import { BoardScene } from "../../game/boards/scene";

// ОДИН мастер — авторитетное состояние; драйвер на каждое место.
const table = createBoardTable({ spec: BOARD_LIBRARY.${a.board}(), seats: ${a.seats}, latencyMs: ${a.latency} });
for (const driver of table.drivers) {
  const scene = new BoardScene({ spec: BOARD_LIBRARY.${a.board}(), driver, selfSeat: driver.seat });
  void scene.mount(hostOf(driver.seat), width, height);
}`,
  },
  render: (a) => <LiveBoardsStage board={a.board} seats={a.seats} latency={a.latency} />,
};
