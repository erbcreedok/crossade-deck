// THE CATALOG'S OWN CHROME — and the line about what may live in it.
//
// The sidebar is the catalog itself: theme and language are settings of the whole
// documentation — sidebar, panels, docs pages and prose. They belong above the story tree,
// because that is the scope they govern.
//
// A setting of ONE canvas is not that. A page may hold several canvases, so a single switch
// up here would claim to speak for all of them; it stands on the canvas instead — see
// `devtools/sceneToolbar.ts`. Nothing of that kind is registered here.

import React, { useEffect, useState } from "react";
import { addons, types, useArgs, useChannel, useGlobals, useParameter, useStorybookApi } from "@storybook/manager-api";
import { IconButton, TooltipLinkList, WithTooltip } from "@storybook/components";
import { GlobeIcon, MoonIcon, SunIcon } from "@storybook/icons";
import { installTheme, s, t, type ThemeName } from "../src/index.js";
import { catalogText, LOCALES, type CatalogLocale, type CatalogText } from "./locales/catalog.js";
import { inspectorBodyStyle, inspectorMarkup } from "./devtools/inspectorPanel.js";
import { type InspectReport } from "./devtools/inspectorBus.js";
import { STORY_MISSING } from "storybook/internal/core-events";
import { GK_INSPECT } from "./inspectChannel.js";
import { storySource } from "./devtools/storySource.js";
import "./devtools/snippetValues.js";
import { pinTextSize } from "./devtools/textSize.js";
import { dark, light } from "./theme.js";

const ADDON_ID = "game-kit/viewer";

/**
 * A STALE MANAGER RELOADS ITSELF — on a phone, this is the difference between a catalog and a
 * screenshot of one.
 *
 * The manager is a single-page app. The PREVIEW follows every edit — Vite reloads the iframe —
 * and the story index arrives over the websocket, so on a desktop nothing looks wrong. A phone
 * backgrounds the tab, the socket dies, and when the reader comes back the page is restored
 * from memory: yesterday's panels, yesterday's list of stories, and no reason on screen to
 * suspect either. A story added hours ago is simply absent, and a panel keeps behaving the way
 * code that is no longer in the repository made it behave. The only cure was closing the
 * browser, which is not a cure, it is a guess that happened to work.
 *
 * Cache headers do not help: the dev server already answers `no-store`, and it is not being
 * asked. Nothing is fetched at all.
 *
 * So the manager checks its OWN scripts when the tab comes back, and reloads when one of them
 * has moved. Only against a dev server — a published catalog serves immutable hashed assets, so
 * the answer never changes and the request would be noise on every focus.
 */
function watchForAStaleSelf(): void {
  const host = globalThis.location?.hostname ?? "";
  const isDev = host === "localhost" || host === "127.0.0.1" || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (!isDev || typeof document === "undefined") return;

  // BOTH selectors. Storybook's manager page lists its bundles as `<link rel="modulepreload">`
  // and imports them from the runtime — there is not one `<script src>` on the page, so a check
  // that only looked for scripts found nothing to compare and never fired. It cost an hour, and
  // it was invisible: the code ran, took its measurements of an empty list, and agreed with
  // itself forever after.
  const scripts = [
    ...document.querySelectorAll<HTMLScriptElement>("script[src]"),
    ...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"][href], link[as="script"][href]'),
  ].map((el) => ("src" in el ? el.src : el.href));
  // Published so a browser test can see it. Watching NOTHING is the failure mode here — it
  // looks exactly like watching everything, and says so just as quietly.
  document.documentElement.dataset["gkWatched"] = String(scripts.length);
  // `last-modified` and the length together: a rebuild that lands within the same second still
  // changes the size, and a file whose size happens to match still moves in time.
  const stampOf = async (url: string): Promise<string> => {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return `${res.headers.get("last-modified") ?? ""}|${res.headers.get("content-length") ?? ""}`;
  };

  let booted: string[] | undefined;
  const read = (): Promise<string[]> => Promise.all(scripts.map((url) => stampOf(url).catch(() => "")));
  void read().then((stamps) => {
    booted = stamps;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !booted) return;
    void read().then((now) => {
      // Only when something actually moved. An unreachable server answers with empty stamps for
      // everything, and reloading into a dead server would replace a stale page with a broken
      // one — worse, and much harder to explain.
      const moved = now.some((stamp, i) => stamp && booted![i] && stamp !== booted![i]);
      if (moved) globalThis.location.reload();
    });
  });
}

/** Where a reader ends up when the name they asked for is gone. */
const LANDING = "start-introduction--docs";

/** The catalog chrome follows the theme; `create()` builds a full theme, so the merge is total. */
addons.setConfig({ theme: dark });

// THE KIT'S TOKENS, INSTALLED AT LOAD — not from inside a component.
//
// The manager is a second document, and the panels here are drawn with `s()` and `t()`, which
// are `var(--gk-…)` and nothing else. Installing the stylesheet from the settings component's
// effect meant installing it only once that component mounted — and on a phone the sidebar is
// CLOSED at load, so it never did: every size and colour in every panel resolved to an invalid
// value. That is why the Code panel's copy button sat in the top-left corner, outside its box:
// `right: var(--gk-space-m)` with nothing behind it is not a position at all.
//
// The switch still repaints from the component below; this is the floor under it.
// The type is pinned here for the same reason it is pinned in the preview, and it had to be
// said twice because the two are separate documents: the manager's panels were left to the
// phone's own idea of a readable size, and the Code panel — a monospace block in a narrow
// column, the exact shape the boost looks for — came up right and then doubled the first time
// anything re-laid it out.
if (typeof document !== "undefined") {
  installTheme(document, "dark");
  pinTextSize(document);
}

/** Read the pair of globals every control here shares. */
function useViewerGlobals(): [{ theme: ThemeName; locale: CatalogLocale; text: CatalogText }, (patch: object) => void] {
  const [globals, updateGlobals] = useGlobals();
  const locale = (globals["locale"] as CatalogLocale) ?? "en";
  return [
    {
      theme: (globals["theme"] as ThemeName) ?? "dark",
      locale,
      // The words come from the same bundles the preview reads, through the same port — the
      // manager is simply another document showing the same catalog.
      text: catalogText(locale),
    },
    updateGlobals,
  ];
}

/**
 * The catalog-wide pair. It sits above the story tree because that is what it governs: the
 * whole catalog, not the story currently open.
 */
const CatalogSettings: React.FC = () => {
  const [{ theme, locale, text }, update] = useViewerGlobals();
  const api = useStorybookApi();

  // The chrome repaints live rather than at build time — otherwise "light" would mean a
  // light picture inside a dark frame, which is not a theme, it is a mismatch.
  useEffect(() => {
    api.setOptions({ theme: theme === "light" ? light : dark });
    // The tree panel is drawn with the kit's own tokens, and it lives in THIS document —
    // so the manager needs the stylesheet too, not just the preview iframe.
    installTheme(document, theme);
  }, [api, theme]);

  return (
    // The header is a nowrap row shared with the brand, so these two stay narrow: the theme
    // shows its state as the icon, and only the locale needs two letters of text.
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 4px 2px" }}>
      <IconButton
        key="gk-theme"
        title={`${text.text("viewer.theme")}: ${text.text(
          theme === "dark" ? "viewer.theme.dark" : "viewer.theme.light",
        )}`}
        onClick={() => update({ theme: theme === "dark" ? "light" : "dark" })}
      >
        {theme === "dark" ? <MoonIcon /> : <SunIcon />}
      </IconButton>

      <WithTooltip
        placement="bottom"
        trigger="click"
        closeOnOutsideClick
        tooltip={({ onHide }: { onHide: () => void }) => (
          <TooltipLinkList
            links={LOCALES.map((l) => ({
              id: l,
              title: l.toUpperCase(),
              active: l === locale,
              onClick: () => {
                update({ locale: l });
                onHide();
              },
            }))}
          />
        )}
      >
        <IconButton key="gk-locale" title={text.text("viewer.locale")}>
          <GlobeIcon />
          <span style={{ marginLeft: 6, fontSize: 11 }}>{locale.toUpperCase()}</span>
        </IconButton>
      </WithTooltip>
    </div>
  );
};

/**
 * The node tree, in the panel next to Controls. It is not drawn beside the scene in story
 * mode on purpose: this section already resizes, docks to the side and hides, and a second
 * set of controls for the same job is how a reader learns to distrust both. A docs page has
 * no such section, and there the scene carries the tree itself.
 */
const NodeTreePanel: React.FC<{ active: boolean }> = ({ active }) => {
  const [{ text }] = useViewerGlobals();
  const api = useStorybookApi();
  // Reports are kept per scene, and a scene is named after its story: the panel shows the
  // story on screen, not whichever scene last spoke.
  const [reports, setReports] = useState<Record<string, InspectReport>>({});
  useChannel({
    [GK_INSPECT]: (next: InspectReport) => setReports((prev) => ({ ...prev, [next.sceneId]: next })),
  });

  if (!active) return null;
  const storyId = api.getUrlState().storyId;
  const nodes = (storyId ? reports[storyId] : undefined)?.nodes ?? [];
  return (
    <div
      style={{ height: "100%", overflow: "auto" }}
      dangerouslySetInnerHTML={{
        __html: `<div style="${inspectorBodyStyle()}">${inspectorMarkup(nodes, text)}</div>`,
      }}
    />
  );
};

/** What Storybook's own highlighter takes — the same block the docs page draws its source with. */
type HighlighterProps = {
  language: string;
  copyable?: boolean;
  padded?: boolean;
  format?: boolean;
  children: string;
};

/**
 * That highlighter, taken from the runtime rather than imported.
 *
 * The manager's bundler rewrites imports of `@storybook/components` into reads of a global, and
 * it does so from a CURATED LIST of names. `SyntaxHighlighter` is not on that list: the import
 * compiles to a bare identifier, and the panel dies on render with "SyntaxHighlighter is not
 * defined". It is on the global itself, which is where every other component in this file ends
 * up anyway — so it is read from there, at render time (the global is installed before addons
 * draw, not before this module loads).
 *
 * Absent, it is simply absent: the fallback below shows the same code without colour. A missing
 * highlighter must cost the colour, never the code.
 */
function highlighter(): React.FC<HighlighterProps> | undefined {
  const components = (globalThis as { __STORYBOOK_COMPONENTS__?: Record<string, unknown> })
    .__STORYBOOK_COMPONENTS__;
  return components?.["SyntaxHighlighter"] as React.FC<HighlighterProps> | undefined;
}

/**
 * The story's source, beside Controls — the same place a reader is already looking when they
 * ask "and how do I write this". In docs mode the block under the canvas answers that; in story
 * mode nothing did, and a live scene is exactly where the question is loudest.
 */
const CodePanel: React.FC<{ active: boolean }> = ({ active }) => {
  // READ, not listen. An event is delivered once, to whoever is already listening — and on a
  // phone this panel is behind a drawer, so it mounts long after the story announced itself and
  // hears nothing at all. The panel came up empty for exactly that reason. The manager keeps
  // the current story's parameters, so the snippet can simply be asked for.
  const docs = useParameter<{ source?: { originalSource?: string } }>("docs", {});
  // The arguments ON SCREEN, not the ones the file was written with. They are what lets a
  // catalog helper be printed as the value it currently produces — move a control and the
  // snippet moves with the picture, which is the promise the rest of this panel already makes.
  const [args] = useArgs();

  const [copied, setCopied] = useState(false);

  if (!active) return null;
  const code = storySource.transform(docs?.source?.originalSource ?? "", { args });
  const Highlighter = highlighter();
  if (Highlighter) {
    // Storybook's own block, the very one the docs page draws source with — so the snippet
    // reads the same in both modes rather than being a second implementation kept in step.
    return (
      // A GRID TRACK, not a plain box. The highlighter grows to its content and brings its own
      // scroller inside; wrapped in `height:100%; overflow:hidden` it simply overflowed and the
      // panel clipped it — twenty-eight lines of source with no way to reach line fifteen.
      //
      // `minmax(0, 1fr)` is what makes the child STOP at the panel's height: a grid item's
      // automatic minimum is its content, so without the explicit zero it refuses to shrink and
      // the track grows instead. Then the highlighter's own scroller does the work, and its copy
      // button — absolutely positioned inside it — stays pinned instead of sailing off the top.
      <div style={{ height: "100%", overflow: "hidden", display: "grid", gridTemplateRows: "minmax(0, 1fr)" }}>
        <Highlighter language="typescript" copyable format={false} padded>
          {code}
        </Highlighter>
      </div>
    );
  }

  return (
    // TWO boxes, and that is the whole point of the shape: the outer one does not scroll and
    // holds the button, the inner one scrolls and holds the code. As one box the button was
    // positioned against the scrolling content and sailed away with it — it looked pinned only
    // while nobody had scrolled yet.
    <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => setCopied(true));
        }}
        style={{
          position: "absolute",
          top: s("space.s"),
          right: s("space.m"),
          zIndex: 1,
          padding: `${s("space.xs")} ${s("space.s")}`,
          border: `1px solid ${t("panelBorder")}`,
          borderRadius: s("radius.s"),
          background: t("panelBg"),
          color: t("textMuted"),
          fontFamily: s("font.mono"),
          fontSize: s("font.size.s"),
          cursor: "pointer",
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
      <pre
        style={{
          margin: 0,
          height: "100%",
          overflow: "auto",
          padding: s("space.m"),
          color: t("text"),
          fontFamily: s("font.mono"),
          fontSize: s("font.size.m"),
          lineHeight: s("font.line.normal"),
          whiteSpace: "pre",
        }}
      >
        {code}
      </pre>
    </div>
  );
};

watchForAStaleSelf();

addons.register(ADDON_ID, (api) => {
  // A NAME THAT NO LONGER EXISTS MUST NOT BE A DEAD END.
  //
  // Storybook remembers the last story a reader had open — in localStorage, per browser. The
  // catalog on this address used to be a different one, so anybody who visited it before still
  // asks for a story from it, and gets an error page instead of the catalog. On a phone the
  // sidebar is collapsed, so that error page is a WHITE SCREEN with no way out and no hint —
  // and clearing the browser's data is not a thing a reader should have to know to do.
  //
  // The same happens to every link ever shared: renaming a story is normal, and a link that
  // dies quietly is worse than one that lands you somewhere sensible.
  // Explicitly the Introduction, not `selectFirstStory()`: that one picks the first STORY, and
  // the first story here is the empty scaffolding under a prose page — hidden from the sidebar
  // and unrenderable, so the reader would trade one error page for another. The landing page is
  // a deliberate choice anyway; `e2e.a-dead-link-lands-somewhere` pins it.
  api.on(STORY_MISSING, () => api.selectStory(LANDING));

  addons.add(`${ADDON_ID}/catalog`, {
    type: types.experimental_SIDEBAR_TOP,
    render: CatalogSettings,
  });

  addons.add(`${ADDON_ID}/node-tree`, {
    type: types.PANEL,
    title: "Node tree",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => <NodeTreePanel active={Boolean(active)} />,
  });

  addons.add(`${ADDON_ID}/code`, {
    type: types.PANEL,
    title: "Code",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => <CodePanel active={Boolean(active)} />,
  });
});



