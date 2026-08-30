// THE JOURNAL — a dashcam for the desk.
//
// A motion bug is a fact about ONE FRAME, and by the time anybody can describe it in words that
// frame is gone. Every bug this kit has had in its gestures was of that kind: a card the wrong size
// on the frame it left the pack, a position that jumped between two frames, a flight that never
// ended. None of them is visible in a screenshot and none of them survives being retold — "it flew
// out of the wrong place" is a sentence about a hundred frames, and the wrong one is in there
// somewhere.
//
// So the desk keeps a rolling record of what it actually did, and the person at the glass stamps
// the moment they saw the thing go wrong. That stamp is the whole point: it turns "somewhere in the
// last minute" into an index. The trace around it says where every moving piece was drawn, what the
// fingers reported, and what the game decided — which is the three things anybody needs and none of
// which a person should have to type out.
//
// A RING, like a dashcam and for the dashcam's reason: nobody knows a recording was worth keeping
// until after the thing happens. It holds the last `seconds` and throws the rest away, so it can be
// left running for as long as somebody is playing without growing without end.
//
// OFF BY DEFAULT, and silent when off — `note` is the only thing the hot paths call, and it returns
// on its first line. The kit does not journal itself in anybody's game unless they asked.
//
// NOT A CLOCK (`guard.one-clock`): it reads the time, it never schedules anything.

/**
 * One thing that happened. `at` is milliseconds since the recording began, `event` says what sort of
 * thing it is, and everything else belongs to that sort.
 *
 * Open rather than a closed union on purpose: the kit writes the kinds it owns (`frame`, `pan`,
 * `mark`), and a game writes its own — the deal's own decisions are exactly what a reader needs
 * next to the frames, and the kit has no business knowing what a deal is.
 */
export type JournalEntry = { readonly at: number; readonly event: string } & Readonly<Record<string, unknown>>;

export interface JournalOptions {
  /** How much of the past to keep, seconds. Older entries fall off the front. Default `JOURNAL_SECONDS`. */
  readonly seconds?: number | undefined;
  /** Where the time comes from. Default `performance.now()`; a test hands over its own. */
  readonly now?: (() => number) | undefined;
}

/**
 * HOW MUCH PAST TO KEEP, seconds.
 *
 * Long enough to hold the gesture somebody has just made and the second or two before it, which is
 * everything a "wait, THAT" needs. Longer costs nothing until it is exported, and the export is
 * where a minute of frames stops being readable.
 */
export const JOURNAL_SECONDS = 30;

interface Recording {
  readonly windowMs: number;
  readonly now: () => number;
  readonly began: number;
  readonly entries: JournalEntry[];
  marks: number;
}

let live: Recording | undefined;

/** Begin recording. Starting again while one is running replaces it — a fresh take, not two takes. */
export function startJournal(opts: JournalOptions = {}): void {
  const now = opts.now ?? (() => performance.now());
  live = {
    windowMs: (opts.seconds ?? JOURNAL_SECONDS) * 1000,
    now,
    began: now(),
    entries: [],
    marks: 0,
  };
}

export function stopJournal(): void {
  live = undefined;
}

/** Is anything being recorded? What the hot paths ask before building an entry worth writing. */
export function journalOn(): boolean {
  return live !== undefined;
}

/**
 * Write one entry. Silent when nothing is recording, which is the normal state of every game that
 * never asked for this.
 *
 * The data is taken as it is handed over — no copy, no walk. A caller that hands over an object it
 * then mutates has written down a lie, so callers build a fresh literal, which is what they were
 * doing anyway to round the numbers.
 */
export function note(event: string, data: Readonly<Record<string, unknown>> = {}): void {
  if (!live) return;
  const at = live.now() - live.began;
  // THE JOURNAL OWNS `at` AND `event`, so they go on LAST. A caller with a field of its own by
  // either name would otherwise write over the timestamp of its own entry — which is exactly what
  // happened the first time a gesture reported where the finger was under the name `at`: every one
  // of its entries lost the moment it happened, and the trace was unreadable in the one way that
  // matters. A trace that cannot say WHEN is not a trace.
  live.entries.push({ ...data, at, event });
  // Throw away what has aged out of the window. From the front, one at a time: the entries are in
  // time order because they were appended in it.
  while (live.entries.length > 1 && at - live.entries[0]!.at > live.windowMs) live.entries.shift();
}

/**
 * STAMP THIS MOMENT — "the thing I am telling you about is here".
 *
 * The one entry a person writes rather than the machinery, and the reason the whole file exists:
 * it turns "somewhere in the last minute" into an index. Returns the mark's number so the person
 * can say it out loud.
 */
export function mark(text = ""): number {
  if (!live) return 0;
  const n = ++live.marks;
  note("mark", { n, text });
  return n;
}

/**
 * HOW MUCH OF THE TIME AROUND A MARK IS WORTH KEEPING, seconds either side.
 *
 * The ring holds half a minute so that whatever just happened is IN it. Reading is the other
 * problem: half a minute of frames at sixty a second is the better part of a megabyte, and a file
 * nobody can read is the same as no file. Three seconds either side of a stamped moment is the
 * gesture that went wrong and the beat before it, which is the whole of what anybody looks at.
 */
export const AROUND_MARK = 3;

/**
 * The take, oldest first — what is handed over as a file.
 *
 * FRAMES ARE TRIMMED TO THE MARKS and everything else is kept whole, and the asymmetry is the
 * point. A frame is only worth reading near the moment somebody pointed at; a touch, a gesture's
 * report and a game's own decision are the STORY, they are few, and one of them missing is a hole
 * in the account. With nothing stamped at all the last stretch is kept, because a person who hit
 * save without hitting mark meant "just now".
 */
export function journalDump(opts: { readonly around?: number } = {}): {
  readonly seconds: number;
  readonly marks: number;
  readonly entries: readonly JournalEntry[];
} {
  if (!live) return { seconds: 0, marks: 0, entries: [] };
  const all = live.entries;
  const first = all[0]?.at ?? 0;
  const last = all[all.length - 1]?.at ?? 0;
  const around = (opts.around ?? AROUND_MARK) * 1000;
  const centres = all.filter((e) => e.event === "mark").map((e) => e.at);
  const near = centres.length > 0 ? centres : [last];
  const keep = (e: JournalEntry): boolean => e.event !== "frame" || near.some((c) => Math.abs(e.at - c) <= around);
  return { seconds: Math.round((last - first) / 10) / 100, marks: live.marks, entries: all.filter(keep) };
}

/** Rounded to three places — a trace is read by a person, and nobody needs a card's ninth decimal. */
export const trace = (n: number): number => Math.round(n * 1000) / 1000;
