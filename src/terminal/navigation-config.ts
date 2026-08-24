/**
 * navConfig — ONE place to tune the whole navigation UI.
 * ─────────────────────────────────────────────────────────────────────────────
 * The 3D route line + pin, the 2D minimap route + pin + ETA pill, the turn HUD,
 * and the distance/time maths all read their values from here. Edit this file
 * to restyle or resize navigation — nothing else needs touching.
 */

export const navConfig = {
  // ── Shared route colours (used by BOTH the 3D line and the 2D minimap) ──
  color: {
    routeCore: "#2684ff", // bright blue centre of the route line
    routeCasing: "#0d4fb5", // darker blue outline/edge
    pillBg: "#0d4fb5", // minimap ETA pill background
    pillText: "#ffffff",
    destRed: "#e8453c", // destination pin + ground ring
  },

  // ── 3D route (sizes in REAL-WORLD METRES; auto-scaled to world units so the
  //    visuals stay human-scale regardless of how big the model's units are) ──
  scene3d: {
    lineWidthM: 0.18, // route line width
    liftM: 0.04, // raise off the floor (z-fight guard)
    pinHeadM: 0.09, // pin head radius (drives the whole pin size) — kept small
    pinFloatM: 0.16, // how high the pin floats above the spot (low, not hovering)
    pinBobM: 0.04, // bob (up/down) amplitude
    ringOuterM: 0.2, // ground ring outer radius
  },

  // ── 2D minimap route (canvas pixels, before the map's markerScale) ──
  minimap: {
    coreWidthPx: 3.5, // bright core line width
    casingWidthPx: 6, // darker casing line width
    destPinHeadPx: 6.5, // destination pin head radius
    pillFontPx: 11, // ETA pill text size
  },

  // ── Turn HUD (glass banner) ──
  hud: {
    tileColor: "#1a73e8", // maneuver-arrow tile background
  },

  // ── Seat-view simulation ──
  seatView: {
    /** Eye height (world Y) for EVERY seat view — a seated spectator's eye in
     *  the lower bowl. Applied in code at teleport time (the seat destinations carry
     *  only X/Z); raise/lower this one value to re-pitch all seat views. */
    eyeY: 0.1,
  },

  // ── Navigation maths ──
  logic: {
    // ════════════════════════════════════════════════════════════════════
    // THE TWO KNOBS that drive every distance + time readout.
    //
    // Distance itself is measured from real coordinates — the navmesh A* path
    // between the player's live position and the destination. These two
    // constants turn that path into metres + walking minutes. Change either and
    // ALL readouts (destination cards AND the turn HUD) recompute. Nothing else to edit.
    // ════════════════════════════════════════════════════════════════════
    /** Whole-site size: the model's longest extent presented as this many
     *  metres. The Everport zone-C5 model is authored 1:1 in metres — its
     *  navmesh spans ~990 units and the terminal really is ~1 km end to end —
     *  so this matches siteSpanUnits and every readout is life-size. This is
     *  THE knob for site size. */
    siteSpanMeters: 990,
    /** Walking speed in metres/second (constant pace → realistic ETA).
     *  6 km/h = 6000 / 3600 ≈ 1.667 m/s (average human walking speed). */
    walkMps: 6000 / 3600,
    /** Walk-speed multiplier the speed UI defaults to / each walk starts at.
     *  The speed control offers 1× / 5× / 10×, starting on 5×. */
    defaultSpeedMult: 5,

    // ── Fixed model fact (not a tuning knob) ──
    /** The walkable site's longest extent in WORLD UNITS, measured from the
     *  navmesh bounding box (X 840, Z 990 for zone C5 — the MODEL box is far
     *  larger, but it carries the surrounding harbour and city, which nobody
     *  walks). Only change this if the 3D model itself changes. */
    siteSpanUnits: 990,
    /** Derived metres-per-world-unit used for every distance/ETA readout.
     *  Independent of the controller's getMetersPerUnit() (eye-height ratio),
     *  which must stay as-is because it sizes the 3D route line / pin. */
    get displayMetersPerUnit(): number {
      return this.siteSpanMeters / this.siteSpanUnits;
    },

    realEyeHeightM: 1.6, // avatar eye height in metres (3D-sizing only)
    turnMinDeg: 18, // a bend sharper than this counts as a turn
    rightIsPositiveCross: false, // flip if left/right read inverted in-app
  },
};
