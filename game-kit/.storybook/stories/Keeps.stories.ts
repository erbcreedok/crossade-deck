import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Draggable,
  facing,
  Flippable,
  freeLayout,
  glassOf,
  installStockFlips,
  keepsAllows,
  Keeper,
  node,
  pick,
  rect,
  registerLayout,
  registerSurface,
  setFacing,
  Surfaced,
  Transformable,
  type Node,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// KEEPS answers which of a child's capabilities still act while it sits INSIDE this container.
// No atom (the default) is the open door: everything a child can do, it may do here. A `Keeper`
// NARROWS to the list it names, and an empty list is the closed case — the atom's own tests read
// `keeps: ["drag"]` as "a card can be carried OUT but not flipped in place", and this is that desk:
// one card, one zone, and a tap that turns the card over ONLY when the zone's own `keepsAllows`
// says `flip` still acts. Dragging the card out is never gated here — it is a SEPARATE law
// (`Grabber`), and this shelf's point is that `Keeps` narrows one capability at a time.
installStockFlips();

const meta: Meta = {
  title: "Atoms/Keeps",
  parameters: {
    gkDoc: "keeps.component",
    gkAtom: "Keeper",
    gkFields: { keeps: ["Zone"] },
  },
};
export default meta;

const TOKEN = { control: "text" };
const PAINT = { control: "select", options: PAINTS };
const CHOICES = ["open", "dragOnly", "closed"];

interface KeepsArgs {
  keeps: string;
  zoneSurface: string;
  zonePaint: string;
  faceSurface: string;
  facePaint: string;
  backSurface: string;
  backPaint: string;
}

export const Zone: StoryObj<KeepsArgs> = {
  render: ({ keeps, zoneSurface, zonePaint, faceSurface, facePaint, backSurface, backPaint }) => {
    registerLayout("story.keeps.free", freeLayout);
    registerSurface(zoneSurface, { layers: [{ paint: zonePaint }], radius: 0.12 });
    registerSurface(faceSurface, { layers: [{ paint: facePaint }], radius: 0.08 });
    registerSurface(backSurface, { layers: [{ paint: backPaint }], radius: 0.08 });

    const desk = node("desk", Container({ layout: "story.keeps.free" }));
    // NO ATOM, A ONE-ITEM LIST, OR AN EMPTY ONE — the reader's choice becomes the zone's own
    // composition, exactly the three states `keeps.test.ts` names.
    const zone = node(
      "zone",
      Bounded({ bounds: rect(2, 2) }),
      Container({ layout: "story.keeps.free" }),
      Surfaced({ surface: zoneSurface }),
      Transformable({ at: { x: 0, y: 0 } }),
      ...(keeps === "open" ? [] : [Keeper({ keeps: keeps === "dragOnly" ? ["drag"] : [] })]),
    );
    const card = node(
      "card",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: faceSurface }),
      Flippable({ flip: "turnOver", back: backSurface }),
      Draggable({ onReject: "home" }),
    );
    add(zone, card);
    add(desk, zone);
    const built = scene(desk, { animate: true });
    // THE TAP IS THE READER'S OWN GATE, not something the kit does for free: `Keeper` narrows what
    // a capability may do, and a caller has to ask `keepsAllows` before acting on the answer.
    built.host.view.addEventListener("pointerdown", (e: PointerEvent) => {
      const hit = pick(built.host, built.host.root, glassOf(built.host.view, e), () => true);
      const turn = hit?.id === "card" ? hit : undefined;
      const owner: Node | undefined = turn?.parent ?? undefined;
      if (!turn || !owner || !keepsAllows(owner, "flip")) return;
      setFacing(turn, facing(turn) === "up" ? "down" : "up");
      built.host.setRoot(built.host.root);
    });
    return wireDrag(built).el;
  },
  args: {
    keeps: "dragOnly",
    zoneSurface: "story.keeps.zone",
    zonePaint: "sunkBg",
    faceSurface: "story.keeps.face",
    facePaint: "accent",
    backSurface: "story.keeps.back",
    backPaint: "textMuted",
  },
  argTypes: {
    keeps: documented("arg.keeps", { control: "select", options: CHOICES }, "zone/keeper"),
    zoneSurface: documented("arg.registerAs", TOKEN, "zone/surface"),
    zonePaint: documented("arg.fill", PAINT, "zone/surface"),
    faceSurface: documented("arg.registerAs", TOKEN, "card/surface"),
    facePaint: documented("arg.fill", PAINT, "card/surface"),
    backSurface: documented("arg.registerAs", TOKEN, "card/flippable"),
    backPaint: documented("arg.fill", PAINT, "card/flippable"),
  },
  parameters: { gkDocStory: "keeps.zone" },
};
