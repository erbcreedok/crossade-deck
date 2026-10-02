// БОТ СООБЩАЕТ СТОЛУ, ЧТО ОН ЖИВ — чтобы страница «Узлы» у хозяина показывала, какая машина сейчас держит Telegram.
//
// Стучится на постоянный адрес стола (реле) и повторяет сообщение: упавший бот молчит, и по давности
// молчания страница видит, что его нет (`server/src/table/nodes.ts`).

import { SECRET_HEADER } from "../../../server/src/table/contract.js";
import { describeSelf, NODE_EVERY_MS } from "../../../server/src/table/nodes.js";
import os from "node:os";
import type { TableEnv } from "./api.js";

const startedAt = Date.now();

/** Начать стучаться; возвращает «перестать». `polling` — держит ли бот Telegram прямо сейчас. */
export function startNodeBeat(env: TableEnv, polling: () => boolean, http: typeof fetch = fetch): () => void {
  const base = (env.relayUrl ?? env.serverUrl ?? "").replace(/\/+$/, "");
  if (!base) return () => {};
  const beat = async () => {
    const report = describeSelf("bot", { version: process.env.npm_package_version ?? "", build: "bot", startedAt, url: null, rooms: null, people: null, polling: polling() }, os.hostname(), process.env);
    await http(`${base}/table/nodes`, {
      method: "POST",
      headers: { "content-type": "application/json", [SECRET_HEADER]: env.secret },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(10_000),
    }).catch((err) => void console.warn("узел: стол не ответил:", String(err)));
  };
  void beat();
  const timer = setInterval(beat, NODE_EVERY_MS);
  return () => clearInterval(timer);
}
