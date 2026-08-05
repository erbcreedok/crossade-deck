import { spinScale, spinShowsOther } from "../flip";
import { cardShadow, withEffect } from "./shadow";
import { scaleFromZ } from "./elevation";
import { applyEffect } from "../anim/effectApply";
import { flipStyle } from "../anim/flipStyles";
import { placeItem } from "./itemFrame";
import type { TableItem } from "./tableItem";
import type { CardVisual } from "./cardKind";

// КАДР ВИДА «КАРТА»: спин флипа, лицо/рубашка, эффект жизни и карточный силуэт тени. Общая часть
// кадра (дыхание, дрожь, высота, постановка root) — itemFrame, один закон на все виды.

export function syncCard(it: TableItem, cv: CardVisual): void {
  cv.secrecy.veil.sync();
  const render = it.body.scaleVal * cv.scaleFactor;
  const f = placeItem(it, it.height, it.width, 0.05);
  let spinX = 1; // гориз. сжатие при перевороте — им же сужаем тень
  if (cv.flipAnim) {
    // ЧТО за движение — решает стиль из реестра (anim/flipStyles.ts). Он отдаёт угол и отклонения
    // ОТ дома; дом карта уже заняла сама, поэтому отклонения складываются с ним.
    const fr = flipStyle(it.life.preset.flip.style).frame(Math.min(1, cv.flipAnim.t / cv.flipAnim.dur), it.life.preset.flip.halfTurns);
    spinX = spinScale(fr.angle);
    it.root.scale.set(render * spinX * fr.scale * scaleFromZ(it.zBase), render * fr.scale * scaleFromZ(it.zBase));
    it.root.position.set(it.root.position.x + fr.dx * it.width, it.root.position.y + fr.dy * it.height);
    it.root.rotation += fr.rot;
    const side = spinShowsOther(fr.angle) ? !cv.flipAnim.fromFaceUp : cv.flipAnim.fromFaceUp;
    cv.baseSprite.texture = cv.secrecy.faceTex(side);
  } else {
    // Высота показывается размером: подняли — стало крупнее. Иначе `z` двигал бы только тень.
    it.root.scale.set(render * scaleFromZ(it.zBase));
  }

  // ЭФФЕКТ (появление/уничтожение, ElementLife) применяется ДО тени: она выводится из итогового
  // состояния предмета, а не правится отдельно под каждый способ появиться или сгинуть.
  const fx = it.life.effectFrame(it.width, it.flashOff);
  if (fx) {
    const ref = { g: cv.burnMask };
    applyEffect(it.root, it.body.px, it.body.py, fx, ref);
    cv.burnMask = ref.g;
  }

  // ТЕНЬ — всегда следствие состояния: место, высота, экранное смещение, форма. Отдельных
  // «теневых анимаций» нет — эффект меняет предмет, тень идёт следом. Размер — от того, каким
  // предмет НАРИСОВАН (render), а не от позы покоя: у удерживаемой карты (×1.45) тень иначе
  // целиком пряталась под ней.
  it.shadowRect = cardShadow(
    withEffect(
      {
        px: it.body.px,
        py: it.body.py,
        shakeX: f.shakeX,
        z: f.z,
        rotation: it.body.rotation,
        scaleFactor: render * scaleFromZ(it.zBase), // тот же множитель, что уехал в root.scale
        screenY: f.bob,
        spinX,
      },
      fx,
    ),
    it.life.preset.shadow,
  );
}
