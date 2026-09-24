"use client";

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
import { useLayoutNavigation } from "./overlay/use-layout-navigation";
import { useStreamVariantId } from "@/streaming/variant";
import { BottomBar } from "./overlay/bottom-bar";
import { SpeedControl } from "./overlay/speed-control";
import { useTerminalUi } from "./context/ui-context";
import { useIsVr } from "@/vr/vr-mode";
import type { DestinationCategory, DestinationsByCategory } from "@/shared/types";
import { useNavUiStore } from "./stores/nav-ui-store";
import { useSecurityStore } from "./stores/security-store";
import { NAV_GLASS_PANEL } from "./overlay/glass-theme";
import { HotspotDataCard, StillPreload } from "./overlay/hotspot-card";
import { DebugPanel } from "./overlay/debug-panel";
import { tick } from "@/shared/runtime/diagnostics";
import { useSite } from "@/config/context";
import { FIRST_PERSON_VIEW } from "./first-person-view";
import { edgeFeather } from "./scene/model-loader/edge-feather";

const HOME_REACH_UNITS = 0.8;

const SECURITY_LAYOUT_ID = "L10";

const SECURITY_INCIDENT_ID = "S07";

const SETTLE_MIN_MS = 350;
const SETTLE_MAX_MS = 1500;
const SETTLE_FRACTION = 0.1;
const SETTLE_FLOOR = 8;

function dressingSettled(): () => boolean {
  let start = -1;
  let peak = 0;
  return () => {
    if (start < 0) start = performance.now();
    const n = useProgressStore.getState().streamDressing;
    if (n > peak) peak = n;
    const elapsed = performance.now() - start;
    if (elapsed < SETTLE_MIN_MS) return false;
    if (elapsed >= SETTLE_MAX_MS) return true;
    if (peak === 0) return true;
    return n <= Math.max(SETTLE_FLOOR, peak * SETTLE_FRACTION);
  };
}
const CURRENT_REACH_UNITS = 0.8;

export default function Overlays() {
  tick("render:Overlays");
  useEffect(() => useNavUiStore.subscribe(() => tick("write:navUiStore")), []);
  const ui = useTerminalUi();
  const vr = useIsVr();
  const {
    inlineMode, unitName,
    floors, startPosition, startRotation,
    phase, setPhase, hasDollHouse, showHud, setShowHud, isReady, isMoving,
    mapEntered,
    activeFloorIndex, othersCached,
    fadeVisible, handleFloorSelect,
    playerControllerRef, triggerFloorTransition,
  } = ui;
  const markInstructionsSeen = useAppStore((s) => s.markInstructionsSeen);
  const markFpInstructionsSeen = useAppStore((s) => s.markFpInstructionsSeen);
  const fpInstructionsSeen = useAppStore((s) => s.fpInstructionsSeen);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

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
  const streamVariant = useStreamVariantId();
  const uiFrozen = streamVariant === "v1";
  const setMapExpanded = useNavUiStore((s) => s.setMapExpanded);
  const mapExpanded = useNavUiStore((s) => s.mapExpanded);
  const eventsOpen = useNavUiStore((s) => s.eventsOpen);
  const navHud = useNavUiStore((s) => s.navHud);
  const hotspotInfo = useNavUiStore((s) => s.hotspotInfo);
  const setHotspotInfo = useNavUiStore((s) => s.setHotspotInfo);

  const [stillUi, setStillUi] = useState(!isMoving);
  useEffect(() => {
    if (isMoving) { setStillUi(false); return; }
    const t = setTimeout(() => setStillUi(true), 300);
    return () => clearTimeout(t);
  }, [isMoving]);

  const [venuesOpen, setVenuesOpen] = useState(false);
  const [hotspotsFlapOpen, setHotspotsFlapOpen] = useState(false);
  const [homeCardDismissed, setHomeCardDismissed] = useState(false);
  const leftPanelOpen = mapExpanded || openLabel !== null || eventsOpen;
  useEffect(() => {
    if (leftPanelOpen || isMoving) setVenuesOpen(false);
  }, [leftPanelOpen, isMoving]);

  useEffect(() => {
    edgeFeather.enabled.value =
      phase === "dollhouse" ? (activeFloor?.dollhouseOnly ? 0.4 : 1) : 0;
  }, [phase, activeFloor?.dollhouseOnly]);

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

      if (moving && !wasMovingRef.current) {
        store.setOpenLabel(null);
        store.setEventsOpen(false);
        store.setHotspotInfo(null);
        store.setAtGroundView(false);
        store.setSelectedHotspotId(null);
      }
      wasMovingRef.current = moving;

      const hp = homeRef.current;
      store.setAtHome(!moving && Math.hypot(p.x - hp[0], p.z - hp[2]) < HOME_REACH_UNITS);

      if (!moving) {
        const dests = destsRef.current;
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
        store.setCurrentDest(cur);
        if (cur && cur.category === "transport" && prev?.id !== cur.id) {
          store.setOpenLabel("transport");
        }
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, playerControllerRef]);
  const homeCardBase = atHome && openLabel === null;
  const atHostel = currentDest?.category === "hostel";
  const [hostelCardDismissed, setHostelCardDismissed] = useState(false);
  useEffect(() => {
    if (!atHostel) setHostelCardDismissed(false);
  }, [atHostel]);
  useEffect(() => {
    if (!atHome) setHomeCardDismissed(false);
  }, [atHome]);
  useEffect(() => {
    if (openLabel !== null || mapExpanded || venuesOpen || eventsOpen) {
      setHomeCardDismissed(true);
      setHostelCardDismissed(true);
    }
  }, [openLabel, mapExpanded, venuesOpen, eventsOpen]);
  useEffect(() => {
    setHomeCardDismissed(false);
    useNavUiStore.getState().setHotspotInfo(null);
  }, [activeFloorIndex]);
  useEffect(() => {
    const store = useNavUiStore.getState();
    if (store.hotspotInfo && store.hotspotInfo.destId !== currentDest?.id) {
      store.setHotspotInfo(null);
    }
  }, [currentDest?.id]);

  const closeOverlays = useCallback(
    (keep?: "resources" | "map" | "instructions" | "data") => {
      if (keep !== "resources") setHotspotsFlapOpen(false);
      if (keep !== "map") setMapExpanded(false);
      if (keep !== "instructions") setInstructionsOpen(false);
      if (keep !== "data") useNavUiStore.getState().setHotspotInfo(null);
    },
    [setMapExpanded],
  );

  const dataCardOpen = !!hotspotInfo;
  useEffect(() => {
    if (dataCardOpen) closeOverlays("data");
  }, [dataCardOpen, closeOverlays]);

  const exploreT = activeFloor?.transitions?.[0];

  const inInterior = !!activeFloor?.interior;
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

  const handleHome = useCallback(() => {
    closeOverlays();
    useSecurityStore.getState().reset();
    setVenuesOpen(false);
    setHomeCardDismissed(false);
    goHome();
    const ctrl = playerControllerRef.current;
    ctrl?.clearPreview();
    const floorStart = activeFloor?.startPosition;
    const p = (floorStart ?? startPosition ?? [0, 0, 0]) as [number, number, number];
    const r = (activeFloor?.startRotation ?? startRotation ?? [0, 0, 0]) as [number, number, number];
    const surfaceY = ctrl?.probeFloorY(p[0], p[2], p[1]) ?? p[1];
    triggerFloorTransition(() => {
      ctrl?.teleportTo([p[0], surfaceY, p[2]], r);
    });
    setAtHome(true);
  }, [goHome, playerControllerRef, activeFloor, startPosition, startRotation, setAtHome, closeOverlays, triggerFloorTransition]);

  const configFirstPerson = useSite().scene.cameras.firstPerson;
  const firstPersonPose = FIRST_PERSON_VIEW ?? configFirstPerson;
  const handleFirstPerson = useCallback(() => {
    const ctrl = playerControllerRef.current;
    if (!ctrl || !firstPersonPose) return;
    closeOverlays();
    ctrl.clearPreview();
    useNavUiStore.getState().enterGroundView();
    useNavUiStore.getState().armStandingAmbient();
    const p = firstPersonPose.position as [number, number, number];
    const r = firstPersonPose.rotation as [number, number, number];
    const surfaceY = ctrl.probeFloorY(p[0], p[2], p[1]) ?? p[1];
    triggerFloorTransition(
      () => {
        ctrl.teleportTo([p[0], surfaceY, p[2]], r);
      },
      { waitUntil: dressingSettled() },
    );
  }, [firstPersonPose, playerControllerRef, closeOverlays, triggerFloorTransition]);

  const firstPersonAction = !uiFrozen && firstPersonPose ? handleFirstPerson : undefined;

  const { goToLayout } = useLayoutNavigation();
  const site = useSite();

  const viewingIncidentId = useSecurityStore((s) => s.viewingIncidentId);
  const securityHotspotById = useSecurityStore((s) => s.hotspotById);
  const backToIncidents = useCallback(() => {
    const incident = useSecurityStore.getState().viewingIncidentId;
    const centre = securityHotspotById[SECURITY_INCIDENT_ID];
    const layout = centre ? site.layoutById[centre.layoutId] : null;
    useSecurityStore.getState().setViewingIncidentId(null);
    if (!centre || !layout) return;

    goToLayout(SECURITY_LAYOUT_ID, () => {
      useSecurityStore.getState().setSelectedIncidentId(incident);
      useNavUiStore.getState().setHotspotInfo({
        destId: layout.id,
        hotspotId: centre.id,
        destLabel: layout.name,
        category: layout.zone,
        hotspotLabel: centre.name,
        index: 1,
        total: 1,
        position: centre.position,
      });
    });
  }, [goToLayout, securityHotspotById, site]);

  const handleMapExpanded = useCallback((open: boolean) => {
    if (!open) return;
    useNavUiStore.getState().setSelectedId(null);
    playerControllerRef.current?.clearPreview();
  }, [playerControllerRef]);

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

  const revealProgress = useProgressStore((s) => s.revealProgress);
  const loaderDone = revealProgress >= 0.999 && othersCached;

  return (
    <>
      <ForceLandscape />
      {!inlineMode && showHud && (
        <HoloTwinHud
          progress={0}
          visible={!loaderDone}
          onFadeComplete={() => setShowHud(false)}
          unitName={unitName}
          revealVeil={!!ui.sceneContent.dollHousePreviewUrl}
        />
      )}
      {!inlineMode && hasDollHouse && (
        <InstructionsCard
          mode="dollhouse"
          visible={isReady && phase === "overlay" && !vr}
          onDismiss={() => {
            markInstructionsSeen();
            setPhase("dollhouse");
          }}
        />
      )}

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

      <NavHud ctrlRef={playerControllerRef} visible={phase === "firstPerson" && isMoving && !inInterior && navHud} dests={activeFloor?.dests} />

      <StillPreload ready={loaderDone} />

      {isReady && hotspotInfo && !fadeVisible && (
        <HotspotDataCard
          destId={hotspotInfo.destId}
          index={hotspotInfo.index}
          hotspotId={hotspotInfo.hotspotId}
          onClose={() => setHotspotInfo(null)}
        />
      )}

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
            transform: mapExpanded ? "translateX(calc(-100% - 24px))" : "translateX(0)",
            pointerEvents: mapExpanded ? "none" : undefined,
          }}
        >
          <ArrowLeft size={17} strokeWidth={2} color="var(--nav-text)" className="short:h-[15px] short:w-[15px]" />
          <span className="nav-display text-[13.5px] font-semibold short:text-[12px]" style={{ color: "var(--nav-text)" }}>Exit</span>
        </button>
      )}

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

      {phase === "firstPerson" && (
        <HotspotsFlap
          open={hotspotsFlapOpen}
          onOpenChange={(next) => {
            if (next) closeOverlays("resources");
            setHotspotsFlapOpen(next);
          }}
          disabled={fadeVisible}
          tucked={isMoving || instructionsOpen || dataCardOpen || mapExpanded}
        />
      )}

      {phase === "firstPerson" && viewingIncidentId && !fadeVisible && (
        <button
          type="button"
          onClick={backToIncidents}
          className="nav-body fixed left-1/2 top-4 z-[210] flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-[11.5px] font-medium text-[rgba(255,255,255,0.86)] transition-[scale,color] duration-200 hover:scale-105 hover:text-white active:translate-y-px sm:top-5 short:top-2 short:px-3 short:py-2"
          style={{
            ...NAV_GLASS_PANEL,
            transform: "translateX(-50%)",
            background: "var(--nav-glass-strong)",
            border: "1.5px solid var(--nav-border)",
          }}
        >
          <ArrowLeft size={16} strokeWidth={1.9} color="currentColor" />
          Back to incidents
        </button>
      )}

      {phase === "firstPerson" && (
        <BottomBar
          visible={mapEntered && !fadeVisible && !isMoving && !instructionsOpen && !dataCardOpen}
          tucked={hotspotsFlapOpen || mapExpanded}
          mapOpen={mapExpanded}
          onOpenMap={() => {
            const next = !mapExpanded;
            closeOverlays("map");
            setMapExpanded(next);
          }}
          onDollhouse={() => {
            closeOverlays();
            useSecurityStore.getState().reset();
            triggerFloorTransition(() => setPhase("dollhouse"), {
              expectedKey: activeFloor?.id,
            });
          }}
          onInstructions={() => {
            closeOverlays("instructions");
            setInstructionsOpen(true);
          }}
          onHome={handleHome}
          mapDisabled={uiFrozen}
          onFirstPerson={firstPersonAction}
        />
      )}

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

      {ui.sceneContent.debug && (
        <>
          <DebugPanel />
        </>
      )}
    </>
  );
}
