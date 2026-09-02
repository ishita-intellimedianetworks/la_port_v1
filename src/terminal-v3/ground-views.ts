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
 * 2. OBLIQUE, NOT FLAT-ON — except where the subject is a line. A box viewed
 *    square-on shows one face and reads as a wall; turned 30-60° it shows two
 *    and reads as a box. `obliq` is the angle between the view direction and
 *    the local walkable corridor, which in a port runs parallel to the quay,
 *    the yard blocks and the tracks — so it stands in for the subject's own
 *    axis. Stacks and reefer rows want 30-60°; the gate lane and the rail track
 *    want the opposite, because a train's length only reads when you sight
 *    down it.
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
  /** Angle between the view and the local walkable corridor: 0 sights straight
   *  down the line, 90 is flat-on to the face. See rule 2. */
  obliq: number;
}

export const GROUND_VIEW_BY_HOTSPOT: Record<string, GroundView> = {
  // The wharf apron is a ground-level place by nature, and the card is "three
  // cranes working this quay section" — one frame from down here. Pulled back to
  // 52 m and swung onto the lit side: the closer standpoints all faced the sun.
  // Stays level, because the marker is barely above eye height and tilting down
  // to "compose" it would just fill the frame with apron.
  H04: {
    position: [-1356.7126, 0.13, 125.147],
    rotation: [0.0102, 2.26, 0],
    intent: "Oblique along the wharf face, cranes working it",
    range: 52,
    pitch: 1,
    sunDot: -0.17,
    obliq: 32,
  },

  // A crane reads from below or not at all, and the card is about THIS crane of
  // eight (QC-02, its lifts, its health) — so it has to be identifiable, which
  // means lit. The lit standpoints are all 90-110 m out; the first attempt put
  // it at 77 m on the wrong side of the machine, sunDot +0.86 — a grey
  // silhouette. At 97 m the whole 30 m of it stands against the sky.
  H05: {
    position: [-1222.5357, 0.13, -147.9023],
    rotation: [0.1798, 2.5186, 0],
    intent: "Whole crane from the lit side, full height in frame",
    range: 97,
    pitch: 10,
    sunDot: -0.41,
    obliq: 43,
  },

  // The one hotspot whose subject IS the walkable surface — an apron exclusion
  // zone. "Do not enter while crane is operating" only means anything at
  // standing height; from 300 m up it is a rectangle. Close in at 14 m and
  // oblique, so the painted ground leads the eye and the crane legs rise out of
  // the top of the frame.
  H07: {
    position: [-1198.827, 0.13, -190.174],
    rotation: [0.0733, 2.1875, 0],
    intent: "The exclusion zone on the apron, crane legs above it",
    range: 14,
    pitch: 4,
    sunDot: -0.09,
    obliq: 29,
  },

  // "Your box is that one, stack A12-04, third tier up." Identification is the
  // whole job and identification needs closeness. Swung to 46° off the block
  // axis so two faces of the stack show and it reads as a solid rather than a
  // painted wall.
  H14: {
    position: [-1075.1096, 0.13, 101.9414],
    rotation: [0.198, -1.1747, 0],
    intent: "Three-quarter on the stack face, hero box on tier 3",
    range: 32,
    pitch: 11,
    sunDot: -0.13,
    obliq: 47,
  },

  // Same identification job, plus -17.8 °C and POWER: CONNECTED are per-unit
  // facts: you have to see the unit and the cable running to it. Three-quarter
  // again, on ground that only exists in v8 — the v2 navmesh stopped at Z 550.9
  // and this stands at Z 514 with the reach behind it.
  H17: {
    position: [-1359.9656, 0.13, 514.4705],
    rotation: [0.1743, -1.5259, 0],
    intent: "Three-quarter on the reefer row, plugs visible",
    range: 31,
    pitch: 10,
    sunDot: -0.46,
    obliq: 61,
  },

  // One lane, one portal, one plate read. Turned to look back DOWN the lane —
  // the first attempt looked across it at sunDot +0.71, staring into the sun
  // through the portal. Narrowest standing spot of the seven (0.6 m clear)
  // because the gate navmesh is a road corridor; the snap holds the player on
  // it. v8 widened the apron here enough that the corridor-axis estimate stops
  // meaning much, which is why this one is scored on sun and range, not shape.
  H21: {
    position: [-767.9969, 0.13, 235.5922],
    rotation: [0.123, 2.7221, 0],
    intent: "Down the lane at the OCR portal",
    range: 13,
    pitch: 7,
    sunDot: -0.59,
    obliq: 55,
  },

  // 52 railcars over 2,150 ft. Sighting down the track is what makes that read
  // as length, so this is deliberately the LEAST oblique of the seven (24°) —
  // rule 2 inverted, because a three-quarter view of a train is just a wall of
  // containers.
  H23: {
    position: [-695.5373, 0.13, -369.8412],
    rotation: [0.0589, 3.0737, 0],
    intent: "Sight down the loading track, train receding",
    range: 40,
    pitch: 3,
    sunDot: -0.83,
    obliq: 22,
  },
};

/** True when this resource can be looked at from the ground — i.e. the
 *  Resources row should offer the walk affordance. */
export function hasGroundView(hotspotId: string): boolean {
  return hotspotId in GROUND_VIEW_BY_HOTSPOT;
}
