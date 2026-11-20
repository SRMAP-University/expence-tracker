import '@/global.css';

import { readAppearancePref, resolveScheme } from '@/lib/appearance';

/**
 * Two themes on one structure: a pale mint canvas (light) or a deep green-black one (dark), with
 * forest feature cards and lime accents in both. Text on a surface always uses the matching ink
 * token: `text` on the canvas and cards, `onForest` on forest, `onLime` on lime, `onPaper` on paper.
 *
 * The theme is picked once, as the app starts (styles are created when their modules load), from
 * the user's choice or the phone's dark mode. Changing it restarts the app.
 */
const LIGHT = {
  // Canvas and surfaces
  background: '#EEF4EC',
  card: '#FFFFFF',
  cardMuted: '#F1F6EF',
  border: '#E0E9DF',
  backdropTop: '#DDEADC',
  backdropMid: '#F5F9F3',
  backdropBottom: '#E6F0E3',
  arcStrong: 'rgba(255,255,255,0.5)',
  arcSoft: 'rgba(255,255,255,0.28)',
  /** Dims the page behind a drawer. */
  shade: 'rgba(6, 30, 26, 0.42)',
  grabber: 'rgba(11, 43, 38, 0.18)',

  // Ink
  text: '#0B2B26',
  textSecondary: '#586B65',
  textTertiary: '#98A8A2',
  /** Links, icons and highlights on the canvas and cards. */
  accent: '#0B3A33',

  // Feature surfaces
  forest: '#0B3A33',
  forestRaised: '#15493F',
  onForest: '#FFFFFF',
  onForestMuted: 'rgba(255,255,255,0.64)',
  onForestLine: 'rgba(255,255,255,0.24)',
  /** A light surface that sits on forest (the tab bar's bubble, buttons on a forest card). */
  paper: '#FFFFFF',
  onPaper: '#0B3A33',
  lime: '#C6EA9C',
  limeSoft: '#E3F3CF',
  limeDeep: '#A3D36F',
  onLime: '#0B2B26',
  onLimeMuted: 'rgba(11,43,38,0.68)',

  // Status
  negative: '#B5382E',
  negativeSoft: '#FBE6E2',
  warning: '#8A5A00',
  warningSoft: '#FBEFD3',

  // Chart
  dot: '#DCE6DB',
} as const;

type Palette = { [K in keyof typeof LIGHT]: string };

const DARK: Palette = {
  background: '#0B1412',
  card: '#15211E',
  cardMuted: '#1C2A26',
  border: '#26362F',
  backdropTop: '#0F1C19',
  backdropMid: '#0B1412',
  backdropBottom: '#0E1916',
  arcStrong: 'rgba(198,234,156,0.045)',
  arcSoft: 'rgba(198,234,156,0.025)',
  shade: 'rgba(0, 0, 0, 0.6)',
  grabber: 'rgba(255, 255, 255, 0.22)',

  text: '#E8F1EC',
  textSecondary: '#A2B5AD',
  textTertiary: '#6D827A',
  accent: '#C6EA9C',

  forest: '#1A5247',
  forestRaised: '#246356',
  onForest: '#FFFFFF',
  onForestMuted: 'rgba(255,255,255,0.66)',
  onForestLine: 'rgba(255,255,255,0.22)',
  paper: '#E8F1EC',
  onPaper: '#0B3A33',
  lime: '#C6EA9C',
  limeSoft: '#23331E',
  limeDeep: '#A3D36F',
  onLime: '#0B2B26',
  onLimeMuted: 'rgba(11,43,38,0.68)',

  negative: '#FF8E7E',
  negativeSoft: '#3A211D',
  warning: '#F0BA5A',
  warningSoft: '#342A15',

  dot: '#26362F',
};

export const appearancePref = readAppearancePref();
export const colorScheme = resolveScheme(appearancePref);
export const isDark = colorScheme === 'dark';

export const Colors: Palette = isDark ? DARK : LIGHT;

export type ThemeColor = keyof Palette;

/** Urbanist, loaded in the root layout. Custom fonts need one family per weight in React Native. */
export const Font = {
  regular: 'Urbanist_400Regular',
  medium: 'Urbanist_500Medium',
  semibold: 'Urbanist_600SemiBold',
  bold: 'Urbanist_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const Shadow = isDark
  ? ({
      card: { boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.28)' },
      float: { boxShadow: '0px 12px 28px rgba(0, 0, 0, 0.45)' },
      sheet: { boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5)' },
    } as const)
  : ({
      card: { boxShadow: '0px 10px 30px rgba(11, 58, 51, 0.06)' },
      float: { boxShadow: '0px 12px 28px rgba(11, 58, 51, 0.22)' },
      sheet: { boxShadow: '0 -8px 32px rgba(6, 30, 26, 0.18)' },
    } as const);

/** Height of the floating tab bar plus its margin; screens add the bottom safe-area inset on top. */
export const TabBarHeight = 64;
export const TabBarMargin = 14;
export const MaxContentWidth = 560;
