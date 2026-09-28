// РЕЛЕ НА CLOUDFLARE WORKER — постоянный адрес стола без своего домена (`*.workers.dev`). Делает то же, что реле
// на fly (`routes.ts`, `relayRoutes`), и ещё одно: пропускает через себя ВСЁ остальное — скрипт, картинки,
// вход в комнату и живую связь — туда, где стол сейчас. Бот, мини-апп и приложение знают только этот адрес.
//
//   POST /relay/table   маяк стола (общий секрет): где он сейчас и какой это запуск
//   GET  /relay/table   жив ли стол — спрашивает бот; адрес в ответе — постоянный, свой
//   /t/…                страница стола под постоянным адресом (как у fly)
//   всё остальное       к столу как есть; неизменное по отпечатку (`app.js?v=…`) — из кэша Cloudflare
//
// Сама обёртка Worker'а — `deploy/relay-worker/index.ts`; здесь только логика, чтобы её проверял vitest.

import { BEACON_TTL_MS, SECRET_HEADER } from "./contract.js";
import { DOWN_PAGE, hostPage } from "./hostPage.js";

export interface RelayKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
export interface RelayEnv {
  RELAY: RelayKv;
  TABLE_SECRET: string;
}
export interface RelayDeps {
  fetch: typeof fetch;
  cache?: { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };
  later?: (job: Promise<unknown>) => void;
  now?: () => number;
}

interface Beat {
  url: string;
  boot: string;
  at: number;
}

const KEY = "table";
/**
 * БЕСПЛАТНЫЙ KV — ТЫСЯЧА ЗАПИСЕЙ В СУТКИ, а маяк бьёт каждые 20 с. Поэтому запись — только когда стол переехал
 * (новый адрес или запуск), и раз в `REWRITE_MS` просто «я жив». Жив ли стол сейчас, реле спрашивает у него самого.
 */
export const REWRITE_MS = 10 * 60_000;
/** Столько Worker помнит маяк у себя, прежде чем перечитать KV. */
const REMEMBER_MS = 15_000;
const HEALTH_WAIT_MS = 4_000;

let remembered: { beat: Beat | null; until: number } | null = null;
export const forgetRemembered = (): void => void (remembered = null);

async function beatOf(env: RelayEnv, now: number): Promise<Beat | null> {
  if (remembered && remembered.until > now) return remembered.beat;
  const raw = await env.RELAY.get(KEY);
  let beat: Beat | null = null;
  try {
    beat = raw ? (JSON.parse(raw) as Beat) : null;
  } catch {
    beat = null;
  }
  remembered = { beat, until: now + REMEMBER_MS };
  return beat;
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

const same = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export async function relayWorker(req: Request, env: RelayEnv, deps: RelayDeps): Promise<Response> {
  const now = (deps.now ?? Date.now)();
  const at = new URL(req.url);
  const origin = at.origin;

  if (at.pathname === "/relay/table" && req.method === "POST") {
    if (!env.TABLE_SECRET || !same(req.headers.get(SECRET_HEADER) ?? "", env.TABLE_SECRET)) return json({ error: "forbidden" }, 403);
    const { url, boot } = ((await req.json().catch(() => null)) ?? {}) as Partial<Beat>;
    if (typeof url !== "string" || !/^https?:\/\//.test(url) || typeof boot !== "string") return json({ error: "bad_request" }, 400);
    const was = await beatOf(env, now);
    const beat: Beat = { url: url.replace(/\/+$/, ""), boot, at: now };
    if (!was || was.url !== beat.url || was.boot !== beat.boot || now - was.at >= REWRITE_MS) {
      await env.RELAY.put(KEY, JSON.stringify(beat));
      remembered = { beat, until: now + REMEMBER_MS };
    }
    return json({ ok: true });
  }

  const beat = await beatOf(env, now);

  if (at.pathname === "/relay/table") {
    // ЖИВ — ЕСЛИ ОТВЕЧАЕТ СЕЙЧАС, а не если маяк был недавно: маяк в KV пишется редко.
    const up = beat !== null && now - beat.at < REWRITE_MS + BEACON_TTL_MS && (await alive(beat.url, deps.fetch));
    return json({ up, url: up ? origin : null, boot: beat?.boot ?? null, seenAt: beat?.at ?? null });
  }

  if (/^\/t(\/.*)?$/.test(at.pathname)) {
    const down = () => new Response(DOWN_PAGE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
    if (!beat) return down();
    const page = /^\/t\/replay\/?$/.test(at.pathname) ? "replay" : /^\/t\/admin\/?$/.test(at.pathname) ? "admin" : "";
    try {
      const got = await deps.fetch(`${beat.url}/table/${page}`, { signal: AbortSignal.timeout(8_000) });
      if (!got.ok) return down();
      return new Response(hostPage(await got.text(), origin), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, must-revalidate" } });
    } catch {
      return down();
    }
  }

  if (!beat) return json({ error: "table_down" }, 503);
  const target = new Request(`${beat.url}${at.pathname}${at.search}`, req);
  // НЕИЗМЕННОЕ — ИЗ КЭША CLOUDFLARE: скрипт по отпечатку, шрифты, картинки. Страницы и API стол помечает
  // «не хранить», и они всегда едут к столу.
  const cacheable = req.method === "GET" && deps.cache && req.headers.get("upgrade") === null;
  if (cacheable) {
    const hit = await deps.cache!.match(req);
    if (hit) return hit;
  }
  const res = await deps.fetch(target);
  if (cacheable && res.ok && /\bpublic\b/.test(res.headers.get("cache-control") ?? "") && !/no-store/.test(res.headers.get("cache-control") ?? "")) {
    const job = deps.cache!.put(req, res.clone());
    if (deps.later) deps.later(job);
    else await job;
  }
  return res;
}

async function alive(url: string, get: typeof fetch): Promise<boolean> {
  try {
    const res = await get(`${url}/health`, { signal: AbortSignal.timeout(HEALTH_WAIT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}
