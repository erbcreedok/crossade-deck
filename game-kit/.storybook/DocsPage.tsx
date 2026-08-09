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
import { Canvas, Controls, DocsContext, Markdown, Subheading, Title } from "@storybook/blocks";
import { ThemeProvider, ensure } from "@storybook/theming";
import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { s, t, type ThemeName } from "../src/index.js";
import { catalogText, type CatalogLocale, type CatalogText } from "./locales/catalog.js";
import { loadedPage, loadPage, pageOf, type PageKey, type PageText } from "./locales/pages.js";
import { type InspectReport } from "./devtools/inspectorBus.js";
import { inspectorMarkup } from "./devtools/inspectorPanel.js";
import { inspectorOpen, inspectorTab, setInspectorOpen, setInspectorTab, type PanelTab } from "./devtools/inspectorPrefs.js";
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
/* By ELEMENT as well as by class. Storybook's own blocks carry sbdocs-h2 and friends, but a
   heading written as ## in the prose comes out of Markdown as a bare h2 — and a bare one is
   coloured by the default docs theme, which is LIGHT. On the dark theme that reads as almost
   nothing: the section titles were there and unreadable, while the paragraphs beside them
   were fine, because paragraphs already had a rule of their own.
   (No backticks in here: this whole block is a template literal.) */
.sbdocs-content h1,.sbdocs-content h2,.sbdocs-content h3,.sbdocs-content h4{color:${t("text")}}
.sbdocs-h2,.sbdocs-h3,.sbdocs-content h2,.sbdocs-content h3{border-bottom-color:${t("panelBorder")}}
.sbdocs-content code,.sbdocs-content :not(pre)>code{background:${t("sunkBg")};color:${t("text")};border-color:${t("panelBorder")}}
/* A phone is ~390px wide: a code span that will not break is a sentence with its end cut
   off. Prose code wraps; a source listing keeps its lines and scrolls instead. */
.sbdocs-content :not(pre)>code{white-space:pre-wrap;overflow-wrap:anywhere}
.docblock-source{overflow-x:auto}
/* The controls table is four columns and a phone is ~390px: without this it does not shrink,
   it WIDENS THE PAGE, and then the whole document scrolls sideways — prose, canvas and code
   all pushed off-screen by a table three blocks below them. Wide content scrolls inside its
   own box; the page itself never does. */
[data-story-controls]{overflow-x:auto;-webkit-overflow-scrolling:touch}
/* The tree used to need a rule of its own here, because the docs sheet restyles markup by tag
   and an inherited font loses to that. The card it lives in now carries the sb-unstyled class,
   Storybook's own opt-out, so the whole subtree is out of that sheet's reach and inherits what
   its container sets. One word beat a rule per element.
   (Still no backticks in this block: it is a template literal.) */
.sbdocs-content a{color:${t("accent")}}
/* A TABLE IN THE PROSE. Storybook's docs sheet paints every second row from its own LIGHT theme,
   so on the dark catalog a table came out as white bands with dark text on the odd rows and dark
   text on white on the even ones — half of it unreadable, and the half that was readable looked
   like a mistake. Nothing above reached it: the paragraph rules colour text, not backgrounds.
   Zebra striping is kept, in our own sunk token, because a four-column table needs it.
   display:block with width:max-content is what makes a wide table scroll INSIDE ITS OWN BOX
   rather than widen the document — the same rule the controls table needed, for the same reason:
   a phone is ~390px and a table three blocks down must not push the prose off-screen.
   (Still a template literal: no backticks in here, not even around a property name.) */
.sbdocs-content table{display:block;width:max-content;max-width:100%;overflow-x:auto;background:transparent;border-color:${t("panelBorder")}}
.sbdocs-content table tr{background:transparent;border-color:${t("panelBorder")}}
.sbdocs-content table tr:nth-of-type(2n){background:${t("sunkBg")}}
/* The colour is repeated HERE, not left to the paragraph rule above: the docs sheet colours cells
   with a table-scoped selector, which outranks the plain one, so the cells came out dimmer than
   the prose beside them — legible enough to miss, faint enough to look like a rendering fault. */
.sbdocs-content table th,.sbdocs-content table td{border-color:${t("panelBorder")};background:transparent;color:${t("text")}}
.sbdocs-content table th{color:${t("textMuted")}}
/* The table of contents lives OUTSIDE .sbdocs-content, so none of the rules above reach it:
   inactive entries were near-black on the dark theme, and the active one was a hardcoded blue
   that is not our accent. It is styled by a sheet we do not own and cannot outrank by
   specificity, so this is the one place !important is the honest tool rather than a shortcut —
   a heavier selector here would only be a disguise for the same override. */
.toc-list .toc-link{color:${t("textMuted")} !important}
.toc-list .toc-link:hover{color:${t("text")} !important}
.toc-list .toc-link.is-active-link{color:${t("accent")} !important}
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

/** A tab head: the current view is stated, the other is offered. */
const Tab: React.FC<{ label: string; active: boolean; onPick: () => void }> = ({ label, active, onPick }) => (
  <span
    role="tab"
    aria-selected={active}
    onClick={(e) => {
      // The head sits inside the fold button, so a tab click must not also fold the card —
      // picking a view and hiding it are opposite intentions.
      e.stopPropagation();
      onPick();
    }}
    style={{
      color: active ? t("text") : t("textFaint"),
      borderBottom: `2px solid ${active ? t("accent") : "transparent"}`,
      paddingBottom: 2,
      cursor: "pointer",
      // A tab head is one word to the eye. Left to wrap it breaks mid-label — "node tree · 1"
      // over "node" — and the underline then belongs to half a name. If the row runs out of
      // room it breaks BETWEEN tabs instead.
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </span>
);

/**
 * The block under the canvas: one card, two VIEWS of the same story — the tree it built, and
 * the arguments that built it. Tabs rather than two cards, and one hide/show between them,
 * because that is what they are: two ways of looking at one scene, exactly as they appear in
 * story mode as two tabs of one panel.
 *
 * Controls exist here at all because a docs page has no panel section: story mode gives a
 * reader knobs and no prose, docs gave prose and no knobs, and the page a reader actually
 * learns from is the one with both.
 */
const StoryPanels: React.FC<{
  report: InspectReport | undefined;
  text: CatalogText;
  story: { moduleExport: unknown };
}> = ({ report, text, story }) => {
  const [open, setOpen] = useState(inspectorOpen);
  const [tab, setTab] = useState<PanelTab>(inspectorTab);
  const toggle = (): void => {
    setOpen((was) => {
      setInspectorOpen(!was);
      return !was;
    });
  };
  const pick = (next: PanelTab): void => {
    setInspectorTab(next);
    setTab(next);
    // Picking a view is asking to see it: a tab that silently switches a folded card is a
    // click that appears to do nothing.
    if (!open) {
      setInspectorOpen(true);
      setOpen(true);
    }
  };
  const count = report?.nodes.length ?? 0;

  return (
    <div
      // `sb-unstyled` is Storybook's own opt-out from the docs typography, and this card needs
      // it. That stylesheet restyles every element inside a docs page by tag — `& :where(span:
      // not(.sb-anchor, .sb-unstyled, .sb-unstyled span))` and a rule per tag — so it beats
      // anything a parent merely passes down: the tab heads came out in the docs body font at
      // 16px while the button around them said mono 11px. Marking the card takes the whole
      // subtree out of reach in one word, instead of a rule per element that goes wrong.
      className="sb-unstyled"
      // A card in its own right, not a flap under the canvas. It no longer hugs the block
      // above by a negative margin: with the source open there is a listing between the two,
      // and the pull would drag the tree over its last line.
      style={{
        border: `1px solid ${t("panelBorder")}`,
        borderRadius: s("radius.m"),
        background: t("panelBg"),
        margin: `0 0 ${s("space.xl")}`,
      }}
    >
      <button
        type="button"
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          // On a 390px phone the row is ~9px short of fitting, and without this the tabs are
          // the side that gives: the strip squeezes and breaks between the two names. Wrapping
          // moves the right-hand cluster to its own line instead — two tidy rows rather than
          // one crushed one.
          flexWrap: "wrap",
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
        <span role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: s("space.m") }}>
          <Tab label={text.text("inspector.title")} active={tab === "tree"} onPick={() => pick("tree")} />
          <Tab label={text.text("panels.controls")} active={tab === "controls"} onPick={() => pick("controls")} />
        </span>
        {/* The count describes the TREE, not the tab strip. Inside the head it made the label
            "node tree · 1 node" — long enough to wrap the row on a 390px phone, and a tab that
            breaks mid-name takes its underline with it. Out here it also disappears when the
            other view is showing, which is the truth: it counts nothing on that one. */}
        <span style={{ display: "flex", gap: s("space.m"), whiteSpace: "nowrap" }}>
          {tab === "tree" ? <span>{text.plural("inspector.nodes", count)}</span> : null}
          <span style={{ color: t("accent") }}>{text.text(open ? "inspector.hide" : "inspector.show")}</span>
        </span>
      </button>
      {open && tab === "tree" ? (
        <div
          data-inspector-tree=""
          style={{
            color: t("text"),
            padding: `0 ${s("space.l")} ${s("space.l")}`,
            overflowX: "auto",
            // Stated here, not inherited. Opting the card out of the docs typography also opts
            // it out of the page's base font, and what is left is the browser default — the
            // tree came back in Times at 16px. Off that sheet, the type is ours to set.
            fontFamily: s("font.mono"),
            fontSize: s("font.size.m"),
            lineHeight: s("font.line.normal"),
          }}
          // The tab above already counts the nodes, so the markup's own header would say it
          // twice; the block starts at the first node.
          dangerouslySetInnerHTML={{ __html: stripHeader(inspectorMarkup(report?.nodes ?? [], text)) }}
        />
      ) : null}
      {open && tab === "controls" ? (
        <div data-story-controls="" style={{ padding: `0 ${s("space.l")} ${s("space.l")}` }}>
          <Controls of={story.moduleExport} />
        </div>
      ) : null}
    </div>
  );
};

/**
 * A story names its page (`gkDoc: "root.component"`); the bundles keep every page under
 * `docs.` so prose and captions cannot collide in one flat namespace.
 */
function docKey(param: unknown): PageKey | undefined {
  return typeof param === "string" ? (`docs.${param}` as PageKey) : undefined;
}

/**
 * This page's prose, fetched when the page opens and again when the language changes. Until it
 * arrives the page renders its chrome and no prose — a blank paragraph for a moment, rather
 * than the previous language's text sitting under the new one's headings.
 */
function usePageText(key: PageKey | undefined, chrome: CatalogText): PageText | undefined {
  const page = key ? pageOf(key) : undefined;
  const locale = chrome.locale;
  const [text, setText] = useState<PageText | undefined>(() => (page ? loadedPage(page, locale) : undefined));

  useEffect(() => {
    if (!page) return;
    let live = true;
    // Straight from the cache when it is there: an already-loaded page must not blink through
    // an empty frame on every re-render.
    setText(loadedPage(page, locale));
    void loadPage(page, locale).then((loaded) => {
      if (live) setText(loaded);
    });
    return () => {
      live = false;
    };
  }, [page, locale]);

  return text;
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
  // A PROSE page — an introduction, a walkthrough — has no scene to show. It still needs a
  // story underneath it, because a docs entry without one does not exist as far as Storybook
  // is concerned; the flag is what keeps that scaffolding from showing through as an empty
  // canvas and a tree of one nameless node.
  const proseOnly = params["gkProse"] === true;
  // Every block on a page reads from ONE object — the page's own words with the chrome behind
  // them. Two objects is how a heading ends up a language ahead of the paragraph under it.
  const prose = usePageText(componentKey, text);

  return (
    <ThemeProvider theme={ensure(theme === "light" ? light : dark)}>
      <style>{PAGE_CHROME}</style>
      <Title />
      {componentKey && prose ? <Markdown>{prose.text(componentKey)}</Markdown> : null}

      {proseOnly ? null : stories.map((story) => {
        const storyKey = docKey(ctx.getStoryContext(story).parameters["gkDocStory"]);
        return (
          <React.Fragment key={story.id}>
            <Subheading>{story.name}</Subheading>
            {storyKey && prose ? <Markdown>{prose.text(storyKey)}</Markdown> : null}
            {/* No `Unstyled` around the canvas: it strips the docs typography from the
                block's own chrome too, and "Show code" then inherits the page's base size —
                which on a phone came out roughly twice as tall as the prose. The scene sets
                its fonts on its own elements, so it needs no protection here. */}
            {/* Open, not behind a "Show code" link. The catalog IS the documentation, and the
                code is the half a reader came for — folded away it reads as absent, which is
                exactly how it read. */}
            <Canvas of={story.moduleExport} sourceState="shown" />
            <StoryPanels report={reports[story.id]} text={text} story={story} />
          </React.Fragment>
        );
      })}
    </ThemeProvider>
  );
};
