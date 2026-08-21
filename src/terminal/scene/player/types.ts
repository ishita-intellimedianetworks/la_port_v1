import type { MutableRefObject, RefObject } from "react";
import type * as THREE from "three";
import type { Pathfinding } from "three-pathfinding";
import type { RoomZone } from "../navmesh/geometry";

// ── Public handle ──────────────────────────────────────────────────────────────
/** Walk/measure/preview target. Y resolution (see usePathfinding):
 *  `y` (floor-level) wins; else `eyeY` (authored camera height — the
 *  controller subtracts its cameraHeight to get the floor); else the
 *  PLAYER's current floor Y. Destination callers should pass
 *  `eyeY: camera.position[1]` — on multi-level venues the fallback picks
 *  the endpoint node at the player's level, which can sit a whole floor
 *  above/below the destination (walked-to-the-overhang-then-snapped bug). */
export interface NavTarget { x: number; y?: number; eyeY?: number; z: number }

export interface PlayerControllerHandle {
  navigateToPoint: (
    pos: NavTarget,
    targetZone?: string,
    onDone?: () => void,
  ) => boolean;
  stopNavigation: () => void;
  /** Navmesh path length (world units) from the player to a point, WITHOUT
   *  walking — for destination distance/ETA. Multiply by getMetersPerUnit() for metres.
   *  Returns null when no walkable path exists. */
  measurePathTo: (pos: NavTarget, targetZone?: string) => number | null;
  /** Batch measurePathTo: distances to MANY points with a single graph search
   *  (one Dijkstra pass settles every target) — the Directions sheet measures
   *  all destinations at once, instantly, instead of one A* per row. */
  measurePathsTo: (targets: NavTarget[], targetZone?: string) => (number | null)[];
  /** Compute + show a route to a point as a non-walking preview (drawn by the
   *  3D route ribbon). Returns false when no walkable path exists. */
  previewTo: (pos: NavTarget, targetZone?: string) => boolean;
  /** Clear any active preview route. */
  clearPreview: () => void;
  /** Preview route waypoints (with world Y) for the 3D route ribbon. */
  getPreviewPath3D: () => { x: number; y: number; z: number }[];
  isMoving: () => boolean;
  getPosition: () => { x: number; y: number; z: number };
  getRotationY: () => number;
  getPath: () => { x: number; z: number }[];
  /** Remaining path waypoints (from the current index) WITH world Y — feeds the
   *  in-scene 3D route ribbon, which needs floor height the 2D minimap doesn't. */
  getPath3D: () => { x: number; y: number; z: number }[];
  /** Player feet position (camera Y minus eye height) — the 3D route's origin. */
  getFootPosition: () => { x: number; y: number; z: number };
  /** Effective walk speed in world units/sec (base speed × current multiplier). */
  getSpeed: () => number;
  /** Real-world metres per world unit, so path lengths can be shown as a
   *  realistic human-walking distance/ETA (the camera fly speed is far faster
   *  than a person walks, so it must NOT drive the displayed time). Derived
   *  from the avatar eye height ≈ a real 1.6 m. */
  getMetersPerUnit: () => number;
  resetToStart: () => void;
  /** smooth=true plays a GSAP transition instead of snapping */
  teleportTo: (pos: [number, number, number], rot: [number, number, number], smooth?: boolean) => void;
  /**
   * Sample the navmesh surface Y directly below the given (x, z). Returns null if
   * no triangle in the current zone contains the point. When stacked triangles
   * are possible (multi-floor navmesh), pass `expectedY` to disambiguate by
   * picking the candidate whose Y is closest. Result does NOT include cameraHeight.
   */
  probeFloorY: (x: number, z: number, expectedY?: number) => number | null;
  getCurrentZone: () => string;
  setCurrentZone: (z: string) => void;
  setOnNavigationComplete: (cb: (() => void) | null) => void;
  /** Temporarily scale walk speed (1 = normal, 5 = fast transition) */
  setSpeedMultiplier: (v: number) => void;
  /** Current walk-speed multiplier (1 / 1.5 / 2 …) — for the speed UI. */
  getSpeedMultiplier: () => number;
  /** Start the one-round idle drift rotation. Called by TerminalExperience after the scene is revealed. */
  startIdleDrift: () => void;
  /**
   * Smoothly rotate the player (yaw only) to face a world-space XZ point.
   * The existing per-frame yaw lerp animates the camera into place — no
   * GSAP, just sets `yawT`. Pitch is unchanged.
   */
  lookAtPoint: (target: { x: number; z: number }) => void;
  /**
   * Capture the current canvas as a PNG data URL. Renders the scene once just
   * before reading the buffer so it works regardless of `preserveDrawingBuffer`.
   * @param download — if true, also triggers a browser download of the image.
   */
  captureScreenshot: (download?: boolean) => string;
  /**
   * Lock the look-drag to yaw only (pitch frozen at its current angle). Used by
   * fly-over poses (aerial Parking view): the drag spins the top-down view
   * around the vertical axis but can't tilt it away from straight-down. Any
   * teleport or new walk clears the lock automatically.
   */
  setPitchLock: (v: boolean) => void;
}

// ── Component props ────────────────────────────────────────────────────────────
export interface PlayerControllerProps {
  /** Walk gate: navmesh ready AND not in a cinematic. Enables pathfinding walk
   *  + floor-follow. */
  enabled?: boolean;
  /** Look gate: player is in first-person and not in a cinematic, REGARDLESS of
   *  navmesh. When true but `enabled` is false (e.g. no navmesh loaded yet), the
   *  camera still follows drag/idle rotation so the user can look around — just
   *  no walking. */
  lookEnabled?: boolean;
  speed?: number;
  cameraHeight?: number;
  startPosition?: [number, number, number];
  startRotation?: [number, number, number];
  pathfinding: Pathfinding;
  /** Initial zone name, e.g. "zone_f0" */
  initialZone: string;
  onMovingChange?: (v: boolean) => void;
  onZoneChange?: (newZone: string) => void;
  /** Room zones per floor (keyed by floor id) extracted from navmesh named meshes */
  roomZonesMap?: MutableRefObject<Map<string, RoomZone[]>>;
  /** Fired when the player enters a different named room zone */
  onRoomChange?: (id: string | null) => void;
  /** Truncate A* routes at height-band / steep segments (see
   *  FloorConfig.routeSanitize). Default true; pass false for venues with a
   *  clean multi-level navmesh whose ramp routes legitimately change level. */
  routeSanitize?: boolean;
  debug?: boolean;
}

// ── Shared mutable state (refs grouped by concern) ─────────────────────────────
export interface TransitionState {
  /** Is a GSAP floor transition currently running? */
  active: MutableRefObject<boolean>;
  start: MutableRefObject<THREE.Vector3>;
  end: MutableRefObject<THREE.Vector3>;
  startYaw: MutableRefObject<number>;
  endYaw: MutableRefObject<number>;
  /** Progress object driven by GSAP: { t: 0 → 1 } */
  prog: MutableRefObject<{ t: number }>;
  tween: MutableRefObject<gsap.core.Tween | null>;
}

export interface PlayerState {
  // ── Position & orientation ──
  pos: MutableRefObject<THREE.Vector3>;
  targetY: MutableRefObject<number>;
  rot: MutableRefObject<THREE.Euler>;
  yawT: MutableRefObject<number>;
  /** Active GSAP tween for `lookAtPoint`. Stored so navigation/drag can kill
   *  it on demand (prevents the tween fighting other yaw writers). */
  lookAtTween: MutableRefObject<gsap.core.Tween | null>;
  initPos: MutableRefObject<THREE.Vector3>;
  snapped: MutableRefObject<boolean>;
  // ── Zone & path ──
  currentZone: MutableRefObject<string>;
  path: MutableRefObject<THREE.Vector3[]>;
  pathI: MutableRefObject<number>;
  /** Non-walking preview route (set by previewTo, cleared by clearPreview). */
  previewPath: MutableRefObject<THREE.Vector3[]>;
  moving: MutableRefObject<boolean>;
  vizGrp: RefObject<THREE.Group | null>;
  onNavComplete: MutableRefObject<(() => void) | null>;
  speedMult: MutableRefObject<number>;
  // ── Idle camera drift ──
  idleOn: MutableRefObject<boolean>;
  idleAcc: MutableRefObject<number>;
  prevEnabled: MutableRefObject<boolean>;
  /** Drag look is yaw-only while true (fly-over pose keeps looking straight
   *  down). Cleared by every teleport / new walk. */
  pitchLock: MutableRefObject<boolean>;
  // ── Floor transition ──
  transition: TransitionState;
}
