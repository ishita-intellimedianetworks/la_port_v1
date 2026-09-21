/** XZ distance to a waypoint at which we advance pathI. Kept tight so the
 *  trajectory hugs corners and the player never visibly cuts into walls. */
export const WAYPOINT_THRESHOLD = 0.08;
export const YAW_TRACK_SPEED = 4.5;
export const MAX_TURN_SPEED = 2.6;
export const Y_LERP_SPEED = 8.0;
export const LOOK_AHEAD_DISTANCE = 4.0;
export const PITCH_MIN = -Math.PI / 2 + 0.01;
export const PITCH_MAX = Math.PI / 2 - 0.01;
export const IDLE_ROTATE_SPEED = 0.1;
export const IDLE_YAW_RATE = 3.5;
export const PITCH_LEVEL_RATE = 4.0;

/** Speed multiplier applied during UI-triggered floor transitions */
export const FLOOR_TRANSITION_SPEED_MULT = 5;
