import { create, type StoreApi } from "zustand";

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

export type SeededStoreHook<T, S> = StoreHook<T> & {
  /** Build the store from `seed`. A no-op while the seed is the one it already
   *  holds; a different seed rebuilds. */
  init: (seed: S) => void;
};

export function createSeededStore<T extends object, S>(
  name: string,
  initializer: (seed: S) => (set: (patch: Patch<T>) => void, get: () => T) => T,
): SeededStoreHook<T, S> {
  let inner: StoreHook<T> | null = null;
  let seeded: S | null = null;

  const require_ = (): StoreHook<T> => {
    if (!inner) {
      throw new Error(
        `[${name}] read before init — the tree's root must call ${name}.init(site) ` +
          `before anything below it reads the store.`,
      );
    }
    return inner;
  };

  const hook = (<U>(selector: (state: T) => U) => require_()(selector)) as SeededStoreHook<T, S>;
  hook.init = (seed: S) => {
    if (inner && seeded === seed) return;
    seeded = seed;
    inner = createStore<T>(initializer(seed));
  };
  hook.getState = () => require_().getState();
  hook.setState = ((patch, replace) =>
    (require_().setState as (p: unknown, r?: unknown) => void)(patch, replace)) as StoreHook<T>["setState"];
  hook.subscribe = ((listener) => require_().subscribe(listener)) as StoreHook<T>["subscribe"];
  return hook;
}
