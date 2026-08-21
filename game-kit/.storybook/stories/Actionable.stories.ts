import type { Meta, StoryObj } from "@storybook/html";
import {
  actionsOf,
  activate,
  add,
  Bounded,
  button,
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
  tiltAngle,
  Tiltable,
  Transformable,
  Valued,
  type Atom,
  type Node,
  type TransformableFields,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// ACTIONABLE is the atom a CONTROL carries: it names the intent a press emits, and the name is a
// registry ref rather than a callback — a node travels into snapshots, over wires and into other
// seats' projections, and a function survives none of those trips.
//
// THIS IS A CONTEXT MENU, whole. HOLD THE CARD to open it. Three separate laws meet here and none
// of them knows about the others:
//
//   · the menu's CONTENT is derived — `actionsOf(card)` reads what the card can do, so it can never
//     offer a flip it cannot perform. Turn a capability off and its item leaves by itself;
//   · each item carries `Actionable`, and a press emits the ref it names, nothing more;
//   · the long press is a gesture the kit reports and does not interpret. What it MEANS — a menu
//     here, picking up a stack elsewhere — is the consumer's word.
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
const faceOf = (card: Node): Atom => Surfaced({ surface: facing(card) === "up" ? FACE : BACK });

export const Menu: StoryObj<MenuArgs> = {
  // HOLD THE CARD, then press an item and the card answers. Notice which verbs the KIT performs:
  // `flip` and `roll` ship a `perform` in their registry record, `tap` does not — it is a pure
  // query a game wires itself. The control cannot tell the difference and must not: it emits a
  // name and stops there.
  render: ({ canFlip, canTap, canRoll, cardW, cardH, gap }) => {
    registerSurface(FACE, { layers: [{ paint: "panelBg" }], radius: 0.08, stroke: { color: "accent", width: 0.03, alignment: 1 } });
    registerSurface(BACK, { layers: [{ paint: "accent" }], radius: 0.08 });
    registerLayout("story.act.free", freeLayout);
    // A column, because a phone is tall and a context menu on one is a stack, never a bar.
    registerLayout("story.act.menu", rowLayout({ direction: "column", gap: 0.08, padding: 0 }));

    // THE PAGE's runtime state, not the tree's: whether a finger asked for the menu, and what the
    // last gesture did. An open menu is not a property of the card — two viewers of one desk do not
    // share an open menu, which is exactly why it cannot live on the node.
    let open = false;
    let said = "hold the card";

    // Made ONCE and carried across rebuilds: the verbs write to this node, and a card rebuilt from
    // the knobs on every press would forget every flip the moment the menu closed.
    const card = node(
      "card",
      Bounded({ bounds: rect(cardW, cardH) }),
      Surfaced({ surface: FACE }),
      Transformable({ at: { x: 0, y: -gap } }),
      ...(canFlip ? [Flippable()] : []),
      ...(canTap ? [Tiltable({ stops: [0, 90], wrap: true })] : []),
      ...(canRoll ? [Valued({ values: { face: 1 } }), Rollable({ sides: 6 })] : []),
    );

    const build = (): Node => {
      const desk = node("desk", Container({ layout: "story.act.free" }));
      card.parent = null;
      add(desk, card);

      // THE MENU IS DERIVED, not written, and it is here only while a finger asked for it.
      // `orientation: "viewer"` terminates the chain of angles, so the words stay upright even when
      // the seat this menu belongs to is turned — which is why a context menu needs no camera of
      // its own (`docs/design/hud.md`).
      if (open) {
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
      }

      add(
        desk,
        node(
          "said",
          Bounded({ bounds: rect(3.6, 0.34) }),
          Transformable({ at: { x: 0, y: gap + 1.15 } }),
          Labeled({ label: said, style: CONTROL_LABEL }),
        ),
      );
      return desk;
    };

    const live = scene(build(), {
      // The shiver rides the ONE clock, so this page is driven by the motion runtime and not the
      // still painter. Everything else on it stays exactly as it was.
      motion: {},
      // A HOLD OPENS THE MENU, and what a hold may land on is this page's word, not the kit's:
      // anything with something to offer. A card with every capability off offers nothing, and
      // holding it opens nothing — no branch says so, the derivation does.
      hold: {
        want: (n) => actionsOf(n).length > 0,
        onHold: (on) => {
          // THE ANSWER TO A GESTURE THAT JUST CHANGED MEANING. The finger has been down half a
          // second and nothing on the glass has said so — and a player who gets no answer lifts
          // their finger to check, cancelling the very gesture they were making. The tremble is
          // that answer, and it moves the card nowhere: the swing is zero at both ends of its span.
          live.motions?.shiver(on.id);
          open = true;
          said = `held ${on.id} → menu`;
          live.setRoot(build());
        },
      },
      press: (_meaning, control) => {
        // The whole of a press handler: ask what the control emits, and stop if it emits nothing.
        // No `disabled` was consulted, because there is none to consult.
        const intent = activate(control);
        if (!intent) return;

        // What the KIT performs, it performs — `flip` and `roll` come back as a new node, so their
        // atoms are written onto the live one. What it does not perform, the game wires: `tap` is a
        // pure query, and walking the tilt stops is this page's own answer to it.
        for (const [name, atom] of perform(intent, card).atoms) card.atoms.set(name, atom);
        if (intent === "tap") {
          // The tilt STOP is state on the node; the ANGLE is a pose, and moving one to the other is
          // the game's step, not the atom's.
          setTilt(card, nextTilt(card));
          const at = fieldsOf<TransformableFields>(card, "Transformable")?.at ?? { x: 0, y: 0 };
          card.atoms.set("Transformable", Transformable({ at, angle: tiltAngle(card) ?? 0 }));
        }
        card.atoms.set("Surfaced", faceOf(card));

        // A CONTEXT MENU CLOSES WHEN IT HAS ANSWERED. Leaving it up would make it a bar, and a bar
        // is a different thing standing in a different place.
        open = false;
        said = `activate() → ${intent}`;
        live.setRoot(build());
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
