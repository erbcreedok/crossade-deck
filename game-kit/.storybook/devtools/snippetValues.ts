// WHAT A CATALOG HELPER STANDS FOR — told to the Code panel, in BOTH documents.
//
// A story's render is driven by the panel, so it cannot write a shape out: it calls `shapeOf`
// to turn a row of flat controls into one value. Honest code, useless snippet — the reader has
// no `shapeOf`, and what they came to a shelf of shapes for is what a `bounds` value LOOKS
// like. So the call is printed as its result.
//
// Imported for its side effect by `preview.ts` AND by `manager.tsx`, and that is the whole
// reason this file exists rather than a line inside the controls. The catalog is two documents
// with two module graphs: the panel is drawn by the manager, and a registration performed only
// in the preview reaches nothing. It failed exactly that way once — the snippet went on
// printing `shapeOf(a)` while every test on the preview side passed.

import { bothRecordSource, cloneRecordSource, endRecordSource, recordSource, startRecordSource, type RecordArgs } from "../stories/record.js";
import { shapeSource, type ShapeArgs } from "../stories/shape.js";
import { raw, registerSnippetValue } from "./storySource.js";

// The CALL, not its result. Every name in it is exported by the kit, so the snippet is code a
// reader can paste: `star(5, 0.9, 0.42)` where a printed path would be twenty coordinates that
// say nothing about what the shape is.
registerSnippetValue("shapeOf", (args) => raw(shapeSource(args as unknown as ShapeArgs)));

// THE RECORD, for the same reason and against the same failure. `Surfaced/Plate` printed
// `registerSurface(PLATE, recordOf(a))` — three names a reader does not have, in the one place
// the page is asking to be copied from. A `SurfaceRecord` is a plain object, and a reader who
// has read a whole section about records has still never seen one.
registerSnippetValue("recordOf", (args) => raw(recordSource(args as unknown as RecordArgs)));

// ONE PER NODE, because a scene can hold more than one. `arrow()` is three nodes and three
// records, and the panel has to print all three as literals — `startRecordOf(a)` cannot be a call
// with a prefix argument, or substitution (which matches a call taking the args object and nothing
// else) would leave the name itself in the snippet.
registerSnippetValue("startRecordOf", (args) => raw(startRecordSource(args)));
registerSnippetValue("endRecordOf", (args) => raw(endRecordSource(args)));

// The base record and its overridden clone, from `Restyle`. The clone prints as the MERGED
// literal — the record a reader would register to get the right-hand card — not as a base and
// a patch, which is machinery of this panel and not of the kit.
registerSnippetValue("bothRecordOf", (args) => raw(bothRecordSource(args)));
registerSnippetValue("cloneRecordOf", (args) => raw(cloneRecordSource(args)));

// `paintOf` is NOT registered, and cannot be: substitution matches a call with one identifier
// argument, because a helper is handed the args object and there is exactly one of those.
// `paintOf(a.under, a.underCustom)` is two, and a story holds several of them with different
// arguments — one registered value could not stand for all of them. It stays a visible call.
