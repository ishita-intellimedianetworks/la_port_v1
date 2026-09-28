"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Container, Image as Picture, type VanillaImage } from "@react-three/uikit";
import { MapPin, X } from "@react-three/uikit-lucide";
import * as THREE from "three";
import type { VrMap, VrResourceGroup } from "../bridge";
import { CardShell, ChipButton, INK, PressRow, Scroll, px } from "./card-kit";
import { useDragScroll } from "./stick-scroll";
import { VrText } from "./text";

const PANEL_W = 520;
const PANEL_MAX_H = "62%";
const MAP_INSET = 14;
const SAMPLE_S = 0.1;
const MISS = "#ff4d4d";
const MISS_MS = 1600;

const AIM = { size: 22, ring: 2, dot: 4 } as const;

const ROW = {
  radius: 10,
  padX: 10,
  padY: 7,
  gap: 4,
  text: 13,
} as const;

const PIN = { size: 22, text: 11 } as const;

const PILLS = { bottom: 12, bar: 4, barColor: "#8a95a5" } as const;
const HERE = "#30d158";
const PICKED = "#0a84ff";

const HINT = {
  idle: "Point anywhere on the plan and pull the trigger to travel.",
  miss: "You can't stand there - try another spot.",
} as const;

function inside(f: number): boolean {
  return f >= 0 && f <= 1;
}

const PLAYER = {
  flatMapWidth: 330,
  size: 6,
  fovLength: 25,
  fovAngle: Math.PI / 3,
  glow: 14,
  fill: "#00e5ff",
  stroke: "#ffffff",
  half: 27,
  canvas: 256,
} as const;

const PLAYER_SCALE = (PANEL_W - MAP_INSET * 2) / PLAYER.flatMapWidth;
const PLAYER_BOX = PLAYER.half * 2 * PLAYER_SCALE;

function playerTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = PLAYER.canvas;
  canvas.height = PLAYER.canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const k = PLAYER.canvas / (PLAYER.half * 2);
  const len = PLAYER.fovLength * k;
  const stroke = 1.5 * k;
  ctx.translate(PLAYER.canvas / 2, PLAYER.canvas / 2);

  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
  grad.addColorStop(0, "rgba(0,229,255,0.9)");
  grad.addColorStop(0.5, "rgba(0,229,255,0.4)");
  grad.addColorStop(1, "rgba(0,229,255,0)");
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, len, -Math.PI / 2 - PLAYER.fovAngle / 2, -Math.PI / 2 + PLAYER.fovAngle / 2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(-PLAYER.fovAngle / 2) * len, -Math.cos(-PLAYER.fovAngle / 2) * len);
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(PLAYER.fovAngle / 2) * len, -Math.cos(PLAYER.fovAngle / 2) * len);
  ctx.strokeStyle = "rgba(0,229,255,0.6)";
  ctx.lineWidth = stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, PLAYER.size * k, 0, Math.PI * 2);
  ctx.fillStyle = PLAYER.fill;
  ctx.shadowColor = PLAYER.fill;
  ctx.shadowBlur = PLAYER.glow * k;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = PLAYER.stroke;
  ctx.lineWidth = stroke;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _local = new THREE.Vector3();

interface PlanPoint {
  fx: number;
  fy: number;
}

function PinBubble({ num, onSelect }: { num: number; onSelect?: () => void }) {
  const size = px(PIN.size);
  return (
    <Container
      width={size}
      height={size}
      borderRadius={999}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      backgroundColor={PICKED}
      borderWidth={1.5}
      borderColor={INK.white}
      cursor={onSelect ? "pointer" : undefined}
      pointerEvents={onSelect ? "auto" : "none"}
      onPointerDown={onSelect}
    >
      <VrText fontSize={px(PIN.text)} fontWeight="bold" color={INK.white}>
        {String(num)}
      </VrText>
    </Container>
  );
}

export function MapPanel({
  map,
  groups,
  onHotspot,
  onClose,
}: {
  map: VrMap;
  groups: VrResourceGroup[];
  onHotspot: (id: string) => void;
  onClose: () => void;
}) {
  const [groupId, setGroupId] = useState<string | null>(groups[0]?.id ?? null);
  const [pillsRef, onPillsScroll] = useDragScroll();
  const [player, setPlayer] = useState<{ fx: number; fy: number; deg: number } | null>(null);
  const [aim, setAim] = useState<PlanPoint | null>(null);
  const [miss, setMiss] = useState<PlanPoint | null>(null);
  const since = useRef(SAMPLE_S);
  const plan = useRef<VanillaImage>(null);
  const marker = useMemo(() => playerTexture(), []);
  useEffect(() => () => marker?.dispose(), [marker]);
  useEffect(() => {
    if (!miss) return;
    const t = setTimeout(() => setMiss(null), MISS_MS);
    return () => clearTimeout(t);
  }, [miss]);

  const { bounds } = map;
  const bw = bounds.maxX - bounds.minX || 1;
  const bh = bounds.maxZ - bounds.minZ || 1;
  const toMap = (x: number, z: number) => ({ fx: (x - bounds.minX) / bw, fy: (z - bounds.minZ) / bh });

  useFrame((state, delta) => {
    since.current += delta;
    if (since.current < SAMPLE_S) return;
    since.current = 0;
    state.camera.matrixWorld.decompose(_pos, _quat, _scale);
    const yaw = _euler.setFromQuaternion(_quat, "YXZ").y;
    const { fx, fy } = toMap(_pos.x, _pos.z);
    const next = { fx, fy, deg: THREE.MathUtils.radToDeg(yaw) };
    setPlayer((prev) =>
      prev &&
      Math.abs(prev.fx - next.fx) < 1e-4 &&
      Math.abs(prev.fy - next.fy) < 1e-4 &&
      Math.abs(prev.deg - next.deg) < 0.5
        ? prev
        : next,
    );
  });

  const group = groups.find((g) => g.id === groupId) ?? null;
  const spots = (group?.hotspots ?? []).map((h, i) => ({ ...h, num: i + 1 }));

  const pointAt = (point: THREE.Vector3): PlanPoint | null => {
    const image = plan.current;
    if (!image) return null;
    image.worldToLocal(_local.copy(point));
    const fx = _local.x + 0.5;
    const fy = 0.5 - _local.y;
    return inside(fx) && inside(fy) ? { fx, fy } : null;
  };

  const travel = (at: PlanPoint | null) => {
    if (!at) return;
    const x = bounds.minX + at.fx * bw;
    const z = bounds.minZ + at.fy * bh;
    if (map.travelTo(x, z)) {
      onClose();
      return;
    }
    setMiss(at);
  };

  const goToHotspot = (id: string) => {
    onHotspot(id);
    onClose();
  };

  const goToGroup = () => {
    group?.travel?.();
    onClose();
  };

  const hint = miss ? HINT.miss : HINT.idle;

  return (
    <CardShell width={px(PANEL_W)} maxHeight={PANEL_MAX_H} padding={0} onDismiss={onClose}>
      <Container height={px(44)} flexDirection="row" alignItems="center" paddingX={px(MAP_INSET)} flexShrink={0}>
        <VrText fontSize={px(14)} fontWeight="semi-bold" color={INK.white}>
          Map
        </VrText>
      </Container>

      {groups.length > 0 && (
        <Container
          ref={pillsRef}
          onScroll={onPillsScroll}
          flexDirection="row"
          flexWrap="no-wrap"
          overflow="scroll"
          gapColumn={px(6)}
          paddingLeft={px(MAP_INSET)}
          paddingRight={px(MAP_INSET)}
          paddingBottom={px(PILLS.bottom)}
          marginBottom={px(4)}
          scrollbarWidth={px(PILLS.bar)}
          scrollbarColor={PILLS.barColor}
          scrollbarBorderRadius={px(PILLS.bar / 2)}
          flexShrink={0}
          width="100%"
        >
          {groups.map((g) => (
            <ChipButton key={g.id} label={g.name} on={g.id === groupId} size={12} onSelect={() => setGroupId(g.id)} />
          ))}
        </Container>
      )}

      <Container marginX={px(MAP_INSET)} borderRadius={px(14)} overflow="hidden" flexShrink={0}>
        <Container positionType="relative" width="100%">
          <Picture
            ref={plan}
            src={map.imageUrl}
            width="100%"
            keepAspectRatio
            cursor="crosshair"
            onPointerMove={(e) => setAim(pointAt(e.point))}
            onPointerLeave={() => setAim(null)}
            onPointerDown={(e) => travel(pointAt(e.point))}
          />
          {spots.map((spot) => {
            if (!spot.position || spot.disabled) return null;
            const at = toMap(spot.position[0], spot.position[2]);
            if (!inside(at.fx) || !inside(at.fy)) return null;
            return (
              <Container
                key={spot.id}
                positionType="absolute"
                positionLeft={`${at.fx * 100}%`}
                positionTop={`${at.fy * 100}%`}
                marginLeft={-px(PIN.size) / 2}
                marginTop={-px(PIN.size) / 2}
              >
                <PinBubble num={spot.num} onSelect={() => goToHotspot(spot.id)} />
              </Container>
            );
          })}
          {player && inside(player.fx) && inside(player.fy) && (
            <Container
              positionType="absolute"
              positionLeft={`${player.fx * 100}%`}
              positionTop={`${player.fy * 100}%`}
              marginLeft={-px(PLAYER_BOX) / 2}
              marginTop={-px(PLAYER_BOX) / 2}
              width={px(PLAYER_BOX)}
              height={px(PLAYER_BOX)}
              pointerEvents="none"
            >
              {marker && (
                <Picture src={marker} width={px(PLAYER_BOX)} height={px(PLAYER_BOX)} transformRotateZ={player.deg} />
              )}
            </Container>
          )}
          {aim && (
            <Container
              positionType="absolute"
              positionLeft={`${aim.fx * 100}%`}
              positionTop={`${aim.fy * 100}%`}
              marginLeft={-px(AIM.size) / 2}
              marginTop={-px(AIM.size) / 2}
              width={px(AIM.size)}
              height={px(AIM.size)}
              borderRadius={999}
              borderWidth={px(AIM.ring)}
              borderColor={INK.white}
              flexDirection="row"
              alignItems="center"
              justifyContent="center"
              pointerEvents="none"
            >
              <Container width={px(AIM.dot)} height={px(AIM.dot)} borderRadius={999} backgroundColor={INK.white} />
            </Container>
          )}
          {miss && (
            <Container
              positionType="absolute"
              positionLeft={`${miss.fx * 100}%`}
              positionTop={`${miss.fy * 100}%`}
              marginLeft={-px(AIM.size) / 2}
              marginTop={-px(AIM.size) / 2}
              width={px(AIM.size)}
              height={px(AIM.size)}
              borderRadius={999}
              borderWidth={px(AIM.ring)}
              borderColor={MISS}
              flexDirection="row"
              alignItems="center"
              justifyContent="center"
              pointerEvents="none"
            >
              <X width={px(AIM.size * 0.6)} height={px(AIM.size * 0.6)} color={MISS} />
            </Container>
          )}
        </Container>
      </Container>

      <Container paddingX={px(MAP_INSET)} paddingY={px(10)} flexShrink={0} flexDirection="row" justifyContent="center">
        <VrText fontSize={px(12)} fontWeight="medium" textAlign="center" color={miss ? MISS : INK.white}>
          {hint}
        </VrText>
      </Container>

      {group && (group.travel || spots.length > 0) && (
        <Container flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0}>
          <Scroll>
            <Container flexDirection="column" gapRow={px(ROW.gap)} paddingX={px(8)} paddingBottom={px(12)} flexShrink={0}>
              {group.travel && (
                <PressRow
                  active={group.id === map.currentId}
                  activeFill={HERE}
                  radius={px(ROW.radius)}
                  paddingX={px(ROW.padX)}
                  paddingY={px(ROW.padY)}
                  gap={px(10)}
                  onSelect={goToGroup}
                >
                  <Container width={px(PIN.size)} height={px(PIN.size)} flexShrink={0} flexDirection="row" alignItems="center" justifyContent="center">
                    <MapPin width={px(16)} height={px(16)} color={INK.white} />
                  </Container>
                  <VrText flexGrow={1} flexShrink={1} minWidth={0} fontSize={px(ROW.text)} fontWeight="semi-bold" color={INK.white}>
                    {`Go to ${group.name}`}
                  </VrText>
                  {group.id === map.currentId && (
                    <VrText fontSize={px(11.5)} fontWeight="bold" color={HERE}>
                      Here
                    </VrText>
                  )}
                </PressRow>
              )}
              {spots.map((spot) => (
                <PressRow
                  key={spot.id}
                  radius={px(ROW.radius)}
                  paddingX={px(ROW.padX)}
                  paddingY={px(ROW.padY)}
                  gap={px(10)}
                  onSelect={spot.disabled ? () => {} : () => goToHotspot(spot.id)}
                >
                  <PinBubble num={spot.num} />
                  <VrText
                    flexGrow={1}
                    flexShrink={1}
                    minWidth={0}
                    fontSize={px(ROW.text)}
                    fontWeight="semi-bold"
                    color={INK.white}
                    opacity={spot.disabled ? 0.4 : 1}
                  >
                    {spot.name}
                  </VrText>
                </PressRow>
              ))}
            </Container>
          </Scroll>
        </Container>
      )}
    </CardShell>
  );
}
