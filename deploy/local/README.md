# Каталог и хаб наружу с этого Мака — четыре агента launchd

`com.crossade.kit` держит Storybook на :9567, `com.crossade.kit-tunnel` — быстрый туннель Cloudflare
на него. `com.crossade.hub` — то же самое для хаба на :9569, `com.crossade.hub-tunnel` — туннель на
него. Все четыре перезапускаются сами (KeepAlive) и стартуют при входе в систему.

```bash
cp deploy/local/*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.crossade.kit.plist ~/Library/LaunchAgents/com.crossade.kit-tunnel.plist
launchctl load ~/Library/LaunchAgents/com.crossade.hub.plist ~/Library/LaunchAgents/com.crossade.hub-tunnel.plist
scripts/kit-tunnel.sh            # текущий адрес каталога (быстрый туннель меняет его при каждом старте)
scripts/hub-tunnel.sh            # текущий адрес хаба — тем же способом
```

Бот (`bot/`) читает свежий адрес хаба сам через `scripts/hub-tunnel.sh`, если `HUB_TUNNEL=1` в его
`.env` (см. `bot/README.md`) — вручную обновлять `HUB_URL` под быстрый туннель не нужно.

## Стол, сервер дев-кита и стенд

`com.crossade.table` — сервер HTML-столов на :2590 и туннель к нему; адрес туннеля сервер сам несёт
реле на Fly маяком (`bot/README.md`). `com.crossade.server` — сервер дев-кита на :2567,
`com.crossade.stand` — стенды `design/` на :8791.

```bash
cp deploy/local/com.crossade.{table,server,stand}.plist ~/Library/LaunchAgents/
for n in table server stand; do launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.crossade.$n.plist; done
```

Две ловушки, обе уже стоили перезапусков по кругу:
- **`&&` в plist пишется `&amp;&amp;`.** Голый `&` делает файл невалидным, и launchd отвечает кодом 78
  (`plutil -lint` это видит сразу).
- **Логи — в `/tmp`, и bash из launchd файлов в Desktop не читает** (TCC). Node и python читают, поэтому
  всё, что берётся из репозитория, запускается ими, а не `bash script.sh`.

Снять: `launchctl unload ~/Library/LaunchAgents/com.crossade.{kit,hub}*.plist`.
Постоянный адрес — это уже именованный туннель с доменом, см. `DEPLOY.md` §3.
