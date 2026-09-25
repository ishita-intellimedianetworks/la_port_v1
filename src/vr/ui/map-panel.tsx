"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Container, Image as Picture, Svg } from "@react-three/uikit";
import { Zap } from "@react-three/uikit-lucide";
import * as THREE from "three";
import type { VrMap, VrMapPin } from "../bridge";
import { CardShell, ChipButton, INK, Label, Scroll, px, rgba } from "./card-kit";
import { VrText } from "./text";

const PANEL_W = 430;
const PIN = 22;
const PLAYER = 12;
const CONE = 56;
const PLAYER_FILL = "#00e5ff";
const HERE = "#30d158";
const PICKED = "#0a84ff";
const SAMPLE_S = 0.1;
const TEXT_2 = 0.82;

const CONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-28 -28 56 56"><path d="M0 0 L-14 -24.25 A28 28 0 0 1 14 -24.25 Z" fill="${PLAYER_FILL}" fill-opacity="0.45" stroke="${PLAYER_FILL}" stroke-opacity="0.6" stroke-width="1.5"/></svg>`;

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");

function fmtMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function PinBubble({ pin, on, here, onSelect }: { pin: VrMapPin; on: boolean; here: boolean; onSelect: () => void }) {
  const size = px(PIN);
  return (
    <Container
      width={size}
      height={size}
      borderRadius={999}
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      backgroundColor={on ? PICKED : here ? HERE : rgba(INK.white, 0.14)}
      cursor="pointer"
      onPointerDown={onSelect}
    >
      <VrText fontSize={px(11)} fontWeight="bold" color={INK.white}>
        {String(pin.num)}
      </VrText>
    </Container>
  );
}

export function MapPanel({ map, onClose }: { map: VrMap; onClose: () => void }) {
  const initial = map.categories.find((c) => c.key === "layouts")?.key ?? map.categories[0]?.key ?? null;
  const [catKey, setCatKey] = useState<string | null>(initial);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [player, setPlayer] = useState<{ fx: number; fy: number; deg: number; x: number; z: number } | null>(null);
  const since = useRef(SAMPLE_S);

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
    const next = { fx, fy, deg: THREE.MathUtils.radToDeg(yaw), x: _pos.x, z: _pos.z };
    setPlayer((prev) =>
      prev &&
      Math.abs(prev.fx - next.fx) < 1e-4 &&
      Math.abs(prev.fy - next.fy) < 1e-4 &&
      Math.abs(prev.deg - next.deg) < 0.5
        ? prev
        : next,
    );
  });

  const category = map.categories.find((c) => c.key === catKey) ?? null;
  const pins = category?.pins ?? [];
  const picked = pins.find((p) => p.id === pickedId) ?? null;
  const distance = (pin: VrMapPin) =>
    player ? fmtMeters(Math.hypot(pin.x - player.x, pin.z - player.z) * map.metersPerUnit) : "-";
  const pick = (pin: VrMapPin) => setPickedId((cur) => (cur === pin.id ? null : pin.id));
  const inside = (f: number) => f >= 0 && f <= 1;

  return (
    <CardShell width={px(PANEL_W)} maxHeight="42%" padding={0} onDismiss={onClose}>
      <Container
        height={px(44)}
        flexDirection="row"
        alignItems="center"
        gapColumn={px(10)}
        paddingX={px(12)}
        flexShrink={0}
      >
        <VrText fontSize={px(13)} fontWeight="semi-bold" color={INK.text} opacity={TEXT_2}>
          Map
        </VrText>
      </Container>

      <Container flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0}>
        <Scroll>
      {map.categories.length > 0 && (
        <Container flexDirection="column" paddingX={px(14)} paddingBottom={px(12)} flexShrink={0}>
          <Container marginBottom={px(4)} paddingLeft={px(4)}>
            <Label size={9.5} tracking={0.14} opacity={0.75 * TEXT_2}>
              Category
            </Label>
          </Container>
          <Container flexDirection="row" flexWrap="wrap" gapColumn={px(6)} gapRow={px(6)}>
            {map.categories.map((c) => (
              <ChipButton
                key={c.key}
                label={c.label}
                on={c.key === catKey}
                size={11.5}
                onSelect={() => {
                  setCatKey(c.key);
                  setPickedId(null);
                }}
              />
            ))}
          </Container>
        </Container>
      )}

      <Container marginX={px(14)} borderRadius={px(14)} overflow="hidden" flexShrink={0}>
        <Container positionType="relative" width="100%">
          <Picture src={map.imageUrl} width="100%" keepAspectRatio />
          {pins.map((pin) => {
            const { fx, fy } = toMap(pin.x, pin.z);
            if (!inside(fx) || !inside(fy)) return null;
            return (
              <Container
                key={`${pin.id}-${pin.num}`}
                positionType="absolute"
                positionLeft={`${fx * 100}%`}
                positionTop={`${fy * 100}%`}
                marginLeft={-px(PIN) / 2}
                marginTop={-px(PIN) / 2}
              >
                <PinBubble pin={pin} on={pin.id === pickedId} here={pin.id === map.currentId} onSelect={() => pick(pin)} />
              </Container>
            );
          })}
          {player && inside(player.fx) && inside(player.fy) && (
            <Container
              positionType="absolute"
              positionLeft={`${player.fx * 100}%`}
              positionTop={`${player.fy * 100}%`}
              marginLeft={-px(CONE) / 2}
              marginTop={-px(CONE) / 2}
              width={px(CONE)}
              height={px(CONE)}
              alignItems="center"
              justifyContent="center"
              pointerEvents="none"
            >
              <Svg
                positionType="absolute"
                content={CONE_SVG}
                width={px(CONE)}
                height={px(CONE)}
                transformRotateZ={player.deg}
              />
              <Container
                width={px(PLAYER)}
                height={px(PLAYER)}
                borderRadius={999}
                backgroundColor={PLAYER_FILL}
                borderWidth={1.5}
                borderColor={INK.white}
              />
            </Container>
          )}
        </Container>
      </Container>

      <Container
        minHeight={px(52)}
        flexDirection="row"
        alignItems="center"
        gapColumn={px(10)}
        paddingX={px(12)}
        paddingY={px(8)}
        flexShrink={0}
      >
        {picked && (
          <>
            <Container flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gapRow={px(2)}>
              <VrText fontSize={px(13.5)} fontWeight="semi-bold" letterSpacing={-0.2} color={INK.text}>
                {picked.name}
              </VrText>
              <VrText fontSize={px(11.5)} fontWeight="medium" color={INK.text} opacity={TEXT_2}>
                {picked.id === map.currentId ? "Here" : distance(picked)}
              </VrText>
            </Container>
            {picked.camera && picked.id !== map.currentId && (
              <Container
                height={px(32)}
                flexDirection="row"
                alignItems="center"
                gapColumn={px(6)}
                paddingX={px(12)}
                borderRadius={px(14)}
                cursor="pointer"
                backgroundColor={INK.accent}
                hover={{ backgroundColor: INK.accentBright }}
                onPointerDown={() => {
                  map.teleport(picked);
                  onClose();
                }}
              >
                <Zap width={px(13)} height={px(13)} color={INK.white} />
                <VrText fontSize={px(12.5)} fontWeight="semi-bold" color={INK.white}>
                  Teleport
                </VrText>
              </Container>
            )}
          </>
        )}
      </Container>

      {pins.length > 0 && (
        <Container flexDirection="column" flexShrink={1} minHeight={0}>
          <Container paddingX={px(14)} paddingBottom={px(4)} paddingTop={px(4)}>
            <Label size={10} tracking={0.06} opacity={TEXT_2}>
              {`${pins.length} on map`}
            </Label>
          </Container>
          <Container
            flexDirection="column"
            gapRow={1}
            paddingX={px(8)}
            paddingBottom={px(10)}
          >
            {pins.map((pin) => {
              const on = pin.id === pickedId;
              const here = pin.id === map.currentId;
              return (
                <Container
                  key={`${pin.id}-row-${pin.num}`}
                  flexDirection="row"
                  alignItems="center"
                  gapColumn={px(10)}
                  paddingX={px(10)}
                  paddingY={px(7)}
                  borderRadius={px(11)}
                  flexShrink={0}
                  cursor="pointer"
                  backgroundColor={on ? rgba(PICKED, 0.16) : rgba(INK.white, 0)}
                  hover={{ backgroundColor: on ? rgba(PICKED, 0.16) : rgba(INK.white, 0.05) }}
                  onPointerDown={() => pick(pin)}
                >
                  <PinBubble pin={pin} on={on} here={here} onSelect={() => pick(pin)} />
                  <VrText flexGrow={1} flexShrink={1} minWidth={0} fontSize={px(13)} fontWeight="semi-bold" color={INK.text}>
                    {pin.name}
                  </VrText>
                  <VrText fontSize={px(11.5)} fontWeight="semi-bold" color={here ? HERE : INK.text} opacity={here ? 1 : TEXT_2}>
                    {here ? "Here" : distance(pin)}
                  </VrText>
                </Container>
              );
            })}
          </Container>
        </Container>
      )}
        </Scroll>
      </Container>
    </CardShell>
  );
}
