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
import { addons, types, useChannel, useGlobals, useStorybookApi } from "@storybook/manager-api";
import { IconButton, TooltipLinkList, WithTooltip } from "@storybook/components";
import { GlobeIcon, MoonIcon, SunIcon } from "@storybook/icons";
import { installTheme, type ThemeName } from "../src/index.js";
import { catalogText, LOCALES, type CatalogLocale, type CatalogText } from "./locales/catalog.js";
import { inspectorBodyStyle, inspectorMarkup } from "./devtools/inspectorPanel.js";
import { type InspectReport } from "./devtools/inspectorBus.js";
import { STORY_MISSING } from "storybook/internal/core-events";
import { GK_INSPECT } from "./inspectChannel.js";
import { dark, light } from "./theme.js";

const ADDON_ID = "game-kit/viewer";

/** The catalog chrome follows the theme; `create()` builds a full theme, so the merge is total. */
addons.setConfig({ theme: dark });

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
  api.on(STORY_MISSING, () => api.selectFirstStory());

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
});
