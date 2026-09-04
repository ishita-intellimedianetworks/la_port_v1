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
  /** The hotspot this card is about (H01-H30). An ID, not a label — the marker
   *  set matches on it to take the open card's own disc down. */
  hotspotId: string;
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
 * selected, and where the player is standing. The rail, panel, map and 3D
 * markers all read it.
 *
 * `currentDest` and `atHome` are position-driven: one poll in Overlays writes
 * them from the player's live XZ, and nothing else recomputes them.
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
  /** The hotspot picked from the list (H01-H30), or null. When set, the scene
   *  shows that marker alone rather than every disc in the layout. */
  selectedHotspotId: string | null;
  /**
   * True while standing at the bottom bar's ground standpoint
   * (`FIRST_PERSON_VIEW`), which takes every marker out of the scene.
   *
   * A flag rather than a camera-height test: the per-hotspot ground views in
   * `ground-views.ts` are also at standing height and must keep their marker.
   * Cleared by `setSelectedHotspotId` — every travel path calls it — and by the
   * position poll once the player walks away.
   */
  atGroundView: boolean;
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
  /** Also clears `atGroundView` — touching a marker is always a departure. */
  setSelectedHotspotId: (id: string | null) => void;
  /** Arrive at the ground standpoint. One action rather than three setters,
   *  since `setSelectedHotspotId` would undo the flag. */
  enterGroundView: () => void;
  setAtGroundView: (value: boolean) => void;
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
  atGroundView: false,
  crowdFlowZones: NO_ZONES,
} satisfies Partial<NavUiState>;

/**
 * Replace a category's remembered option, returning the same object when the
 * value is already correct — the map subscribes to `optionByCat`, so a fresh
 * identity on every `setCurrentDest` re-rendered it on every move.
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
      eventsOpen: false,
    });
  },

  setOpenLabel: (category) => {
    const { selectedId, currentDest } = get();
    // Opening a category while standing at its selected destination drops that
    // selection, so the panel shows the list, not a stale "You're here".
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

    // Only a reached destination — selected and navigated to — auto-selects its
    // sub-category; standing near a place never flips the tabs.
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
    set({ openLabel: null, selectedId: null, currentDest: null, eventsOpen: false, atGroundView: false }),

  closePanel: () => set({ openLabel: null, lastLabel: null, selectedId: null }),

  requestPortal: (transition) => set({ pendingPortal: transition }),
  clearPortal: () => set({ pendingPortal: null }),

  setHotspotInfo: (info) => set({ hotspotInfo: info }),
  setSelectedHotspotId: (id) => set({ selectedHotspotId: id, atGroundView: false }),
  enterGroundView: () => set({ atGroundView: true, selectedHotspotId: null, hotspotInfo: null }),
  setAtGroundView: (value) => set({ atGroundView: value }),
  setCrowdFlowZones: (zones) => set({ crowdFlowZones: zones }),

  reset: () => set({ ...INITIAL }),
}));
