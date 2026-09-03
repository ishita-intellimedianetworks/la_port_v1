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

/**
 * A store whose INITIAL STATE comes from the site config — created on demand
 * rather than at import.
 *
 * Why it cannot be an ordinary `createStore`: the seeded values (the FOV, the
 * colour grade, the sky) are per MODEL now, and there are three models. A
 * module-level `create()` runs at import, long before any route has rendered,
 * so the only thing it could seed from is a hardcoded default or one arbitrary
 * site — which is exactly the shared-config problem the split removed.
 *
 * So creation is deferred to `init(seed)`, which the tree's root calls with its
 * own site BEFORE any child renders. The hook it hands out is stable either
 * way, so hook order is never disturbed. Calling `init` again with the SAME
 * seed is a no-op — a route serves one model for the life of a document, and
 * re-seeding mid-session would throw away whatever the debug panel had moved.
 *
 * A DIFFERENT seed rebuilds. In the browser that never happens; on the SERVER it
 * is the whole point, because these module singletons outlive one request and a
 * render of /v2 must not inherit the store /v1 seeded on the request before it.
 * The rebuild happens at the tree's root, before anything below has subscribed.
 *
 * Reading the store before `init` throws, deliberately and loudly — that is a
 * tree that mounted a consumer above its own root, and the alternative is a
 * silent fallback to somebody else's numbers.
 */
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
