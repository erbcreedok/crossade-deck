// ЗАПАСНОЙ УЗЕЛ СООБЩАЕТ РЕЕСТРУ, ЧТО ОН ЕСТЬ — иначе на странице «Узлы» запасных не видно, пока они не включились.
// Реестр живёт на столе, который сейчас отвечает на постоянном адресе (`server/src/table/nodes.ts`); сообщение идёт через реле.

/** Описание запасного узла в виде, который принимает `POST /table/nodes`. */
export function standbyReport({ id, host, region = "home", startedAt, note, commit = "" }) {
  return { id, role: "standby", region, host, version: "", build: "", startedAt, url: null, rooms: null, people: null, polling: null, note, commit };
}

/** Короткое пояснение человеку: что запасной делает и насколько свежа его копия базы. */
export function standbyNote({ tableOn, botOn, replicaAgeSec }) {
  const side = (on, name) => (on ? `${name} ВКЛЮЧЁН (подхватил)` : `${name} в запасе`);
  const replica = replicaAgeSec == null ? "снимка базы нет" : `снимок базы ${replicaAgeSec < 90 ? `${Math.round(replicaAgeSec)} с` : `${Math.round(replicaAgeSec / 60)} мин`} назад`;
  return `${side(tableOn, "стол")}, ${side(botOn, "бот")}; ${replica}`;
}

export async function sendReport(relay, secret, report, send = fetch) {
  try {
    await send(`${relay}/table/nodes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-table-secret": secret },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* реле недоступно — следующая попытка через полминуты */
  }
}
