import { createStore } from "../create-store";

/**
 * The active model's world bounds, published by the loader after each load.
 *
 * The environment reads it to fit the sun and shadow camera and to scale the
 * cloud layer, because a terminal and a stadium occupy wildly different world
 * units and nothing downstream should hardcode either.
 */
export type WorldBounds = {
  center: [number, number, number];
  radius: number;
  /** The box itself, not just its bounding sphere. The sun's shadow camera
   *  needs the real extents: a port is 2 km wide and 60 m tall, and a sphere
   *  around that is mostly empty air — fitting the shadow frustum to it spends
   *  the whole map on nothing. */
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
  // Publishing the SAME bounds must not notify. `bounds` is a fresh object each
  // call and `version` always increments, so without this every repeated report
  // woke the environment and the shadow camera for no reason at all.
  setBounds: (bounds) => {
    const { bounds: current, version } = get();
    if (sameBounds(current, bounds)) return;
    set({ bounds, version: version + 1 });
  },
}));
