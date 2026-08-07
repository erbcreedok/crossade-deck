// THE DOCS PAGE, assembled by hand.
//
// The stock autodocs page reads its prose from `parameters.docs.description`, which is baked
// into the story index when the catalog is built. That text can never follow a language
// switch — so a page built that way makes the switch half-work, and half-working is the one
// outcome that teaches you to distrust the control.
//
// Here the page takes a KEY from the story and resolves it at render time, exactly like every
// other caption in the kit. The layout is the familiar one — title, prose, then each story
// with its canvas — plus one block the stock page has no idea about: the node tree, which on
// a docs page has nowhere else to go (the panel next to Controls only exists in story mode).

import React, { useContext, useEffect, useMemo, useState } from "react";
import { Canvas, DocsContext, Markdown, Subheading, Title } from "@storybook/blocks";
import { ThemeProvider, ensure } from "@storybook/theming";
import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { s, t, type ThemeName } from "../src/index.js";
import { catalogText, type CatalogKey, type CatalogLocale, type CatalogText } from "./locales/catalog.js";
import { type InspectReport } from "./devtools/inspectorBus.js";
import { inspectorMarkup } from "./devtools/inspectorPanel.js";
import { inspectorOpen, setInspectorOpen } from "./devtools/inspectorPrefs.js";
import { GK_INSPECT } from "./inspectChannel.js";
import { dark, light } from "./theme.js";

// The page CHROME — the wrapper, the headings, the inline code — is styled by a global sheet
// the docs container writes once from a static theme, so a ThemeProvider inside the page
// cannot reach it and the page would stay white under a dark catalog. These rules take it
// back with our tokens, which means they follow the switch on their own: the token values
// flip on the `data-gk-theme` attribute, with no JavaScript in the path.
const PAGE_CHROME = `
.sbdocs-wrapper{background:${t("stageBg")};padding-top:${s("space.xl")}}
.sbdocs-content{color:${t("text")}}
.sbdocs-content p,.sbdocs-content li,.sbdocs-content td,.sbdocs-content th{color:${t("text")}}
.sbdocs-title,.sbdocs-h1,.sbdocs-h2,.sbdocs-h3,.sbdocs-content strong{color:${t("text")}}
.sbdocs-h2,.sbdocs-h3{border-bottom-color:${t("panelBorder")}}
.sbdocs-content code,.sbdocs-content :not(pre)>code{background:${t("sunkBg")};color:${t("text")};border-color:${t("panelBorder")}}
/* A phone is ~390px wide: a code span that will not break is a sentence with its end cut
   off. Prose code wraps; a source listing keeps its lines and scrolls instead. */
.sbdocs-content :not(pre)>code{white-space:pre-wrap;overflow-wrap:anywhere}
.docblock-source{overflow-x:auto}
/* The tree is raw markup dropped into the docs column, and an inherited font is the weakest
   thing in CSS: any rule the docs sheet has for a descendant element beats it. Hence a rule
   of our own, specific enough to win — inline sizes inside the markup still beat this one. */
.sbdocs-content [data-inspector-tree],.sbdocs-content [data-inspector-tree] *{font-family:${s("font.mono")};font-size:${s("font.size.m")};line-height:${s("font.line.normal")}}
.sbdocs-content a{color:${t("accent")}}
`;

/** The current viewer globals, seeded from the story context and kept live over the channel. */
function useViewerGlobals(): { text: CatalogText; theme: ThemeName } {
  const ctx = useContext(DocsContext);
  const seed = useMemo(() => {
    const first = ctx.componentStories()[0];
    return first ? ctx.getStoryContext(first).globals : {};
  }, [ctx]);
  const [globals, setGlobals] = useState<Record<string, unknown>>(seed);

  useEffect(() => {
    const handler = ({ globals: next }: { globals: Record<string, unknown> }): void => setGlobals(next);
    ctx.channel.on(GLOBALS_UPDATED, handler);
    return () => {
      ctx.channel.off(GLOBALS_UPDATED, handler);
    };
  }, [ctx]);

  return {
    text: catalogText((globals["locale"] as CatalogLocale) ?? "en"),
    theme: (globals["theme"] as ThemeName) ?? "dark",
  };
}

/** Every live scene on this page, by the story it belongs to. */
function useReports(): Record<string, InspectReport> {
  const ctx = useContext(DocsContext);
  const [reports, setReports] = useState<Record<string, InspectReport>>({});
  useEffect(() => {
    const handler = (report: InspectReport): void =>
      setReports((prev) => ({ ...prev, [report.sceneId]: report }));
    ctx.channel.on(GK_INSPECT, handler);
    return () => {
      ctx.channel.off(GK_INSPECT, handler);
    };
  }, [ctx]);
  return reports;
}

/**
 * The tree as a block of its own, under the canvas rather than inside it. It folds like
 * "Show code" next to it, and starts open: in this slice the tree is the only thing a scene
 * has to show, and a page that opens with it folded reads as a page with nothing in it.
 */
const NodeTree: React.FC<{ report: InspectReport | undefined; text: CatalogText }> = ({ report, text }) => {
  const [open, setOpen] = useState(inspectorOpen);
  const toggle = (): void => {
    setOpen((was) => {
      setInspectorOpen(!was);
      return !was;
    });
  };
  const count = report?.nodes.length ?? 0;

  return (
    <div
      // A card in its own right, not a flap under the canvas: the canvas block keeps a
      // margin below it, so a box with no top edge read as one that had come loose.
      style={{
        border: `1px solid ${t("panelBorder")}`,
        borderRadius: s("radius.m"),
        background: t("panelBg"),
        margin: `calc(-1 * ${s("space.l")}) 0 ${s("space.xl")}`,
      }}
    >
      <button
        type="button"
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: s("space.s"),
          width: "100%",
          padding: `${s("space.s")} ${s("space.l")}`,
          border: "none",
          background: "none",
          color: t("textMuted"),
          // Longhands, never the `font` shorthand: assembled from custom properties it is
          // not reliably applied through the style object, and it fails SILENTLY — the row
          // then inherits the page type and towers over the "Show code" label beside it.
          fontFamily: s("font.mono"),
          fontSize: s("font.size.s"),
          fontWeight: 700,
          lineHeight: s("font.line.normal"),
          letterSpacing: ".6px",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        <span>
          {text.text("inspector.title")} · {text.plural("inspector.nodes", count)}
        </span>
        <span style={{ color: t("accent") }}>{text.text(open ? "inspector.hide" : "inspector.show")}</span>
      </button>
      {open ? (
        <div
          data-inspector-tree=""
          style={{
            color: t("text"),
            padding: `0 ${s("space.l")} ${s("space.l")}`,
            overflowX: "auto",
          }}
          // The heading above already counts the nodes, so the markup's own header would say
          // it twice; the block starts at the first node.
          dangerouslySetInnerHTML={{ __html: stripHeader(inspectorMarkup(report?.nodes ?? [], text)) }}
        />
      ) : null}
    </div>
  );
};

/**
 * A story names its page (`gkDoc: "root.component"`); the bundles keep every page under
 * `docs.` so prose and captions cannot collide in one flat namespace.
 */
function docKey(param: unknown): CatalogKey | undefined {
  return typeof param === "string" ? (`docs.${param}` as CatalogKey) : undefined;
}

function stripHeader(html: string): string {
  const firstNode = html.indexOf("<div style=\"margin-left:");
  return firstNode < 0 ? "" : html.slice(firstNode);
}

export const DocsPage: React.FC = () => {
  const ctx = useContext(DocsContext);
  const { text, theme } = useViewerGlobals();
  const reports = useReports();
  const stories = ctx.componentStories();

  // Keys, not text: a page without one is a page someone forgot to write, and rendering
  // nothing is how that stays invisible until a reader hits it.
  const params = stories[0] ? ctx.getStoryContext(stories[0]).parameters : {};
  const componentKey = docKey(params["gkDoc"]);

  return (
    <ThemeProvider theme={ensure(theme === "light" ? light : dark)}>
      <style>{PAGE_CHROME}</style>
      <Title />
      {componentKey ? <Markdown>{text.text(componentKey)}</Markdown> : null}

      {stories.map((story) => {
        const storyKey = docKey(ctx.getStoryContext(story).parameters["gkDocStory"]);
        return (
          <React.Fragment key={story.id}>
            <Subheading>{story.name}</Subheading>
            {storyKey ? <Markdown>{text.text(storyKey)}</Markdown> : null}
            {/* No `Unstyled` around the canvas: it strips the docs typography from the
                block's own chrome too, and "Show code" then inherits the page's base size —
                which on a phone came out roughly twice as tall as the prose. The scene sets
                its fonts on its own elements, so it needs no protection here. */}
            <Canvas of={story.moduleExport} />
            <NodeTree report={reports[story.id]} text={text} />
          </React.Fragment>
        );
      })}
    </ThemeProvider>
  );
};
