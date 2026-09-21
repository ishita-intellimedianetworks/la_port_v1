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
export const MAP_FULL_INSET_X = 104;
export const MAP_FULL_CHROME_Y = 150;
export const SIDE_LEGEND_W = 176;
export const ZOOM_FACTOR = 1.18;

export const ZOOM_OUT_MARGIN = 1.06;
/** Hard floor, in case a site authors a context layer absurdly larger than its plan. */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export const STICKER_MARGIN_PX        = 4;
export const MOBILE_STICKER_MARGIN_PX = 2;

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
export const PATH_COLOR = navConfig.color.routeCore;
export const ROUTE_CASING = navConfig.color.routeCasing;
export const ROUTE_PILL_BG = navConfig.color.pillBg;
export const ROUTE_PILL_TEXT = navConfig.color.pillText;
export const DEST_COLOR = navConfig.color.destRed;
export const CLICK_MARKER = "rgba(255, 255, 255, 0.85)";
export const BORDER_COLOR = "rgba(255, 255, 255, 1)";
