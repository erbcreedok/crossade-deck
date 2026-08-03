import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene";
import { BOARD_LIBRARY, type BoardLibraryId } from "../../game/boards/presets";
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
 * Конкретная игра — ДАННЫЕ (`game/boards/presets.ts`), не подкласс: шахматы, крестовый и
 * монополия не написали ни строчки движка. Правил игр нет НАМЕРЕННО: мок исполняет всё, что
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
import { BOARD_LIBRARY } from "../../game/boards/presets";

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
 *   • `board: monopoly` — «бросить кубики», фишки по кольцу, деньги у мест.
 */
export const Boards: StoryObj<Args> = {};
