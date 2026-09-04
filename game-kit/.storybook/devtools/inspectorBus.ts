// THE BUS between a live scene and whoever wants to show its tree.
//
// The inspector has two homes and neither is inside the scene: the catalog's bottom panel
// (next to Controls, where resize, dock and hide already exist and are the reader's habit)
// and, on a docs page where that panel does not exist at all, a block of its own under the
// canvas. Drawing the tree over the stage is what made a phone show a strip of desk and a
// column of text.
//
// Neither home may be reached from here. A scene knows what it holds and nothing about where
// it is displayed — so it PUBLISHES, and whoever draws subscribes. The same door serves a real
// app later: a dev overlay listens to exactly this, with no Storybook anywhere in the path.
//
// Reports are kept PER SCENE, not as "the last one": a docs page renders every story of the
// component, so several scenes are alive at once and each block must find its own.

import { type InspectNode } from "../../src/index.js";
import { GK_INSPECT, GK_INSPECT_UNWATCH, GK_INSPECT_WATCH, GK_INSPECT_WHO } from "../inspectChannel.js";

export interface InspectReport {
  /** Who published. The catalog names scenes after stories, so a block can find its own. */
  readonly sceneId: string;
  readonly nodes: readonly InspectNode[];
}

export interface InspectChannel {
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
}

type Listener = (report: InspectReport) => void;

const listeners = new Set<Listener>();
const reports = new Map<string, InspectReport>();

/** The catalog names the next scene; without a name, scenes are numbered. */
let nextSceneId: string | null = null;
/**
 * The story being rendered, and it is NOT consumed — several scenes may stand in one story (a board
 * watched from two seats), and each of them needs a name that is the same on the next render. An
 * auto-numbered one would not be: it would climb by one per screen per keystroke, and every climb
 * is another WebGL context the browser eventually takes back.
 */
let storyId: string | null = null;
let sceneCount = 0;

export function setNextSceneId(id: string): void {
  nextSceneId = id;
  storyId = id;
}

/**
 * The name this scene publishes under. A `key` is for the SECOND and further scenes of one story:
 * they share the story's name and differ by the key, so a re-render finds each of them standing.
 * Without a key the old rule holds — the story's name, once, then numbers.
 */
export function takeSceneId(key?: string): string {
  if (key !== undefined) return `${storyId ?? "scene"}#${key}`;
  const id = nextSceneId ?? `scene:${(sceneCount += 1)}`;
  nextSceneId = null;
  return id;
}

function sameReport(prev: InspectReport | undefined, next: InspectReport): boolean {
  if (!prev) return false;
  if (prev.nodes === next.nodes) return true;
  if (prev.nodes.length !== next.nodes.length) return false;
  return JSON.stringify(prev.nodes) === JSON.stringify(next.nodes);
}

export function publishInspect(report: InspectReport): void {
  const prev = reports.get(report.sceneId);
  if (sameReport(prev, report)) return;
  reports.set(report.sceneId, report);
  for (const l of listeners) l(report);
}

/** A subscriber gets every live scene at once: a panel may open long after they built. */
export function onInspect(listener: Listener): () => void {
  listeners.add(listener);
  for (const r of reports.values()) listener(r);
  return () => listeners.delete(listener);
}

/**
 * Bridges the bus across the iframe channel, emitting only when at least one watcher is listening.
 * A watcher announces interest with `GK_INSPECT_WATCH` and receives all live reports immediately.
 */
export function wireInspectBridge(channel: InspectChannel): () => void {
  let watchers = 0;
  const onWatch = (): void => {
    watchers += 1;
    for (const r of liveReports()) channel.emit(GK_INSPECT, r);
  };
  const onUnwatch = (): void => {
    watchers = Math.max(0, watchers - 1);
  };
  channel.on(GK_INSPECT_WATCH, onWatch);
  channel.on(GK_INSPECT_UNWATCH, onUnwatch);
  const stopBus = onInspect((report) => {
    if (watchers > 0) channel.emit(GK_INSPECT, report);
  });
  channel.emit(GK_INSPECT_WHO);
  return () => {
    channel.off(GK_INSPECT_WATCH, onWatch);
    channel.off(GK_INSPECT_UNWATCH, onUnwatch);
    stopBus();
  };
}

/** A disposed scene stops speaking for a tree that is no longer on screen. */
export function clearInspect(sceneId: string): void {
  reports.delete(sceneId);
}

export function liveReports(): readonly InspectReport[] {
  return [...reports.values()];
}
