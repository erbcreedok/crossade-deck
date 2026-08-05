// СБОРКА SceneApi — модуль движка: публичные двери сцены (контракт — sceneContract.SceneApi).
// Дефолт-ветки (defaultX) зовут ПОВЕДЕНИЕ ЯДРА напрямую (sceneSeams.coreX): сцена из своего шва
// получает базовую ветку, даже если сам шов она переопределила.

import type { SceneApi } from "./sceneContract";
import type { SceneEngine } from "./sceneEngine";
import { contentToScreen, applyView, clampView, screenToContent, syncVp } from "./sceneView";
import { flipGroup, releaseElement } from "./sceneFrame";
import { coreBeginDrag, coreCanDrag, coreOnElementTapped, coreOnSceneTap, corePickElement } from "./sceneSeams";

export function buildSceneApi(e: SceneEngine): SceneApi {
  return {
    width: () => e.width,
    height: () => e.height,
    renderer: () => e.app?.renderer ?? null,
    app: () => e.app,
    appReady: () => e.app !== null,
    contentAdd: (c) => void e.content.addChild(c),
    surfaceAdd: (c) => void e.scene.surface.addChild(c),
    chromeAdd: (c) => void e.chrome.addChild(c),
    chromeAddAt: (c, i) => void e.chrome.addChildAt(c, i),
    setChromeButtons: (btns) => {
      e.chromeButtons = [...btns];
    },
    forgetHovered: (btns) => {
      if (e.hoveredBtn && btns.includes(e.hoveredBtn)) e.hoveredBtn = null;
    },
    byId: e.byId,
    drag: () => e.drag,
    setDrag: (d) => {
      e.drag = d;
    },
    dragScreen: () => e.dragScreen,
    grabMode: () => e.grabMode,
    dragCtx: () => e.dragCtx,
    viewport: () => e.viewport,
    setContentSize: (w, h) => {
      e.contentW = w;
      e.contentH = h;
    },
    contentSize: () => ({ w: e.contentW, h: e.contentH }),
    layers: () => e.scene,
    setButtons: (btns) => {
      e.buttons = [...btns];
    },
    buttonsRef: () => e.buttons,
    preset: () => e.preset,
    setPreset: (p) => {
      e.preset = p;
    },
    reduceMotion: () => e.reduceMotion,
    lowFx: () => e.lowFx,
    flashOff: () => e.flashOff,
    render: () => e.render(),
    wake: () => e.wake(),
    after: (sec, fn) => e.after(sec, fn),
    animDuration: (id, kind) => e.animDuration(id, kind),
    needsPeek: (el) => e.peeks.needs(el),
    flipGroup: (els) => flipGroup(e, els),
    placeCard: (el) => e.placeCard(el),
    releaseElement: (el) => releaseElement(e, el),
    hitElement: (cx, cy) => e.hitElement(cx, cy),
    screenToContent: (sx, sy) => screenToContent(e, sx, sy),
    contentToScreen: (cx, cy) => contentToScreen(e, cx, cy),
    syncVp: () => syncVp(e),
    clampView: () => clampView(e),
    applyView: () => applyView(e),
    emitView: () => e.emitView(),
    focusBounds: (b) => e.camera.focusBounds(b),
    registerZone: (zone, onDrop, accepts, textFor) => e.registerZone(zone, onDrop, accepts, textFor),
    mountMarkers: (host, lead, dragger, anchorCfg) =>
      e.markerRig.mount({ verb: e.scene.verb, surface: e.scene.surface, dragLayer: e.scene.cards.drag }, host, lead, dragger, anchorCfg),
    clearMarkers: () => e.markerRig.clear(),
    markersList: () => e.markerRig.list(),
    grabbersList: () => e.markerRig.grabberList(),
    resetSceneState: () => e.resetSceneState(),
    setQualityProfile: (p) => e.setProfile(p),
    defaultBeginDrag: (el, cp, sp) => coreBeginDrag(e, el, cp, sp),
    defaultSceneTap: (content, screen) => coreOnSceneTap(e, content, screen),
    defaultPickElement: (cx, cy) => corePickElement(e, cx, cy),
    defaultElementTapped: (el) => coreOnElementTapped(e, el),
    defaultCanDrag: (el) => coreCanDrag(e, el),
  };
}
