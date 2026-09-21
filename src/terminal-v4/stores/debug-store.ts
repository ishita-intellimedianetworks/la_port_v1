import { createStore } from "@/shared/stores/create-store";

export type DebugState = {
  /** Draw the walkable surface as the green fill + wireframe overlay. */
  showNavmesh: boolean;
  setShowNavmesh: (v: boolean) => void;
  navmeshDepth: boolean;
  setNavmeshDepth: (v: boolean) => void;
  navmeshTriangles: number | null;
  setNavmeshTriangles: (n: number | null) => void;
  cameraEdit: boolean;
  setCameraEdit: (v: boolean) => void;
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
