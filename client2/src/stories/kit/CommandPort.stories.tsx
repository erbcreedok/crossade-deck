import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import type { Card } from "../../game/ui/Card";
import type { Command } from "../../game/engine/command";
import { Button } from "../../game/ui/Button";
import { CanvasStage } from "../harness/CanvasStage";


interface Args {
  t: Command["t"];
  value: string;
  x: number;
  y: number;
  conceal: boolean;
}

/** Собрать команду из аргументов панели — тот же объект, что пришёл бы по сети. */
function commandFrom(a: Args, id: string): Command {
  switch (a.t) {
    case "move":
      return { t: "move", id, x: a.x, y: a.y };
    case "setValue":
      return { t: "setValue", id, value: a.value };
    case "conceal":
      return { t: "conceal", id, v: a.conceal };
    default:
      return { t: "flip", id };
  }
}

const log = action("command");

// Последние аргументы панели. Кнопка и консоль читают ИХ, а не то, что было при сборке.
//
// Сцену на правку рычага пересобирать нельзя: карта вернулась бы в исходное, и эффект прошлой
// команды пропадал бы на глазах. Но и «ничего не делать» нельзя — именно из-за этого кнопка
// навсегда оставалась с первыми аргументами и порт выглядел сломанным.
let live: Args = { t: "flip", value: "K♥", x: 420, y: 140, conceal: true };
const keep = <K extends keyof Args>(k: K) => (_el: unknown, v: unknown) => void (live = { ...live, [k]: v as Args[K] });

/**
 * ПОРТ КОМАНД — единственная дверь, через которую доску двигает НЕ палец: сервер, правило игры,
 * консоль, undo.
 *
 * Кнопки эту дверь не доказывают. Кнопка в витрине — тот же локальный вызов, и по ней невозможно
 * отличить настоящий порт от прямой мутации карты: картинка одинаковая. Поэтому здесь порт выведен
 * НАРУЖУ и показывает свой ТРАФИК.
 *
 * Команду можно послать из консоли браузера:
 *
 *   __cmd({ t: "flip", id: "port" })
 *   __cmd({ t: "move", id: "port", x: 400, y: 120 })
 *   __cmd({ t: "setValue", id: "port", value: "KH" })
 *   __cmd({ t: "conceal", id: "port", v: true })
 *
 * Каждая исполненная команда падает в панель Actions. Если бы витрина меняла карту напрямую,
 * канвас выглядел бы так же, а журнал остался пустым — эту подмену раздел и ловит.
 */
const meta: Meta<Args> = {
  title: "Mechanics/Command port",
  args: { t: "flip", value: "K♥", x: 420, y: 140, conceal: true },
  argTypes: {
    t: { name: "t", description: "тип команды — весь список порта (engine/command.ts)", control: { type: "select" }, options: ["flip", "move", "setValue", "conceal"] },
    value: { name: "value", description: "новое значение карты (setValue) — так сервер РАСКРЫВАЕТ карту; масть можно буквой", control: { type: "text" }, if: { arg: "t", eq: "setValue" } },
    x: { name: "x", description: "куда переместить (move)", control: { type: "range", min: 60, max: 600, step: 10 }, if: { arg: "t", eq: "move" } },
    y: { name: "y", description: "куда переместить (move)", control: { type: "range", min: 40, max: 400, step: 10 }, if: { arg: "t", eq: "move" } },
    conceal: { name: "v", description: "скрыть или раскрыть (conceal)", control: { type: "boolean" }, if: { arg: "t", eq: "conceal" } },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import type { Command } from "../../game/engine/command";

// Порт — обычные ДАННЫЕ. Ровно такой объект приходит по сети, из undo или из правила игры:
const cmd: Command = ${JSON.stringify(commandFrom(a as unknown as Args, "port"))};

// Единственная дверь. Всё, что двигает доску мимо неё, не увидят ни сеть, ни undo, ни запись игры.
ctx.dispatch(cmd);`,
  },
  render: (a) => (
    <CanvasStage<Card, Args>
      args={a}
      // Аргументы не применяются сами: команда — СОБЫТИЕ, а не состояние. Панель её только
      // собирает, отправка — кнопка или вызов из консоли. Пересобирать сцену на каждый рычаг
      // тоже нельзя: карта возвращалась бы в исходное, и эффект прошлой команды пропадал.
      apply={{ t: keep("t"), value: keep("value"), x: keep("x"), y: keep("y"), conceal: keep("conceal") }}
      opts={{ cardHeight: 160 }}
      build={(ctx, args) => {
        live = args;
        const home = { x: ctx.padding + ctx.cardW / 2, y: ctx.padding + ctx.cardH / 2 };
        // apiCard — карта, которую двигает API, а не палец: она исключена из хит-теста драга.
        // Обычная карта показывала бы другой сценарий — «а можно ещё и рукой».
        ctx.apiCard({ id: "port", card: "A♠", pose: "rest" }, home);

        const send = (cmd: Command) => {
          log(cmd); // трафик порта — в панель Actions
          ctx.dispatch(cmd);
        };
        ctx.button(new Button({ label: "отправить", variant: "primary", size: "sm", onClick: () => send(commandFrom(live, "port")) }), {
          x: home.x,
          y: home.y + ctx.cardH * 0.8,
        });

        // Дверь наружу — ТОТ ЖЕ `send`, что у кнопки: обходного пути консоль не получает.
        //
        // Кладём её и в окно каталога (`parent`), а не только в окно превью. Консоль браузера по
        // умолчанию стоит в ВЕРХНЕМ документе, и `__cmd` там просто не существовало: чтобы дверь
        // нашлась, надо было сперва догадаться переключить контекст на iframe превью. Окна
        // одного происхождения, так что записать в родителя можно; если однажды нельзя — молча
        // остаёмся с дверью в превью.
        const door = (globalThis as unknown as { __cmd?: (c: Command) => void });
        door.__cmd = send;
        try {
          const top = (globalThis as unknown as { parent?: { __cmd?: (c: Command) => void } }).parent;
          if (top && top !== globalThis) top.__cmd = send;
        } catch {
          // другое происхождение — дверь остаётся только внутри превью
        }
        const hint = ctx.label('в консоли браузера:  __cmd({ t: "flip", id: "port" })', ctx.padding, home.y + ctx.cardH * 0.8 + 34, 13, 0xcdb98f, undefined, 0);
        ctx.extent(Math.max(hint.width, ctx.cardW * 3) + ctx.padding * 2, home.y + ctx.cardH * 0.8 + 34 + hint.height + ctx.padding);
      }}
    />
  ),
};
export default meta;

/**
 * Соберите команду рычагами и отправьте кнопкой — или пошлите её из консоли браузера через
 * `__cmd(...)`, что и есть настоящий сценарий: доску двигает кто-то СНАРУЖИ.
 *
 * Смотреть надо в панель **Actions**: там виден трафик порта, а не только его результат на канвасе.
 *
 * Карта здесь недрагабельная намеренно (`apiCard`) — раздел про то, что двигает её не палец.
 * Движение при `move` идёт стилем из пресета (`anim/moveStyles.ts`), а не телепортом: телепорт
 * означал бы, что команда обошла физику, и по статичному кадру это неотличимо.
 */
export const CommandPort: StoryObj<Args> = { name: "Command port" };
