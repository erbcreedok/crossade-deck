# REPORT · метки «кто и что сделал» — шаг B из четырёх: значок в плане и рендере

## Закрыто
- `src/core/marks.ts`: Реестр чернил игроков (`registerInk`, `inkRecord`, `resetInks`, `resolveInk`) с дефолтными значениями (`south` → `gold`, `north` → `teal`, `east` → `ruby`, `west` → `emerald`).
- `src/core/viewer.ts`: В `MarkPolicy` добавлено опциональное поле `inks?: Record<string, string>`.
- `src/render/scenePlan/quads.ts`: `Quad.layer` расширен до `"shadow" | "mark" | undefined`.
- `src/render/scenePlan/input.ts`: В `PlanInput` добавлено поле `now?: number` для управления временной отметкой TTL.
- `src/render/contour.ts`: Экспортирована функция `dashOpen` для нарезок открытых полилиний.
- `src/render/scenePlan/markQuads.ts`: Генерация квадов слоя `"mark"` для отображения кружка-значка в правом верхнем углу футпринта узла (HUD-размер, независим от зума камеры), наложенной иконки `mark.<name>`, а также пунктирного вектора перемещения от `from` до центра узла.
- `src/render/scenePlan/index.ts`: В интеграции `markQuads` в обход дерева `scenePlan`, расширена сортировка `rank(q)` на 7 рангов (поддержка `mark` слоя поверх обычных поверхностей и под поднимаемым грузом).
- `src/render/scenePlan/plan.test.ts`: Добавлены юнит-тесты `marks.badge-in-top-right-corner`, `marks.policy-hides-mark`, `marks.from-produces-dashed-vector`.
- `docs/test-plan/10-scene-plan.md` и `docs/test-plan/README.md`: Обновлены таблицы и суммы тест-плана.
- Снимок: Сгенерирован и сохранён PNG `.agent/tmp/live-chess--chess.png`.

## Осталось
- Шаг C: проводка в `drag.ts` и ручки на Live-страницах.
- Шаг D: карты (перевернул, перемешал, кинул).

## Вопросы
- Нет.

## Прогон
- `cd game-kit && npx tsc --noEmit` → 0 ошибок.
- `cd game-kit && npx vitest run` → 93 файла тестов, 1154 теста, 100% зелёные (включая `guards.test.ts` и `testPlan.test.ts`).
