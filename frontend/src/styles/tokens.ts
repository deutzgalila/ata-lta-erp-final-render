/**
 * Design System Tokens — ATA & LTA Accounting Firm ERP
 * Extracted verbatim from `erp_prototype/css/styles.css` (:root).
 *
 * Source: erp_prototype/css/styles.css:8-73
 * Checkpoint: Present this token table in PR description for design sign-off.
 */

export const colors = {
  // Brand & Corporate Entities
  ata: '#2563eb',
  lta: '#475569',

  // Surfaces & Backgrounds
  bg: '#f4f6fb',
  surface: '#ffffff',
  panel: '#ffffff',
  bgMuted: '#f0f1f3',
  bgLight: '#fafafa',
  bgHover: '#f0f1f3',
  bgSubtle: '#f8fafc',
  loginBg: '#0f172a',

  // Text
  text: '#2d2d3f',
  textMain: '#1e293b',
  textMuted: '#9494a0',

  // Borders
  border: '#f0f0f5',

  // Primary Theme (Trust Blue)
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primaryLight: '#eef1ff',
  primaryAlpha: 'rgba(37, 99, 235, 0.08)',

  // Semantic Status Colors
  danger: '#ef4444',
  success: '#10b981',
  warning: '#fbbf24',

  // Extended Accent Palette
  blue: '#3b82f6',
  indigo: '#6366f1',
  teal: '#14b8a6',
  orange: '#f97316',
  purple: '#a855f7',
  green: '#22c55e',
  yellow: '#eab308',
  cyan: '#06b6d4',
  red: '#ef4444',
} as const;

export const typography = {
  fontSans: '"Poppins", "Inter", system-ui, -apple-system, sans-serif',

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
  xs: '6px',
  sm: '12px',
  md: '20px',
  lg: '32px',
  xl: '40px',
  panePaddingX: '32px',
  panePaddingY: '28px',
  sidebarWidth: '200px',
  sidebarCollapsedWidth: '56px',
} as const;

export const radii = {
  sm: '12px',
  md: '12px',
  lg: '12px',
  xl: '12px',
  pill: '999px',
} as const;

export const shadows = {
  soft: '0 10px 40px rgba(0, 0, 0, 0.03)',
  card: '0 15px 35px rgba(0, 0, 0, 0.04)',
  float: '0 20px 50px rgba(0, 0, 0, 0.15)',
  primary: '0 8px 20px rgba(37, 99, 235, 0.35)',
} as const;

export const transitions = {
  loading: '0.25s',
  delayLoading: '0.25s',
} as const;

/**
 * Raw verbatim map of CSS custom properties as defined in `erp_prototype/css/styles.css`.
 */
export const rawCssTokens: Record<string, string> = {
  '--color-ata': '#2563eb',
  '--color-lta': '#475569',
  '--color-bg': '#f4f6fb',
  '--color-surface': '#ffffff',
  '--color-panel': '#ffffff',
  '--color-bg-muted': '#f0f1f3',
  '--color-bg-light': '#fafafa',
  '--color-bg-hover': '#f0f1f3',
  '--color-bg-subtle': '#f8fafc',
  '--color-text': '#2d2d3f',
  '--color-text-main': '#1e293b',
  '--color-text-muted': '#9494a0',
  '--color-border': '#f0f0f5',
  '--color-primary': '#2563eb',
  '--color-primary-dark': '#1d4ed8',
  '--color-primary-light': '#eef1ff',
  '--color-primary-alpha': 'rgba(37, 99, 235, 0.08)',
  '--color-danger': '#ef4444',
  '--color-success': '#10b981',
  '--color-warning': '#fbbf24',
  '--color-blue': '#3b82f6',
  '--color-indigo': '#6366f1',
  '--color-teal': '#14b8a6',
  '--color-orange': '#f97316',
  '--color-purple': '#a855f7',
  '--color-green': '#22c55e',
  '--color-yellow': '#eab308',
  '--color-cyan': '#06b6d4',
  '--color-red': '#ef4444',
  '--font-sans': '"Poppins", "Inter", system-ui, -apple-system, sans-serif',
  '--transition-loading': '0.25s',
  '--delay-loading': '0.25s',
  '--pane-padding-x': '32px',
  '--pane-padding-y': '28px',
  '--radius-sm': '12px',
  '--radius-md': '12px',
  '--radius-lg': '12px',
  '--radius-xl': '12px',
  '--radius-pill': '999px',
  '--spacing-xs': '6px',
  '--spacing-sm': '12px',
  '--spacing-md': '20px',
  '--spacing-lg': '32px',
  '--spacing-xl': '40px',
  '--sidebar-width': '200px',
  '--sidebar-collapsed-width': '56px',
  '--shadow-soft': '0 10px 40px rgba(0, 0, 0, 0.03)',
  '--shadow-card': '0 15px 35px rgba(0, 0, 0, 0.04)',
  '--shadow-float': '0 20px 50px rgba(0, 0, 0, 0.15)',
  '--shadow-primary': '0 8px 20px rgba(37, 99, 235, 0.35)',
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
