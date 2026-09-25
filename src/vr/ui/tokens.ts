export const POINTER_ORDER = {
  ui: 10,
  overlay: 20,
} as const;

export const PANEL_DISTANCE = 2;

export const RENDER_ORDER = 1000;

export const ROW_HEIGHT = 56;

export const BAR_BUTTON = 64;

export const SPACE = {
  panel: 32,
  section: 20,
  row: 12,
  rowX: 20,
  icon: 16,
  dock: 16,
  tile: 14,
} as const;

export const RADIUS = {
  panel: 28,
  tile: 18,
  row: 18,
  button: 10,
  dot: 999,
} as const;

export const TEXT = {
  group: 14,
  meta: 15,
  label: 16,
  tile: 17,
  body: 20,
  value: 22,
  title: 28,
} as const;

export const COLOR = {
  glass: "#090b0f",
  panel: "#000000",
  tile: "#000000",
  border: "#ffffff",
  text: "#ffffff",
  accent: "#0071e3",
  accentBright: "#2997ff",
  danger: "#e5484d",
  scrollbar: "#5c6878",
  ok: "#30d158",
  warn: "#ffb020",
  alert: "#ff5c5c",
} as const;

export const DOCK = {
  label: 24,
  labelHeight: 42,
} as const;

export const OPACITY = {
  panel: 0.62,
  tile: 0.4,
  tileHover: 0.65,
  chip: 0.6,
  chipHover: 0.75,
  border: 0.22,
  chipBorder: 0.14,
  activeBorder: 0.5,
  divider: 0.08,
  icon: 0.86,
  muted: 0.7,
  disabled: 0.4,
} as const;
