/**
 * Design tokens — the single source of truth for color, type, and spacing.
 * Values transcribed from docs/04_UIUX_SPEC.md §1. Hardcoding a color or a
 * spacing number anywhere else is a review-blocking rule.
 */

export type ColorScheme = 'light' | 'dark';

/**
 * `danger` is reserved exclusively for allergen warnings — not validation
 * errors, not destructive buttons. If red always means "this could hurt you,"
 * red keeps meaning it.
 */
export const palette = {
  light: {
    bg: '#FFF8EF',
    surface: '#FFFFFF',
    surfaceAlt: '#F6EBDD',
    text: '#251B16',
    textMuted: '#706158',
    accent: '#247148',
    accentText: '#FFFFFF',
    ready: '#34745A',
    near: '#A45F0A',
    far: '#81736A',
    danger: '#B93832',
    border: '#E8D6C5',
  },
  dark: {
    bg: '#17110E',
    surface: '#241B17',
    surfaceAlt: '#30231D',
    text: '#FFF7EE',
    textMuted: '#B9A89C',
    accent: '#58BD86',
    accentText: '#102A1C',
    ready: '#69BD91',
    near: '#E7A44B',
    far: '#B1A096',
    danger: '#FF7A73',
    border: '#49362C',
  },
} as const;

export type ColorToken = keyof (typeof palette)['light'];

/**
 * The palette widened to `string`. `palette` is `as const` so that ColorToken
 * can be derived from it, but that also gives every value a literal type —
 * which makes the light and dark palettes mutually unassignable and breaks any
 * code that picks one at runtime.
 */
export type Palette = { readonly [K in ColorToken]: string };

/** System font stack only — a custom font costs bundle size and a layout shift. */
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
  /** Cook mode only — readable from arm's length across a counter. */
  cookStep: { fontSize: 28, lineHeight: 38, fontWeight: '500' },
} as const;

/** 4pt base scale. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 20, full: 999 } as const;

/**
 * Elevation (spec §1.3): `sm` for cards, `lg` for sheets.
 *
 * Dark mode is deliberately flat — a shadow on a near-black surface reads as
 * mud, so depth there comes from `border` instead. `elevation` is the Android
 * channel; the `shadow*` keys are iOS and web. Both are set because React
 * Native honours different ones per platform.
 */
export interface ElevationStyle {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  /** The Android channel; the shadow* keys cover iOS and web. */
  elevation: number;
}

export interface ElevationSet {
  sm: ElevationStyle;
  lg: ElevationStyle;
}

export const shadow: Record<ColorScheme, ElevationSet> = {
  light: {
    sm: {
      shadowColor: '#251B16',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    lg: {
      shadowColor: '#251B16',
      shadowOpacity: 0.12,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  },
  dark: {
    sm: {
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    lg: {
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
  },
};

/**
 * Native and phone-sized web viewports use the compact phone composition.
 * Wide web viewports use a centered workspace capped at this width so content
 * can breathe without becoming difficult to scan.
 */
export const layout = {
  mobileViewportMaxWidth: 430,
  tabletBreakpoint: 640,
  desktopBreakpoint: 960,
  desktopMaxWidth: 1600,
  desktopGutter: 32,
  desktopColumnGap: 24,
} as const;

/**
 * Minimum touch targets in pt. Cook mode is oversized deliberately — it is
 * operated with a knuckle or the back of a hand.
 */
export const touchTarget = { standard: 44, cookMode: 64, primaryCtaHeight: 56 } as const;
