// The one event that crosses the iframe. Named here so the two sides cannot drift: the
// preview publishes what `inspect(root)` returned, the manager panel draws it.
//
// The story's SOURCE does not travel this way, and that is worth stating: it was an event once,
// and on a phone the Code panel lives behind a drawer, so it mounted after the announcement and
// showed nothing. A late subscriber cannot hear a one-shot event — the panel reads the story's
// parameters instead. Anything a panel may open onto belongs in a place that can be READ.
export const GK_INSPECT = "gameKit/inspect";
