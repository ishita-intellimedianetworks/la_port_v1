/**
 * The studio's palette, lifted from the 3di admin so the two tools look like
 * one product.
 *
 * That app themes daisyUI with these exact values (`globals.css > theme-3di`).
 * We do NOT pull daisyUI in to get them: it is a global plugin whose base
 * styles would land on every route in this app, including the terminal, to
 * style one internal tool. So the tokens are transcribed here and spent as
 * ordinary Tailwind arbitrary values, which reaches the same look and touches
 * nothing outside `/admin`.
 *
 * Kept as strings rather than a Tailwind theme extension for the same reason —
 * nothing here should be reachable from the runtime's class namespace.
 */

export const C = {
  /** Page ground — daisyUI `neutral`. */
  ground: "#111827",
  /** Cards and panels — `base-100`. */
  surface: "#1f2937",
  /** Raised rows, inputs on a card — `base-200`. */
  raised: "#374151",
  /** Table headers, borders on a raised surface — `base-300`. */
  edge: "#4b5563",
  primary: "#0457a9",
  primaryHover: "#0569cc",
  accent: "#22c55e",
  info: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
} as const;

/** Shared surface treatments. The 3di admin's `--radius-box: 0.5rem` is
 *  `rounded-lg`, and its `--border: 1px` is the default. */
export const CARD = "rounded-lg border border-[#374151] bg-[#1f2937]";
export const HEAD = "bg-[#4b5563]";
export const FIELD =
  "w-full rounded-lg border border-[#4b5563] bg-[#111827] px-2.5 py-1.5 text-sm text-slate-100 " +
  "outline-none transition focus:border-[#0457a9] disabled:cursor-not-allowed disabled:opacity-40";
