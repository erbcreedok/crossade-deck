import type { Meta, StoryObj } from "@storybook/html";
import {
  actionsOf,
  activate,
  add,
  Bounded,
  button,
  byId,
  compose,
  Container,
  CONTROL_LABEL,
  facing,
  fieldsOf,
  Flippable,
  freeLayout,
  installStockActions,
  installStockControls,
  Labeled,
  nextTilt,
  node,
  Oriented,
  perform,
  rect,
  registerLayout,
  registerSurface,
  Rollable,
  rowLayout,
  setTilt,
  Surfaced,
  Tiltable,
  tiltAngle,
  Transformable,
  Valued,
  type Atom,
  type TransformableFields,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// ACTIONABLE is the atom a CONTROL carries: it names the intent a press emits, and the name is a
// registry ref rather than a callback — a node travels into snapshots, over wires and into other
// seats' projections, and a function survives none of those trips.
//
// THIS IS A CONTEXT MENU, and it is built the only way the kit allows. The items are not written
// out: `actionsOf(card)` derives them from the capabilities the card already carries, so a card can
// never advertise a flip it cannot perform. Take a capability away with the knobs and its item
// leaves the menu by itself — that is the whole claim, and it is the one to press on.
installStockControls();
installStockActions();

const FACE = "story.act.face";
const BACK = "story.act.back";

interface MenuArgs {
  canFlip: boolean;
  canTap: boolean;
  canRoll: boolean;
  cardW: number;
  cardH: number;
  gap: number;
}

const meta: Meta = {
  title: "Atoms/Actionable",
  parameters: {
    gkDoc: "actionable.component",
    gkAtom: "Actionable",
    // One field. Each menu item is a `button()` carrying it; press one and the readout shows what
    // `activate()` returned — the very call a press handler makes before deciding anything happened.
    gkFields: { action: ["Menu"] },
  },
};
export default meta;

/** Which face a card shows is the CONSUMER's answer, read off the parity the kit keeps. */
const faceOf = (card: ReturnType<typeof node>): Atom => Surfaced({ surface: facing(card) === "up" ? FACE : BACK });

export const Menu: StoryObj<MenuArgs> = {
  // PRESS THE ITEMS — the card answers. `flip` turns it over, `tap` walks its tilt stops, `roll`
  // throws a new face. And notice which of those the KIT performs: `flip` and `roll` ship a
  // `perform` in their registry record, `tap` does not — it is a pure query a game wires itself.
  // The control does not know the difference and must not: it emits a name and stops there.
  render: ({ canFlip, canTap, canRoll, cardW, cardH, gap }) => {
    registerSurface(FACE, { layers: [{ paint: "panelBg" }], radius: 0.08, stroke: { color: "accent", width: 0.03, alignment: 1 } });
    registerSurface(BACK, { layers: [{ paint: "accent" }], radius: 0.08 });
    registerLayout("story.act.free", freeLayout);
    // A column, because a phone is tall and a context menu on one is a stack, never a bar.
    registerLayout("story.act.menu", rowLayout({ direction: "column", gap: 0.08, padding: 0 }));

    const able: Atom[] = [];
    if (canFlip) able.push(Flippable());
    if (canTap) able.push(Tiltable({ stops: [0, 90], wrap: true }));
    if (canRoll) able.push(Valued({ values: { face: 1 } }), Rollable({ sides: 6 }));

    const desk = node("desk", Container({ layout: "story.act.free" }));
    const card = node(
      "card",
      Bounded({ bounds: rect(cardW, cardH) }),
      Surfaced({ surface: FACE }),
      Transformable({ at: { x: 0, y: -gap } }),
      ...able,
    );
    add(desk, card);

    // THE MENU IS DERIVED, not written. `orientation: "viewer"` terminates the chain of angles, so
    // the words stay upright even when the seat this menu belongs to is turned — which is why a
    // context menu needs no camera of its own (`docs/design/hud.md`).
    const menu = node(
      "menu",
      Container({ layout: "story.act.menu" }),
      Oriented({ orientation: "viewer" }),
      Transformable({ at: { x: 0, y: gap } }),
    );
    for (const a of actionsOf(card)) {
      add(menu, button(`item/${a.name}`, { label: a.label, action: a.name, look: "quiet" }));
    }
    add(desk, menu);

    add(
      desk,
      node(
        "said",
        Bounded({ bounds: rect(3.6, 0.34) }),
        Transformable({ at: { x: 0, y: gap + 1.15 } }),
        Labeled({ label: actionsOf(card).length ? "press an item" : "no capability, no menu", style: CONTROL_LABEL }),
      ),
    );

    const live = scene(desk, {
      press: (_meaning, control) => {
        // The whole of a press handler: ask what the control emits, and stop if it emits nothing.
        // No `disabled` was consulted, because there is none to consult.
        const intent = activate(control);
        const root = live.host.root;
        const on = byId(root, "card");
        if (!intent || !on) return;

        // What the KIT performs, it performs — `flip` and `roll` come back as a new node, so their
        // atoms are composed onto the live one. What it does not perform, the game wires: `tap` is
        // a pure query, and walking the tilt stops is this story's own answer to it.
        for (const atom of perform(intent, on).atoms.values()) compose(on, atom);
        if (intent === "tap") {
          // The tilt STOP is state on the node; the ANGLE is a pose, and moving one to the other is
          // the game's step, not the atom's. `Tiltable` says which stops exist and which one it
          // stands on — how far that turns the card is `tiltAngle`, and who writes it is whoever
          // owns the pose.
          setTilt(on, nextTilt(on));
          const at = fieldsOf<TransformableFields>(on, "Transformable")?.at ?? { x: 0, y: 0 };
          compose(on, Transformable({ at, angle: tiltAngle(on) ?? 0 }));
        }
        compose(on, faceOf(on));

        const said = byId(root, "said");
        if (said) compose(said, Labeled({ label: `activate() → ${intent}`, style: CONTROL_LABEL }));
        live.setRoot(root);
      },
    });
    return live.el;
  },
  args: { canFlip: true, canTap: true, canRoll: false, cardW: 1.1, cardH: 1.5, gap: 1.0 },
  argTypes: {
    canFlip: documented("arg.canFlip", { control: "boolean" }, "card/capabilities"),
    canTap: documented("arg.canTap", { control: "boolean" }, "card/capabilities"),
    canRoll: documented("arg.canRoll", { control: "boolean" }, "card/capabilities"),
    cardW: documented("arg.w", { control: { type: "number", min: 0.2, step: 0.1 } }, "card/bounds"),
    cardH: documented("arg.h", { control: { type: "number", min: 0.2, step: 0.1 } }, "card/bounds"),
    gap: documented("arg.gap", { control: { type: "number", min: 0, step: 0.05 } }, "desk/spacing"),
  },
  parameters: { gkDocStory: "actionable.menu" },
};
