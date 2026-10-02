# Voyager: прод и дев из git

```
~/repo       ветка main   прод: crossade-table (:2590, публичный через Funnel), crossade-bot
~/repo-dev   ветка dev*   дев:  crossade-dev-table (:2591, https :8443), crossade-dev-stands (:9585, https :10000)
                          * какая ветка — `~/.crossade-dev-branch` или аргумент `deploy-voyager.sh dev <ветка>`
```

Дев виден ТОЛЬКО устройствам вашего tailnet (`tailscale serve`, не `funnel`):
`https://voyager-crossade.tail5ece90.ts.net:8443` — стол, `…:10000/hud3d/` — дизайн-стенды (все папки `design/`).
Чтобы показать дев тому, кого нет в tailnet: `tailscale funnel --bg --https=8443 2591`, потом `… off`.

Выкатка: `scripts/deploy-voyager.sh prod` (вручную) и `crossade-pull-dev.timer` (дев сам, раз в минуту).
Юниты ставит `deploy/voyager/install.sh`.
