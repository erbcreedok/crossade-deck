import { useContext } from "react";
import { Controls, Description, DocsContext, Primary, Source, Subtitle, Title } from "@storybook/addon-docs/blocks";

// Исходники файлов стори целиком — Vite подставляет их на сборке (?raw), сеть тут ни при чём.
// Нужны потому, что у стори, которая берёт render у meta (`export const X: Story = {}`), СВОЕГО
// кода нет вовсе: в блоке Source стоит честный, но бесполезный `{}`. Настоящий код такой стори —
// в meta её файла, и показать надо файл.
const FILES = import.meta.glob("../src/stories/**/*.stories.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Путь из индекса сторибука («./src/stories/kit/X.stories.tsx») → ключ glob'а («../src/…»). */
function fileSource(importPath: string | undefined): string | null {
  if (!importPath) return null;
  const tail = importPath.replace(/^\.\//, "");
  const key = Object.keys(FILES).find((k) => k.endsWith(tail));
  return key ? FILES[key]! : null;
}

// Страница документации КАТАЛОГА — своя, а не штатная.
//
// Зачем понадобилась. Владельцу нужно видеть ИСХОДНИК стори: по картинке непонятно, как приём
// повторить у себя. Штатный способ — вкладка Docs, но её стандартная страница заканчивается блоком
// <Stories/>, а он монтирует КАЖДУЮ стори раздела живым канвасом. У нас канвас один на весь
// сторибук (пул витрин, см. docs/HANDOFF.md): десяток разделов — десяток контекстов, потолок
// браузера ~16, и чернеет всё разом. Поэтому autodocs и был выключен.
//
// Здесь <Stories/> заменён на список ОДНИХ ИСХОДНИКОВ. Живой пример остаётся ровно один —
// <Primary/> сверху, — а код показан у всех стори раздела. Канвасов по-прежнему один.
//
// Если однажды захочется живых примеров под каждой стори, дешёвого пути нет: понадобится заглушка
// «оживить по клику» с лимитом в один активный канвас. Пока цена не оправдана — код читают чаще,
// чем крутят десятую стори раздела.
export function DocsPage() {
  const { componentStories } = useContext(DocsContext);
  const stories = componentStories();
  const file = fileSource(stories[0]?.parameters?.fileName as string | undefined);

  return (
    <>
      <Title />
      <Subtitle />
      <Description of="meta" />

      {/* Единственный живой канвас на странице. */}
      <Primary />
      <Controls />

      <h2 className="sbdocs sbdocs-h2">Исходники</h2>
      <p className="sbdocs sbdocs-p">
        Код каждой стори раздела. Живой пример выше — один: канвас в каталоге общий, и поднимать его
        копию под каждой стори нельзя.
      </p>

      {file ? (
        <details className="sbdocs">
          <summary className="sbdocs sbdocs-p" style={{ cursor: "pointer" }}>
            Весь файл раздела целиком — с общим <code>meta</code> и его <code>render</code>
          </summary>
          <p className="sbdocs sbdocs-p">
            У стори вида <code>export const X: Story = {"{}"}</code> своего кода нет: она берёт
            <code> render</code> у <code>meta</code>. В её блоке ниже будет честный, но бесполезный{" "}
            <code>{"{}"}</code> — смотреть надо сюда.
          </p>
          <Source code={file} language="tsx" />
        </details>
      ) : null}

      {stories.map((story) => (
        <section key={story.id}>
          <h3 className="sbdocs sbdocs-h3">{story.name}</h3>
          <Description of={story.moduleExport} />
          <Source of={story.moduleExport} />
        </section>
      ))}
    </>
  );
}
