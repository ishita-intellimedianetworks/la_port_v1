import type { CrowdLevel, DestinationCategory, FloorTransition } from "@/shared/types";
import { createStore } from "@/shared/stores/create-store";

export interface CrowdFlowZoneRect {
  level: CrowdLevel;
  tris: [number, number][][];
  center: [number, number];
}

export interface CurrentDest {
  id: string;
  label: string;
  category: DestinationCategory;
  option?: string;
}

export interface HotspotInfo {
  destId: string;
  hotspotId: string;
  destLabel: string;
  category: DestinationCategory;
  option?: string;
  hotspotLabel?: string;
  index: number;
  total: number;
  position: [number, number, number];
}

type OptionByCat = Partial<Record<DestinationCategory, string | null>>;

export interface NavUiState {
  openLabel: DestinationCategory | null;
  lastLabel: DestinationCategory | null;
  selectedId: string | null;
  currentDest: CurrentDest | null;
  atHome: boolean;
  pendingPortal: FloorTransition | null;
  mapExpanded: boolean;
  eventsOpen: boolean;
  navHud: boolean;
  optionByCat: OptionByCat;
  autoOptionCat: DestinationCategory | null;
  hotspotInfo: HotspotInfo | null;
  selectedHotspotId: string | null;
  atGroundView: boolean;
  standingAmbientArmed: boolean;
  selectionSeq: number;
  crowdFlowZones: CrowdFlowZoneRect[];

  toggleLabel: (category: DestinationCategory) => void;
  setOpenLabel: (category: DestinationCategory | null) => void;
  setSelectedId: (id: string | null) => void;
  setOptionForCat: (category: DestinationCategory, option: string | null) => void;
  setCurrentDest: (dest: CurrentDest | null) => void;
  setAtHome: (value: boolean) => void;
  setMapExpanded: (value: boolean) => void;
  setEventsOpen: (value: boolean) => void;
  setNavHud: (value: boolean) => void;
  openEvents: () => void;
  goHome: () => void;
  closePanel: () => void;
  requestPortal: (transition: FloorTransition) => void;
  clearPortal: () => void;
  setHotspotInfo: (info: HotspotInfo | null) => void;
  setSelectedHotspotId: (id: string | null) => void;
  enterGroundView: () => void;
  setAtGroundView: (value: boolean) => void;
  armStandingAmbient: () => void;
  setCrowdFlowZones: (zones: CrowdFlowZoneRect[]) => void;
  reset: () => void;
}

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
  standingAmbientArmed: false,
  selectionSeq: 0,
  crowdFlowZones: NO_ZONES,
} satisfies Partial<NavUiState>;

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
    const standingOnSelection = !!category && !!selectedId && currentDest?.id === selectedId;
    set({ openLabel: category, selectedId: standingOnSelection ? null : selectedId });
  },

  setSelectedId: (id) => set({ selectedId: id }),

  setOptionForCat: (category, option) =>
    set({ optionByCat: withOption(get().optionByCat, category, option), autoOptionCat: null }),

  setCurrentDest: (dest) => {
    const state = get();
    if (state.currentDest?.id === dest?.id && state.currentDest?.category === dest?.category) {
      return;
    }

    let optionByCat = state.optionByCat;
    let autoOptionCat = state.autoOptionCat;

    if (
      state.currentDest &&
      state.autoOptionCat === state.currentDest.category &&
      dest?.id !== state.currentDest.id
    ) {
      optionByCat = withoutOption(optionByCat, state.currentDest.category);
      autoOptionCat = null;
    }

    if (dest && state.selectedId === dest.id) {
      optionByCat = withOption(optionByCat, dest.category, dest.option ?? null);
      autoOptionCat = dest.category;
    }

    set({
      currentDest: dest,
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
  setSelectedHotspotId: (id) =>
    set((s) => ({ selectedHotspotId: id, atGroundView: false, selectionSeq: s.selectionSeq + 1 })),
  enterGroundView: () => set({ atGroundView: true, selectedHotspotId: null, hotspotInfo: null }),
  setAtGroundView: (value) => set({ atGroundView: value }),
  armStandingAmbient: () => set({ standingAmbientArmed: true }),
  setCrowdFlowZones: (zones) => set({ crowdFlowZones: zones }),

  reset: () => set({ ...INITIAL }),
}));
