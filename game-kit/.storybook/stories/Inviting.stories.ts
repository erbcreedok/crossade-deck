import type { Meta, StoryObj } from "@storybook/html";
import {
  Acceptor,
  add,
  Bounded,
  coatNames,
  Container,
  Draggable,
  freeLayout,
  installStockCarries,
  installStockCoats,
  Inviting,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  Valued,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented, hiddenRow, PAINTS } from "./surfaceControls.js";

// INVITING is the LOOK of willingness: one coat a zone wears while a drag it would take is in
// flight. Whether the zone is willing is never decided here — that is the Acceptor's verdict, and
// a game whose legality lives in functions picks its zones itself and uses the same wear/undo
// protocol. Grab dresses, release undresses; the tree carries no "highlighted" flag anywhere.
//
// The recipes and the carry styles are installed here, as an ordinary consumer would.
installStockCoats();
installStockCarries();

const meta: Meta = {
  title: "Atoms/Inviting",
  parameters: {
    gkDoc: "inviting.component",
    gkAtom: "Inviting",
    // The atom's one field: all three knobs of the coat live on the one scene.
    gkFields: { coat: ["Invite"] },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };
const RANK = { control: { type: "range", min: 1, max: 13, step: 1 } };
/** Shown only when a recipe is named: an absent coat has no strength and no colour to be asked about. */
const COATED = { if: { arg: "coat.recipe", neq: "" } };

interface InviteArgs {
  deskLayout: string;
  zoneW: number;
  zoneH: number;
  zoneLayout: string;
  zoneSurface: string;
  zonePaint: string;
  zoneRadius: number;
  zoneX: number;
  zoneY: number;
  accepts: number;
  /** THE COAT AS ONE VALUE, because that is how the atom takes it. Three flat knobs poured into a
   *  nested slot made the snippet read `{ coat: { recipe, level, tint } }` over `const recipe = …`
   *  — the panel and the code describing the same thing in two different shapes. */
  coat: { recipe: string; level: number; tint: string };
  sevenW: number;
  sevenH: number;
  sevenSurface: string;
  sevenPaint: string;
  sevenRadius: number;
  sevenX: number;
  sevenY: number;
  sevenRank: number;
  eightW: number;
  eightH: number;
  eightSurface: string;
  eightPaint: string;
  eightRadius: number;
  eightX: number;
  eightY: number;
  eightRank: number;
}

export const Invite = {
  // A zone that takes SEVENS, and two cards you can drag at it. Pick up the seven and the zone
  // puts its invite on — ring, wash, whatever the knobs say; let go and it comes off. Pick up
  // the eight and nothing lights: the rule answered `deny`, and an unwilling zone has nothing
  // to show. The verdict is the Acceptor's; the atom only says what willingness LOOKS like.
  render: ({
    deskLayout,
    zoneW,
    zoneH,
    zoneLayout,
    zoneSurface,
    zonePaint,
    zoneRadius,
    zoneX,
    zoneY,
    accepts,
    coat,
    sevenW,
    sevenH,
    sevenSurface,
    sevenPaint,
    sevenRadius,
    sevenX,
    sevenY,
    sevenRank,
    eightW,
    eightH,
    eightSurface,
    eightPaint,
    eightRadius,
    eightX,
    eightY,
    eightRank,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerLayout(zoneLayout, freeLayout);
    registerSurface(zoneSurface, { layers: [{ paint: zonePaint }], radius: zoneRadius });
    registerSurface(sevenSurface, { layers: [{ paint: sevenPaint }], radius: sevenRadius });
    registerSurface(eightSurface, { layers: [{ paint: eightPaint }], radius: eightRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    add(
      desk,
      node(
        "sevenZone",
        Bounded({ bounds: rect(zoneW, zoneH) }),
        Container({ layout: zoneLayout }),
        Surfaced({ surface: zoneSurface }),
        Transformable({ at: { x: zoneX, y: zoneY } }),
        Acceptor({ accept: { eq: ["el.values.rank", accepts] } }),
        Inviting({ coat }),
      ),
    );
    add(
      desk,
      node(
        "seven",
        Bounded({ bounds: rect(sevenW, sevenH) }),
        Surfaced({ surface: sevenSurface }),
        Transformable({ at: { x: sevenX, y: sevenY } }),
        Valued({ values: { rank: sevenRank } }),
        Draggable(),
      ),
    );
    add(
      desk,
      node(
        "eight",
        Bounded({ bounds: rect(eightW, eightH) }),
        Surfaced({ surface: eightSurface }),
        Transformable({ at: { x: eightX, y: eightY } }),
        Valued({ values: { rank: eightRank } }),
        Draggable(),
      ),
    );
    return wireDrag(scene(desk, { animate: true })).el;
  },
  args: {
    deskLayout: "story.invite.free",
    zoneW: 1.5,
    zoneH: 1.9,
    zoneLayout: "story.invite.zone.free",
    zoneSurface: "story.invite.zone",
    zonePaint: "sunkBg",
    zoneRadius: 0.12,
    zoneX: 1.2,
    zoneY: 0,
    accepts: 7,
    coat: { recipe: "ring", level: 0.7, tint: "accent" },
    sevenW: 1,
    sevenH: 1.4,
    sevenSurface: "story.invite.seven",
    sevenPaint: "accent",
    sevenRadius: 0.08,
    sevenX: -1.4,
    sevenY: -0.8,
    sevenRank: 7,
    eightW: 1,
    eightH: 1.4,
    eightSurface: "story.invite.eight",
    eightPaint: "textMuted",
    eightRadius: 0.08,
    eightX: -1.4,
    eightY: 0.9,
    eightRank: 8,
  },
  // PROBE: Storybook's types key `argTypes` by the args' own keys, so a dot-path is not modelled.
  // Cast to find out whether the runtime supports what the types do not.
  argTypes: {
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    zoneW: documented("arg.w", SIZE, "seven zone/bounds"),
    zoneH: documented("arg.h", SIZE, "seven zone/bounds"),
    zoneLayout: documented("arg.layoutName", TOKEN, "seven zone/container"),
    zoneSurface: documented("arg.registerAs", TOKEN, "seven zone/surface"),
    zonePaint: documented("arg.fill", PAINT, "seven zone/surface"),
    zoneRadius: documented("arg.radius", RADIUS, "seven zone/surface"),
    zoneX: documented("arg.x", PLACE, "seven zone/transformable"),
    zoneY: documented("arg.y", PLACE, "seven zone/transformable"),
    accepts: documented("arg.accepts", RANK, "seven zone/acceptor"),
    // The parent's own row comes off: its three parts are controlled one by one just below.
    coat: hiddenRow(),
    "coat.recipe": documented("arg.coatRecipe", { control: "select", options: ["", ...coatNames()] }, "seven zone/inviting"),
    "coat.level": documented("arg.coatLevel", { control: { type: "number", min: 0, max: 1, step: 0.05 }, ...COATED }, "seven zone/inviting"),
    "coat.tint": documented("arg.coatTint", { control: "select", options: ["", ...PAINTS], ...COATED }, "seven zone/inviting"),
    sevenW: documented("arg.w", SIZE, "seven card/bounds"),
    sevenH: documented("arg.h", SIZE, "seven card/bounds"),
    sevenSurface: documented("arg.registerAs", TOKEN, "seven card/surface"),
    sevenPaint: documented("arg.fill", PAINT, "seven card/surface"),
    sevenRadius: documented("arg.radius", RADIUS, "seven card/surface"),
    sevenX: documented("arg.x", PLACE, "seven card/transformable"),
    sevenY: documented("arg.y", PLACE, "seven card/transformable"),
    sevenRank: documented("arg.rank", RANK, "seven card/valued"),
    eightW: documented("arg.w", SIZE, "eight card/bounds"),
    eightH: documented("arg.h", SIZE, "eight card/bounds"),
    eightSurface: documented("arg.registerAs", TOKEN, "eight card/surface"),
    eightPaint: documented("arg.fill", PAINT, "eight card/surface"),
    eightRadius: documented("arg.radius", RADIUS, "eight card/surface"),
    eightX: documented("arg.x", PLACE, "eight card/transformable"),
    eightY: documented("arg.y", PLACE, "eight card/transformable"),
    eightRank: documented("arg.rank", RANK, "eight card/valued"),
  },
  parameters: { gkDocStory: "inviting.invite" },
} as StoryObj<InviteArgs>;
