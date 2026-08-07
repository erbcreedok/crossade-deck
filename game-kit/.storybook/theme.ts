import { create } from "@storybook/theming";
import { PALETTES, SCALE } from "../src/index.js";

// The catalog chrome reads the KIT's palette. A separate set of colours here would be a
// second theme to keep in step, and it would drift by the second story.
const p = PALETTES.dark;

export const dark = create({
  base: "dark",
  brandTitle: "game-kit",
  brandTarget: "_self",

  colorPrimary: p.accent,
  colorSecondary: p.accent, // ONE gold: the canon forbids a second accent

  appBg: p.stageBg,
  appContentBg: p.panelBg,
  appPreviewBg: p.stageBg,
  appBorderColor: p.panelBorder,
  appBorderRadius: 8,

  textColor: p.text,
  textInverseColor: p.stageBg,
  textMutedColor: p.textMuted,

  barTextColor: p.textMuted,
  barSelectedColor: p.accent,
  barHoverColor: p.accent,
  barBg: p.panelBg,

  buttonBg: p.panelBg,
  buttonBorder: p.panelBorder,
  booleanBg: p.sunkBg,
  booleanSelectedBg: p.accent,

  inputBg: p.sunkBg,
  inputBorder: p.panelBorder,
  inputTextColor: p.text,
  inputBorderRadius: 6,

  fontBase: SCALE["font.sans"],
  fontCode: SCALE["font.mono"],
});

export const light = create({
  base: "light",
  brandTitle: "game-kit",
  brandTarget: "_self",
  colorPrimary: PALETTES.light.accent,
  colorSecondary: PALETTES.light.accent,
  appBg: PALETTES.light.stageBg,
  appContentBg: PALETTES.light.panelBg,
  appPreviewBg: PALETTES.light.stageBg,
  appBorderColor: PALETTES.light.panelBorder,
  appBorderRadius: 8,
  textColor: PALETTES.light.text,
  textMutedColor: PALETTES.light.textMuted,
  barBg: PALETTES.light.panelBg,
  barTextColor: PALETTES.light.textMuted,
  barSelectedColor: PALETTES.light.accent,
  inputBg: PALETTES.light.panelBg,
  inputBorder: PALETTES.light.panelBorder,
  fontBase: SCALE["font.sans"],
  fontCode: SCALE["font.mono"],
});
