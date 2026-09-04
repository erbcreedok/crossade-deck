## UNIT · NodeSpec и Revised — сериализация дерева

`vitest (headless, no WebGL)` · 4 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `spec.roundtrip` | дерево Node | `toSpec` → `JSON` → `fromSpec` | возвращает равнозначный спек и совпадающие caps и fields |
| `spec.project-preserves-serialization` | спроецированное дерево | `toSpec` до и после roundtrip | даёт идентичный NodeSpec |
| `spec.unknown-atom-throws` | спек с неизвестным атомом | `fromSpec` | бросает ошибку с именем узла и атома |
| `spec.revised-atom-bump` | корень Node | `revOf` / `bump` | `revOf` по умолчанию 0, `bump` увеличивает rev на 1 |
