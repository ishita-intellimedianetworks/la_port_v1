import { createStore } from "@/shared/stores/create-store";
import type { Vec3 } from "@/config/schema";

export type AnchorDraft = { id: string; position: Vec3 };

export type DebugState = {
  showNavmesh: boolean;
  setShowNavmesh: (v: boolean) => void;
  navmeshDepth: boolean;
  setNavmeshDepth: (v: boolean) => void;
  navmeshTriangles: number | null;
  setNavmeshTriangles: (n: number | null) => void;
  cameraEdit: boolean;
  setCameraEdit: (v: boolean) => void;
  anchorEdit: boolean;
  setAnchorEdit: (v: boolean) => void;
  showAnchorHelper: boolean;
  setShowAnchorHelper: (v: boolean) => void;
  anchorDraft: AnchorDraft | null;
  setAnchorDraft: (v: AnchorDraft | null) => void;
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
  anchorEdit: false,
  setAnchorEdit: (v) => set({ anchorEdit: v }),
  showAnchorHelper: false,
  setShowAnchorHelper: (v) => set({ showAnchorHelper: v }),
  anchorDraft: null,
  setAnchorDraft: (v) => set({ anchorDraft: v }),
  panelCollapsed: false,
  setPanelCollapsed: (v) => set({ panelCollapsed: v }),
}));
