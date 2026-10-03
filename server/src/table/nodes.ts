// УЗЛЫ — какие машины сейчас обслуживают Crossade и что на каждой делает.
//
// Узел — это процесс на машине: сервер стола (мак, вояжер, будущий иностранный) или бот. Каждый
// сообщает о себе сам (`NodeReport`), реестр только помнит, когда слышал его в последний раз. Что узел
// «жив» — решает давность этого слова (`NODE_TTL_MS`), а не его собственное заявление: упавшему
// сообщать нечем.
//
// Реестр живёт в памяти того стола, который сейчас обслуживает постоянный адрес: узлы стучатся к нему
// через реле. Сменился стол — реестр наполняется заново за одну минуту, потому что каждый узел
// повторяет сообщение.


/** Как часто узел повторяет сообщение. */
export const NODE_EVERY_MS = 30_000;
/** Столько реестр верит узлу после последнего сообщения. */
export const NODE_TTL_MS = 90_000;

export type NodeRole = "table" | "bot" | "standby";

export interface NodeReport {
  /** Устойчивое имя узла: `NODE_ID` или имя машины. */
  id: string;
  role: NodeRole;
  /** Где стоит: `NODE_REGION` (`home`, `eu`…). */
  region: string;
  host: string;
  version: string;
  build: string;
  /** Когда процесс запущен, мс. */
  startedAt: number;
  /** Адрес, по которому узел виден снаружи, если он есть. */
  url: string | null;
  /** Стол: сколько комнат и людей сейчас. */
  rooms: number | null;
  people: number | null;
  /** Бот: держит ли он Telegram (long polling). */
  polling: boolean | null;
  /** Короткое пояснение узла человеку: что он делает сейчас («стол в запасе, снимок базы 40 с назад»). */
  note?: string | null;
  /** Коммит, из которого запущен узел. */
  commit?: string;
}

export interface NodeView extends NodeReport {
  seenAt: number;
  up: boolean;
  /** Этот узел отвечает на постоянном адресе прямо сейчас — реестр это знает про того, кто ему отвечает. */
  serving: boolean;
}

/** Один узел — это пара «роль + имя»: бот и стол на одной машине называются одинаково, но это два процесса. */
const keyOf = (n: Pick<NodeReport, "role" | "id">) => `${n.role}/${n.id}`;

const nodes = new Map<string, NodeReport & { seenAt: number }>();

const text = (value: unknown, max: number, fallback = ""): string =>
  typeof value === "string" ? value.trim().slice(0, max) : fallback;

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

/** Чужое сообщение — не доверяем форме: поля чистятся и обрезаются, лишнее отбрасывается. */
export function cleanReport(raw: unknown): NodeReport | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = text(r.id, 48);
  if (!id || !/^[\w.:-]+$/.test(id)) return null;
  if (r.role !== "table" && r.role !== "bot" && r.role !== "standby") return null;
  const url = text(r.url, 200);
  return {
    id,
    role: r.role,
    region: text(r.region, 24),
    host: text(r.host, 64),
    version: text(r.version, 24),
    build: text(r.build, 24),
    startedAt: count(r.startedAt) ?? 0,
    url: /^https?:\/\//.test(url) ? url : null,
    rooms: count(r.rooms),
    people: count(r.people),
    polling: typeof r.polling === "boolean" ? r.polling : null,
    note: text(r.note, 120) || null,
    commit: text(r.commit, 12),
  };
}

export function reportNode(report: NodeReport, now = Date.now()): void {
  nodes.set(keyOf(report), { ...report, seenAt: now });
}

export function forgetNodes(): void {
  nodes.clear();
}

/** Узлы, которых слышали, — живые сверху; `self` — сам отвечающий стол, он всегда жив и всегда «обслуживает». */
export function nodesList(self: NodeReport, now = Date.now()): NodeView[] {
  const others = [...nodes.values()]
    .filter((one) => keyOf(one) !== keyOf(self))
    .map((one): NodeView => ({ ...one, up: now - one.seenAt < NODE_TTL_MS, serving: false }));
  const me: NodeView = { ...self, seenAt: now, up: true, serving: true };
  return [me, ...others].sort((a, b) => Number(b.up) - Number(a.up) || a.role.localeCompare(b.role) || a.id.localeCompare(b.id));
}

/** Описание этого процесса: имя узла и регион из окружения (`NODE_ID`, `NODE_REGION`), иначе имя машины и «home». Имя машины даёт вызывающий: общий код не знает Node. */
export function describeSelf(
  role: NodeRole,
  facts: { version: string; build: string; startedAt: number; url: string | null; rooms: number | null; people: number | null; polling: boolean | null; note?: string | null; commit?: string },
  host: string,
  env: Record<string, string | undefined> = {},
): NodeReport {
  return {
    id: text(env.NODE_ID, 48) || host,
    role,
    region: text(env.NODE_REGION, 24) || "home",
    host,
    ...facts,
  };
}
