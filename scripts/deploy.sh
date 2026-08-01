#!/usr/bin/env bash
# Выкатка ГОТОВОГО образа из GHCR на Fly.io.
#
# Почему скрипт, а не `fly deploy` руками — причина та же, что и раньше: знание о деплое
# должно жить в ОДНОМ месте, одинаковом на ноутбуке и в CI, иначе они расходятся молча.
# Изменилось другое: раньше скрипт запускал сборку на стороне Fly, и артефакта наружу не
# оставалось. Теперь образы собирает GitHub Actions и кладёт в GHCR, а скрипт только
# указывает Fly, какой именно образ взять. Из этого следует всё остальное:
#   - выкатить можно ЛЮБУЮ прошлую сборку по тегу — это же и есть откат;
#   - тот самый артефакт, который проверяли, уедет и на Fly, и на свой сервер позже;
#   - порядок «сервер раньше клиента» больше не нужен: адрес сервера не вшивается в бандл,
#     он приезжает в рантайме (client/src/runtimeConfig.ts).
#
# Использование:
#   scripts/deploy.sh                          # все компоненты, последний образ с main
#   scripts/deploy.sh web                      # один компонент
#   scripts/deploy.sh server web               # несколько
#   IMAGE_TAG=sha-abc1234 scripts/deploy.sh web    # конкретная сборка (откат — это она же)
#   IMAGE_TAG=build-312 scripts/deploy.sh          # по номеру сборки, как в подписи версии
#   DEPLOY_ENV=dev scripts/deploy.sh web            # другое окружение (ищет client/fly.dev.toml)
#   BUILD_FROM_SOURCE=1 scripts/deploy.sh server    # запасной путь: собрать на Fly, минуя GHCR
#
# Список компонентов — deploy/components.json, его же читает .github/workflows/build.yml.
set -euo pipefail

cd "$(dirname "$0")/.."

MANIFEST="deploy/components.json"
IMAGE_TAG="${IMAGE_TAG:-main}"
DEPLOY_ENV="${DEPLOY_ENV:-prod}"
BUILD_FROM_SOURCE="${BUILD_FROM_SOURCE:-}"

# Владелец/репозиторий берутся из origin, чтобы форк не выкатывал чужие образы. GHCR
# принимает только нижний регистр, а GitHub имена — нет: приводим сами.
default_registry() {
  local url slug
  url="$(git config --get remote.origin.url || true)"
  slug="$(printf '%s' "$url" | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
  [[ -n "$slug" ]] || { echo "не смог определить репозиторий из remote.origin.url" >&2; exit 1; }
  printf 'ghcr.io/%s' "$(printf '%s' "$slug" | tr '[:upper:]' '[:lower:]')"
}
IMAGE_REGISTRY="${IMAGE_REGISTRY:-$(default_registry)}"

# --- чтение манифеста ------------------------------------------------------------------
# Через node, а не jq: node в этом репозитории есть заведомо, jq на macOS из коробки нет.

all_components() {
  node -e '
    const all = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    process.stdout.write(Object.keys(all).filter((k) => !k.startsWith("$")).join("\n"));
  ' "$MANIFEST"
}

field() {
  node -e '
    const all = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const component = all[process.argv[2]];
    if (!component) {
      console.error(`неизвестный компонент «${process.argv[2]}». Есть: ` +
        Object.keys(all).filter((k) => !k.startsWith("$")).join(", "));
      process.exit(1);
    }
    const value = component[process.argv[3]];
    if (value === undefined) {
      console.error(`у компонента «${process.argv[2]}» нет поля «${process.argv[3]}» в ${process.argv[1]}`);
      process.exit(1);
    }
    process.stdout.write(String(value));
  ' "$MANIFEST" "$1" "$2"
}

# Прод-конфиг лежит как есть, окружение подставляется в имя: client/fly.toml → client/fly.dev.toml.
# Так стенд заводится добавлением файла, без правок скрипта и workflow.
fly_config() {
  local base="$1"
  [[ "$DEPLOY_ENV" == "prod" ]] && { printf '%s' "$base"; return; }
  printf '%s.%s.toml' "${base%.toml}" "$DEPLOY_ENV"
}

# Имя аппы на Fly по тому же правилу: crusade-deck-client → crusade-deck-client-dev.
app_for_env() {
  local app="$1"
  [[ "$DEPLOY_ENV" == "prod" ]] && { printf '%s' "$app"; return; }
  printf '%s-%s' "$app" "$DEPLOY_ENV"
}

# Адрес не хранится в манифесте, а выводится из имени аппы — иначе адрес каждого стенда
# пришлось бы туда дописывать, и он бы разъезжался с реальностью.
health_url() {
  printf 'https://%s.fly.dev%s' "$(app_for_env "$(field "$1" app)")" "$(field "$1" healthPath)"
}

# --- откуда Fly возьмёт образ ------------------------------------------------------------
#
# Хранилище артефактов — всегда GHCR. Но Fly тянет чужой реестр АНОНИМНО, а GHCR создаёт
# пакеты приватными даже в публичном репозитории, и поменять это можно только кнопкой в
# вебе — API у GitHub для видимости пакета нет. Полагаться на разовый ручной клик деплой не
# должен, поэтому путей два:
#
#   публичный пакет → Fly тянет прямо из GHCR (быстро, ничего качать не надо);
#   приватный       → образ перекладывается в реестр самого Fly и выкатывается оттуда.
#
# Артефакт при этом один и тот же: в registry.fly.io уезжает БАЙТ В БАЙТ тот образ, что
# лежит в GHCR, — не пересборка. GHCR остаётся источником правды, из которого его можно
# забрать куда угодно ещё.

ghcr_public() {
  local repo="$1" tag="$2" token
  token="$(curl -fsSL "https://ghcr.io/token?scope=repository:${repo}:pull&service=ghcr.io" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).token' 2>/dev/null)" || return 1
  [[ -n "$token" ]] || return 1
  curl -fsSL -o /dev/null \
    -H "Authorization: Bearer ${token}" \
    -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json" \
    "https://ghcr.io/v2/${repo}/manifests/${tag}"
}

# Возвращает адрес, который надо отдать flyctl. Печатает пояснения в stderr, чтобы stdout
# остался чистым — его читает вызывающая сторона.
resolve_image() {
  local repo="$1" tag="$2" app="$3"
  local ghcr="ghcr.io/${repo}:${tag}" fly="registry.fly.io/${app}:${tag}"

  if ghcr_public "$repo" "$tag"; then
    echo "    образ публичный — Fly возьмёт его прямо из GHCR" >&2
    printf '%s' "$ghcr"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    cat >&2 <<MSG
!! Образ ${ghcr} не читается анонимно (приватный пакет или нет такого тега), а docker,
   которым его можно было бы переложить в реестр Fly, здесь недоступен.

   Варианты:
     1) сделать пакет публичным один раз:
        https://github.com/users/${repo%%/*}/packages/container/${repo#*/}/settings
        → Change visibility → Public. Дальше docker не нужен вообще;
     2) выкатывать из CI (Actions → Выкатка) — там docker есть и перекладка идёт сама;
     3) проверить, что тег вообще существует: gh run list --workflow build.yml
MSG
    exit 1
  fi

  echo "    пакет приватный — перекладываю образ в реестр Fly (тот же образ, не пересборка)" >&2
  # --platform: образы собираются под amd64 (Fly крутит только его), и на arm-ноутбуке
  # docker без этого пытается найти arm-вариант и спотыкается.
  docker pull --platform linux/amd64 --quiet "$ghcr" >&2
  docker tag "$ghcr" "$fly"
  flyctl auth docker >&2
  docker push --quiet "$fly" >&2
  printf '%s' "$fly"
}

# --- выкатка ---------------------------------------------------------------------------

deploy_from_image() {
  local component="$1" image fly repo app source
  image="$(field "$component" image)"
  fly="$(fly_config "$(field "$component" fly)")"
  repo="${IMAGE_REGISTRY#ghcr.io/}/${image}"
  app="$(app_for_env "$(field "$component" app)")"

  [[ -f "$fly" ]] || { echo "нет конфига $fly (окружение «$DEPLOY_ENV»)" >&2; exit 1; }

  echo "==> ${component}: ${IMAGE_REGISTRY}/${image}:${IMAGE_TAG} → ${app}"
  source="$(resolve_image "$repo" "$IMAGE_TAG" "$app")"
  flyctl deploy --now --config "$fly" --image "$source"
}

# Запасной путь: Fly собирает из исходников, как было до перехода на GHCR. Нужен, когда CI
# лежит, а выкатить надо. Артефакта наружу при этом НЕ остаётся — это осознанный размен.
deploy_from_source() {
  local component="$1" fly dockerfile context
  fly="$(fly_config "$(field "$component" fly)")"
  dockerfile="$(field "$component" dockerfile)"
  context="$(field "$component" context)"

  if [[ -n "$(git status --porcelain)" ]]; then
    echo "!! В рабочем дереве есть несохранённые правки — образ соберётся из них," >&2
    echo "   а номер сборки будет от последнего коммита. Закоммить или отложи их." >&2
    exit 1
  fi

  echo "==> ${component}: сборка на стороне Fly из ${dockerfile} (в обход GHCR)"
  flyctl deploy --now \
    --config "$fly" \
    --dockerfile "$dockerfile" \
    --build-arg "APP_BUILD=$(git rev-list --count HEAD)" \
    --build-arg "APP_COMMIT=$(git rev-parse --short HEAD)" \
    "$context"
}

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  # mapfile/readarray нет в bash 3.2, который стоит на macOS по умолчанию.
  while IFS= read -r line; do targets+=("$line"); done < <(all_components)
fi

echo "==> Окружение: ${DEPLOY_ENV}; тег образа: ${IMAGE_TAG}${BUILD_FROM_SOURCE:+ (игнорируется: сборка из исходников)}"

for component in "${targets[@]}"; do
  if [[ -n "$BUILD_FROM_SOURCE" ]]; then
    deploy_from_source "$component"
  else
    deploy_from_image "$component"
  fi
done

# Проверка живёт здесь, а не в workflow: тогда «выкатил и убедился» — одно действие и на
# ноутбуке, и в CI. Машины спят (min_machines_running = 0), первый запрос их будит — отсюда
# щедрые --retry и таймаут, иначе проверка падала бы на холодном старте, а не на поломке.
echo "==> Проверка"
failed=""
for component in "${targets[@]}"; do
  url="$(health_url "$component")"
  if code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 60 --retry 5 --retry-delay 5 \
      --retry-all-errors "$url")" && [[ "$code" == 2* ]]; then
    echo "    ok  ${code}  ${url}"
  else
    echo "    НЕ ОТВЕЧАЕТ (${code:-нет ответа})  ${url}"
    failed="${failed} ${component}"
  fi
done

if [[ -n "$failed" ]]; then
  echo "!! После выкатки не отвечают:${failed}" >&2
  echo "   Логи: flyctl logs -a <аппа>. Откат: IMAGE_TAG=<прошлый тег> $0${failed}" >&2
  exit 1
fi

echo "==> Готово."
