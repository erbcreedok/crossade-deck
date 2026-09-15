# Ночная подгонка — план (согласован с владельцем)

Протокол: задачи строго по порядку; коммит на механику с `[skip ci]` и тегом `night/b<build>`; строка в `.night/log.md`
каждые 5–10 мин; без субагентов; развилка без владельца → вопрос в лог, дальше; список кончился → стоп.
Утром — одна HTML-страница: таймлайн сверху (время, задача, билд-ссылка), под ним карточки фич (что проверить,
баги, тесты), расход (время, коммиты; токены основной сессии не измеряются).

## Рабочее место
- Ветка `tg-html`, рабочее дерево `/Users/giyers/Desktop/crossade-deck/.claude/worktrees/tg-html`; бот в `../bot`.
- Выкатка стола: `git push origin tg-html:main` (из корня дерева) → в `/Users/giyers/Desktop/crossade-deck`
  `git pull --ff-only` → `launchctl kickstart -k gui/$(id -u)/com.crossade.table` → проверить `localhost:2590/health`
  и `https://crossade-deck-server.fly.dev/relay/table` (`up:true`). Правки бота — ещё `com.crossade.bot`.
- Fly (реле `/t`) выкатывается ТОЛЬКО если менялся сам механизм пересылки: из чистой копии `main`
  (`git worktree add --detach`), `BUILD_FROM_SOURCE=1 scripts/deploy.sh server`.
- Тесты: `cd server && npx vitest run`, `npx tsc --noEmit`, типы клиента — tsconfig со `table-client/*.ts`;
  e2e: поднять `TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts`,
  затем `node scripts/table*.mjs http://localhost:2599`. `tableChairs.mjs` падает давно и не из-за нас.
- Каждый сторож проверяется поломкой: мутировать код, увидеть падение, вернуть.
- Секреты только в `bot/.env` и `server/.env.table`. НИКОГДА не коммитить `fix-menu.mjs`, `fix-menu.js`,
  `bot/fix-menu.mjs`, `.agent/agents/probe.ndjson`, тестовые PNG.
- Процессы убивать только по PID. Живой стол перезапускать только через launchd.
