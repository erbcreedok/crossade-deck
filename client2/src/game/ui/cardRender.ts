import { spinScale, spinShowsOther } from "../flip";
import { cardShadow, withEffect } from "./shadow";
import { bobOffset, idleBobs, scaleFromZ, screenLift, zFromScale } from "./elevation";
import { applyEffect } from "../anim/effectApply";
import { flipStyle } from "../anim/flipStyles";
import type { Card } from "./Card";

// КАДР КАРТЫ — модуль Card: провязка «состояние → картинка и силуэт тени» (правило пересборки:
// класс-фасад держит данные, поведение — функциями над ним; снаружи ui/ этим полям делать нечего).

/** Кадровая синхронизация: позиция/масштаб/поворот, спин флипа, эффект жизни, силуэт тени. */
export function syncCard(c: Card): void {
  c.secrecy.veil.sync();
  const frozen = c.reduceMotion || c.lowFx;
  const render = c.body.scaleVal * c.scaleFactor;
  // Дыхание: ЭКРАННОЕ покачивание, а не высота — размер карты при нём не меняется, слой тоже.
  let bob = 0;
  if (!frozen && (idleBobs(c.state, c.idle) || c.peekBob)) {
    bob = bobOffset(Math.sin(c.life.age * c.life.preset.idle.speed + c.bobPhase), c.life.preset.idle.amp, c.height);
  }
  const shakeX = c.life.shakeX(c.width, 0.05);

  // ВЫСОТА — один источник: поза покоя (масштаб) плюс подъём полёта (пиксели → доли высоты карты,
  // чтобы `z` везде значил одно и то же) плюс заданный zBase. Двигать карту по экрану «чтобы
  // выглядела выше» в обход `z` нельзя: одно событие, описанное дважды, разойдётся.
  const z = zFromScale(c.body.scaleVal) + c.body.liftPx / Math.max(1, c.height) + c.zBase;
  c.root.position.set(c.body.px + shakeX, c.body.py + screenLift(z, c.height) + bob);
  c.root.rotation = c.body.rotation;
  let spinX = 1; // гориз. сжатие при перевороте — им же сужаем тень
  if (c.flip) {
    // ЧТО за движение — решает стиль из реестра (anim/flipStyles.ts). Он отдаёт угол и отклонения
    // ОТ дома; дом карта уже заняла сама, поэтому отклонения складываются с ним.
    const fr = flipStyle(c.life.preset.flip.style).frame(Math.min(1, c.flip.t / c.flip.dur), c.life.preset.flip.halfTurns);
    spinX = spinScale(fr.angle);
    c.root.scale.set(render * spinX * fr.scale * scaleFromZ(c.zBase), render * fr.scale * scaleFromZ(c.zBase));
    c.root.position.set(c.root.position.x + fr.dx * c.width, c.root.position.y + fr.dy * c.height);
    c.root.rotation += fr.rot;
    const side = spinShowsOther(fr.angle) ? !c.flip.fromFaceUp : c.flip.fromFaceUp;
    c.baseSprite.texture = c.secrecy.faceTex(side);
  } else {
    // Высота показывается размером: подняли — стало крупнее. Иначе `z` двигал бы только тень.
    c.root.scale.set(render * scaleFromZ(c.zBase));
  }

  // ЭФФЕКТ (появление/уничтожение, ElementLife) применяется ДО тени: она выводится из итогового
  // состояния предмета, а не правится отдельно под каждый способ появиться или сгинуть.
  const fx = c.life.effectFrame(c.width, c.flashOff);
  if (fx) {
    const ref = { g: c.burnMask };
    applyEffect(c.root, c.body.px, c.body.py, fx, ref);
    c.burnMask = ref.g;
  }

  // ТЕНЬ — всегда следствие состояния: место, высота, экранное смещение, форма. Отдельных
  // «теневых анимаций» нет — эффект меняет предмет, тень идёт следом. Размер — от того, каким
  // предмет НАРИСОВАН (render), а не от позы покоя: у удерживаемой карты (×1.45) тень иначе
  // целиком пряталась под ней.
  c.shadowRect = cardShadow(
    withEffect(
      {
        px: c.body.px,
        py: c.body.py,
        shakeX,
        z,
        rotation: c.body.rotation,
        scaleFactor: render * scaleFromZ(c.zBase), // тот же множитель, что уехал в root.scale
        screenY: bob,
        spinX,
      },
      fx,
    ),
    c.life.preset.shadow,
  );
}
