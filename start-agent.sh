#!/bin/zsh
# Второй агент: верхний HUD из стенда в продукт. Задача целиком — в TASK.md рядом.
cd /Users/giyers/Desktop/crossade-deck/.claude/worktrees/tophud-layer || exit 1
echo "\033]0;Claude — верхний HUD (tophud-layer)\007"
exec claude --remote-control "tophud" --permission-mode auto --model opus \
  "Прочитай целиком файл TASK.md в корне этого worktree — это твоя задача от владельца. Дальше действуй по ней: сначала разведка, потом план на 5–10 строк владельцу, потом код."
