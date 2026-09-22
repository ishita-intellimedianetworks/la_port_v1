import type { MutableRefObject, RefObject } from "react";
import type * as THREE from "three";
import type { Pathfinding } from "three-pathfinding";
import type { RoomZone } from "../navmesh/geometry";

export interface NavTarget { x: number; y?: number; eyeY?: number; z: number }

export interface PlayerControllerHandle {
  navigateToPoint: (
    pos: NavTarget,
    targetZone?: string,
    onDone?: () => void,
  ) => boolean;
  stopNavigation: () => void;
  measurePathTo: (pos: NavTarget, targetZone?: string) => number | null;
  measurePathsTo: (targets: NavTarget[], targetZone?: string) => (number | null)[];
  previewTo: (pos: NavTarget, targetZone?: string) => boolean;
  clearPreview: () => void;
  getPreviewPath3D: () => { x: number; y: number; z: number }[];
  isMoving: () => boolean;
  getPosition: () => { x: number; y: number; z: number };
  getRotationY: () => number;
  getPath: () => { x: number; z: number }[];
  getPath3D: () => { x: number; y: number; z: number }[];
  getFootPosition: () => { x: number; y: number; z: number };
  getSpeed: () => number;
  getMetersPerUnit: () => number;
  resetToStart: () => void;
  teleportTo: (pos: [number, number, number], rot: [number, number, number], smooth?: boolean) => void;
  probeFloorY: (x: number, z: number, expectedY?: number) => number | null;
  nearestNavPoint: (pos?: { x: number; y?: number; z: number })
    => { x: number; y: number; z: number; dist: number } | null;
  getCurrentZone: () => string;
  setCurrentZone: (z: string) => void;
  setOnNavigationComplete: (cb: (() => void) | null) => void;
  setSpeedMultiplier: (v: number) => void;
  getSpeedMultiplier: () => number;
  startIdleDrift: () => void;
  stopIdleDrift: () => void;
  lookAtPoint: (target: { x: number; z: number }) => void;
  captureScreenshot: (download?: boolean) => string;
  setPitchLock: (v: boolean) => void;
}

export interface PlayerControllerProps {
  enabled?: boolean;
  lookEnabled?: boolean;
  speed?: number;
  cameraHeight?: number;
  startPosition?: [number, number, number];
  startRotation?: [number, number, number];
  pathfinding: Pathfinding;
  initialZone: string;
  onMovingChange?: (v: boolean) => void;
  onZoneChange?: (newZone: string) => void;
  roomZonesMap?: MutableRefObject<Map<string, RoomZone[]>>;
  onRoomChange?: (id: string | null) => void;
  routeSanitize?: boolean;
  debug?: boolean;
}

export interface TransitionState {
  active: MutableRefObject<boolean>;
  start: MutableRefObject<THREE.Vector3>;
  end: MutableRefObject<THREE.Vector3>;
  startYaw: MutableRefObject<number>;
  endYaw: MutableRefObject<number>;
  prog: MutableRefObject<{ t: number }>;
  tween: MutableRefObject<gsap.core.Tween | null>;
}

export interface PlayerState {
  pos: MutableRefObject<THREE.Vector3>;
  targetY: MutableRefObject<number>;
  rot: MutableRefObject<THREE.Euler>;
  yawT: MutableRefObject<number>;
  lookAtTween: MutableRefObject<gsap.core.Tween | null>;
  initPos: MutableRefObject<THREE.Vector3>;
  snapped: MutableRefObject<boolean>;
  currentZone: MutableRefObject<string>;
  path: MutableRefObject<THREE.Vector3[]>;
  pathI: MutableRefObject<number>;
  previewPath: MutableRefObject<THREE.Vector3[]>;
  moving: MutableRefObject<boolean>;
  vizGrp: RefObject<THREE.Group | null>;
  onNavComplete: MutableRefObject<(() => void) | null>;
  speedMult: MutableRefObject<number>;
  idleOn: MutableRefObject<boolean>;
  idleAcc: MutableRefObject<number>;
  prevEnabled: MutableRefObject<boolean>;
  pitchLock: MutableRefObject<boolean>;
  transition: TransitionState;
}
