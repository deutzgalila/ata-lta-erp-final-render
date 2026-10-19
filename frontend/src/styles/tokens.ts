/**
 * Design System Tokens — ATA & LTA Accounting Firm ERP
 * Swiss Industrial Brutalist Edition (Archetype: Swiss Industrial Print)
 */

export const colors = {
  // Brand & Corporate Entities
  ata: '#0A0A0A',
  lta: '#3A3935',

  // Surfaces & Backgrounds
  bg: '#F4F4F0',
  surface: '#FAF9F5',
  panel: '#FAF9F5',
  bgMuted: '#EAE8E3',
  bgLight: '#FFFFFF',
  bgHover: '#E4E2DC',
  bgSubtle: '#EAE8E3',
  selected: '#DDDAD2',
  loginBg: '#F4F4F0',

  // Text
  text: '#0A0A0A',
  textMain: '#0A0A0A',
  textMuted: '#4A4945',
  textPlaceholder: '#5C5B57',
  textInverse: '#FAF9F5',

  // Borders
  border: '#C8C5BC',
  borderStrong: '#0A0A0A',
  controlBorder: '#111111',

  // Primary Theme (Carbon Ink)
  primary: '#0A0A0A',
  primaryDark: '#222220',
  primaryLight: '#EAE8E3',
  primaryAlpha: 'rgba(10, 10, 10, 0.08)',

  // Semantic Status Colors (Hazard Red, Forest Ink, Ochre Ink)
  accent: '#E61919',
  danger: '#E61919',
  success: '#0F5223',
  warning: '#734800',

  // Extended Accent Palette
  blue: '#103F6E',
  indigo: '#103F6E',
  teal: '#0F5223',
  orange: '#734800',
  purple: '#3A3935',
  green: '#0F5223',
  yellow: '#734800',
  cyan: '#103F6E',
  red: '#E61919',
} as const;

export const typography = {
  fontSans: "'Inter', system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  fontDisplay: "'Archivo Black', 'Inter', system-ui, sans-serif",

  // Button Typography
  btnFontSize: '0.875rem', // 14px
  btnFontSizeSm: '0.8125rem', // 13px
  btnFontSizeXs: '0.75rem', // 12px
  btnFontWeight: '500',
  btnFontWeightEmphasis: '600',
  btnLetterSpacing: '0.025em',
  btnLineHeight: '1.43',

  // Link Typography
  linkFontWeight: '400',
  linkFontWeightNav: '500',
  linkLineHeight: '1.5',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  panePaddingX: '32px',
  panePaddingY: '24px',
  sidebarWidth: '232px',
  sidebarCollapsedWidth: '56px',
} as const;

export const radii = {
  sm: '0px',
  md: '0px',
  lg: '0px',
  xl: '0px',
  pill: '0px',
} as const;

export const shadows = {
  soft: 'none',
  card: 'none',
  float: '4px 4px 0px #0A0A0A',
  primary: 'none',
} as const;

export const transitions = {
  loading: '0.15s',
  delayLoading: '0.15s',
} as const;

export const rawCssTokens: Record<string, string> = {
  '--color-ata': '#0A0A0A',
  '--color-lta': '#3A3935',
  '--color-bg': '#F4F4F0',
  '--color-surface': '#FAF9F5',
  '--color-panel': '#FAF9F5',
  '--color-bg-muted': '#EAE8E3',
  '--color-bg-light': '#FFFFFF',
  '--color-bg-hover': '#E4E2DC',
  '--color-bg-subtle': '#EAE8E3',
  '--color-text': '#0A0A0A',
  '--color-text-main': '#0A0A0A',
  '--color-text-muted': '#4A4945',
  '--color-border': '#C8C5BC',
  '--color-border-strong': '#0A0A0A',
  '--color-primary': '#0A0A0A',
  '--color-primary-dark': '#222220',
  '--color-primary-light': '#EAE8E3',
  '--color-primary-alpha': 'rgba(10, 10, 10, 0.08)',
  '--color-danger': '#E61919',
  '--color-accent': '#E61919',
  '--color-success': '#0F5223',
  '--color-warning': '#734800',
  '--color-blue': '#103F6E',
  '--color-indigo': '#103F6E',
  '--color-teal': '#0F5223',
  '--color-orange': '#734800',
  '--color-purple': '#3A3935',
  '--color-green': '#0F5223',
  '--color-yellow': '#734800',
  '--color-cyan': '#103F6E',
  '--color-red': '#E61919',
  '--font-sans': "'Inter', system-ui, -apple-system, sans-serif",
  '--font-mono': "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  '--font-display': "'Archivo Black', 'Inter', system-ui, sans-serif",
  '--transition-loading': '0.15s',
  '--delay-loading': '0.15s',
  '--pane-padding-x': '32px',
  '--pane-padding-y': '24px',
  '--radius-sm': '0px',
  '--radius-md': '0px',
  '--radius-lg': '0px',
  '--radius-xl': '0px',
  '--radius-pill': '0px',
  '--spacing-xs': '4px',
  '--spacing-sm': '8px',
  '--spacing-md': '16px',
  '--spacing-lg': '24px',
  '--spacing-xl': '32px',
  '--sidebar-width': '232px',
  '--sidebar-collapsed-width:': '56px',
  '--shadow-soft': 'none',
  '--shadow-card': 'none',
  '--shadow-float': '4px 4px 0px #0A0A0A',
  '--shadow-primary': 'none',
  '--btn-font-size': '0.875rem',
  '--btn-font-size-sm': '0.8125rem',
  '--btn-font-size-xs': '0.75rem',
  '--btn-font-weight': '500',
  '--btn-font-weight-emphasis': '600',
  '--btn-letter-spacing': '0.025em',
  '--btn-line-height': '1.43',
  '--link-font-weight': '400',
  '--link-font-weight-nav': '500',
  '--link-line-height': '1.5',
};

export const designTokens = {
  colors,
  typography,
  spacing,
  radii,
  shadows,
  transitions,
  rawCssTokens,
} as const;

export default designTokens;
