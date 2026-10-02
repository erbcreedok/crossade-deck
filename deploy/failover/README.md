# Запасной узел: мак подхватывает, если Voyager лёг

Основной — Voyager (стол и бот). Мак — запасной: пока Voyager жив, на маке не крутится ни стол, ни бот.

```
Voyager (основной)                          Мак (запасной)
  crossade-table   :2590  ──Funnel──┐         com.crossade.failover   ← надзиратель, всегда включён
  crossade-bot     polling          │           ├─ каждые 15 с: стол Voyager? реле? бот в реестре?
  crossade-snapshot.timer (2 мин)   │           ├─ Voyager жив:  раз в 2 мин забирает снимок базы (rsync)
    └─ ~/crossade-deck/backup/ ─────┼──rsync──► └─ Voyager упал: база ← снимок, поднимает ↓, пишет в Telegram
                                    │         com.crossade.failover-table   (сам не стартует)
                                    │         com.crossade.failover-bot     (сам не стартует)
```

## Правила (`decide.mjs`, тест `node --test deploy/failover`)

- Стол и бот переключаются НЕЗАВИСИМО, и только после `FAIL_AFTER`/`RECOVER_AFTER` = 4 проб подряд (~1 мин).
- Стол считается упавшим, только если он молчит напрямую И люди через реле его не видят: обрыв связи одного мака
  с Voyager не поднимает второй стол.
- Бот упал — в реестре узлов («Узлы» у хозяина) нет живого бота с другой машины. Реестр не ответил — доказательства нет, ничего не меняется.
- Voyager вернулся — мак сам гасит запасных. Лишний процесс с одним токеном бота дал бы Telegram-конфликт 409.

## Данные

Снимок базы (`server/scripts/snapshotDb.mjs`, `VACUUM INTO`) — цельный файл, а не копия `.db` рядом с `-wal`.
При подхвате база мака откладывается в `server/data/crossade.db.before-<время>` и заменяется снимком Voyager.
Что сыграно, пока мак стоял за основного, остаётся в базе мака и **автоматически с базой Voyager не сливается**:
у Voyager главная его база. Снимок отстаёт от Voyager до двух минут.

## Установка на маке

```bash
cp deploy/failover/com.crossade.failover*.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.crossade.failover.plist   # только надзиратель
```
Таймер снимков на Voyager: `crossade-snapshot.{service,timer}` (user-systemd).

## Чего это не закрывает

Мак не 24/7: если лягут и Voyager, и мак — ляжет всё. Настоящая замена — второй постоянный сервер, на нём те же
`crossade-table` и `crossade-bot` как ещё один запасной.
