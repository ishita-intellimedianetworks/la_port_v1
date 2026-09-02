import type { Vec3 } from "@/config/schema";

/**
 * GROUND VIEWS — the standpoint a resource can be looked at from ON FOOT.
 *
 * Every layout in `site.json` is `walkable: false`: all ten cameras are aerial
 * framings, so today the only way to see a resource is from 60-460 m up. This
 * table adds a SECOND, optional pose per hotspot — one that stands a person on
 * the navmesh and points them at the marker.
 *
 * WHY THIS LIVES HERE AND NOT IN `site.json`
 * ------------------------------------------
 * `site.json` is shared by `/`, `/v2` and `/v3`. This is a v3-only feature, so
 * the data is v3-only too: nothing under `@/config` changes, and the other two
 * routes cannot see these poses even by accident. If ground views graduate to
 * the product, the move is to add `groundCamera?: LayoutCamera` to
 * `HotspotConfig` and delete this file — the shape below is deliberately the
 * same one a config block would have.
 *
 * ROTATION ORDER — READ THIS BEFORE EDITING A NUMBER
 * --------------------------------------------------
 * These are YXZ eulers, the order `camera.rotation.set(x, y, z, "YXZ")` in
 * `player/utils/teleport.ts` applies — the same convention as `cameras.spawn`
 * and `cameras.firstPerson` in `site.json`, and NOT the XYZ order that
 * `layouts[].camera` / `hotspots[].camera` use (those get reordered by
 * `xyzToYxz` on the way through `resolveCamera`; these do not go through it).
 * `[pitch, yaw, 0]`, pitch positive = looking up. The YAW is a look-at from the
 * standpoint's eye to the marker, so the subject is centred left-to-right; the
 * PITCH deliberately is not — see rule 3 below.
 *
 * `position` IS A FOOT POSITION, NOT AN EYE POSITION
 * --------------------------------------------------
 * Y here is the navmesh SURFACE under the standpoint — 0.130 exactly, since the
 * v8 navmesh is dead flat. `goToHotspotGround` probes the live navmesh at this
 * XZ and teleports to what it finds, and `teleportTo` then adds the player's own
 * camera height — so the eye always ends up at exactly first-person height,
 * the same as walking there would give, rather than at a number baked in here.
 * The stored Y only serves as `probeFloorY`'s `expectedY` tie-breaker and as
 * the fallback if the probe misses.
 *
 * WHY ONLY SEVEN
 * --------------
 * A ground camera has to still tell the hotspot's story. The ones left out are
 * not left out for want of nearby navmesh — H18 has walkable road 26 m away and
 * a 5° look-up — but because their card is an AREA fact (block occupancy, yard
 * moves/hour, berth utilisation) and at 1.83 m you see the front row and
 * nothing behind it. Percentages over a block are a plan-view fact. The seven
 * here are each about ONE object at human scale, which is the case where
 * standing next to it beats looking down at it.
 *
 * HOW THE ANGLES WERE CHOSEN — three rules, all of them photographic
 * ------------------------------------------------------------------
 * The first pass at this table aimed each camera dead-centre at the bead from
 * the nearest workable spot. Geometrically correct, and it looked wrong: two of
 * the seven faced almost straight into the sun, and every one of them put the
 * subject in the middle of the frame like a passport photo. The three rules
 * below are what replaced "point at the marker".
 *
 * 1. SUN BEHIND, NOT IN FRONT. `lights.sunDirection` is [-1.5, 5.9, -2.6] —
 *    63° up, and horizontally toward [-0.50, -0.87]. That is the light the
 *    directional lamp in `scene-lights.tsx` actually casts, so a camera facing
 *    that bearing sees only the shadowed side of everything. Each pose records
 *    `sunDot`: the view direction dotted with the direction to the sun, so +1
 *    is staring into it and -1 is having it straight behind. Every one here is
 *    at most 0.15, and the target is about -0.55 — over the shoulder, raking
 *    across the subject so its form reads. The old H05 sat at +0.86 and the old
 *    H21 at +0.71, which is why those two looked flat and grey.
 *
 * 2. THERE MUST BE A PATH ONWARD. Every standpoint can walk at least 15 m
 *    further, within +/-30° of where it looks — `walk` records how far. This is
 *    the rule that came last and mattered most: an earlier pass scored
 *    standpoints by distance to the nearest mesh boundary, which on a road
 *    corridor just means "the middle of the lane" and never asks whether the
 *    mesh CONTINUES. It produced arrivals with nowhere to go — H21 could walk
 *    0.5 m forward and stood in 54 m2 of ground, H17 had 1.0 m. All seven
 *    failed it.
 *
 *    Two metrics were tried as gates first and both were wrong. Open AREA: this
 *    navmesh is a 48,758 m2 corridor network over an 850x1156 m box, its p90
 *    for a 30 m box is 257 m2 and its MAX is 317 — a 420 threshold matched
 *    nothing anywhere on the mesh. Open DIRECTIONS is worse: a road gives few
 *    by construction, and the gate lane at H21 walks 40 m along itself while
 *    scoring 2 of 16. Gating on either rejects exactly the corridors that ARE
 *    paths. A road is a path; it just is not a plaza.
 *
 *    This replaced an earlier obliquity rule (approach a stack at 30-60° so two
 *    faces show). The two could not both hold — a three-quarter view
 *    deliberately faces ACROSS the road it stands on, so the ground runs out
 *    ahead of you. Standing where the path leads won, because a handsome angle
 *    you cannot walk out of is a screenshot, not a viewpoint.
 *
 * 3. THE SUBJECT SITS HIGH, NOT CENTRED. Each camera is pitched slightly BELOW
 *    its marker, by `0.35 x` the marker's own elevation and never more than
 *    5.8° — which is a third of the way from centre to the top of a 35° frame.
 *    Tall subjects (the crane, the stacks) therefore ride up onto the upper
 *    third with their mass filling the frame beneath; near-level subjects (the
 *    wharf, the track) barely move, because tilting DOWN to "compose" a subject
 *    that is already at eye height just fills the shot with tarmac. The pitch
 *    stored below is the CAMERA's, not the marker's; each entry notes both.
 *
 * Every standpoint was found by sweeping the whole navmesh for a point
 * satisfying all three plus a per-subject range band, then preferring the one
 * furthest from a mesh boundary so the arrival is not on a sliver edge.
 *
 * WHICH NAVMESH — RE-CHECK THESE IF THE BAKE MOVES
 * ------------------------------------------------
 * Authored against the navmesh that ships with `portla-c5-v8o-inst-mo`, the
 * bake /v3 streams (NEXT_PUBLIC_STREAM_BASE_V3 → v8w-inst-mo/): 6,364 triangles,
 * flat at Y 0.130, world X -1500.1..-662.1, Z -436.7..709.2. That is
 * la-port-zone-c5-navmesh-v4, and it is NOT the mesh /v2 walks on — v6wo ships
 * the v2 navmesh, 3,949 triangles at Y ~0.15 reaching only to Z 550.9. Same
 * coordinate frame, 61% more mesh, longer in Z.
 *
 * The navmesh travels with the chunks, so pointing the route at another bake
 * silently changes the ground these poses stand on. Nothing breaks loudly if it
 * does — `goToHotspotGround` probes the live mesh and will seat the player on
 * whatever is there — so re-run the check rather than trusting the arrival.
 */
export interface GroundView {
  /** Standpoint as a FOOT position on the navmesh — see the note above. */
  position: Vec3;
  /** YXZ euler `[pitch, yaw, 0]`, looking from that standpoint's eye at the
   *  marker. Positive pitch looks up. */
  rotation: Vec3;
  /** What this shot is for. Shown nowhere; it is the reason the numbers are
   *  what they are, and the thing to re-check if a bake moves the geometry. */
  intent: string;
  /** Ground distance to the marker, metres — recorded so a later edit can tell
   *  whether it is still framing the same subject. */
  range: number;
  /** The CAMERA's upward pitch in degrees — already lifted off the marker by
   *  rule 3, so it is a few degrees shallower than the angle to the bead. */
  pitch: number;
  /** View direction dotted with the direction to the sun, horizontally. +1 is
   *  facing into it, -1 is having it dead behind; anything above ~0.15 puts the
   *  subject in its own shadow. Kept as data so a lighting change can be
   *  re-checked against all seven at once rather than by eye. */
  sunDot: number;
  /** Metres of PATH ONWARD: how far you can keep walking from this standpoint
   *  within +/-30 deg of where the camera looks, measured on the v8 navmesh.
   *  This is the number that stops an arrival being marooned — see rule 2. */
  walk: number;
  /** Walkable m2 in the 30x30 m box centred on the standpoint. Context for
   *  `walk`, not a gate: the mesh's own p90 is 257 m2 and its max is 317, so
   *  anything past ~250 is genuinely open ground and ~70 is a lane. */
  area: number;
}

export const GROUND_VIEW_BY_HOTSPOT: Record<string, GroundView> = {
  // BERTH / QUAY — DELIBERATELY NOT AUTO-COMPOSED. This one is authored to
  // match what /v2 shows: `rotation` is byte-identical to L02's camera in
  // `site.json` ([0, -0.4538, 0] — dead level, yaw -26°), so /v3 frames the
  // berth and the quay exactly as the aerial arrival does, just from standing
  // height. L02's rotation is authored XYZ with only Y non-zero, and xyzToYxz
  // is the identity on that, so the triple carries over verbatim.
  //
  // THE POSITION COULD NOT BE DIRECTLY BENEATH /v2's CAMERA. That camera sits
  // at [-1483.2, 22.5, 297.0] and looks out across the water — marching its
  // view axis 260 m finds no walkable ground at all, because the whole approach
  // is the berth itself. This stands 30.5 m away on the nearest apron that
  // holds the same framing: the quay marker lands 5.0° off centre and the berth
  // marker 3.4°, both well inside the 29.3° half-frame, with 40 m of path
  // onward and 262 m2 of ground.
  //
  // IT FACES THE SUN — sunDot +0.56, the one entry here that breaks rule 1.
  // That is inherited, not chosen: /v2's own berth camera looks that way, and
  // matching /v2 was the instruction. The auto-composed alternative faced the
  // other way at -0.14 but framed the quay obliquely instead of the way /v2
  // does. If the backlighting reads badly, that alternative is the fallback —
  // it cannot be had together with /v2's framing.
  H04: {
    position: [-1454.5, 0.13, 307.5],
    rotation: [0, -0.4538, 0],
    intent: "The /v2 berth-quay framing, taken from ground level",
    range: 160,
    pitch: 0,
    sunDot: 0.56,
    walk: 40,
    area: 262,
  },

  // A crane reads from below or not at all, and the card is about THIS crane of
  // eight (QC-02, its lifts, its health) — so it has to be identifiable, which
  // means lit. The lit standpoints are all 90-110 m out; the first attempt put
  // it at 77 m on the wrong side of the machine, sunDot +0.86 — a grey
  // silhouette. At 97 m the whole 30 m of it stands against the sky.
  H05: {
    position: [-1219.5, 0.13, -164.5],
    rotation: [0.1562, 2.5825, 0],
    intent: "Whole crane from the lit side, full height in frame",
    range: 113,
    pitch: 9,
    sunDot: -0.47,
    walk: 23,
    area: 273,
  },

  // The one hotspot whose subject IS the walkable surface — an apron exclusion
  // zone. "Do not enter while crane is operating" only means anything at
  // standing height; from 300 m up it is a rectangle. Close in at 14 m and
  // oblique, so the painted ground leads the eye and the crane legs rise out of
  // the top of the frame.
  H07: {
    position: [-1201.5, 0.13, -195.5],
    rotation: [0.0642, 2.5609, 0],
    intent: "The exclusion zone on the apron, crane legs above it",
    range: 16,
    pitch: 4,
    sunDot: -0.45,
    walk: 40,
    area: 283,
  },

  // "Your box is that one, stack A12-04, third tier up." Identification is the
  // whole job and identification needs closeness. Swung to 46° off the block
  // axis so two faces of the stack show and it reads as a solid rather than a
  // painted wall.
  H14: {
    position: [-1021.5, 0.13, 73.5],
    rotation: [0.2176, 2.1567, 0],
    intent: "Three-quarter on the stack face, hero box on tier 3",
    range: 29,
    pitch: 12,
    sunDot: -0.06,
    walk: 40,
    area: 123,
  },

  // Same identification job, plus -17.8 °C and POWER: CONNECTED are per-unit
  // facts: you have to see the unit and the cable running to it. Three-quarter
  // again, on ground that only exists in v8 — the v2 navmesh stopped at Z 550.9
  // and this stands at Z 514 with the reach behind it.
  H17: {
    position: [-1298.5, 0.13, 478.5],
    rotation: [0.1206, 2.424, 0],
    intent: "Three-quarter on the reefer row, plugs visible",
    range: 46,
    pitch: 7,
    sunDot: -0.32,
    walk: 18,
    area: 221,
  },

  // One lane, one portal, one plate read. Turned to look back DOWN the lane —
  // the first attempt looked across it at sunDot +0.71, staring into the sun
  // through the portal. Narrowest standing spot of the seven (0.6 m clear)
  // because the gate navmesh is a road corridor; the snap holds the player on
  // it. v8 widened the apron here enough that the corridor-axis estimate stops
  // meaning much, which is why this one is scored on sun and range, not shape.
  H21: {
    position: [-773.5, 0.13, 225.5],
    rotation: [0.0742, -3.1377, 0],
    intent: "Down the lane at the OCR portal",
    range: 22,
    pitch: 4,
    sunDot: -0.87,
    walk: 40,
    area: 68,
  },

  // 52 railcars over 2,150 ft. Sighting down the track is what makes that read
  // as length, so this is deliberately the LEAST oblique of the seven (24°) —
  // rule 2 inverted, because a three-quarter view of a train is just a wall of
  // containers.
  H23: {
    position: [-698.5, 0.13, -362.5],
    rotation: [0.0721, -3.1344, 0],
    intent: "Sight down the loading track, train receding",
    range: 33,
    pitch: 4,
    sunDot: -0.87,
    walk: 40,
    area: 116,
  },
};

/** True when this resource can be looked at from the ground — i.e. the
 *  Resources row should offer the walk affordance. */
export function hasGroundView(hotspotId: string): boolean {
  return hotspotId in GROUND_VIEW_BY_HOTSPOT;
}
