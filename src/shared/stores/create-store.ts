import { create, type StoreApi } from "zustand";

/**
 * The store factory every store in this app is built on.
 *
 * It exists because plain zustand allows two mistakes that are invisible in
 * review and catastrophic at runtime — both of which froze this app:
 *
 *  1. `useStore()` with NO selector subscribes to the entire store. Since
 *     zustand's `set` always produces a NEW state object, such a subscriber
 *     re-renders on every write, even writes that changed nothing it reads.
 *     The reveal smoother writes progress every frame, so one no-selector call
 *     in the provider re-rendered the whole app 60x a second.
 *
 *  2. A setter that writes the same value it already holds still notifies every
 *     subscriber, because only the object identity changed.
 *
 * This factory removes both by construction:
 *
 *  - The returned hook has NO zero-argument overload, so `useStore()` is a
 *    TYPE ERROR rather than a performance cliff.
 *  - `set` shallow-compares the patch against current state and returns early
 *    when nothing actually changed, so no-op writes notify nobody.
 *
 * `getState` / `setState` / `subscribe` are forwarded for imperative use
 * outside React.
 */

/** A patch, or a reducer producing one. Returning `{}` means "no change". */
type Patch<T> = Partial<T> | ((state: T) => Partial<T>);

export type StoreHook<T> = {
  /** Selector is REQUIRED — see the note above. */
  <U>(selector: (state: T) => U): U;
  getState: StoreApi<T>["getState"];
  setState: StoreApi<T>["setState"];
  subscribe: StoreApi<T>["subscribe"];
};

export function createStore<T extends object>(
  initializer: (set: (patch: Patch<T>) => void, get: () => T) => T,
): StoreHook<T> {
  const useBase = create<T>()((rawSet, get) => {
    const set = (patch: Patch<T>) => {
      const current = get();
      const next = typeof patch === "function" ? patch(current) : patch;

      // Skip the write entirely when every key already holds that value. This
      // is what stops a per-frame "set the same thing again" from waking every
      // subscriber in the tree.
      let changed = false;
      for (const key in next) {
        if (!Object.is(current[key], next[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;

      rawSet(next as Partial<T>);
    };

    return initializer(set, get);
  });

  const hook = (<U>(selector: (state: T) => U) => useBase(selector)) as StoreHook<T>;
  hook.getState = useBase.getState;
  hook.setState = useBase.setState;
  hook.subscribe = useBase.subscribe;
  return hook;
}
