// ВКЛАДКА «Узлы» — какие машины сейчас обслуживают Crossade: кто отвечает на постоянном адресе, кто держит бота,
// какие столы ждут в запасе. Читает `/table/admin/nodes` (`server/src/table/nodes.ts`) и обновляется сама, пока открыта.

import { HOST } from "./host.js";

interface NodeView {
  id: string;
  role: "table" | "bot" | "standby";
  region: string;
  host: string;
  version: string;
  build: string;
  startedAt: number;
  url: string | null;
  rooms: number | null;
  people: number | null;
  polling: boolean | null;
  note?: string | null;
  commit?: string;
  seenAt: number;
  up: boolean;
  serving: boolean;
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const ROLE_NAME: Record<NodeView["role"], string> = { table: "стол", bot: "бот", standby: "запасной" };

/** Что узел делает сейчас — одной строкой: «отвечает на постоянном адресе», «держит Telegram», «в запасе», «молчит». */
export function nodeDoing(n: Pick<NodeView, "role" | "up" | "serving" | "polling">): string {
  if (!n.up) return "молчит";
  if (n.role === "standby") return "следит";
  if (n.role === "bot") return n.polling ? "держит Telegram" : "запускается";
  return n.serving ? "отвечает на постоянном адресе" : "в запасе";
}

export function sinceText(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 90) return `${s} с назад`;
  if (s < 5400) return `${Math.round(s / 60)} мин назад`;
  if (s < 129600) return `${Math.round(s / 3600)} ч назад`;
  return `${Math.round(s / 86400)} сут назад`;
}

const upFor = (ms: number, now: number) => sinceText(ms, now).replace(" назад", "");

export function nodeCard(n: NodeView, now = Date.now()): string {
  const load = n.role === "table" && n.rooms !== null ? ` · комнат ${n.rooms}, людей ${n.people ?? 0}` : "";
  const run = n.startedAt ? ` · работает ${upFor(n.startedAt, now)}` : "";
  const url = n.url ? `<div class="люди">${esc(n.url)}</div>` : "";
  const note = n.note ? `<div class="люди">${esc(n.note)}</div>` : "";
  const commit = n.commit ? ` · ${esc(n.commit.slice(0, 8))}` : "";
  return `<div class="стол${n.up ? " жив" : ""}">
    <div class="шапка"><span class="имя">${esc(n.id)}</span><span class="метка${n.up ? " жив" : ""}">${ROLE_NAME[n.role]} · ${esc(nodeDoing(n))}</span></div>
    <div class="люди"><b>${esc(n.region || "—")}</b> · ${esc(n.host)} · v${esc(n.version)}+${esc(n.build)}${commit}${esc(load)}${esc(run)}</div>
    ${note}
    ${url}
    <div class="когда">${n.serving ? "отвечает сейчас" : `слышали ${esc(sinceText(n.seenAt, now))}`}</div>
  </div>`;
}

export function mountNodes(root: HTMLElement, auth: Record<string, string>): { refresh(): Promise<void> } {
  root.innerHTML = `<div class="wrap"><h1>Узлы</h1><p class="sub" id="узлы-итог">Спрашиваю стол…</p><div id="узлы-список"></div></div>`;
  const sum = root.querySelector<HTMLElement>("#узлы-итог")!;
  const list = root.querySelector<HTMLElement>("#узлы-список")!;
  const refresh = async () => {
    const res = await fetch(`${HOST}/table/admin/nodes`, { headers: auth, cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      sum.textContent = res?.status === 403 ? "Нет доступа: страница открыта не хозяину." : "Стол не отвечает.";
      sum.classList.add("плохо");
      return;
    }
    const { nodes } = (await res.json()) as { nodes: NodeView[] };
    const now = Date.now();
    const alive = nodes.filter((n) => n.up).length;
    sum.classList.remove("плохо");
    sum.textContent = `Живых узлов ${alive} из ${nodes.length}. Обновляется само.`;
    list.innerHTML = nodes.map((n) => nodeCard(n, now)).join("");
  };
  // Пока вкладка скрыта, стол не дёргаем.
  setInterval(() => void (!root.hidden && refresh()), 15_000);
  return { refresh };
}
