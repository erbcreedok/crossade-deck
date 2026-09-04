# Каталог наружу с этого Мака — два агента launchd

`com.crossade.kit` держит Storybook на :9567, `com.crossade.kit-tunnel` — быстрый туннель Cloudflare
на него. Оба перезапускаются сами (KeepAlive) и стартуют при входе в систему.

```bash
cp deploy/local/*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.crossade.kit.plist ~/Library/LaunchAgents/com.crossade.kit-tunnel.plist
scripts/kit-tunnel.sh            # текущий адрес (быстрый туннель меняет его при каждом старте)
```

Снять: `launchctl unload ~/Library/LaunchAgents/com.crossade.kit*.plist`.
Постоянный адрес — это уже именованный туннель с доменом, см. `DEPLOY.md` §3.
