import { navConfig } from "../../navigation-config";

export const DEFAULT_MAP_SIZE = 330;
export const MOBILE_MAP_SIZE = 150;

// The map opens as a resizable floating window (canvas size, in CSS px). The
// user drags the bottom-right corner to grow/shrink between MIN and the viewport.
export const MAP_WINDOW_DEFAULT = { w: 410, h: 260 };
export const MAP_WINDOW_MIN = { w: 380, h: 240 };
// Reserved space when clamping the window to the viewport: the left anchor
// (~88px) + right margin, and the top anchor + header + bottom margin.
export const MAP_WINDOW_INSET_X = 112;
export const MAP_WINDOW_INSET_Y = 150;
// Full-screen mode: the canvas fills the viewport BESIDE the left sidebar.
// X reserve = left anchor (88) + right margin (16); Y reserve = top+bottom
// margins (32) + title bar (~44) + action footer (~52) so the whole window fits.
export const MAP_FULL_INSET_X = 104;
// Y reserve = top+bottom margins (32) + title bar (~44) + action footer, which
// can grow to ~2 lines (name + buttons) ≈ 74. Generous so the window never runs
// past the viewport bottom (which would let the page scroll behind it).
export const MAP_FULL_CHROME_Y = 150;
// Phone (landscape) list-mode: the destination legend renders as a side column
// NEXT to the plan. Its width must be reserved when sizing the canvas or the
// window (canvas + legend) runs past the right edge of the screen.
// 158 → 176: the gate rows now carry the crowd "● Moderate" chip beside the
// name, which at 158 truncated the gate names to a couple of characters.
export const SIDE_LEGEND_W = 176;
export const ZOOM_FACTOR = 1.18; // per wheel tick

// Zoom is expressed in metres-per-pixel and both ends are derived at runtime
// from the rects themselves, because "how far out is all the way out" depends
// on how much bigger the site aerial is than the walkable zone — which is
// authored, not fixed. These two are the only tuning left.

/** How far past the zone framing you may zoom IN. 6x on an 841 x 989 m zone
 *  puts roughly 140 m across the canvas, about one berth. */
export const ZOOM_IN_LIMIT = 6;

/** Slack at the zoomed-OUT end, so the outermost layer clears the edges
 *  instead of sitting flush against them. */
export const ZOOM_OUT_MARGIN = 1.08;

// Sticker margin (px). Fixed pixels carved out of the existing canvas — the
// canvas keeps the same outer dimensions as before stickers existed, and
// the floor plan shrinks by 2 × this on each axis to make room for labels.
// Small values: a thin label strip is enough since most labels fit in one
// row of ~14 px text, and we want the floor plan to dominate the view.
export const STICKER_MARGIN_PX        = 4;
export const MOBILE_STICKER_MARGIN_PX = 2;

// Sticker label visuals — mirrors the active PillBtn atom (white pill,
// black text) so stickers read as a smaller version of the floor pills
// above the map.
export const STICKER_BG     = "#ffffff";
export const STICKER_TEXT   = "#000000";
export const STICKER_LINE   = "rgba(255, 255, 255, 0.55)";
export const PLAYER_SIZE = 6;
export const FOV_ANGLE = Math.PI / 3;
export const FOV_LENGTH = 25;
export const BORDER_RADIUS = 8;

export const BG = "rgba(10, 14, 26, 0.92)";
export const PLAYER_FILL = "#00e5ff";
export const PLAYER_STROKE = "#ffffff";
// Route colours come from the central nav-config so the minimap matches the 3D
// route exactly. Bright blue core over a darker-blue casing, with a blue ETA
// pill on the line. Replaces the old flat white dashed path.
export const PATH_COLOR = navConfig.color.routeCore; // bright blue core
export const ROUTE_CASING = navConfig.color.routeCasing; // darker blue casing
export const ROUTE_PILL_BG = navConfig.color.pillBg;
export const ROUTE_PILL_TEXT = navConfig.color.pillText;
export const DEST_COLOR = navConfig.color.destRed;
export const CLICK_MARKER = "rgba(255, 255, 255, 0.85)";
export const BORDER_COLOR = "rgba(255, 255, 255, 1)";
