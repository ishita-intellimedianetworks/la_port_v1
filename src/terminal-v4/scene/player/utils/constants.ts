/** XZ distance to a waypoint at which we advance pathI. Kept tight so the
 *  trajectory hugs corners and the player never visibly cuts into walls. */
export const WAYPOINT_THRESHOLD = 0.08;
/** How fast yawT (the yaw target) tracks the look-ahead direction — used as
 *  the per-second decay rate inside 1 - exp(-rate * dt). Lower = floatier,
 *  higher = sharper. Eased to 4.5 so the heading target glides into corners
 *  instead of stepping when the look-ahead point jumps to a new segment. */
export const YAW_TRACK_SPEED = 4.5;
/** Max camera yaw speed in rad/s. Lowered from 5 → 2.6 (~150 °/s): combined
 *  with the wider look-ahead below, corners sweep gradually rather than
 *  snapping the heading around at every waypoint. */
export const MAX_TURN_SPEED = 2.6;
/** Vertical-follow exponential decay rate (per second). Used by the
 *  walk-frame to ease pos.y toward the navmesh-probed surface Y every
 *  frame. Lower = softer climb (slope-like glide), higher = stiffer track
 *  (closer to a snap). 8 gives a perceptibly continuous slope feel on
 *  stairs while still keeping the camera glued to the surface in steady
 *  walking — ~63% of a step is closed per ~125 ms. */
export const Y_LERP_SPEED = 8.0;
/** Distance ahead on the path to aim the camera (metres).
 *  Wider look-ahead starts corner sweeps earlier, making turns feel gradual.
 *  Widened 2.5 → 4.0 so the heading begins easing toward a turn well before
 *  the corner, smoothing the per-waypoint direction changes. */
export const LOOK_AHEAD_DISTANCE = 4.0;
/** Pitch clamp — just shy of ±90° so the view can never flip upside-down but
 *  is otherwise unconstrained. The near-vertical range matters for fly-over
 *  poses (aerial Parking view teleports in looking straight down at -90°; a
 *  tighter clamp made the first drag visibly snap the pitch back to the
 *  limit). */
export const PITCH_MIN = -Math.PI / 2 + 0.01;
export const PITCH_MAX = Math.PI / 2 - 0.01;
export const IDLE_ROTATE_SPEED = 0.1;
/** Exponential decay rate (per second) for the idle yaw lerp — used to ease
 *  rot.y toward yawT when the player is NOT walking. The walk path keeps the
 *  constant-rate clamp at MAX_TURN_SPEED so corners feel responsive; idle
 *  rotations (lookAtPoint after arrival, drift, etc.) use this softer ease so
 *  a sudden yawT change doesn't snap-start at 290 °/s. ~3.5 ≈ 95% settled in
 *  ~860 ms — close to the perceived smoothness of walking turns. */
export const IDLE_YAW_RATE = 3.5;
/** Rate at which the camera pitch (rot.x) eases back to 0 while the player is
 *  walking — used as the per-second decay rate inside 1 - exp(-rate * dt).
 *  ~4 means roughly 95% leveled in ~750ms. Avoids both a hard snap on walk
 *  start and the camera marching with a permanent up/down tilt to the target. */
export const PITCH_LEVEL_RATE = 4.0;

/** Speed multiplier applied during UI-triggered floor transitions */
export const FLOOR_TRANSITION_SPEED_MULT = 5;
