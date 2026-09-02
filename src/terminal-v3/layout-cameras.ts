import { poseForCamera } from "@/config";
import type { CameraPose, LayoutCamera } from "@/config/schema";

/**
 * LAYOUT CAMERA OVERRIDES — /v3 ONLY.
 *
 * `site.json`'s layout cameras are shared by `/`, `/v2` and `/v3`, and they are
 * right for the bakes the first two routes stream. /v3 streams a DIFFERENT bake
 * (portla-c5-v8o-inst-mo), and a bake can put geometry where a pose composed
 * against the old one used to have air. This table is where /v3 says "that shot
 * needs a different eye against my model", without touching a file the other two
 * routes read.
 *
 * Anything not named here falls through to `site.json` unchanged, so this stays
 * a list of exceptions and not a second copy of the camera table.
 *
 * AUTHORED IN `site.json`'s FORM, ON PURPOSE
 * ------------------------------------------
 * Entries are `LayoutCamera`, not resolved poses: `rotation` is the **XYZ**
 * triple `/extract-pos` and the ?debug=true camera editor print, identical to
 * what `layouts[].camera` holds. `cameraForLayoutV3` runs it through the very
 * same `poseForCamera` the config module uses, so the XYZ → YXZ reorder happens
 * in one place for both.
 *
 * That reorder is NOT cosmetic here and this entry is the proof. L02's authored
 * `[-0.2322, -0.4432, -0.1011]` looks like it carries 5.8° of roll; reordered it
 * is `[-0.2094, -0.4538, -0.00004]` — pitch 12.0° down, yaw 26.0°, and a LEVEL
 * horizon. Storing the raw triple as a runtime rotation would tilt the shot.
 * So: paste from the tool, never hand-convert.
 *
 * ── L02 Berth / Quay ────────────────────────────────────────────────────────
 * THE SYMPTOM. On /v3 this arrival landed inside a ship's hull — the frame was a
 * wall of deck plating.
 *
 * WHAT IT IS NOT, because this was checked first: `cp_002` in
 * la-port-zone-c5-cp-v4.glb is byte-identical to what `site.json` already
 * carries. Position matches to four decimals, and its quaternion
 * [0, -0.224951, 0, 0.974370] is a pure Y rotation of -0.453785 rad against the
 * authored -0.4538. Re-reading the pose from cp-v4 changes nothing: the
 * checkpoint did not move, the model did. (cp_012 DID move in cp-v4, which is
 * likely where the expectation came from — but that is `cameras.spawn`.)
 *
 * WHAT IT IS. v8 added chunk `c7`, a 126 x 43 x 211 m vessel centred at
 * [-1492.3, 13.3, 287.8], and the authored eye at y 22.461 sits inside it. v6 —
 * what /v2 streams — has no such chunk, and every other chunk near the berth
 * (c3, c4, c5, c36, c39) is identical between the bakes. v8 berthed a second
 * vessel on top of the camera. Measured by raycasting the decoded far-tier
 * geometry (986,755 triangles over the berth), 44% of the frame's rays hit
 * something within 25 m from the authored pose.
 *
 * THE FIX. X and Z are cp_002's, untouched, so /v3 stands on the same spot /v2
 * does. The eye rises from 22.461 to 38 — just over the vessel, whose bbox tops
 * out at 34.6 — and the camera tilts down 12° to hold the berth in frame from
 * the greater height. Sweeping height against the real geometry:
 *
 *     y 22.5  44% of frame rays blocked within 25 m   <- authored, inside the hull
 *     y 28     7%
 *     y 32     1%
 *     y 36     0%                                     <- first clear height
 *     y 38     0%   <- this, 3.4 m of margin over the hull
 *
 * Moving BACKWARD along the view axis instead was tried and is wrong: c3/c4/c5
 * are the crane chunks strung along the quay at [-1390,159], [-1428,236] and
 * [-1499,380], and the shot looks straight DOWN that line — which is what gives
 * it the receding row of cranes. Reversing along it walks into c5. Up is the
 * only direction that is empty.
 *
 * IF v8 IS REBAKED, RE-CHECK THIS. It is pinned to one vessel's height.
 */
export const LAYOUT_CAMERA_OVERRIDE: Record<string, LayoutCamera> = {
  L02: {
    // cp_002's X and Z exactly; only Y differs. This is the camera height
    // itself, not a floor — L02 is `walkable: false` / `exactPose: true`, so the
    // runtime seats it verbatim rather than probing the navmesh.
    position: [-1483.1617, 38, 297.0468],
    // XYZ, as authored — see the note above. Resolves to pitch 12.0° down,
    // yaw 26.0°, level horizon.
    rotation: [-0.2322, -0.4432, -0.1011],
  },
};

/**
 * The pose /v3 should use for a layout: its override resolved through the same
 * `poseForCamera` the config module uses, or the pose `site.json` already gave.
 *
 * `eyeOffset` is 0 because every override here is an AERIAL pose (`walkable:
 * false`), matching what `authoredPose` does in config/index.ts — and it only
 * bites on the `target` form anyway, which none of these use.
 */
export function cameraForLayoutV3(layoutId: string, fallback: CameraPose): CameraPose {
  const override = LAYOUT_CAMERA_OVERRIDE[layoutId];
  return override ? poseForCamera(override, 0) : fallback;
}
