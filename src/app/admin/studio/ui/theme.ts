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
  /**
   * TWO ACCENTS, AND ONLY TWO. Green is "this is the action" and red is "this
   * destroys something"; everything else is grey. A panel whose blue primary,
   * green accent and amber warning all turned up in the same row of buttons
   * gave no answer to "which one do I press", which is the only question a row
   * of buttons has to answer.
   */
  primary: "#22c55e",
  primaryDeep: "#16a34a",
  /** Green on green, for text sitting ON a filled primary. */
  onPrimary: "#06210f",
  danger: "#ef4444",
  dangerDeep: "#dc2626",
  warning: "#f59e0b",
} as const;

/** Shared surface treatments. The 3di admin's `--radius-box: 0.5rem` is
 *  `rounded-lg`, and its `--border: 1px` is the default. */
export const CARD = "rounded-lg border border-[#374151] bg-[#1f2937]";
export const HEAD = "bg-[#4b5563]";
/** Inputs read as inputs: a lighter border than the card they sit on, near-
 *  white text, and a green ring on focus so the field you are typing into is
 *  obvious at a glance. */
export const FIELD =
  "w-full rounded-lg border border-[#6b7280] bg-[#0b1220] px-2.5 py-2 text-sm text-slate-50 " +
  "outline-none transition placeholder:text-slate-500 " +
  "focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e]/40 " +
  "disabled:cursor-not-allowed disabled:opacity-40";
