// ОБЁРТКА WORKER'А — постоянный адрес стола на `*.workers.dev`. Вся логика — `server/src/table/relayWorker.ts`.
//   npx wrangler deploy --config deploy/relay-worker/wrangler.toml
import { relayWorker, type RelayEnv } from "../../server/src/table/relayWorker.js";

export default {
  fetch(req: Request, env: RelayEnv, ctx: { waitUntil(job: Promise<unknown>): void }): Promise<Response> {
    return relayWorker(req, env, { fetch: (input, init) => fetch(input, init), cache: (caches as unknown as { default: Cache }).default, later: (job) => ctx.waitUntil(job) });
  },
};
