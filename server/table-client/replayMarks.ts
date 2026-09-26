// МЕТКИ ЗАПИСИ — важные мгновения партии на шкале: раздача, закрытие круга, сбор круга крупье, конец.
//
// ТОЛЬКО ПОДТВЕРЖДЁННОЕ. Каждая метка стоит на том, что стол действительно записал:
//   раздача       — ход стола `dealt` (или `match.start`, если раздачи ходом нет);
//   закрытие      — судья сказал «очередь есть, порог ноль», а в круге лежат карты: круг полон и ждёт
//                   сбора (то же правило, что у судьи, `awaitsSweep`);
//   сбор круга    — карты круга ушли в руку стула крупье — кто бы их ни нёс, это видно по следу хода;
//   конец партии  — `match.end`, а в старых записях — судья сказал, что очереди больше нет.
// Закрытие и сбор — разные мгновения: круг закрыли, и только потом его собрали.
//
// Обрезанный ход (у старых записей) не применить — по нему меток нет, и они не придумываются.
//
// Один проход по записи со столом в руках: состояние на каждом шаге — то же, что показывает экран.

import type { Op, Snapshot } from "../src/table/contract.js";
import { applyPatch } from "../src/table/patch.js";
import type { Told } from "./replayStore.js";

export type MarkKind = "deal" | "close" | "sweep" | "end";

export interface Mark {
  /** Номер мгновения записи. */
  step: number;
  at: number;
  kind: MarkKind;
  says: string;
}

export const MARK_NAMES: Record<MarkKind, string> = { deal: "Раздача", close: "Круг закрыт", sweep: "Сбор круга", end: "Конец партии" };

/** Карты одного сбора приходят по одной — всё, что пришло подряд за это время, один сбор. */
const SWEEP_JOIN_MS = 4000;
const RING = "ring";

export function marksOf(deeds: readonly Told[], start: Snapshot): Mark[] {
  const marks: Mark[] = [];
  let state = start;
  let awaiting = false;
  let going = false;
  const nameOf = (key: string | null | undefined): string | null => (key ? (state.people.find((p) => p.key === key)?.name ?? null) : null);
  const ownerName = (chair: unknown): string | null => (typeof chair === "string" ? nameOf(state.chairs.find((c) => c.id === chair)?.owner) : null);
  const last = (kind: MarkKind) => [...marks].reverse().find((m) => m.kind === kind);

  deeds.forEach((d, step) => {
    if (d.side === "table" && d.kind === "patch") {
      const ops = (d.what as { ops?: unknown }).ops;
      if (!Array.isArray(ops) || ops.length === 0) return;
      const before = state;
      state = applyPatch(state, { v: (d.what as { v: number }).v, ops: ops as Op[] });
      for (const op of ops as Op[]) {
        if (op.t === "dealt") marks.push({ step, at: d.at, kind: "deal", says: `${op.byName ?? "Раздал"} раздал` });
        if (op.t === "move" && op.from.in === "deck" && op.from.pile === RING && op.to.in === "hand") {
          const to = op.to;
          const chair = before.chairs.find((c) => c.id === to.chair) ?? state.chairs.find((c) => c.id === to.chair);
          if (!chair?.croupier) continue;
          const prev = marks.at(-1);
          if (prev?.kind === "sweep" && d.at - prev.at <= SWEEP_JOIN_MS) continue;
          const by = op.trail?.by;
          const croupier = by !== undefined && by === chair.owner;
          marks.push({ step, at: d.at, kind: "sweep", says: croupier || !op.trail ? "Крупье собрал круг" : `${op.trail.byName} собрал круг крупье` });
        }
      }
      return;
    }
    if (d.kind === "match.start" && !marks.some((m) => m.kind === "deal" && Math.abs(m.at - d.at) < 5000)) marks.push({ step, at: d.at, kind: "deal", says: `${nameOf(d.who) ?? "Раздача"}${nameOf(d.who) ? " раздал" : ""}` });
    if (d.kind === "match.end") {
      const prev = last("end");
      if (!(prev && d.at - prev.at < 5000)) marks.push({ step, at: d.at, kind: "end", says: d.who ? `Партия окончена — проиграл ${nameOf(d.who) ?? d.who}` : "Партия окончена" });
      going = false;
    }
    if (d.kind === "match") {
      const now = (d.what ?? {}) as { идёт?: unknown; ход?: unknown; порог?: unknown; закрыл?: unknown };
      const turn = now.идёт === true && typeof now.ход === "string";
      const ring = state.piles.find((p) => p.id === RING)?.cards.length ?? 0;
      const waits = turn && now.порог === 0 && ring > 0;
      if (waits && !awaiting) {
        const who = ownerName(now.закрыл);
        marks.push({ step, at: d.at, kind: "close", says: who ? `Круг закрыл ${who}` : "Круг закрыт" });
      }
      awaiting = waits;
      if (going && now.идёт === true && now.ход === null) {
        const prev = last("end");
        if (!(prev && d.at - prev.at < 5000)) marks.push({ step, at: d.at, kind: "end", says: "Партия окончена" });
      }
      going = turn;
    }
  });
  return marks;
}

/** Метка до или после мгновения — «к прошлому важному», «к следующему важному». */
export function markNear(marks: readonly Mark[], step: number, dir: 1 | -1): Mark | null {
  if (dir > 0) return marks.find((m) => m.step > step) ?? null;
  return [...marks].reverse().find((m) => m.step < step) ?? null;
}

/**
 * ТЕСНЫЕ МЕТКИ — В ОДНУ ГРУППУ: ближе `gap` долей шкалы друг к другу их пальцем не различить. Группа
 * стоит на первой своей метке и раскрывается списком.
 */
export function clusters(marks: readonly Mark[], total: number, gap: number): Mark[][] {
  const out: Mark[][] = [];
  for (const m of marks) {
    const group = out.at(-1);
    if (group && total > 0 && (m.step - group[0]!.step) / total < gap) group.push(m);
    else out.push([m]);
  }
  return out;
}
