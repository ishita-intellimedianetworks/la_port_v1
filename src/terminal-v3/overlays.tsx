"use client";

/**
 * Overlays — HTML overlays for the interior phase.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Home, Square } from "lucide-react";

import { Minimap } from "./map";
import { FadeScreen } from "../shared/ui/screens";
import ForceLandscape from "../shared/ui/screens/force-landscape";
import { HoloTwinHud } from "@/shared/ui/screens/loading-screen";
import { useProgressStore } from "../shared/stores/progress-store";
import { InstructionsCard } from "./overlay/instructions-card";
import { useAppStore } from "../shared/stores/app-store";
import { NavHud } from "./overlay/nav-hud";
import { PanelHeader } from "./overlay/destination-panel/panel-header";
import { DEST_CATEGORIES } from "./overlay/destination-panel/category-meta";
import { HotspotsFlap } from "./overlay/hotspots-flap";
import { useStreamVariantId } from "@/streaming/variant";
import { BottomBar } from "./overlay/bottom-bar";
import { SpeedControl } from "./overlay/speed-control";
import { useTerminalUi } from "./context/ui-context";
import type { DestinationCategory, DestinationsByCategory } from "@/shared/types";
import { useNavUiStore } from "./stores/nav-ui-store";
import { NAV_GLASS_PANEL } from "./overlay/glass-theme";
import { HotspotDataCard } from "./overlay/hotspot-card";
import { DebugPanel } from "./overlay/debug-panel";
import { DebugCameraEditor } from "./overlay/debug-panel/camera-editor";
import { tick } from "@/shared/runtime/diagnostics";
import { useSite } from "@/config/context";
import { FIRST_PERSON_VIEW } from "./first-person-view";
import { edgeFeather } from "./scene/model-loader/edge-feather";

// "Home" / "currently at" are pure XZ proximity to a fixed spot; rotation is
// ignored. Tight, so any real step away clears them.
const HOME_REACH_UNITS = 0.8;
const CURRENT_REACH_UNITS = 0.8;

export default function Overlays() {
  tick("render:Overlays");
  // Dev-only (?diag=true): separates a render storm from a blocked main thread.
  useEffect(() => useNavUiStore.subscribe(() => tick("write:navUiStore")), []);
  const ui = useTerminalUi();
  const {
    inlineMode, unitName,
    floors, startPosition, startRotation,
    phase, setPhase, hasDollHouse, showHud, setShowHud, isReady, isMoving,
    mapEntered,
    activeFloorIndex, othersCached,
    fadeVisible, handleFloorSelect,
    playerControllerRef, triggerFloorTransition,
  } = ui;
  // Persisted "instructions seen" flags — tapping Enter marks them seen.
  const markInstructionsSeen = useAppStore((s) => s.markInstructionsSeen);
  const markFpInstructionsSeen = useAppStore((s) => s.markFpInstructionsSeen);
  const fpInstructionsSeen = useAppStore((s) => s.fpInstructionsSeen);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  // Fires once on first arrival in first person; afterwards the dock's
  // Instructions button is the way back to the card.
  useEffect(() => {
    if (phase === "firstPerson" && !fpInstructionsSeen) setInstructionsOpen(true);
  }, [phase, fpInstructionsSeen]);
  const activeFloor = floors[activeFloorIndex];
  const openLabel = useNavUiStore((s) => s.openLabel);
  const lastLabel = useNavUiStore((s) => s.lastLabel);
  const currentDest = useNavUiStore((s) => s.currentDest);
  const atHome = useNavUiStore((s) => s.atHome);
  const setAtHome = useNavUiStore((s) => s.setAtHome);
  const goHome = useNavUiStore((s) => s.goHome);
  // `/` is frozen at what the main version ships; this tree only runs as /v3,
  // so the newer chrome is always on.
  const streamVariant = useStreamVariantId();
  const uiFrozen = streamVariant === "v1";
  const setMapExpanded = useNavUiStore((s) => s.setMapExpanded);
  const mapExpanded = useNavUiStore((s) => s.mapExpanded);
  const eventsOpen = useNavUiStore((s) => s.eventsOpen);
  // Only panel-started walks raise the turn HUD; map clicks and double-clicks
  // walk silently (see navigateToFloor).
  const navHud = useNavUiStore((s) => s.navHud);
  const hotspotInfo = useNavUiStore((s) => s.hotspotInfo);
  const setHotspotInfo = useNavUiStore((s) => s.setHotspotInfo);

  // `isMoving` jitters for a frame or two around arrivals, teleports and path
  // corners. `stillUi` hides panels immediately on a walk but restores them
  // only after ~300ms of continuous stillness, so a settle never flashes one.
  const [stillUi, setStillUi] = useState(!isMoving);
  useEffect(() => {
    if (isMoving) { setStillUi(false); return; }
    const t = setTimeout(() => setStillUi(true), 300);
    return () => clearTimeout(t);
  }, [isMoving]);

  // Venues flap (right edge), lifted here so it stays mutually exclusive with
  // the left-side panels.
  const [venuesOpen, setVenuesOpen] = useState(false);
  // The "Resources" edge flap (layouts + hotspots), exclusive with the map.
  const [hotspotsFlapOpen, setHotspotsFlapOpen] = useState(false);
  // The at-home cards auto-open; this tracks the corner close button. Reset on
  // leaving home (below) so the card returns on the next arrival.
  const [homeCardDismissed, setHomeCardDismissed] = useState(false);
  const leftPanelOpen = mapExpanded || openLabel !== null || eventsOpen;
  useEffect(() => {
    if (leftPanelOpen || isMoving) setVenuesOpen(false);
  }, [leftPanelOpen, isMoving]);

  // Soft-edge feather: on in the dollhouse overview, off in first-person. A
  // live uniform flip — no recompile; the transition blackout hides it.
  useEffect(() => {
    // `uEdgeEnabled` multiplies the rim dissolve, so it doubles as intensity:
    // dollhouse-only floors get a gentle fade instead of the full dissolve.
    edgeFeather.enabled.value =
      phase === "dollhouse" ? (activeFloor?.dollhouseOnly ? 0.4 : 1) : 0;
  }, [phase, activeFloor?.dollhouseOnly]);

  // One poll writes both position-driven highlights into the store:
  //   • atHome      → stopped within HOME_REACH_UNITS of the start position.
  //   • currentDest → stopped within CURRENT_REACH_UNITS of a destination.
  // Refs feed the interval so its deps stay stable — otherwise it is torn down
  // every render and never fires. Setters are read via getState().
  const homeRef = useRef<[number, number, number]>([0, 0, 0]);
  const destsRef = useRef<DestinationsByCategory | undefined>(undefined);
  const wasMovingRef = useRef(false);
  useEffect(() => {
    homeRef.current = (activeFloor?.startPosition ?? startPosition ?? [0, 0, 0]) as [number, number, number];
    destsRef.current = activeFloor?.dests;
  }, [activeFloor, startPosition]);
  useEffect(() => {
    if (phase !== "firstPerson") return;
    const id = setInterval(() => {
      const ctrl = playerControllerRef.current;
      if (!ctrl) return;
      const store = useNavUiStore.getState();
      const p = ctrl.getPosition();
      const moving = ctrl.isMoving();

      // A walk that just started closes the open panel; the highlight comes
      // back from position once stopped. Walking off the ground standpoint
      // ends it, so the markers return as soon as the player leaves.
      if (moving && !wasMovingRef.current) { store.setOpenLabel(null); store.setEventsOpen(false); store.setHotspotInfo(null); store.setAtGroundView(false); }
      wasMovingRef.current = moving;

      const hp = homeRef.current;
      store.setAtHome(!moving && Math.hypot(p.x - hp[0], p.z - hp[2]) < HOME_REACH_UNITS);

      // Only while stopped: during a walk it is hidden anyway, and keeping the
      // last value avoids mid-walk churn.
      if (!moving) {
        const dests = destsRef.current;
        // Keep the latched destination while still standing at its camera:
        // several destinations can share one pose, and re-picking the nearest
        // every tick would steal the latch from the one actually travelled to.
        const prev = store.currentDest;
        if (prev && dests) {
          const pd = dests[prev.category]?.find((x) => x.id === prev.id);
          const cam = pd?.camera;
          if (cam && Math.hypot(p.x - cam.position[0], p.z - cam.position[2]) < CURRENT_REACH_UNITS) {
            return;
          }
        }
        let cur: { id: string; label: string; category: DestinationCategory; option?: string } | null = null;
        let best = CURRENT_REACH_UNITS;
        if (dests) {
          for (const c of DEST_CATEGORIES) {
            for (const dest of dests[c.key] ?? []) {
              if (!dest.camera) continue;
              const d = Math.hypot(p.x - dest.camera.position[0], p.z - dest.camera.position[2]);
              if (d < best) { best = d; cur = { id: dest.id, label: dest.label, category: c.key, option: dest.option }; }
            }
          }
        }
        // Arriving at a new transit hub auto-opens the Transport panel. Fires
        // once on the transition, so a manual close is not undone.
        store.setCurrentDest(cur);
        if (cur && cur.category === "transport" && prev?.id !== cur.id) {
          store.setOpenLabel("transport");
        }
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, playerControllerRef]);
  // The memorial's home pose IS its Main Entrance destination, so homeActive
  // never turns on — the venue card uses this looser condition instead.
  const homeCardBase = atHome && openLabel === null;
  // Standing at the village's Athletes' Hostel — the interior-entry card lives
  // here, the monument card at spawn.
  const atHostel = currentDest?.category === "hostel";
  const [hostelCardDismissed, setHostelCardDismissed] = useState(false);
  useEffect(() => {
    if (!atHostel) setHostelCardDismissed(false);
  }, [atHostel]);
  // The home card shows on arrival, not whenever its conditions re-qualify:
  // opening any overlay while at home counts as dismissing it. It re-arms on
  // leaving home, and explicitly in handleHome.
  useEffect(() => {
    if (!atHome) setHomeCardDismissed(false);
  }, [atHome]);
  useEffect(() => {
    if (openLabel !== null || mapExpanded || venuesOpen || eventsOpen) {
      setHomeCardDismissed(true);
      setHostelCardDismissed(true);
    }
  }, [openLabel, mapExpanded, venuesOpen, eventsOpen]);
  // A venue swap lands directly at the new venue's home, so the not-at-home
  // reset never fires — re-arm explicitly.
  useEffect(() => {
    setHomeCardDismissed(false);
    useNavUiStore.getState().setHotspotInfo(null);
  }, [activeFloorIndex]);
  // A teleport never passes through the walk-start close above (isMoving stays
  // false), so close the card once the latch stops matching it.
  useEffect(() => {
    const store = useNavUiStore.getState();
    if (store.hotspotInfo && store.hotspotInfo.destId !== currentDest?.id) {
      store.setHotspotInfo(null);
    }
  }, [currentDest?.id]);

  /**
   * Exactly one overlay at a time — Resources, the map, the instructions card
   * and a hotspot's data card each own the screen. Callers name what they are
   * KEEPING, so a new overlay is one line here rather than an edit to every
   * other button.
   */
  const closeOverlays = useCallback(
    (keep?: "resources" | "map" | "instructions" | "data") => {
      if (keep !== "resources") setHotspotsFlapOpen(false);
      if (keep !== "map") setMapExpanded(false);
      if (keep !== "instructions") setInstructionsOpen(false);
      if (keep !== "data") useNavUiStore.getState().setHotspotInfo(null);
    },
    [setMapExpanded],
  );

  // A marker click opens its card from inside the canvas, which never touches
  // these panels — so the card clears the others from here, not at its call site.
  const dataCardOpen = !!hotspotInfo;
  useEffect(() => {
    if (dataCardOpen) closeOverlays("data");
  }, [dataCardOpen, closeOverlays]);

  // The floor authored as a transition — now only labels the accommodation overlay.
  const exploreT = activeFloor?.transitions?.[0];

  // Interior floors get a stripped-down UI; Home there exits to the village.
  const inInterior = !!activeFloor?.interior;
  // The hotel-room interior floor — "Explore Hotel Room" swaps straight into it.
  const hotelIndex = useMemo(() => floors.findIndex((f) => f.id === "hotel-room"), [floors]);
  const exitToVillage = useCallback(() => {
    const idx = floors.findIndex((f) => !f.interior);
    goHome();
    playerControllerRef.current?.clearPreview();
    handleFloorSelect(idx >= 0 ? idx : 0);
  }, [floors, goHome, playerControllerRef, handleFloorSelect]);
  const interiorHome = useCallback(() => {
    const ctrl = playerControllerRef.current;
    if (!ctrl) return;
    const p = (activeFloor?.startPosition ?? startPosition ?? [0, 0, 0]) as [number, number, number];
    const r = (activeFloor?.startRotation ?? startRotation ?? [0, 0, 0]) as [number, number, number];
    const y = ctrl.probeFloorY(p[0], p[2], p[1]) ?? p[1];
    triggerFloorTransition(() => {
      ctrl.teleportTo([p[0], y, p[2]], r);
    });
  }, [activeFloor, startPosition, startRotation, playerControllerRef, triggerFloorTransition]);

  // Home = no overlay + home position, with at-home marked optimistically.
  const handleHome = useCallback(() => {
    // An arrival, so nothing that was open belongs to where the player lands.
    closeOverlays();
    setVenuesOpen(false);
    // Home only ever (re)opens the at-home card; only its X closes it.
    setHomeCardDismissed(false);
    goHome();
    const ctrl = playerControllerRef.current;
    ctrl?.clearPreview();
    const floorStart = activeFloor?.startPosition;
    const p = (floorStart ?? startPosition ?? [0, 0, 0]) as [number, number, number];
    const r = (activeFloor?.startRotation ?? startRotation ?? [0, 0, 0]) as [number, number, number];
    const surfaceY = ctrl?.probeFloorY(p[0], p[2], p[1]) ?? p[1];
    // Fade to black → snap to the start pose → fade back in, as teleports do.
    triggerFloorTransition(() => {
      ctrl?.teleportTo([p[0], surfaceY, p[2]], r);
    });
    setAtHome(true);
  }, [goHome, playerControllerRef, activeFloor, startPosition, startRotation, setAtHome, closeOverlays, triggerFloorTransition]);

  /**
   * "First Person" — stand at the authored pose that is on the navmesh.
   *
   * Not handleHome with a different constant: Home is an arrival (re-arms the
   * at-home card, asserts `atHome`), this is a relocation that says nothing
   * about where it lands. The poll above recomputes `currentDest`/`atHome`
   * from live position, so writing either here would only fight it.
   *
   * /v3 overrides the config pose with `first-person-view.ts`; the fallback is
   * what makes deleting that file enough to restore the config behaviour. Read
   * unconditionally, not behind the `??` — `useSite` is a hook.
   */
  const configFirstPerson = useSite().scene.cameras.firstPerson;
  const firstPersonPose = FIRST_PERSON_VIEW ?? configFirstPerson;
  const handleFirstPerson = useCallback(() => {
    const ctrl = playerControllerRef.current;
    if (!ctrl || !firstPersonPose) return;
    closeOverlays();
    ctrl.clearPreview();
    // No markers while down there: the poll latches `currentDest` from live XZ
    // a tick later, which would otherwise light up the nearest layout's set.
    useNavUiStore.getState().enterGroundView();
    const p = firstPersonPose.position as [number, number, number];
    const r = firstPersonPose.rotation as [number, number, number];
    // The authored Y is the camera's height, not the ground — probe the floor
    // and let teleportTo re-add the eye height, as Home does.
    const surfaceY = ctrl.probeFloorY(p[0], p[2], p[1]) ?? p[1];
    triggerFloorTransition(() => {
      ctrl.teleportTo([p[0], surfaceY, p[2]], r);
    });
  }, [firstPersonPose, playerControllerRef, closeOverlays, triggerFloorTransition]);

  /** The First Person circle, or nothing. Hoisted so the dock and the
   *  instructions card are gated by the same value. */
  const firstPersonAction = !uiFrozen && firstPersonPose ? handleFirstPerson : undefined;

  // The map and the label panel share the open category, so the label is kept
  // and the map opens on the list the panel showed. Only the selection and
  // preview route are dropped.
  const handleMapExpanded = useCallback((open: boolean) => {
    if (!open) return;
    useNavUiStore.getState().setSelectedId(null);
    playerControllerRef.current?.clearPreview();
  }, [playerControllerRef]);

  // Crowd Flow fly-over: opening the category lifts the player to the authored
  // aerial pose, closing it returns to the pre-fly spot. The return fires only
  // if still at the aerial pose, so a destination teleport out of it wins.
  const crowdFly = activeFloor?.crowdFlowGlb?.flyCamera;
  const crowdOpen = openLabel === "crowdflow";
  const preCrowdPose = useRef<{ pos: [number, number, number]; yaw: number } | null>(null);
  const wasCrowdOpen = useRef(false);
  useEffect(() => {
    const ctrl = playerControllerRef.current;
    if (!ctrl || !crowdFly) { wasCrowdOpen.current = crowdOpen; return; }
    if (crowdOpen && !wasCrowdOpen.current) {
      const foot = ctrl.getFootPosition();
      preCrowdPose.current = { pos: [foot.x, foot.y, foot.z], yaw: ctrl.getRotationY() };
      triggerFloorTransition(() => {
        const ch = ctrl.getPosition().y - ctrl.getFootPosition().y;
        ctrl.teleportTo(
          [crowdFly.position[0], crowdFly.position[1] - ch, crowdFly.position[2]],
          crowdFly.rotation,
        );
        ctrl.setPitchLock(true);
      });
    } else if (!crowdOpen && wasCrowdOpen.current && preCrowdPose.current) {
      const prev = preCrowdPose.current;
      preCrowdPose.current = null;
      triggerFloorTransition(() => {
        const cam = ctrl.getPosition();
        const stillAerial =
          Math.hypot(cam.x - crowdFly.position[0], cam.z - crowdFly.position[2]) < 5 &&
          cam.y > crowdFly.position[1] * 0.5;
        if (stillAerial && !ctrl.isMoving()) {
          ctrl.teleportTo(prev.pos, [0, prev.yaw, 0]);
        }
      });
    }
    wasCrowdOpen.current = crowdOpen;
  }, [crowdOpen, crowdFly, playerControllerRef, triggerFloorTransition]);

  // Completes only at 100% AND both models downloaded, so it never hides early.
  const revealProgress = useProgressStore((s) => s.revealProgress);
  const loaderDone = revealProgress >= 0.999 && othersCached;

  return (
    <>
      <ForceLandscape />
      {/* Device fullscreen toggle — self-gates to touch devices in landscape. */}
      {/* <FullscreenButton /> */}
      {!inlineMode && showHud && (
        <HoloTwinHud
          progress={0}
          visible={!loaderDone}
          onFadeComplete={() => setShowHud(false)}
          unitName={unitName}
          // Let the preview point-cloud behind show through once it glows in.
          revealVeil={!!ui.sceneContent.dollHousePreviewUrl}
        />
      )}
      {/* Dollhouse card — first visit only; teaches orbiting and the
          double-click that leads inside. */}
      {!inlineMode && hasDollHouse && (
        <InstructionsCard
          mode="dollhouse"
          visible={isReady && phase === "overlay"}
          onDismiss={() => {
            markInstructionsSeen();
            setPhase("dollhouse");
          }}
        />
      )}

      {/* First-person card — first arrival, and any press of the dock's
          Instructions button. Floats in place, where the controls apply. */}
      {phase === "firstPerson" && (
        <InstructionsCard
          mode="firstPerson"
          showFirstPerson={!!firstPersonAction}
          visible={isReady && instructionsOpen}
          onDismiss={() => {
            markFpInstructionsSeen();
            setInstructionsOpen(false);
          }}
        />
      )}

      {isReady && phase === "firstPerson" && !inInterior && (
        <Minimap entered={mapEntered} onExpandedChange={handleMapExpanded} />
      )}

      {/* Google-Maps-style turn-by-turn banner — mirrors the 3D route ribbon.
          Hidden inside apartment interiors. */}
      <NavHud ctrlRef={playerControllerRef} visible={phase === "firstPerson" && isMoving && !inInterior && navHud} dests={activeFloor?.dests} />

      {/* Top-center "You're currently at {place}" pill — shown whenever the
          player is standing at a label destination (any label), independent of
          whether its panel is open. Tap to open that label's list. Clears by
          position when they move away / start walking elsewhere.
          COMMENTED OUT for now (memorial demo) — do not delete.
      {isReady && phase === "firstPerson" && !inInterior && currentDest && (
        <ReachedBanner
          name={currentDest.label}
          show={mapEntered && stillUi && !mapExpanded && !fadeVisible}
          onDismiss={() => setOpenLabel(currentDest.category)}
        />
      )}
      */}

      {/* Hotspot readout — opened by clicking a 3D marker. The click arrives as
          (destination, marker index), which resolves back to a hotspot id. */}
      {isReady && hotspotInfo && !fadeVisible && (
        <HotspotDataCard
          destId={hotspotInfo.destId}
          index={hotspotInfo.index}
          onClose={() => setHotspotInfo(null)}
        />
      )}

      {/* Accommodation overlay — shown at home when the floor has an interior
          to step into, with a "view the rooms" action that swaps into it.
          Currently dead on the village, which authors no `transitions`; its
          interior-entry UI lives on the hostel card below. */}
      {isReady && phase === "firstPerson" && !inInterior && homeCardBase && exploreT && !homeCardDismissed && stillUi && !mapExpanded && !venuesOpen && (
        <div
          style={{ ...NAV_GLASS_PANEL, opacity: mapEntered && !fadeVisible ? 1 : 0 }}
          className="fixed left-[88px] top-4 z-[115] flex w-[340px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[14px] p-6 transition-opacity duration-[220ms] short:left-[54px] short:top-1 short:w-[236px] short:max-w-[calc(100vw-64px)] short:rounded-[10px] short:p-3 short:origin-top-left short:scale-[0.8]"
        >
          <PanelHeader
            title="Athlete Accommodation"
            subtitle={`${floors.find((f) => f.id === exploreT.targetFloorId)?.label ?? "Block"} · LA 28 Olympic Village`}
            onClose={() => setHomeCardDismissed(true)}
          />

          <p className="nav-body mt-3 text-[13px] font-normal leading-relaxed short:mt-2 short:text-[12px]" style={{ color: "var(--nav-text-dim)" }}>
            This is the accommodation provided to participants during the Games.
          </p>
        </div>
      )}

      {/* Memorial venue card — shown at home on the coliseum. Gated on
          homeCardBase, not homeActive: the memorial's home pose IS the Main
          Entrance destination, so homeActive would never turn on. */}
      {isReady && phase === "firstPerson" && !inInterior && homeCardBase && activeFloor?.id === "memorial" && !homeCardDismissed && stillUi && !mapExpanded && !venuesOpen && (
        <div
          style={{ ...NAV_GLASS_PANEL, opacity: mapEntered && !fadeVisible ? 1 : 0 }}
          className="fixed left-[88px] top-4 z-[115] flex w-[340px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[14px] p-6 transition-opacity duration-[220ms] short:left-[54px] short:top-1 short:w-[236px] short:max-w-[calc(100vw-64px)] short:rounded-[10px] short:p-3 short:origin-top-left short:scale-[0.8]"
        >
          <PanelHeader
            title="LA Memorial Coliseum"
            subtitle="Exposition Park Zone"
            onClose={() => setHomeCardDismissed(true)}
          />

          <div
            className="ui-scrollbar nav-body mt-3 flex max-h-[46dvh] flex-col gap-2.5 overflow-y-auto text-[13px] font-normal leading-relaxed short:mt-2 short:max-h-[52dvh] short:gap-2 short:text-[12px]"
            style={{ color: "var(--nav-text-dim)" }}
          >
            {/* Two paragraphs, split exactly as on the official la28.org venue page. */}
            <p>
              LA Memorial Coliseum is one of the most illustrious stadiums in the United States.
              Built in 1923, it serves as a living memorial to all who served in the U.S. Armed
              Forces during World War I. It is the home stadium for the USC Trojans Football
              team, hosted the first Super Bowl and was used in the 1932 and 1984 Olympic Games.
            </p>
            <p>
              In 2028, it will become the first venue in history to host at three Games. In
              addition to being the home of Athletics and Para Athletics at the 2028 Games, it
              will co-host the Olympic Opening Ceremony with 2028 Stadium in a dual-venue
              celebration and host both the Olympic and Paralympic Closing Ceremonies.
            </p>
          </div>
        </div>
      )}

      {/* Interior exit tab — top-left corner; leaves the apartment back to the
          village. */}
      {isReady && phase === "firstPerson" && inInterior && (
        <button
          type="button"
          title="Exit to village"
          onClick={exitToVillage}
          className="fixed left-6 top-6 z-[116] flex h-[42px] cursor-pointer items-center gap-2 rounded-[14px] pl-3 pr-4 transition-[opacity,transform,filter] duration-[420ms] ease-out hover:brightness-110 short:left-2 short:top-2 short:h-9 short:gap-1.5 short:pl-2 short:pr-3"
          style={{
            background: "var(--nav-glass)",
            backdropFilter: "var(--nav-backdrop)",
            WebkitBackdropFilter: "var(--nav-backdrop)",
            isolation: "isolate",
            willChange: "backdrop-filter",
            border: "1.5px solid var(--nav-border)",
            boxShadow: "var(--nav-shadow-chip)",
            opacity: mapEntered && !fadeVisible && !mapExpanded ? 1 : 0,
            // Leaves off the left edge, as the Resources panel beside it does.
            transform: mapExpanded ? "translateX(calc(-100% - 24px))" : "translateX(0)",
            pointerEvents: mapExpanded ? "none" : undefined,
          }}
        >
          <ArrowLeft size={17} strokeWidth={2} color="var(--nav-text)" className="short:h-[15px] short:w-[15px]" />
          <span className="nav-display text-[13.5px] font-semibold short:text-[12px]" style={{ color: "var(--nav-text)" }}>Exit</span>
        </button>
      )}

      {/* Interior dock: just a small round Home (reset to the interior's start)
          or a red Stop while moving — nothing else (no speed, no labels). */}
      {phase === "firstPerson" && inInterior && (
        <button
          type="button"
          title={isMoving ? "Stop" : "Home"}
          onClick={() => (isMoving ? playerControllerRef.current?.stopNavigation() : interiorHome())}
          className="fixed bottom-6 left-1/2 z-120 flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-[14px] transition-[opacity,transform] duration-[280ms] ease-out hover:brightness-110 short:bottom-3 short:h-[38px] short:w-[38px] short:rounded-[10px]"
          style={{
            background: "var(--nav-glass)",
            backdropFilter: "var(--nav-backdrop)",
            WebkitBackdropFilter: "var(--nav-backdrop)",
            isolation: "isolate",
            willChange: "backdrop-filter",
            border: "1.5px solid var(--nav-border)",
            boxShadow: "var(--nav-shadow-dock)",
            opacity: mapEntered ? 1 : 0,
            transform: `translateX(-50%) translateY(${mapEntered ? "0px" : "20px"})`,
          }}
        >
          {isMoving ? (
            <Square size={15} color="var(--nav-text)" strokeWidth={2} style={{ fill: "var(--nav-text)" }} />
          ) : (
            <Home size={18} strokeWidth={1.9} color="var(--nav-text)" />
          )}
        </button>
      )}

      {/* Left edge: the "Resources" panel — layouts, each expandable to its
          hotspots. Tucks away behind any overlay that owns the screen and
          slides back when it closes, keeping whatever was unfolded. */}
      {phase === "firstPerson" && (
        <HotspotsFlap
          open={hotspotsFlapOpen}
          onOpenChange={(next) => {
            if (next) closeOverlays("resources");
            setHotspotsFlapOpen(next);
          }}
          disabled={fadeVisible}
          // The map opens over this edge, so the panel slides out of its way.
          tucked={isMoving || instructionsOpen || dataCardOpen || mapExpanded}
        />
      )}

      {/* Bottom dock: the four actions that work from anywhere. */}
      {phase === "firstPerson" && (
        <BottomBar
          // Fades out under the same overlays the left flap tucks behind.
          visible={mapEntered && !fadeVisible && !isMoving && !instructionsOpen && !dataCardOpen}
          // Resources or the map open: drop the dock off the bottom edge. On a
          // landscape phone either ends within a thumb's width of these
          // circles. Tucked, not hidden, so the Map circle stays reachable.
          tucked={hotspotsFlapOpen || mapExpanded}
          mapOpen={mapExpanded}
          onOpenMap={() => {
            // Read the toggle before closeOverlays sets it false, or the map
            // could only ever be closed and immediately reopened.
            const next = !mapExpanded;
            closeOverlays("map");
            setMapExpanded(next);
          }}
          onDollhouse={() => {
            closeOverlays();
            // The walking view streams chunks and the dollhouse draws a single
            // GLB, so this tears one model down and builds another.
            // `expectedKey` holds the blackout until that GLB is mounted —
            // it was released on the way in, so it has to re-parse first.
            triggerFloorTransition(() => setPhase("dollhouse"), {
              expectedKey: activeFloor?.id,
            });
          }}
          onInstructions={() => {
            closeOverlays("instructions");
            setInstructionsOpen(true);
          }}
          onHome={handleHome}
          // Map stays in the dock, greyed and out of the tab order — removing
          // it would reflow the row and move where Home and Dollhouse land.
          // First Person is omitted outright: it has never shipped, and
          // `undefined` is what a site with no authored pose passes anyway.
          mapDisabled={uiFrozen}
          onFirstPerson={firstPersonAction}
        />
      )}

      {/* Stop + speed — bottom-centre dock while walking. The open map window
          has its own Stop, so hide this then. */}
      {phase === "firstPerson" && !inInterior && isMoving && !mapExpanded && (
        <div
          className="fixed bottom-6 left-1/2 z-120 flex items-center gap-1.5 rounded-[14px] p-[5px_7px] transition-[opacity,transform] duration-[280ms] ease-out short:bottom-2 short:rounded-[10px] short:p-[4px_6px]"
          style={{
            background: "var(--nav-glass)",
            backdropFilter: "var(--nav-backdrop)",
            WebkitBackdropFilter: "var(--nav-backdrop)",
            isolation: "isolate",
            willChange: "backdrop-filter",
            border: "1.5px solid var(--nav-border)",
            boxShadow: "var(--nav-shadow-dock)",
            opacity: mapEntered ? 1 : 0,
            transform: `translateX(-50%) translateY(${mapEntered ? "0px" : "20px"})`,
          }}
        >
          <button
            type="button"
            onClick={() => playerControllerRef.current?.stopNavigation()}
            title="Stop"
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[14px] pl-3 pr-4 transition-[filter] hover:brightness-110"
            style={{ background: "var(--nav-accent)" }}
          >
            <Square size={14} color="#ffffff" strokeWidth={2} className="fill-white" />
            <span className="nav-display text-[13px] font-semibold text-white">Stop</span>
          </button>
          <SpeedControl ctrlRef={playerControllerRef} />
        </div>
      )}

      {/* Monument home card — the village spawn pose IS the Olympic Village
          Monument, so the at-home overlay presents it. */}
      {isReady && phase === "firstPerson" && !inInterior && activeFloor?.id === "village" && homeCardBase && !homeCardDismissed && stillUi && !mapExpanded && !venuesOpen && (
        <div
          style={{ ...NAV_GLASS_PANEL, opacity: mapEntered && !fadeVisible ? 1 : 0 }}
          className="fixed left-[88px] top-4 z-[115] flex w-[340px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[14px] p-6 transition-opacity duration-[220ms] short:left-[54px] short:top-1 short:w-[236px] short:max-w-[calc(100vw-64px)] short:rounded-[10px] short:p-3 short:origin-top-left short:scale-[0.8]"
        >
          <PanelHeader
            title="Olympic Village Monument"
            subtitle="Landmark · LA 28 Olympic Village"
            onClose={() => setHomeCardDismissed(true)}
          />

          <p className="nav-body mt-3 text-[13px] font-normal leading-relaxed short:mt-2 short:text-[12px]" style={{ color: "var(--nav-text-dim)" }}>
            The monument marks the heart of the LA 28 Olympic Village — the
            athletes&rsquo; central gathering point and the village&rsquo;s
            signature photo spot.
          </p>
        </div>
      )}

      {/* Hostel overlay — shown standing at the village's Athletes' Hostel.
          "Explore the room" blacks out and swaps straight into the hotel
          interior and its navmesh; handleFloorSelect owns the blackout and
          waits for the model before fading back. */}
      {isReady && phase === "firstPerson" && !inInterior && activeFloor?.id === "village" && atHostel && openLabel === null && hotelIndex >= 0 && !hostelCardDismissed && stillUi && !mapExpanded && !venuesOpen && (
        <div
          style={{ ...NAV_GLASS_PANEL, opacity: mapEntered && !fadeVisible ? 1 : 0 }}
          className="fixed left-[88px] top-4 z-[115] flex w-[340px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[14px] p-6 transition-opacity duration-[220ms] short:left-[54px] short:top-1 short:w-[236px] short:max-w-[calc(100vw-64px)] short:rounded-[10px] short:p-3 short:origin-top-left short:scale-[0.8]"
        >
          <PanelHeader
            title="Athletes&rsquo; Hostel"
            subtitle="On-site accommodation · LA 28 Olympic Village"
            onClose={() => setHostelCardDismissed(true)}
          />

          <p className="nav-body mt-3 text-[13px] font-normal leading-relaxed short:mt-2 short:text-[12px]" style={{ color: "var(--nav-text-dim)" }}>
            The hostel houses participating athletes during the Games — compact,
            fully-furnished rooms a short walk from the venues. Step inside to
            explore a room from the inside.
          </p>

          <button
            type="button"
            title="Explore the hostel room from inside"
            onClick={() => handleFloorSelect(hotelIndex)}
            disabled={fadeVisible}
            className="nav-display mt-4 flex h-[42px] w-full cursor-pointer items-center justify-center rounded-[12px] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed short:mt-3 short:h-[36px] short:rounded-[10px]"
            style={{ background: "var(--nav-accent)" }}
          >
            <span className="text-[13.5px] font-semibold text-white short:text-[12px]">Explore the room</span>
          </button>
        </div>
      )}

      <FadeScreen visible={fadeVisible} />

      {/* ?debug=true only — look and framing in one panel: sun, lights, grade,
          FOV, the navmesh overlay and a live camera binding, plus the JSON to
          paste back into the site file. */}
      {ui.sceneContent.debug && (
        <>
          <DebugPanel />
          <DebugCameraEditor />
        </>
      )}
    </>
  );
}
