#!/usr/bin/env node
// CROSSADE-TABLE — MCP-сервер: через него за стол садится ЧУЖОЙ агент (Antigravity, Claude Code,
// цикл на Ollama) и играет, как человек.
//
// Три тула, и больше ничего: `look` — что видно, `moves` — что можно, `play` — сходить. Агенту не
// нужно знать ни правил, ни протокола стола: список ходов ему даёт сервер, и он называет номер.
//
// ЧУЖИХ КАРТ ЕМУ НЕ ВИДНО — сервер их и не присылает (`bots/view.ts`). Проверять это здесь нечем и
// не нужно: здесь просто нет места, откуда они могли бы взяться.
//
// ГОВОРИТ ПО stdio (`MCP` поверх JSON-RPC): так его запускает и Antigravity, и Claude Code. Адрес
// стола и секрет — из окружения, как везде: `TABLE_URL`, `TABLE_SECRET`, `TABLE_ROOM`, `TABLE_ME`.

import { createInterface } from "node:readline";

const URL_BASE = process.env["TABLE_URL"] ?? "http://localhost:2611";
const SECRET = process.env["TABLE_SECRET"] ?? "";
const ROOM = process.env["TABLE_ROOM"] ?? "";
const ME = process.env["TABLE_ME"] ?? "agent:внешний";

interface Rpc {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "look",
    description: "Посмотреть на стол: чей ход, что в круге, что у меня в руке, что помнит стол. Чужих карт не видно.",
    inputSchema: { type: "object", properties: { room: { type: "string", description: "Комната; не сказана — из TABLE_ROOM" } } },
  },
  {
    name: "moves",
    description: "Какие ходы мне сейчас доступны. Каждый с номером — его и называют в play.",
    inputSchema: { type: "object", properties: { room: { type: "string" } } },
  },
  {
    name: "play",
    description: "Сходить. Ход называется НОМЕРОМ из moves.",
    inputSchema: { type: "object", properties: { room: { type: "string" }, n: { type: "integer", description: "Номер хода из moves" } }, required: ["n"] },
  },
];

async function askTable(path: string, init?: RequestInit): Promise<unknown> {
  const answer = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: { "x-table-secret": SECRET, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!answer.ok) throw new Error(`стол ответил ${answer.status}`);
  return answer.json();
}

const roomOf = (args: Record<string, unknown> | undefined): string => {
  const room = typeof args?.["room"] === "string" ? (args["room"] as string) : ROOM;
  if (!room) throw new Error("не сказано, за каким столом играть: TABLE_ROOM или room");
  return room;
};

/** Что тул отвечает агенту: MCP ждёт текст, и текст этот читает модель — значит он должен быть внятным. */
const says = (text: string) => ({ content: [{ type: "text", text }] });

async function callTool(name: string, args: Record<string, unknown> | undefined): Promise<{ content: { type: string; text: string }[] }> {
  const room = roomOf(args);
  if (name === "look" || name === "moves") {
    const seen = (await askTable(`/table/rooms/${room}/look?by=${encodeURIComponent(ME)}`)) as {
      turn: string | null;
      mine: boolean;
      view: { ring: { rank: string; suit: string }[]; hand: { face: { rank: string; suit: string } }[]; others: { name: string; cards: number }[] } | null;
      moves: { n: number; says: string }[];
    };
    if (name === "moves") {
      return says(seen.mine ? seen.moves.map((one) => `${one.n}. ${one.says}`).join("\n") : "Сейчас не твой ход.");
    }
    if (!seen.mine || seen.view === null) return says(`Ход у ${seen.turn ?? "никого"} — жди.`);
    const карта = (f: { rank: string; suit: string }) => `${f.rank}${f.suit}`;
    return says([
      `Ход твой.`,
      `Круг снизу вверх: ${seen.view.ring.map(карта).join(", ") || "пусто"}`,
      `Твоя рука: ${seen.view.hand.map((one) => карта(one.face)).join(", ") || "пусто"}`,
      `Соседи: ${seen.view.others.map((one) => `${one.name} (${one.cards})`).join(", ") || "никого"}`,
      "",
      "Ходы:",
      ...seen.moves.map((one) => `${one.n}. ${one.says}`),
    ].join("\n"));
  }
  if (name === "play") {
    const done = (await askTable(`/table/rooms/${room}/play`, { method: "POST", body: JSON.stringify({ by: ME, n: args?.["n"] }) })) as
      | { ok: true; did: string }
      | { ok: false; says: string };
    return says(done.ok ? `Сходил: ${done.did}` : done.says);
  }
  throw new Error(`нет такого тула: ${name}`);
}

const send = (body: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...body })}\n`);

createInterface({ input: process.stdin }).on("line", (line) => {
  let call: Rpc;
  try {
    call = JSON.parse(line) as Rpc;
  } catch {
    return;
  }
  const id = call.id;
  const answer = (result: unknown) => (id === undefined ? undefined : send({ id, result }));
  const sorry = (message: string) => (id === undefined ? undefined : send({ id, error: { code: -32000, message } }));

  if (call.method === "initialize") {
    return void answer({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "crossade-table", version: "0.1.0" } });
  }
  if (call.method === "tools/list") return void answer({ tools: TOOLS });
  if (call.method === "tools/call") {
    const params = call.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    if (typeof params?.name !== "string") return void sorry("не сказано, какой тул звать");
    void callTool(params.name, params.arguments)
      .then(answer)
      .catch((err: unknown) => sorry(String(err instanceof Error ? err.message : err)));
    return;
  }
  // Уведомления (`notifications/*`) ответа не ждут — и не получают.
  if (id !== undefined) sorry(`не знаю метода ${call.method}`);
});
