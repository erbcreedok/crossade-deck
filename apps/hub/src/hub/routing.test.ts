// WHAT THE ADDRESS DOES TO THE SHELF — the five moves, as a table.
//
// Routing is where a launcher rots quietly: every rule holds on the machine it was written on, and
// breaks on a phone where the network is slow enough for the gaps between them to be real. The bugs
// this file is written against were all real:
//
// - pressing Back left the shelf showing, and a reload dropped the player back into the game they
//   had just left (the desk's own `setRoom` landed after the leave);
// - a link to another game did nothing at all while one was running;
// - a game's own `replaceState` naming its room read as "the route changed", and the table the
//   player was sitting at was torn down and rejoined.
//
// A SCAN AND NOT A MOUNT: standing the real shell up needs a canvas, a painter and a socket, and the
// rules under test are decisions taken between those. What is checked is the decision table itself —
// which is the thing that was wrong, every time.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SHELL = readFileSync(new URL("./shell.ts", import.meta.url), "utf8");

/**
 * The body of one of the shell's top-level functions, up to the closing brace at its own column.
 *
 * MATCHED ON THE SIGNATURE AND NOT THE NAME. `leave` is also a local inside `sweep` (the clock's own
 * unjoin), and a search for `const leave = ` found that one first — a guard that read the wrong
 * function and failed on it, which is the least useful kind of red there is.
 */
function block(signature: string): string {
  const at = SHELL.indexOf(`const ${signature}`);
  expect(at, `the shell still has \`${signature}\``).toBeGreaterThan(0);
  const rest = SHELL.slice(at);
  const end = rest.indexOf("\n  };");
  return rest.slice(0, end > 0 ? end : rest.length);
}

describe("hub.the-address-is-the-place", () => {
  it("the route already showing is not news — a desk naming its own room is not a navigation", () => {
    // THE ONE THAT COSTS A TABLE. `hubHost.setRoom` writes `#cards?room=NNNN` the moment the server
    // names the room, while the card table is up and being played.
    const router = block("stopRouting = onRoute");
    expect(router, "the router compares against what is running").toContain("id !== runningId");
    expect(block("enter = async (id: string"), "…and so does the opening itself").toContain("runningId === id");
  });

  it("another game is a swap, and the shelf never shows between the two", () => {
    const entering = block("enter = async (id: string");
    expect(entering, "the old game is let go from inside the opening").toContain('leave(false, "play")');
    // AFTER the fetch, never before: taken down at the top, the player watches an empty stage for
    // the whole of the download.
    const letGo = entering.indexOf('leave(false, "play")');
    const fetched = entering.indexOf("await Promise.all");
    expect(letGo, "the old game goes down only once the new one has arrived").toBeGreaterThan(fetched);
    expect(entering, "and the address is not rewritten by the swap itself").toContain("if (write) goTo(id);");
  });

  it("a chunk that lands somewhere nobody is any more is dropped", () => {
    // EVERY GAP IS REAL ON A PHONE. Back, another tile and a pasted link all happen inside the wait
    // for a chunk; a mount that ignored them would paint a game over the place the player went to.
    const entering = block("enter = async (id: string");
    expect(entering, "an opening takes a number").toContain("const mine = ++opening;");
    expect(entering, "and a stale one never mounts").toContain("mine !== opening");
    expect(block("goToShelf = (write = true"), "leaving invalidates the opening in flight").toContain("opening += 1;");
  });

  it("leaving clears the address, and going nowhere writes nothing", () => {
    expect(block("leave = (write = true"), "the shelf is an address too").toContain("if (write) goTo(undefined);");
    const router = block("stopRouting = onRoute");
    // The router never writes: the address is already what it is, and writing it back would push a
    // second identical entry for every Back the player presses.
    expect(router.includes("goTo("), "the router reads the address, it does not write it").toBe(false);
    expect(router, "and it leaves through the same door a press does").toContain("goToShelf(false)");
  });

  it("what is running is remembered, and forgotten when it stops", () => {
    expect(block("enter = async (id: string"), "an opened game is named").toContain("runningId = id;");
    expect(block("leave = (write = true"), "and a closed one is not").toContain("runningId = undefined;");
  });
});
