import React from "react";
import { addons, types, useChannel } from "storybook/manager-api";
import { SyntaxHighlighter } from "storybook/internal/components";

// ПАНЕЛЬ «КОД» — рядом с Controls, в режиме СТОРИ.
//
// До неё код жил только на вкладке Docs: смотришь на компонент — код в другом месте, и чтобы его
// увидеть, надо уйти со стори и найти её среди соседей. Панель убирает этот переход.
//
// Источник ОДИН и тот же, что у «Show code»: `parameters.code(args)` раздела. Второй генератор тут
// был бы худшим из возможных решений — два места, где пишется код примера, разъедутся в первый же
// день, и заметить это будет нечем.

const ADDON_ID = "crusade/code";
const PANEL_ID = `${ADDON_ID}/panel`;

function CodePanel({ active }: { active?: boolean }) {
  // Хуки обязаны вызываться до любого выхода — иначе React ругается на разное их число.
  const [code, setCode] = React.useState<string | null>(null);
  // Текст приходит ИЗ ПРЕВЬЮ: `parameters.code` — функция, а функции через канал не проходят.
  // Считать его тут было нечем, и панель сообщала «параметр не описан» при описанном параметре.
  useChannel({ "crusade/code": (c: string | null) => setCode(c) });
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
  return (
    <SyntaxHighlighter language="tsx" copyable bordered>
      {code}
    </SyntaxHighlighter>
  );
}

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "Код",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => <CodePanel active={active} />,
  });
});
