import type { CrowdLevel, DestinationCategory, FloorTransition } from "@/shared/types";
import { createStore } from "@/shared/stores/create-store";

/**
 * One crowd-flow zone, so the map can draw the same shapes the 3D layer would.
 * `tris` are the zone mesh's world-XZ triangles.
 */
export interface CrowdFlowZoneRect {
  level: CrowdLevel;
  tris: [number, number][][];
  /** Zone centre (world XZ) — used to name a side in the crowd panel. */
  center: [number, number];
}

/** The layout the player is currently standing at. */
export interface CurrentDest {
  id: string;
  label: string;
  category: DestinationCategory;
  /** Its sub-category — arriving auto-selects this in the panel and map. */
  option?: string;
}

/** A clicked 3D marker — drives the centred hotspot card. */
export interface HotspotInfo {
  destId: string;
  destLabel: string;
  category: DestinationCategory;
  option?: string;
  /** The clicked pin's own label; falls back to the destination name. */
  hotspotLabel?: string;
  /** 1-based marker index within the destination's pins, and the total. */
  index: number;
  total: number;
  /** World position of the marker. */
  position: [number, number, number];
}

type OptionByCat = Partial<Record<DestinationCategory, string | null>>;

/**
 * The single source of truth for wayfinding UI — which panel is open, what is
 * selected, and where the player is standing. The left rail, the destination
 * panel, the map and the 3D markers all read it, so one update reaches all of
 * them and they cannot drift apart.
 *
 * `currentDest` and `atHome` are POSITION-driven: one poll in Overlays writes
 * them from the player's live XZ, and nothing else recomputes them.
 *
 * Built on `createStore`, which requires a selector and drops writes that
 * change nothing — see the note in `shared/stores/create-store.ts` for why
 * that matters here.
 */
export interface NavUiState {
  /** Open category (null = none) — drives the panel AND the map's pin set. */
  openLabel: DestinationCategory | null;
  /** Most-recent category, kept so the panel can animate OUT after closing. */
  lastLabel: DestinationCategory | null;
  selectedId: string | null;
  currentDest: CurrentDest | null;
  atHome: boolean;
  /** A requested interior-portal entry (overlay button → canvas). */
  pendingPortal: FloorTransition | null;
  mapExpanded: boolean;
  eventsOpen: boolean;
  /** Whether the turn-by-turn HUD shows for the CURRENT walk. Only walks
   *  started from a panel set this; map clicks and double-clicks walk silently. */
  navHud: boolean;
  /** Remembered sub-category per category, shared by the panel and the map. */
  optionByCat: OptionByCat;
  /** Which category's sub-category was AUTO-selected by arriving, so leaving
   *  can undo it without ever clearing a manual pick. */
  autoOptionCat: DestinationCategory | null;
  hotspotInfo: HotspotInfo | null;
  /**
   * The hotspot the operator has picked from the list (H01-H30), or null.
   *
   * This is what puts a marker in the 3D scene: markers appear only for the
   * selected hotspot, so the view shows the one point being discussed rather
   * than every disc in the layout at once.
   */
  selectedHotspotId: string | null;
  crowdFlowZones: CrowdFlowZoneRect[];

  /** Toggle a category; switching to a different one drops the selection. */
  toggleLabel: (category: DestinationCategory) => void;
  setOpenLabel: (category: DestinationCategory | null) => void;
  setSelectedId: (id: string | null) => void;
  /** Remember a picked sub-category (panel tab / map filter). */
  setOptionForCat: (category: DestinationCategory, option: string | null) => void;
  setCurrentDest: (dest: CurrentDest | null) => void;
  setAtHome: (value: boolean) => void;
  setMapExpanded: (value: boolean) => void;
  setEventsOpen: (value: boolean) => void;
  setNavHud: (value: boolean) => void;
  /** Open the event feed, closing the destination panel and map. */
  openEvents: () => void;
  /** Home: no panel, no selection, not "at" anywhere. */
  goHome: () => void;
  /** Close the panel entirely and drop the selection. */
  closePanel: () => void;
  requestPortal: (transition: FloorTransition) => void;
  clearPortal: () => void;
  setHotspotInfo: (info: HotspotInfo | null) => void;
  setSelectedHotspotId: (id: string | null) => void;
  setCrowdFlowZones: (zones: CrowdFlowZoneRect[]) => void;
  reset: () => void;
}

/** Shared empty value, so a reset never hands out a fresh array identity. */
const NO_ZONES: CrowdFlowZoneRect[] = [];

const INITIAL = {
  openLabel: null,
  lastLabel: null,
  selectedId: null,
  currentDest: null,
  atHome: false,
  pendingPortal: null,
  mapExpanded: false,
  eventsOpen: false,
  navHud: false,
  optionByCat: {} as OptionByCat,
  autoOptionCat: null,
  hotspotInfo: null,
  selectedHotspotId: null,
  crowdFlowZones: NO_ZONES,
} satisfies Partial<NavUiState>;

/**
 * Replace a category's remembered option, returning the SAME object when the
 * value is already what it should be.
 *
 * The map subscribes to `optionByCat`. Spreading a fresh object on every write
 * — as the previous version did on every `setCurrentDest` — re-rendered the map
 * whenever the player moved between destinations, for a value that had not
 * changed.
 */
function withOption(
  current: OptionByCat,
  category: DestinationCategory,
  option: string | null,
): OptionByCat {
  if (category in current && current[category] === option) return current;
  return { ...current, [category]: option };
}

function withoutOption(current: OptionByCat, category: DestinationCategory): OptionByCat {
  if (!(category in current)) return current;
  const next = { ...current };
  delete next[category];
  return next;
}

export const useNavUiStore = createStore<NavUiState>((set, get) => ({
  ...INITIAL,

  toggleLabel: (category) => {
    const { openLabel, selectedId } = get();
    const isOpen = openLabel === category;
    set({
      openLabel: isOpen ? null : category,
      lastLabel: category,
      selectedId: isOpen ? selectedId : null,
      // Opening any category closes the event feed.
      eventsOpen: false,
    });
  },

  setOpenLabel: (category) => {
    const { selectedId, currentDest } = get();
    // Opening a category while standing AT its selected destination drops that
    // selection, so the panel shows the list rather than a stale "You're here".
    // An explicit pick re-selects immediately afterwards.
    const standingOnSelection = !!category && !!selectedId && currentDest?.id === selectedId;
    set({ openLabel: category, selectedId: standingOnSelection ? null : selectedId });
  },

  setSelectedId: (id) => set({ selectedId: id }),

  // A manual pick overrides and clears the auto-selection bookkeeping, so the
  // choice survives walking away.
  setOptionForCat: (category, option) =>
    set({ optionByCat: withOption(get().optionByCat, category, option), autoOptionCat: null }),

  setCurrentDest: (dest) => {
    const state = get();
    if (state.currentDest?.id === dest?.id && state.currentDest?.category === dest?.category) {
      return;
    }

    let optionByCat = state.optionByCat;
    let autoOptionCat = state.autoOptionCat;

    // Leaving a place whose sub-category was auto-selected on arrival puts the
    // list back to its default. Manual picks are never touched.
    if (
      state.currentDest &&
      state.autoOptionCat === state.currentDest.category &&
      dest?.id !== state.currentDest.id
    ) {
      optionByCat = withoutOption(optionByCat, state.currentDest.category);
      autoOptionCat = null;
    }

    // Only a REACHED destination — one that was selected and navigated to —
    // auto-selects its sub-category. Merely standing near a place never flips
    // the panel or map tabs.
    if (dest && state.selectedId === dest.id) {
      optionByCat = withOption(optionByCat, dest.category, dest.option ?? null);
      autoOptionCat = dest.category;
    }

    set({
      currentDest: dest,
      // Arriving where you'd selected keeps it selected, so its directions read
      // "You're here". Arriving anywhere else clears the pending selection.
      ...(dest ? { selectedId: state.selectedId === dest.id ? dest.id : null } : null),
      optionByCat,
      autoOptionCat,
    });
  },

  setAtHome: (value) => set({ atHome: value }),

  setMapExpanded: (value) =>
    // Opening the map closes the event feed; closing it leaves the feed alone.
    set(value ? { mapExpanded: true, eventsOpen: false } : { mapExpanded: false }),

  setEventsOpen: (value) => set({ eventsOpen: value }),
  setNavHud: (value) => set({ navHud: value }),

  openEvents: () =>
    set({
      eventsOpen: true,
      openLabel: null,
      lastLabel: null,
      selectedId: null,
      mapExpanded: false,
    }),

  goHome: () =>
    set({ openLabel: null, selectedId: null, currentDest: null, eventsOpen: false }),

  closePanel: () => set({ openLabel: null, lastLabel: null, selectedId: null }),

  requestPortal: (transition) => set({ pendingPortal: transition }),
  clearPortal: () => set({ pendingPortal: null }),

  setHotspotInfo: (info) => set({ hotspotInfo: info }),
  setSelectedHotspotId: (id) => set({ selectedHotspotId: id }),
  setCrowdFlowZones: (zones) => set({ crowdFlowZones: zones }),

  reset: () => set({ ...INITIAL }),
}));
