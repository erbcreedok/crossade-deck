import React from "react";
import { addons, types, useChannel } from "storybook/manager-api";
import { SyntaxHighlighter } from "storybook/internal/components";

// ПАНЕЛЬ CODE — рядом с Controls, в режиме СТОРИ.
//
// Имя латиницей, как у соседних вкладок сторибука (Controls, Actions, Interactions): одна русская
// вкладка в их ряду читается как чужая, а не как своя.
//
// До неё код жил только на вкладке Docs: смотришь на компонент — код в другом месте, и чтобы его
// увидеть, надо уйти со стори и найти её среди соседей. Панель убирает этот переход.
//
// Источник ОДИН и тот же, что у «Show code»: `parameters.code(args)` раздела. Второй генератор тут
// был бы худшим из возможных решений — два места, где пишется код примера, разъедутся в первый же
// день, и заметить это будет нечем.

const ADDON_ID = "crusade/code";
const PANEL_ID = `${ADDON_ID}/panel`;
const CODE_EVENT = "crusade/code";

/**
 * Код, присланный превью ДО того, как панель открыли.
 *
 * Панель монтируется только по клику на вкладку, а превью присылает код, когда собрало стори, —
 * то есть заведомо раньше. Подписка внутри панели приходила к шапочному разбору: событие уже
 * прошло, второго не будет (аргументы-то не менялись), и панель писала «параметр не описан» при
 * описанном параметре.
 *
 * Своего кэша для этого не нужно: канал сам помнит последнюю посылку каждого события — `last()`
 * отдаёт её аргументы. Второе хранилище того же значения разошлось бы с первым.
 */
function codeFromChannel(): string | null {
  const last = addons.getChannel().last?.(CODE_EVENT);
  return Array.isArray(last) ? ((last[0] as string | null) ?? null) : null;
}

function CodePanel({ active }: { active?: boolean }) {
  // Хуки обязаны вызываться до любого выхода — иначе React ругается на разное их число.
  const [code, setCode] = React.useState<string | null>(codeFromChannel);
  // Текст приходит ИЗ ПРЕВЬЮ: `parameters.code` — функция, а функции через канал не проходят.
  // Подписка нужна для живых правок рычагов; начальное значение берётся из памяти канала.
  useChannel({ [CODE_EVENT]: (c: string | null) => setCode(c) });
  // Вкладку могли открыть на уже собранной стори — перечитываем память канала при показе.
  React.useEffect(() => {
    if (active) setCode(codeFromChannel());
  }, [active]);
  if (!active) return null;
  if (!code) {
    return (
      <div style={{ padding: 16, fontSize: 13, lineHeight: 1.6 }}>
        У раздела не описан <code>parameters.code</code> — показывать нечего.
        <br />
        Это функция <code>(args) =&gt; string</code> в <code>meta.parameters</code>: она собирает код КОМПОНЕНТА с
        аргументами текущей стори. Исходник самой стори тут не годится — он про устройство каталога,
        а не про применение компонента.
      </div>
    );
  }
  // Панель узкая по своей природе (она делит низ экрана с канвасом), поэтому код не переносим по
  // словам, а даём ему СВОЙ горизонтальный скролл: перенос ломает отступы примера, и он перестаёт
  // быть кодом, который можно скопировать.
  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto" }}>
      <SyntaxHighlighter language="tsx" copyable bordered wrapLongLines={false}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "Code",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => <CodePanel active={active} />,
  });
});
