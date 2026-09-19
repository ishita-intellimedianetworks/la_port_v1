import { createStore } from "@/shared/stores/create-store";

/**
 * The `?debug=true` panel's own switches — the ones that are not a light, a
 * sky value or a grade, and so have nowhere else to live.
 *
 * Nothing here is read unless the URL carries `?debug=true`: the scene gates
 * the navmesh overlay on the URL flag as well, and the camera editor only
 * mounts inside the debug panel. So a production page pays for one zustand
 * store holding two booleans and never touches them.
 *
 * WHY THE NAVMESH TOGGLE EXISTS. It used to be `debug` itself — open the panel
 * to dial the lighting and the whole terminal came up under a bright green
 * sheet, which is exactly the surface you cannot judge a sun angle through. It
 * is a separate switch now, and it starts OFF.
 */
export type DebugState = {
  /** Draw the walkable surface as the green fill + wireframe overlay. */
  showNavmesh: boolean;
  setShowNavmesh: (v: boolean) => void;
  /**
   * Depth-test the overlay, i.e. let the world occlude it.
   *
   * OFF by default, which is not the obvious choice and is the one that makes
   * the switch work. The navmesh is authored flat at Y 0.130 and the terminal's
   * apron, quay and yard slabs sit within centimetres of it over a site a
   * kilometre across — so depth-tested, most of the mesh loses the z-fight to
   * the ground it describes and "show navmesh" appears to do nothing. Drawn
   * through, you always see the mesh; turn this ON for the other question,
   * which is whether a patch of it is floating above or sunk below the floor.
   */
  navmeshDepth: boolean;
  setNavmeshDepth: (v: boolean) => void;
  /**
   * Triangles in the navmesh actually captured, or null before one is.
   *
   * A readout, not a knob — it is what separates "the overlay is off" from
   * "the overlay is on and you are looking through it", which are otherwise the
   * same blank screen. v3 streams la-port-zone-c5-navmesh-v4: 6,364 triangles.
   */
  navmeshTriangles: number | null;
  setNavmeshTriangles: (n: number | null) => void;
  /**
   * Whether the camera panel's position/rotation inputs WRITE.
   *
   * Off, they are a live readout of wherever the camera happens to be — safe to
   * leave open while walking. On, dragging one moves the camera. The split is
   * there because a readout that updates every frame is also a control an
   * accidental drag can teleport you with, and the "edit camera" button on the
   * open resource is the deliberate act that arms it.
   */
  cameraEdit: boolean;
  setCameraEdit: (v: boolean) => void;
  /** Leva's own collapse, held here so the "edit camera" button on the open
   *  resource can pop the panel back open — the button is in the HTML overlay
   *  tree, several levels away from the panel. */
  panelCollapsed: boolean;
  setPanelCollapsed: (v: boolean) => void;
};

export const useDebugStore = createStore<DebugState>((set) => ({
  showNavmesh: false,
  setShowNavmesh: (v) => set({ showNavmesh: v }),
  navmeshDepth: false,
  setNavmeshDepth: (v) => set({ navmeshDepth: v }),
  navmeshTriangles: null,
  setNavmeshTriangles: (n) => set({ navmeshTriangles: n }),
  cameraEdit: false,
  setCameraEdit: (v) => set({ cameraEdit: v }),
  panelCollapsed: false,
  setPanelCollapsed: (v) => set({ panelCollapsed: v }),
}));
