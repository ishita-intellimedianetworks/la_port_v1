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
import { BottomBar } from "./overlay/bottom-bar";
import { SpeedControl } from "./overlay/speed-control";
import { useTerminalUi } from "./context/ui-context";
import type { DestinationCategory, DestinationsByCategory } from "@/shared/types";
import { useNavUiStore } from "./stores/nav-ui-store";
import { NAV_GLASS_PANEL } from "./overlay/glass-theme";
import { HotspotDataCard } from "./overlay/hotspot-card";
import { SkyDebug } from "./overlay/sky-debug";
import { tick } from "@/shared/runtime/diagnostics";
import { edgeFeather } from "./scene/model-loader/edge-feather";

// "Home" / "currently at" are decided purely by XZ proximity to the fixed start
// / destination spot (rotation is irrelevant). Tight, so any real step away clears them.
const HOME_REACH_UNITS = 0.8;
const CURRENT_REACH_UNITS = 0.8;

export default function Overlays() {
  tick("render:Overlays");
  // Dev-only (?diag=true): a frozen page is either a render storm or a blocked
  // main thread. Counting store writes, renders and frames separates the two.
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
  // Persisted "dollhouse instructions seen" flag — once the overlay's Enter is
  // tapped we mark it seen so the instructions don't reappear next visit.
  const markInstructionsSeen = useAppStore((s) => s.markInstructionsSeen);
  const markFpInstructionsSeen = useAppStore((s) => s.markFpInstructionsSeen);
  const fpInstructionsSeen = useAppStore((s) => s.fpInstructionsSeen);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  // Show the first-person card the first time the player lands in first
  // person. `fpInstructionsSeen` is persisted, so this fires once and the
  // dock's button is the way back to it afterwards.
  useEffect(() => {
    if (phase === "firstPerson" && !fpInstructionsSeen) setInstructionsOpen(true);
  }, [phase, fpInstructionsSeen]);
  const activeFloor = floors[activeFloorIndex];
  // All destination-nav UI state lives in one store (shared with the 3D panel + minimap).
  const openLabel = useNavUiStore((s) => s.openLabel);
  const lastLabel = useNavUiStore((s) => s.lastLabel);
  const currentDest = useNavUiStore((s) => s.currentDest);
  const atHome = useNavUiStore((s) => s.atHome);
  const setAtHome = useNavUiStore((s) => s.setAtHome);
  const goHome = useNavUiStore((s) => s.goHome);
  const setMapExpanded = useNavUiStore((s) => s.setMapExpanded);
  const mapExpanded = useNavUiStore((s) => s.mapExpanded);
  const eventsOpen = useNavUiStore((s) => s.eventsOpen);
  // Only walks started from a label/directions panel raise the turn HUD; manual
  // map clicks and 3D double-clicks walk silently (see navigateToFloor).
  const navHud = useNavUiStore((s) => s.navHud);
  // Clicked 3D hotspot marker → centred info overlay (memorial hotspots).
  const hotspotInfo = useNavUiStore((s) => s.hotspotInfo);
  const setHotspotInfo = useNavUiStore((s) => s.setHotspotInfo);

  // `isMoving` can jitter for a frame or two (arrival settling into the destination
  // pose, teleport snaps, path corners) and the overlays gate on it — so they
  // blinked in/out mid-transition. `stillUi` hides panels IMMEDIATELY when a
  // walk starts, but only shows them again after ~300ms of continuous
  // stillness, so a brief stop/settle never flashes a panel.
  const [stillUi, setStillUi] = useState(!isMoving);
  useEffect(() => {
    if (isMoving) { setStillUi(false); return; }
    const t = setTimeout(() => setStillUi(true), 300);
    return () => clearTimeout(t);
  }, [isMoving]);

  // Venues flap (right edge) open state, lifted here so it's mutually exclusive
  // with the left-side panels: opening a left panel — or walking — closes it,
  // and opening it closes the left panels.
  const [venuesOpen, setVenuesOpen] = useState(false);
  // The one edge flap ("Resources": layouts + their hotspots), mutually
  // exclusive with the map.
  const [hotspotsFlapOpen, setHotspotsFlapOpen] = useState(false);
  // The at-home accommodation/hostel cards auto-open at home; this lets the user
  // dismiss them with the corner close button. Reset when leaving home (below) so
  // the card returns on the next arrival.
  const [homeCardDismissed, setHomeCardDismissed] = useState(false);
  const leftPanelOpen = mapExpanded || openLabel !== null || eventsOpen;
  useEffect(() => {
    if (leftPanelOpen || isMoving) setVenuesOpen(false);
  }, [leftPanelOpen, isMoving]);

  // Soft-edge feather on the model: ON in the dollhouse overview (rim dissolves
  // into the backdrop), OFF (sharp) in first-person. A live uniform flip — no
  // recompile; the transition blackout hides the switch.
  useEffect(() => {
    // `uEdgeEnabled` multiplies the rim dissolve, so it doubles as an intensity.
    // Dollhouse-only floors (e.g. the memorial) get a gentle fade (0.4) rather
    // than the full dissolve; other dollhouse floors get the full effect.
    edgeFeather.enabled.value =
      phase === "dollhouse" ? (activeFloor?.dollhouseOnly ? 0.4 : 1) : 0;
  }, [phase, activeFloor?.dollhouseOnly]);


  // Where the player ACTUALLY is drives two highlights, via one stable-deps poll
  // that WRITES the shared store. Both are pure XZ proximity to a FIXED point
  // (no rotation, no moving anchor):
  //   • atHome     → stopped within HOME_REACH_UNITS of the start position.
  //   • currentDest → stopped within CURRENT_REACH_UNITS of a label destination
  //     (banner + hidden from its own list). Because the reference is the destination's
  //     fixed spot, stepping away grows the distance and clears it — turning in
  //     place does NOT (rotation is ignored).
  // Refs feed the interval so its deps stay stable (else it'd be torn down each
  // render and never fire → Home stuck "selected" after walking away). Store
  // setters are read via getState() so they never need to be deps.
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

      // A walk that just STARTED closes the open panel so nothing stale lights
      // up after it (the highlight comes back from position once stopped).
      if (moving && !wasMovingRef.current) { store.setOpenLabel(null); store.setEventsOpen(false); store.setHotspotInfo(null); }
      wasMovingRef.current = moving;

      const hp = homeRef.current;
      store.setAtHome(!moving && Math.hypot(p.x - hp[0], p.z - hp[2]) < HOME_REACH_UNITS);

      // Recompute "currently at" only while stopped — during a walk it's hidden
      // (gated on !isMoving) and keeping the last value avoids mid-walk churn.
      if (!moving) {
        const dests = destsRef.current;
        // KEEP the latched destination while the player is still standing at
        // its camera. Several destinations can share ONE camera pose (CCTV /
        // Wi-Fi / Concessions all arrive at the concession stand) — re-picking
        // the nearest by category order every tick would steal the latch from
        // the one the player actually teleported to (its markers blinked off
        // after a second).
        const prev = store.currentDest;
        if (prev && dests) {
          const pd = dests[prev.category]?.find((x) => x.id === prev.id);
          const cam = pd?.camera;
          if (cam && Math.hypot(p.x - cam.position[0], p.z - cam.position[2]) < CURRENT_REACH_UNITS) {
            return; // still at the latched destination — nothing to change
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
        // Arriving at a transit hub (a NEW one — fires once on the transition,
        // so a manual close while standing there isn't re-opened) auto-opens the
        // Transport panel, surfacing the live bus list without reopening by hand.
        store.setCurrentDest(cur);
        if (cur && cur.category === "transport" && prev?.id !== cur.id) {
          store.setOpenLabel("transport");
        }
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, playerControllerRef]);
  // The memorial's home pose IS its Main Entrance destination, so currentDest
  // latches there and homeActive never turns on — the venue card uses this
  // looser "at home, nothing open" condition instead.
  const homeCardBase = atHome && openLabel === null;
  // Standing at the village's Athletes' Hostel destination — shows the
  // "Explore the room" card there (the interior-entry UI lives at the hostel;
  // the home/monument card lives at spawn).
  const atHostel = currentDest?.category === "hostel";
  const [hostelCardDismissed, setHostelCardDismissed] = useState(false);
  useEffect(() => {
    if (!atHostel) setHostelCardDismissed(false);
  }, [atHostel]);
  // The home card shows on ARRIVAL at home (spawn / Home button), not whenever
  // its conditions re-qualify: opening any overlay while standing at home
  // counts as dismissing it, so CLOSING that overlay doesn't pop the home card
  // back open. It re-arms only once the player actually leaves home (the Home
  // button also re-arms explicitly in handleHome).
  useEffect(() => {
    if (!atHome) setHomeCardDismissed(false);
  }, [atHome]);
  useEffect(() => {
    if (openLabel !== null || mapExpanded || venuesOpen || eventsOpen) {
      setHomeCardDismissed(true);
      setHostelCardDismissed(true);
    }
  }, [openLabel, mapExpanded, venuesOpen, eventsOpen]);
  // A venue swap is an ARRIVAL: the switch is made from the venues panel
  // (which dismisses the card, above) and the player lands directly at the new
  // venue's home, so the not-at-home reset never fires — re-arm explicitly so
  // the new venue greets with its home card.
  useEffect(() => {
    setHomeCardDismissed(false);
    // A venue swap invalidates any open hotspot-info card (its markers are gone).
    useNavUiStore.getState().setHotspotInfo(null);
  }, [activeFloorIndex]);
  // A TELEPORT to another destination never passes through the walk-start
  // close above (isMoving stays false), so an open hotspot card lingered over
  // the new spot. Close it as soon as the latched destination stops matching
  // the card's destination.
  useEffect(() => {
    const store = useNavUiStore.getState();
    if (store.hotspotInfo && store.hotspotInfo.destId !== currentDest?.id) {
      store.setHotspotInfo(null);
    }
  }, [currentDest?.id]);

  /**
   * EXACTLY ONE overlay at a time.
   *
   * Resources, the map, the instructions card and a hotspot's data card each
   * own the screen while they are up, so opening any of them closes the rest.
   * This used to be a handful of `setThisFalse()` calls copied into each
   * button, and they had drifted: the map closed Resources but not the
   * instructions, nothing at all closed the data card, and clicking a bead
   * left the Resources panel sitting on top of the card it had just opened.
   *
   * One function, every caller naming what it is KEEPING, so a new overlay is
   * one more line here rather than an edit to every other button.
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

  // Clicking a bead in the 3D scene opens its data card from inside the canvas,
  // which never touches these panels — so the card is the one overlay that has
  // to clear the others from here rather than at its own call site.
  const dataCardOpen = !!hotspotInfo;
  useEffect(() => {
    if (dataCardOpen) closeOverlays("data");
  }, [dataCardOpen, closeOverlays]);

  // "Explore the accommodation" — the floor authored as a transition. Used only
  // to label the accommodation overlay now that the enter-interior action is off.
  const exploreT = activeFloor?.transitions?.[0];

  // Apartment-interior floors get a stripped-down UI (no minimap / toggle /
  // nav-path); the Home button there EXITS back to the exterior village.
  const inInterior = !!activeFloor?.interior;
  // Index of the hotel-room interior floor — the village "Explore Hotel Room"
  // tab blacks out and swaps straight into it (no fly-in, no double-click).
  const hotelIndex = useMemo(() => floors.findIndex((f) => f.id === "hotel-room"), [floors]);
  const exitToVillage = useCallback(() => {
    const idx = floors.findIndex((f) => !f.interior);
    goHome();
    playerControllerRef.current?.clearPreview();
    handleFloorSelect(idx >= 0 ? idx : 0);
  }, [floors, goHome, playerControllerRef, handleFloorSelect]);
  // Interior Home = back to this interior's start pose (not an exit).
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

  // Home = no overlay + home position: close any label panel, drop any
  // selection / "currently at", clear the preview, return to the start view
  // (mark at-home optimistically).
  const handleHome = useCallback(() => {
    // Going home is an arrival, so nothing that was open belongs to where the
    // player is about to be — the map would linger over the teleport, and a
    // panel would hide the home overlay behind it.
    closeOverlays();
    setVenuesOpen(false);
    // Clicking Home only ever (re)opens the at-home card — re-clicking never
    // closes it; only the card's X does.
    setHomeCardDismissed(false);
    goHome();
    const ctrl = playerControllerRef.current;
    ctrl?.clearPreview();
    const floorStart = activeFloor?.startPosition;
    const p = (floorStart ?? startPosition ?? [0, 0, 0]) as [number, number, number];
    const r = (activeFloor?.startRotation ?? startRotation ?? [0, 0, 0]) as [number, number, number];
    const surfaceY = ctrl?.probeFloorY(p[0], p[2], p[1]) ?? p[1];
    // Fade to black → snap to the start pose → fade back in. No walking or
    // gliding across the scene — the same soft transition the destination teleport uses.
    triggerFloorTransition(() => {
      ctrl?.teleportTo([p[0], surfaceY, p[2]], r);
    });
    setAtHome(true);
  }, [goHome, playerControllerRef, activeFloor, startPosition, startRotation, setAtHome, closeOverlays, triggerFloorTransition]);

  // Hide the standing-at destination from its own list (re-appears once it un-latches).

  // Opening the full map covers the screen. The map and the label panel SHARE
  // the open category + sub-category (nav store), so we keep the label — the
  // map opens on the same list the panel showed (the panel itself hides via
  // its !mapExpanded gate). Only the selection + preview route are dropped so
  // nothing stale lingers behind the map.
  const handleMapExpanded = useCallback((open: boolean) => {
    if (!open) return;
    useNavUiStore.getState().setSelectedId(null);
    playerControllerRef.current?.clearPreview();
  }, [playerControllerRef]);

  // ── Crowd Flow fly-over ────────────────────────────────────────────────────
  // Opening the Crowd Flow category lifts the player to the authored aerial
  // pose (pitch-locked straight down) so the zone heatmap reads at a glance;
  // closing it returns to the pre-fly spot. The return only fires if the
  // player is still AT the aerial pose — leaving via a destination teleport
  // (which also closes the panel) must win, not be snapped back.
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


  // The loader completes only when the progress bar has filled to 100% AND both
  // models are downloaded — so it never hides early.
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
          // Stay up until the bar hits 100% AND both models are downloaded.
          visible={!loaderDone}
          onFadeComplete={() => setShowHud(false)}
          unitName={unitName}
          // A preview point-cloud is loading on the canvas behind — let it
          // show through the loading screen once it starts glowing in.
          revealVeil={!!ui.sceneContent.dollHousePreviewUrl}
        />
      )}
      {/* Dollhouse card — over the dollhouse preview on a first visit. It
          teaches orbiting and the double-click that leads inside; dismissing it
          marks it seen and drops into the dollhouse view. */}
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

      {/* First-person card — on first arrival in first person, and after that
          whenever the dock's Instructions button is pressed. It floats in place
          rather than sending the player back to the dollhouse to read it:
          these are first-person controls, so they belong where they apply. */}
      {phase === "firstPerson" && (
        <InstructionsCard
          mode="firstPerson"
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


      {/* Hotspot readout — opened by CLICKING a 3D marker. The engine reports
          the click as (destination, marker index); a destination IS a layout
          and its markers are that layout's hotspots[] in order, so the pair
          resolves straight back to a hotspot id and its field dictionary. */}
      {isReady && hotspotInfo && !fadeVisible && (
        <HotspotDataCard
          destId={hotspotInfo.destId}
          index={hotspotInfo.index}
          onClose={() => setHotspotInfo(null)}
        />
      )}

      {/* Accommodation overlay — shown at home (like the label panels) when this
          floor has an interior to step into. Frames it as the participants'
          accommodation + the block number, with a "view the rooms" action that
          flies to the transition camera and swaps into the interior. */}
      {/* Gated on homeCardBase (at home + nothing open). Currently dead on the
          village — it authors no `transitions`, so exploreT is undefined; the
          interior-entry UI lives on the hostel-destination card below. */}
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

      {/* Memorial venue card — shown at home (Main Entrance) on the coliseum,
          mirroring the village accommodation overlay: venue name + zone, then
          the venue's story. Dismissed via X; re-appears after walking away.
          NOTE: gated on atHome + no open panel, NOT homeActive — the memorial's
          home pose IS the Main Entrance destination, so `currentDest` latches
          there immediately and homeActive (which requires no current
          destination) would never turn on. */}
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
          className="fixed left-6 top-6 z-[116] flex h-[42px] cursor-pointer items-center gap-2 rounded-[14px] pl-3 pr-4 transition-[filter] hover:brightness-110 short:left-2 short:top-2 short:h-9 short:gap-1.5 short:pl-2 short:pr-3"
          style={{
            background: "var(--nav-glass)",
            backdropFilter: "var(--nav-backdrop)",
            WebkitBackdropFilter: "var(--nav-backdrop)",
            isolation: "isolate",
            willChange: "backdrop-filter",
            border: "1.5px solid var(--nav-border)",
            boxShadow: "var(--nav-shadow-chip)",
            opacity: mapEntered && !fadeVisible ? 1 : 0,
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


      {/* Left edge: the single "Resources" panel — layouts, each expandable
          to its child hotspots. Tucked away behind any overlay that owns the
          screen — the instructions card, or a resource's data card — because
          that overlay is what the viewer is meant to be reading and chrome
          standing beside it competes for attention. It slides back in on its
          own when the overlay closes, keeping whatever was unfolded. */}
      {phase === "firstPerson" && (
        <HotspotsFlap
          open={hotspotsFlapOpen}
          onOpenChange={(next) => {
            if (next) closeOverlays("resources");
            setHotspotsFlapOpen(next);
          }}
          disabled={fadeVisible}
          tucked={isMoving || instructionsOpen || dataCardOpen}
        />
      )}

      {/* Bottom dock: the four actions that work from anywhere. */}
      {phase === "firstPerson" && (
        <BottomBar
          // Fades out under the same overlays the left flap tucks behind: while
          // a card is being read the four circles are not the thing to press,
          // and the way out of the card is the card's own close button.
          visible={mapEntered && !fadeVisible && !isMoving && !instructionsOpen && !dataCardOpen}
          // Resources is open: drop the dock off the bottom edge. The panel is
          // the tallest overlay on the screen and, on a landscape phone, ends
          // within a thumb's width of these circles.
          tucked={hotspotsFlapOpen}
          mapOpen={mapExpanded}
          onOpenMap={() => {
            // Read the toggle BEFORE closeOverlays sets it false, or the map
            // could never be opened — only closed and immediately reopened.
            const next = !mapExpanded;
            closeOverlays("map");
            setMapExpanded(next);
          }}
          onDollhouse={() => {
            closeOverlays();
            // The return leg of the same asymmetry the entry has: the walking
            // view streams chunks and the dollhouse draws a single GLB, so this
            // tears one model down and builds another. `expectedKey` holds the
            // blackout until that GLB is actually mounted — it was released on
            // the way in (deliberate memory policy), so it has to re-parse, and
            // without the gate the fade lifts onto an empty scene.
            triggerFloorTransition(() => setPhase("dollhouse"), {
              expectedKey: activeFloor?.id,
            });
          }}
          onInstructions={() => {
            closeOverlays("instructions");
            setInstructionsOpen(true);
          }}
          onHome={handleHome}
        />
      )}

      {/* Stop + speed — bottom-centre glass dock while walking (the rail keeps its
          icons). The open map window has its own Stop, so hide this then. */}
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

      {/* Monument home card — the village spawn/Home pose IS the Olympic
          Village Monument, so the at-home overlay presents the monument
          (mirroring the memorial venue card). The hostel/interior-entry card
          moved to the hostel destination below. */}
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

      {/* Hostel overlay — shown standing AT the village's Athletes' Hostel
          destination (walk/teleport there via the Hostel category). Describes
          the hostel and carries the "Explore the room" action: one tap blacks
          out and swaps straight into the hotel interior + its navmesh (no
          camera fly-in, no double-click). handleFloorSelect owns the blackout
          and waits for the model before fading back; the Y is snapped to the
          hostel navmesh (see useSceneNavigation). */}
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

      {/* ?debug=true only — the time-of-day slider, next to PerfMeter's readout
          so the sky's cost can be watched while it is being driven. */}
      {ui.sceneContent.debug && <SkyDebug />}
    </>
  );
}
