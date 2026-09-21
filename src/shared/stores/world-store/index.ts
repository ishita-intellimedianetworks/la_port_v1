import { createStore } from "../create-store";

export type WorldBounds = {
  center: [number, number, number];
  radius: number;
  min: [number, number, number];
  max: [number, number, number];
};

export type WorldState = {
  bounds: WorldBounds | null;
  /** Bumped on every publish, so consumers can react to a re-fit even when the
   *  numbers happen to be identical. */
  version: number;
  setBounds: (bounds: WorldBounds) => void;
};

const sameBounds = (a: WorldBounds | null, b: WorldBounds) =>
  !!a &&
  a.radius === b.radius &&
  a.center[0] === b.center[0] &&
  a.center[1] === b.center[1] &&
  a.center[2] === b.center[2];

export const useWorldStore = createStore<WorldState>((set, get) => ({
  bounds: null,
  version: 0,
  setBounds: (bounds) => {
    const { bounds: current, version } = get();
    if (sameBounds(current, bounds)) return;
    set({ bounds, version: version + 1 });
  },
}));
