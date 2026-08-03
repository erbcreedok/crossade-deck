import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene";
import { BOARD_LIBRARY, type BoardLibraryId } from "../../game/boards/presets";
import { seatCount } from "../../game/boards/state";
import {
  applyRoomCommand,
  canTouch,
  createRoom,
  memberAt,
  occupantsFor,
  type RoomCommand,
  type RoomState,
} from "../../game/boards/room";

interface Args {
  guestsAllowed: boolean;
  observersCanTouch: boolean;
}

const logRoom = action("room ← команда");
const logBoard = action("board ← dispatch");

function useRoom(): [RoomState, (cmd: RoomCommand) => void] {
  const [room, dispatch] = useReducer((r: RoomState, cmd: RoomCommand) => {
    logRoom(cmd);
    return applyRoomCommand(r, cmd);
  }, undefined, () => {
    // Стартовый состав: создатель-модератор сел на p1, второй юзер смотрит.
    let r = createRoom("5246", "chess");
    r = applyRoomCommand(r, { t: "join", id: "u1", displayName: "Ербол" });
    r = applyRoomCommand(r, { t: "join", id: "u2", displayName: "Аида" });
    r = applyRoomCommand(r, { t: "sit", id: "u1", seat: "p1" });
    return r;
  });
  return [room, dispatch];
}

const chip = (color: number) => ({
  display: "inline-block", width: 10, height: 10, borderRadius: 5,
  background: `#${color.toString(16).padStart(6, "0")}`, marginRight: 6,
});
const btn: React.CSSProperties = {
  font: "12px monospace", background: "#2f3d34", color: "#cfd8cf", border: "1px solid #50604f",
  borderRadius: 4, padding: "2px 6px", cursor: "pointer",
};

function RoomStage({ guestsAllowed, observersCanTouch }: Args) {
  const [room, dispatch] = useRoom();
  const [viewAs, setViewAs] = useState("u1");
  const [guestSeq, setGuestSeq] = useState(1);

  useEffect(() => {
    dispatch({ t: "setPolicy", policy: { guestsAllowed, observersCanTouch } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestsAllowed, observersCanTouch]);

  const spec = useMemo(() => BOARD_LIBRARY[room.boardId as BoardLibraryId](), [room.boardId]);
  const seats = Array.from({ length: seatCount(spec) }, (_, i) => `p${i + 1}`);
  const me = room.members.find((m) => m.id === viewAs);
  const mySeat = me?.occupancy.kind === "player" ? me.occupancy.seat : undefined;
  const occupants = occupantsFor(room, seats);
  // Ключ сцены: пересобираем канвас на смену борды/рассадки/зрителя — комната живёт дольше сцены.
  const sceneKey = `${room.boardId}|${occupants.join(",")}|${viewAs}|${canTouch(room, viewAs)}`;

  return (
    <div style={{ display: "flex", width: "100%", height: "100vh", background: "#222b26" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CanvasHost key={sceneKey} boardId={room.boardId as BoardLibraryId} occupants={occupants} selfSeat={mySeat} interactive={canTouch(room, viewAs)} />
      </div>
      <div style={{ width: 280, padding: 10, font: "12px monospace", color: "#cfd8cf", overflowY: "auto", borderLeft: "1px solid #394639" }}>
        <div style={{ marginBottom: 8 }}>
          Комната <b style={{ color: "#e0c04c" }}>{room.code}</b> · борда:{" "}
          <select style={{ ...btn }} value={room.boardId} onChange={(e) => dispatch({ t: "setBoard", boardId: e.target.value })}>
            {Object.keys(BOARD_LIBRARY).map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        {room.members.map((m) => {
          const seat = m.occupancy.kind === "player" ? m.occupancy.seat : null;
          return (
            <div key={m.id} style={{ padding: "6px 0", borderTop: "1px solid #394639", opacity: m.id === viewAs ? 1 : 0.85 }}>
              <div>
                <span style={chip(m.color)} />
                <b style={{ color: m.id === viewAs ? "#e0c04c" : "#cfd8cf" }}>{m.name}</b>
                {m.membership === "moderator" ? " 🛡" : ""}{m.guest ? " (гость)" : ""} — {seat ? `игрок @${seat}` : "наблюдатель"}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                <button style={btn} onClick={() => setViewAs(m.id)}>👁 глазами</button>
                {seat ? (
                  <button style={btn} onClick={() => dispatch({ t: "stand", id: m.id })}>встать</button>
                ) : (
                  seats.filter((s) => !memberAt(room, s)).map((s) => (
                    <button key={s} style={btn} onClick={() => dispatch({ t: "sit", id: m.id, seat: s })}>сесть @{s}</button>
                  ))
                )}
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => { dispatch({ t: "join", id: `g${guestSeq}`, guest: true }); setGuestSeq((n) => n + 1); }}>
            + гость
          </button>
        </div>
        <div style={{ marginTop: 8, color: "#8b9a8b" }}>
          Наблюдателям {room.policy.observersCanTouch ? "МОЖНО" : "нельзя"} мешать · гости {room.policy.guestsAllowed ? "разрешены" : "запрещены"}
        </div>
      </div>
    </div>
  );
}

function CanvasHost({ boardId, occupants, selfSeat, interactive }: {
  boardId: BoardLibraryId;
  occupants: (string | null)[];
  selfSeat?: string;
  interactive: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // useEffect, не cleanup ref-колбэка: React 18 возврат из ref игнорирует, сцена бы не умирала.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({
      spec: BOARD_LIBRARY[boardId](),
      occupants,
      // У наблюдателя МЕСТА НЕТ: явный несуществующий стул, иначе дефолт «p1» показал бы ему
      // чужую руку лицом. Все руки сидящих тогда честно уходят в полосу мест рубашками.
      selfSeat: selfSeat ?? "observer",
      interactive,
      onCommand: (cmd) => logBoard(cmd),
    });
    const g = globalThis as unknown as { __room?: BoardScene };
    g.__room = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => {
      if (g.__room === scene) delete g.__room;
      scene.destroy();
    };
    // Хост живёт под key от родителя — все входы стабильны на время его жизни.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={hostRef} style={{ width: "100%", height: "100%", background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />;
}

/**
 * КОМНАТА — сборка людей вокруг живой борды (`docs/BOARDS-DESIGN.md` §6–7). Роли — три
 * ортогональных факта: identity (юзер / гость «цвет + зверь»), membership (модератор 🛡),
 * occupancy (игрок на стуле / наблюдатель). «Игрок» — не сущность, а человек, ЗАНЯВШИЙ место.
 *
 * Панель справа — дебаг-рычаги комнаты: сажайте людей на стулья, вставайте, добавляйте гостей,
 * меняйте борду НА ЛЕТУ (люди, роли и цвета остаются — occupancy сбрасывается: у новой борды
 * свои места), смотрите стол глазами любого (👁). Наблюдатель без права «мешать» стол не тащит —
 * включите `observersCanTouch` и он сможет (как вечером за шахматами).
 *
 * Стандалон-игра и комната — не два режима: стандалон = неявная комната с фиксированной бордой
 * и спрятанной панелью (стори Mechanics/Boards — ровно это).
 */
const meta: Meta<Args> = {
  title: "Mechanics/Room",
  args: { guestsAllowed: true, observersCanTouch: false },
  argTypes: {
    guestsAllowed: {
      name: "guestsAllowed",
      description: "пускать ли неавторизованных: гость получает имя «цвет + зверь» и presence-цвет из имени",
    },
    observersCanTouch: {
      name: "observersCanTouch",
      description: "«мешать»: наблюдателю (без места) разрешается таскать фигуры в общих зонах — политика комнаты, не свойство борды",
    },
  },
  parameters: {
    layout: "fullscreen",
    code: (a: Record<string, unknown>) => `import { createRoom, applyRoomCommand } from "../../game/boards/room";
import { BoardScene } from "../../game/boards/scene";

let room = createRoom("5246", "chess", { guestsAllowed: ${a.guestsAllowed}, observersCanTouch: ${a.observersCanTouch} });
room = applyRoomCommand(room, { t: "join", id: "u1", displayName: "Ербол" });   // первый — модератор
room = applyRoomCommand(room, { t: "sit", id: "u1", seat: "p1" });        // occupancy: player@p1

// Комната живёт дольше сцены: смена борды пересобирает стол, люди остаются.
const scene = new BoardScene({ spec: board(room.boardId), occupants: occupantsFor(room, seats),
  selfSeat: mySeat, interactive: canTouch(room, viewerId) });`,
  },
  render: (a) => <RoomStage guestsAllowed={a.guestsAllowed} observersCanTouch={a.observersCanTouch} />,
};
export default meta;

/**
 * Комната с бордой и панелью людей. Что сделать руками:
 *   • посадите Аиду на p2 — у стола появится её имя; встаньте — стул снова «свободно»;
 *   • «+ гость» пару раз: у гостей имена «цвет + зверь», цвет точки = цвет из имени;
 *   • 👁 «глазами» наблюдателя: стол видно, но тащить нельзя (пока `observersCanTouch` выключен);
 *   • смените борду селектом — люди и роли остаются, все встали (у новой борды свои места).
 */
export const Room: StoryObj<Args> = {};
