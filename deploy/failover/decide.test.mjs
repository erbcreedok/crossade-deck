import test from "node:test";
import assert from "node:assert/strict";
import { decide, fresh, readRegistry, isRunning, FAIL_AFTER, RECOVER_AFTER } from "./decide.mjs";

const alive = { voyagerTable: true, relayUp: true, liveBot: { other: true } };
const dead = { voyagerTable: false, relayUp: false, liveBot: { other: false } };

const run = (state, probes) => probes.reduce((acc, p) => {
  const out = decide(acc.state, p);
  return { state: out.state, log: [...acc.log, out.actions] };
}, { state, log: [] });

test("пока Voyager жив, мак молчит и счётчики чистые", () => {
  const { state, log } = run(fresh(), Array(10).fill(alive));
  assert.deepEqual(state, fresh());
  assert.ok(log.every((a) => a.table === null && a.bot === null));
});

test("мак поднимается только после FAIL_AFTER проб подряд, и стол, и бот", () => {
  const { log } = run(fresh(), Array(FAIL_AFTER).fill(dead));
  assert.deepEqual(log.slice(0, -1).map((a) => a.table), Array(FAIL_AFTER - 1).fill(null));
  assert.deepEqual(log.at(-1), { table: "start", bot: "start" });
});

test("одна живая проба посреди падения сбрасывает счёт", () => {
  const { log } = run(fresh(), [dead, dead, dead, alive, dead, dead, dead]);
  assert.ok(log.every((a) => a.table === null), "после сброса трёх проб мало");
});

test("обрыв связи только мака с Voyager не поднимает второй стол, если люди стол видят", () => {
  const cut = { voyagerTable: false, relayUp: true, liveBot: { other: true } };
  const { log } = run(fresh(), Array(FAIL_AFTER * 2).fill(cut));
  assert.ok(log.every((a) => a.table === null));
});

test("реле и реестр не ответили — доказательства нет, ничего не меняется", () => {
  const blind = { voyagerTable: false, relayUp: null, liveBot: null };
  const started = run(fresh(), Array(FAIL_AFTER).fill(dead)).state;
  const { state, log } = run(started, Array(8).fill({ voyagerTable: false, relayUp: null, liveBot: null }));
  assert.deepEqual(state, started);
  assert.ok(log.every((a) => a.bot === null));
  // и из выключенного состояния слепые пробы мак не поднимают тоже: стол (voyagerTable=false, relayUp=null) — это «упал», бот — нет
  const { log: cold } = run(fresh(), Array(FAIL_AFTER).fill(blind));
  assert.equal(cold.at(-1).bot, null);
});

test("мак гасится только когда Voyager вернулся RECOVER_AFTER проб подряд", () => {
  const started = run(fresh(), Array(FAIL_AFTER).fill(dead)).state;
  const { log } = run(started, Array(RECOVER_AFTER).fill(alive));
  assert.deepEqual(log.slice(0, -1).map((a) => a.table), Array(RECOVER_AFTER - 1).fill(null));
  assert.deepEqual(log.at(-1), { table: "stop", bot: "stop" });
});

test("бот переключается отдельно от стола", () => {
  const botOnly = { voyagerTable: true, relayUp: true, liveBot: { other: false } };
  const { log } = run(fresh(), Array(FAIL_AFTER).fill(botOnly));
  assert.deepEqual(log.at(-1), { table: null, bot: "start" });
});

test("последняя ступень ждёт дольше: свои пороги", () => {
  const slow = { failAfter: 16, recoverAfter: 2 };
  const out = (n) => run(fresh(), Array(n).fill(dead).map((p) => p)).log;
  let st = fresh();
  const acts = [];
  for (let i = 0; i < 16; i++) { const r = decide(st, dead, slow); st = r.state; acts.push(r.actions.table); }
  assert.deepEqual(acts.slice(0, 15), Array(15).fill(null));
  assert.equal(acts[15], "start");
  assert.equal(out(FAIL_AFTER).at(-1).table, "start", "с порогами по умолчанию тот же ряд проб уже включил бы");
  const back = decide(decide(st, alive, slow).state, alive, slow);
  assert.equal(back.actions.table, "stop");
});

test("реестр: чужой стол жив по свежему сообщению, даже если флаг serving стоит не у него", () => {
  const nodes = [
    { id: "fly", role: "table", up: true, serving: true },
    { id: "voyager", role: "table", up: true, serving: false },
    { id: "voyager", role: "bot", up: true, polling: true },
  ];
  assert.deepEqual(readRegistry(nodes, "fly"), { otherTable: true, liveBot: { other: true } });
});

test("реестр: свои записи и погасшие чужие не считаются; не ответил — доказательства нет", () => {
  const nodes = [
    { id: "fly", role: "table", up: true },
    { id: "fly", role: "bot", up: true, polling: true },
    { id: "voyager", role: "table", up: false },
    { id: "voyager", role: "bot", up: true, polling: false },
  ];
  assert.deepEqual(readRegistry(nodes, "fly"), { otherTable: false, liveBot: { other: false } });
  assert.deepEqual(readRegistry(null, "fly"), { otherTable: false, liveBot: null });
});

test("зарегистрированное, но не запущенное задание — не «включено»: после перезагрузки мак не объявляет, что Voyager «вернулся»", () => {
  const idle = "gui/501/com.crossade.failover-table = {\n\tactive count = 0\n\tpath = /x.plist\n\tstate = not running\n\trunatload = 0\n}";
  const live = "gui/501/com.crossade.failover-table = {\n\tactive count = 1\n\tstate = running\n\tpid = 4242\n}";
  assert.equal(isRunning(idle), false);
  assert.equal(isRunning(live), true);
  assert.equal(isRunning("state = waiting\n"), false);
});
