/**
 * Design System Tokens — ATA & LTA Accounting Firm ERP
 * Institutional Finance Ledger Edition (Brutalist × Minimalist Synthesis)
 */

export const colors = {
  // Brand & Corporate Entities
  ata: '#1E3A8A',
  lta: '#0369A1',
  entityLta: '#0369A1',

  // Surfaces & Backgrounds
  canvas: '#F8FAFC',
  bg: '#F8FAFC',
  sidebar: '#F1F5F9',
  surface: '#FFFFFF',
  panel: '#FFFFFF',
  bgMuted: '#F1F5F9',
  bgLight: '#FFFFFF',
  bgHover: '#E2E8F0',
  bgSubtle: '#F1F5F9',
  selected: '#DBEAFE',
  loginBg: '#F8FAFC',

  // Text & Typography
  ink: '#0F172A',
  strong: '#0F172A',
  text: '#0F172A',
  textMain: '#0F172A',
  textBase: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#475569',
  textPlaceholder: '#64748B',
  textInverse: '#FFFFFF',

  // Borders
  border: '#CBD5E1',
  borderSubtle: '#CBD5E1',
  borderStrong: '#94A3B8',
  controlBorder: '#64748B',

  // Primary Theme & Brand Accent (Corporate Finance Blue)
  focus: '#1D4ED8',
  primary: '#1D4ED8',
  primaryDark: '#1E40AF',
  primaryHover: '#1E40AF',
  primaryLight: '#EFF6FF',
  primaryAlpha: 'rgba(29, 78, 216, 0.08)',
  accent: '#1D4ED8',
  accentSolid: '#1D4ED8',
  accentSolidHover: '#1E40AF',
  accentSubtle: '#EFF6FF',

  // Semantic Status Ramps
  success: '#166534',
  successSurface: '#F0FDF4',
  successBorder: '#86EFAC',

  warning: '#854D0E',
  warningSurface: '#FEFCE8',
  warningBorder: '#FDE047',

  danger: '#991B1B',
  dangerSolid: '#DC2626',
  dangerSurface: '#FEF2F2',
  dangerBorder: '#FCA5A5',

  info: '#075985',
  infoSurface: '#F0F9FF',
  infoBorder: '#7DD3FC',

  chart: '#1D4ED8',

  // Extended Accent Palette
  blue: '#1D4ED8',
  indigo: '#1E3A8A',
  teal: '#166534',
  orange: '#854D0E',
  purple: '#334155',
  green: '#166534',
  yellow: '#854D0E',
  cyan: '#075985',
  red: '#DC2626',
} as const;

export const typography = {
  fontSans: "'Inter', 'Geist Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, monospace",
  fontDisplay: "'Inter', 'Geist Sans', system-ui, sans-serif",
  minFontSizePx: 12,

  // Button Typography
  btnFontSize: '0.875rem', // 14px
  btnFontSizeSm: '0.8125rem', // 13px
  btnFontSizeXs: '0.75rem', // 12px
  btnFontWeight: '500',
  btnFontWeightEmphasis: '600',
  btnLetterSpacing: '-0.01em',
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
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '12px',
  pill: '999px',
} as const;

export const shadows = {
  soft: '0px 1px 2px 0px rgba(15, 23, 42, 0.04)',
  card: '0px 0px 0px 1px rgba(15, 23, 42, 0.04), 0px 1px 2px -1px rgba(15, 23, 42, 0.05), 0px 2px 4px 0px rgba(15, 23, 42, 0.03)',
  float: '0px 0px 0px 1px rgba(15, 23, 42, 0.06), 0px 10px 25px -5px rgba(15, 23, 42, 0.08), 0px 4px 10px -2px rgba(15, 23, 42, 0.04)',
  primary: '0px 1px 2px 0px rgba(29, 78, 216, 0.15)',
} as const;

export const transitions = {
  loading: '0.15s',
  delayLoading: '0.15s',
  durationFast: '150ms',
  durationNormal: '200ms',
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const rawCssTokens: Record<string, string> = {
  '--color-ata': '#1E3A8A',
  '--color-lta': '#0369A1',
  '--color-entity-lta': '#0369A1',
  '--color-canvas': '#F8FAFC',
  '--color-bg-app': '#F8FAFC',
  '--color-bg': '#F8FAFC',
  '--color-sidebar': '#F1F5F9',
  '--color-bg-subtle': '#F1F5F9',
  '--color-bg-muted': '#F1F5F9',
  '--color-surface': '#FFFFFF',
  '--color-panel': '#FFFFFF',
  '--color-bg-light': '#FFFFFF',
  '--color-hover': '#E2E8F0',
  '--color-bg-hover': '#E2E8F0',
  '--color-selected': '#DBEAFE',
  '--color-surface-selected': '#DBEAFE',
  '--color-ink': '#0F172A',
  '--color-strong': '#0F172A',
  '--color-text': '#0F172A',
  '--color-text-main': '#0F172A',
  '--color-text-base': '#0F172A',
  '--color-text-secondary': '#334155',
  '--color-muted': '#475569',
  '--color-text-muted': '#475569',
  '--color-placeholder': '#64748B',
  '--color-text-placeholder': '#64748B',
  '--color-text-inverse': '#FFFFFF',
  '--color-border': '#CBD5E1',
  '--color-border-subtle': '#CBD5E1',
  '--color-border-strong': '#94A3B8',
  '--color-control-border': '#64748B',
  '--color-focus': '#1D4ED8',
  '--color-primary': '#1D4ED8',
  '--color-primary-dark': '#1E40AF',
  '--color-primary-hover': '#1E40AF',
  '--color-primary-light': '#EFF6FF',
  '--color-primary-alpha': 'rgba(29, 78, 216, 0.08)',
  '--color-accent': '#1D4ED8',
  '--color-accent-solid': '#1D4ED8',
  '--color-accent-solid-hover': '#1E40AF',
  '--color-accent-subtle': '#EFF6FF',
  '--color-danger': '#991B1B',
  '--color-danger-solid': '#DC2626',
  '--color-danger-surface': '#FEF2F2',
  '--color-danger-border': '#FCA5A5',
  '--color-success': '#166534',
  '--color-success-surface': '#F0FDF4',
  '--color-success-border': '#86EFAC',
  '--color-warning': '#854D0E',
  '--color-warning-surface': '#FEFCE8',
  '--color-warning-border': '#FDE047',
  '--color-info': '#075985',
  '--color-info-surface': '#F0F9FF',
  '--color-info-border': '#7DD3FC',
  '--color-chart': '#1D4ED8',
  '--color-blue': '#1D4ED8',
  '--color-indigo': '#1E3A8A',
  '--color-teal': '#166534',
  '--color-orange': '#854D0E',
  '--color-purple': '#334155',
  '--color-green': '#166534',
  '--color-yellow': '#854D0E',
  '--color-cyan': '#075985',
  '--color-red': '#DC2626',
  '--font-sans': "'Inter', 'Geist Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  '--font-mono': "'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, monospace",
  '--font-display': "'Inter', 'Geist Sans', system-ui, sans-serif",
  '--transition-loading': '0.15s',
  '--delay-loading': '0.15s',
  '--pane-padding-x': '32px',
  '--pane-padding-y': '24px',
  '--radius-xs': '4px',
  '--radius-sm': '6px',
  '--radius-md': '8px',
  '--radius-lg': '12px',
  '--radius-xl': '12px',
  '--radius-pill': '999px',
  '--spacing-xs': '4px',
  '--spacing-sm': '8px',
  '--spacing-md': '16px',
  '--spacing-lg': '24px',
  '--spacing-xl': '32px',
  '--sidebar-width': '232px',
  '--sidebar-collapsed-width': '56px',
  '--shadow-soft': '0px 1px 2px 0px rgba(15, 23, 42, 0.04)',
  '--shadow-card': '0px 0px 0px 1px rgba(15, 23, 42, 0.04), 0px 1px 2px -1px rgba(15, 23, 42, 0.05), 0px 2px 4px 0px rgba(15, 23, 42, 0.03)',
  '--shadow-float': '0px 0px 0px 1px rgba(15, 23, 42, 0.06), 0px 10px 25px -5px rgba(15, 23, 42, 0.08), 0px 4px 10px -2px rgba(15, 23, 42, 0.04)',
  '--shadow-primary': '0px 1px 2px 0px rgba(29, 78, 216, 0.15)',
  '--btn-font-size': '0.875rem',
  '--btn-font-size-sm': '0.8125rem',
  '--btn-font-size-xs': '0.75rem',
  '--btn-font-weight': '500',
  '--btn-font-weight-emphasis': '600',
  '--btn-letter-spacing': '-0.01em',
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
