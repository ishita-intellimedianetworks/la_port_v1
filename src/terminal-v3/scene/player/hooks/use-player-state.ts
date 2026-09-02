import { useRef } from "react";
import * as THREE from "three";
import type { PlayerState } from "../types";
import { navConfig } from "../../../navigation-config";

interface UsePlayerStateOptions {
  startPosition: [number, number, number];
  startRotation: [number, number, number];
  cameraHeight: number;
  initialZone: string;
}

/**
 * Creates and groups all mutable ref state for PlayerController.
 * Refs are stable across renders — only created once on mount.
 */
export function usePlayerState({
  startPosition,
  startRotation,
  cameraHeight,
  initialZone,
}: UsePlayerStateOptions): PlayerState {
  const startY = startPosition[1] + cameraHeight;

  // ── Position & orientation ────────────────────────────────────────────────
  const pos     = useRef(new THREE.Vector3(startPosition[0], startY, startPosition[2]));
  const targetY = useRef(startY);
  const rot     = useRef(new THREE.Euler(startRotation[0], startRotation[1], startRotation[2]));
  const yawT    = useRef(startRotation[1]);
  const lookAtTween = useRef<gsap.core.Tween | null>(null);
  const initPos = useRef(new THREE.Vector3(startPosition[0], startY, startPosition[2]));
  const snapped = useRef(false);

  // ── Zone & path ───────────────────────────────────────────────────────────
  const currentZone   = useRef(initialZone);
  const path          = useRef<THREE.Vector3[]>([]);
  const pathI         = useRef(0);
  const previewPath   = useRef<THREE.Vector3[]>([]);
  const moving        = useRef(false);
  const vizGrp        = useRef<THREE.Group>(null);
  const onNavComplete = useRef<(() => void) | null>(null);
  const speedMult     = useRef(navConfig.logic.defaultSpeedMult);

  // ── Idle camera drift ─────────────────────────────────────────────────────
  const idleOn      = useRef(false);
  const idleAcc     = useRef(0);
  const prevEnabled = useRef(false);
  const pitchLock   = useRef(false);

  // ── Floor transition (GSAP drives transProg.t 0 → 1) ─────────────────────
  const transActive   = useRef(false);
  const transStart    = useRef(new THREE.Vector3());
  const transEnd      = useRef(new THREE.Vector3());
  const transStartYaw = useRef(0);
  const transEndYaw   = useRef(0);
  const transProg     = useRef({ t: 0 });
  const transTween    = useRef<gsap.core.Tween | null>(null);

  return {
    pos, targetY, rot, yawT, lookAtTween, initPos, snapped,
    currentZone, path, pathI, previewPath, moving, vizGrp, onNavComplete, speedMult,
    idleOn, idleAcc, prevEnabled, pitchLock,
    transition: {
      active:   transActive,
      start:    transStart,
      end:      transEnd,
      startYaw: transStartYaw,
      endYaw:   transEndYaw,
      prog:     transProg,
      tween:    transTween,
    },
  };
}
