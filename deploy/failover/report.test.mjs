import test from "node:test";
import assert from "node:assert/strict";
import { sendReport, standbyNote, standbyReport } from "./report.mjs";

test("описание запасного узла — роль standby и пояснение", () => {
  const r = standbyReport({ id: "mac", host: "m", startedAt: 5, note: "ок", commit: "abc123" });
  assert.deepEqual([r.role, r.id, r.note, r.commit, r.url], ["standby", "mac", "ок", "abc123", null]);
});

test("пояснение: что включено и насколько свеж снимок", () => {
  assert.equal(standbyNote({ tableOn: false, botOn: false, replicaAgeSec: 40 }), "стол в запасе, бот в запасе; снимок базы 40 с назад");
  assert.equal(standbyNote({ tableOn: true, botOn: false, replicaAgeSec: 600 }), "стол ВКЛЮЧЁН (подхватил), бот в запасе; снимок базы 10 мин назад");
  assert.match(standbyNote({ tableOn: false, botOn: false, replicaAgeSec: null }), /снимка базы нет/);
});

test("сообщение уходит на /table/nodes с секретом, а недоступное реле не роняет узел", async () => {
  let seen;
  await sendReport("https://relay", "s3cret", { id: "x" }, async (url, init) => { seen = { url, secret: init.headers["x-table-secret"], body: JSON.parse(init.body) }; return new Response("{}"); });
  assert.deepEqual(seen, { url: "https://relay/table/nodes", secret: "s3cret", body: { id: "x" } });
  await assert.doesNotReject(sendReport("https://relay", "s", {}, async () => { throw new Error("offline"); }));
});
