import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BotEnv } from "./env.js";

/** `scripts/hub-tunnel.sh` lives at the repo root, two directories up from this file. */
const HUB_TUNNEL_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "hub-tunnel.sh");

export type RunTunnelScript = () => Promise<string>;

/** The real runner — a test passes a fake instead of shelling out. */
export const runHubTunnelScript: RunTunnelScript = () =>
  new Promise((resolve, reject) => {
    // A COLD START (hub not up, or the tunnel needs a fresh address) can take a while — the script
    // itself waits out `npm run dev` coming up and cloudflared minting an address.
    execFile(HUB_TUNNEL_SCRIPT, [], { timeout: 90_000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });

/**
 * WHERE THE HUB IS RIGHT NOW — `HUB_URL` unless `HUB_TUNNEL=1`, in which case the script that
 * actually knows (`scripts/hub-tunnel.sh`) is asked fresh, because a quick tunnel's address is
 * minted anew on every start and a value pinned in `.env` would go stale the moment it restarts.
 *
 * A failing script (hub down and won't come up, cloudflared missing) falls back to `HUB_URL` rather
 * than failing the command outright — a stale or local link beats no link at all.
 */
export async function resolveHubUrl(env: BotEnv, run: RunTunnelScript = runHubTunnelScript): Promise<string> {
  if (!env.hubTunnel) return env.hubUrl;
  try {
    const url = (await run()).trim();
    if (url) return url;
  } catch (err) {
    console.error("scripts/hub-tunnel.sh failed, falling back to HUB_URL:", err);
  }
  return env.hubUrl;
}
