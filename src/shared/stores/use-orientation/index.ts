import { createStore } from "../create-store";

export type OrientationState = {
  isLandscape: boolean;
  setLandscape: (value: boolean) => void;
};

export const useOrientation = createStore<OrientationState>((set) => ({
  isLandscape: true,
  setLandscape: (value) => set({ isLandscape: value }),
}));
