// THE STRIP ALONG THE TOP OF A GAME — markup over the glass, the same in every game on this shelf
// and in a game opened at its own URL.
//
// Nothing here knows what game it is standing over: the name arrives as a string, the people as a
// roster, the way out as a function a shelf hands in and standalone does not.

export { topHud, type TopHud, type TopHudExit, type TopHudOptions, type TopHudState } from "./topHud.js";
export { TOP_HUD_LOOK, topHudLook, type TopHudLook } from "./look.js";
export { peopleRow, type PeopleRow, type RowBall, type TopHudPerson } from "./row.js";
export { fitTitle, nameCap, type Fit, type FitAsk } from "./fit.js";
