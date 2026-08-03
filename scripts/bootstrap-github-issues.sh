#!/usr/bin/env bash
#
# bootstrap-github-issues.sh — заводит трекинг задач Crossade Deck в GitHub Issues.
# Консолидирует: todo/ (баги тестировщика) + client2/docs/open-tasks.md + HANDOFF.md.
#
# Запуск:
#   1) brew install gh          # если ещё нет
#   2) gh auth login            # выбрать github.com, HTTPS, свой аккаунт
#   3) bash bootstrap-github-issues.sh
#
# Идемпотентность: метки/майлстоуны создаются «если нет». ISSUES создаются каждый
# запуск заново — прогоняй скрипт РОВНО ОДИН РАЗ, иначе получишь дубли.
# (В конце есть закомментированный блок «снести всё и начать заново».)

set -euo pipefail
REPO="erbcreedok/crossade-deck"

echo "==> Репозиторий: $REPO"
gh repo view "$REPO" >/dev/null || { echo "Нет доступа к $REPO — проверь gh auth status"; exit 1; }

# ---------------------------------------------------------------- метки
label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null && echo "  label: $1"; }
echo "==> Метки"
label bug          d73a4a "Дефект"
label feature      0e8a16 "Новая фича / доработка"
label decision     fbca04 "Открытое решение — нужен выбор владельца"
label epic         5319e7 "Крупное направление (зонтик над задачами)"
label p-high       b60205 "Приоритет: высокий"
label p-med        d93f0b "Приоритет: средний"
label p-low        fef2c0 "Приоритет: низкий"
label client-v1    c5def5 "Старый клиент (client/)"
label client2      1d76db "Новый клиент (client2/, канвас)"
label server       bfdadc "Сервер (Colyseus)"

# ---------------------------------------------------------------- майлстоуны (направление)
ms() {
  local title="$1" desc="$2"
  if gh api "repos/$REPO/milestones" --jq '.[].title' | grep -qxF "$title"; then
    echo "  milestone есть: $title"
  else
    gh api "repos/$REPO/milestones" -f title="$title" -f description="$desc" -f state=open >/dev/null
    echo "  milestone: $title"
  fi
}
echo "==> Майлстоуны (ПРЕДЛОЖЕНИЕ по направлению — переименуй/удали под себя)"
ms "client2 → прод"        "Довести client2 (канвас-переписку) до продакшена и заменить старый client/"
ms "Скрытая карта на /table" "Ввести понятие hidden в TableEngine/CardVisual и навесить оверлей пыли"
ms "Правила игры: Дурак"    "Первый слой правил поверх механик (free-mode — уже первый кирпич)"
ms "Полировка UI / мобайл"  "Мелкие дефекты вёрстки и мобильных экранов"

msnum() { gh api "repos/$REPO/milestones" --jq ".[] | select(.title==\"$1\") | .number"; }

# ---------------------------------------------------------------- issues
issue() { # title  labels  milestone-title(или "")  body
  local title="$1"
  local labels="$2"
  local milestone="$3"
  local body="$4"
  if [ -n "$milestone" ]; then
    gh issue create --repo "$REPO" --title "$title" --body "$body" --label "$labels" --milestone "$milestone" | sed 's#^#  issue: #'
  else
    gh issue create --repo "$REPO" --title "$title" --body "$body" --label "$labels" | sed 's#^#  issue: #'
  fi
}

echo "==> Issues: направления (epics)"
issue "[epic] Миграция client → client2" "epic,p-high,client2" "client2 → прод" \
"Активная разработка идёт в client2/ (канвас, Pixi v8), но прод всё ещё на старом client/.
Направление-зонтик: довести client2 до паритета и заменить.

ВОПРОС ВЛАДЕЛЬЦУ: подтвердить, что client/ уходит. Если да — баги client-v1 ниже можно закрыть как won't-fix.
Источник: client2/docs/HANDOFF.md, корневой CLAUDE.md."

issue "[epic] Слой правил игры: Дурак" "epic,feature,p-high,server" "Правила игры: Дурак" \
"Сейчас в коде только механика владения/перемещения карт, правил нет (сознательно).
free-mode («ГОУ!») — первый кирпич будущей системы правил (правила = конфиги).
Направление-зонтик: описать правила Дурака как конфиг поверх механик.
Источник: CLAUDE.md (Free mode / 'no game rules'), память проекта."

echo "==> Issues: фичи / решения (client2)"
issue "Скрытая карта на /table (TableEngine/CardVisual)" "feature,p-high,client2" "Скрытая карта на /table" \
"Живая «пыль» уже подключена к ui/Card (видно на /free-desk). /table (TableEngine/CardVisual)
про hidden ещё НЕ знает — сперва ввести само понятие скрытой карты, затем навесить тот же оверлей.
Плюс привязать к профилю качества/reduce-motion (fallback — статичный hiddenFace).
Источник: open-tasks.md §B.4."

issue "Канвас-слайдер vs Stepper для дробных шагов" "decision,client2" "" \
"Числовые контролы на /motion — Stepper (целые шаги), т.к. канвас-примитива «плавный слайдер» нет.
Из-за этого дробные шаги (напр. дрожание 0.1) огрубились до целых.
РЕШЕНИЕ: делать ли отдельный UI-примитив «слайдер» в канвасе.
Источник: open-tasks.md §A.1."

issue "Плотность частиц как рычаг" "feature,p-low,client2" "" \
"Реальная цена частиц — их КОЛИЧЕСТВО (не size/freq). Сейчас зашито константами
(step=4, perCell=2 в censorDemo.particleCard). Предлагался ползунок «плотность» с пересборкой облака.
Источник: open-tasks.md §A.3."

issue "«Тряска рядов»: интенсивность/скорость настраиваемые" "feature,p-low,client2" "" \
"Сейчас только тумблер «двигать». Сделать интенсивность/скорость настраиваемыми — «когда-нибудь».
Источник: open-tasks.md §B.5."

issue "Master reduce-motion, читающий ОС" "feature,client2" "" \
"Тумблер reduce-motion на /motion локальный, не читает системную настройку
(prefers-reduced-motion / iOS/Android). Связать с ОС.
Источник: open-tasks.md §C.6 (animation-levers §4)."

issue "Авто-профиль по FPS (автопонижение качества)" "feature,client2" "" \
"Есть профили moderate/full, но нет автопонижения при просадке FPS.
Источник: open-tasks.md §C.7."

issue "Глобальный флаг вспышек/мерцания (фото-чувствительность)" "feature,client2" "" \
"Частицы умеют flicker, но нет общего флага на все вспышечные анимации (напр. «сжечь»).
Источник: open-tasks.md §C.8."

issue "Драг-режим: глушить анимации во время драга" "feature,client2" "" \
"На слабых устройствах «виснет драг». Резать анимации на время перетаскивания.
Источник: open-tasks.md §C.9."

issue "Батарея/термал-aware: резать idle/частицы на low battery" "feature,client2" "" \
"Мобайл: понижать idle/частицы при низком заряде/перегреве.
Источник: open-tasks.md §C.10."

issue "/motion: idle-дыхание, «сжечь», флип как тест-кейсы" "feature,p-low,client2" "" \
"Есть в движке/планах, но на стенде /motion отдельными секциями не заведены. Стенд задуман расширяемым.
Источник: open-tasks.md §D.11."

# ---------------------------------------------------------------- Баги старого клиента (client/)
# ВНИМАНИЕ: это дефекты client/ (v1). Если client/ уходит в пользу client2 — закомментируй
# весь блок ниже (или закрой issues как won't-fix после создания).
echo "==> Issues: баги client-v1 (проверь актуальность!)"
issue "ActionBar: «Забрать 1»/«Забрать все» обрезаются до «Забрать…»" "bug,p-high,client-v1" "Полировка UI / мобайл" \
"На 375px обе команды схлопываются CSS-эллипсисом в «Забрать…» — игрок не отличает «взять одну» от
«забрать всю колоду» (вторая необратима). shortenLabel режет по символам (14), кнопка ограничена пикселями.
Где: client/src/components/ActionBar.tsx:26 vs theme.css:479.
Источник: todo/02-action-bar-labels.md."

issue "Автораздача 36 карт на 4 → 10/10/8/8 вместо 9/9/9/9" "bug,p-med,client-v1" "" \
"autoDealPlan кладёт по 2 карты подряд; остаток «доезжает» парами → перекос кратен 2.
Ожидается: остаток разбирается по одной. Где: client/src/game/dealing.ts.
Источник: todo/03-autodeal-uneven.md."

issue "iOS Safari: лобби обрезает кнопку «Войти по коду»" "bug,p-med,client-v1" "Полировка UI / мобайл" \
"На iPhone SE панель лобби фикс-высоты режет последнюю кнопку пополам, внутренней прокрутки нет.
Ожидается: панель растёт по контенту / скроллится. Где: LobbyScreen + .panel (theme.css).
Источник: todo/04-lobby-cut-on-ios.md."

issue "Шапка на 375px прячет счётчик готовности" "bug,p-low,client-v1" "Полировка UI / мобайл" \
"scrollWidth 418 > clientWidth 355: «готовы: N» и счётчик ботов уезжают в скрытый скролл без подсказки.
Прокрутка намеренная — вопрос к порядку бейджей / признаку скролла. Где: theme.css:326 .table-topbar.
Источник: todo/06-topbar-clipped.md."

issue "Пустая колода: «Перемешать»/«Автораздача» активны, но мертвы" "bug,p-low,client-v1" "" \
"При колоде 0 кнопки яркие и нажимаются, но не делают ничего (ни анимации, ни отказа).
Рядом сделано верно: barActionsFor возвращает NOTHING. В раздаче нет проверки на deckCount.
Источник: todo/07-dead-controls.md."

echo ""
echo "==> Готово. Проверь: gh issue list --repo $REPO"
echo "    Уже исправленные баги todo #1 (seat-overlap) и #5 (board-boxes) НЕ заводились."

# ---------------------------------------------------------------- откат (если создалось с дублями)
# Снести ВСЕ открытые issues (осторожно!):
#   gh issue list --repo "$REPO" --state open --limit 100 --json number \
#     | jq -r '.[].number' | xargs -I{} gh issue delete {} --repo "$REPO" --yes
