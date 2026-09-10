import { defineConfig } from "vite";

// The `development` condition is what resolves `game-kit` and the games to their SOURCE instead of
// a built `dist` — no build step for anything in the repo while developing. Vite adds it itself in
// serve mode; it is spelled out so a production `vite build` resolves the same way.
//
// The list REPLACES Vite's defaults, so it has to be complete: dropping `browser` or `module` here
// would silently pick the wrong entry of some third dependency.

/** Where a tunnel hands the hub out from — by suffix, so a fresh address needs nothing edited. */
const TUNNEL_HOSTS = [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app", ".ts.net"];

export default defineConfig({
  resolve: {
    conditions: ["development", "module", "browser", "import", "default"],
  },
  server: {
    // ON EVERY INTERFACE, because the game is checked from a phone on the same WiFi. The flag is
    // repeated in the `dev` script on purpose: a config-triggered restart has come back without it,
    // and the loss says nothing — the port is right, the page is up, and only the phone hangs.
    host: true,
    port: 9569,
    // NEVER QUIETLY SOMEWHERE ELSE. Vite's default is to walk to the next free port when this one is
    // taken, so a stray older server keeps the address and the new one answers on a port nobody was
    // told about.
    strictPort: true,
    // ...AND ANY HOST THAT REACHES THIS SERVER THROUGH A TUNNEL. Vite answers "403 Invalid host" to
    // a `Host` header it does not know, which is every trycloudflare / ngrok address — a table
    // opened from a phone off this WiFi is exactly that (`scripts/hub-tunnel.sh`). Named by suffix,
    // so a fresh tunnel address (they change on every start) needs nothing edited here.
    allowedHosts: TUNNEL_HOSTS,
  },
});
