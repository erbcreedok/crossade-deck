// АЛИАС ПЕРЕХОДА: рантайм слит в ядро (sceneEngine.attach/api) — сцены, писавшие
// `new SceneRuntime(...)`, работают без правок. Новому коду — SceneEngine + sceneContract.
export { SceneEngine as SceneRuntime } from "./sceneEngine";
export type { Pt, SceneApi, SceneDelegate } from "./sceneContract";
