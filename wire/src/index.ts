// THE WIRE — the two things a Crossade Deck screen needs before it can play with anybody else:
// WHO the player is (an account, kept on this device and vouched for by the server) and WHICH ROOM
// their desk is talking through (`joinTable`).
//
// It is its own package and not part of the hub because the hub is only one of its callers. A game
// opened on its own URL needs the same account and the same room, and a game that had to reach into
// `apps/hub` for them would not be a standalone game at all.
//
// It speaks TREES (`game-kit`'s `Node`, `toSpec`/`fromSpec`) because that is what the room carries —
// and NOTHING about drawing one. No painter, no camera, no pixi: a desk decides what a tree looks
// like, the wire only gets it there and back. See `guards.test.ts`.

export { serverUrl } from "./server.js";
export {
  ensureAccount,
  forgetAccount,
  linkTelegram,
  myProfile,
  renameAccount,
  restoreAccount,
  storedAccount,
  telegramAccount,
  telegramInvite,
  telegramInviteState,
  updateProfile,
  type Account,
  type InviteRefusal,
  type InviteState,
  type LinkOutcome,
  type TelegramInvite,
  type Profile,
  type Provider,
} from "./account.js";
export { joinTable, type JoinTableOptions, type RelayMessage, type RosterItem, type Table } from "./table.js";
