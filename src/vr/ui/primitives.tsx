"use client";

import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import { X } from "@react-three/uikit-lucide";
import * as THREE from "three";
import { usePress, useScrollArea } from "./stick-scroll";
import { VrText } from "./text";
import {
  BAR_BUTTON,
  COLOR,
  FOLLOW,
  OPACITY,
  PANEL_DISTANCE,
  POINTER_ORDER,
  RADIUS,
  RENDER_ORDER,
  ROW_HEIGHT,
  SPACE,
  TEXT,
} from "./tokens";

const _head = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _size = new THREE.Vector2();

interface ViewSize {
  x: number;
  y: number;
  pixel: number;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function measureView(camera: THREE.Camera, gl: THREE.WebGLRenderer): ViewSize | null {
  const lens = camera as THREE.PerspectiveCamera;
  if (!lens.isPerspectiveCamera) return null;
  const height = 2 * Math.tan((Math.PI * lens.fov) / 360) * PANEL_DISTANCE;
  const pixels = gl.getSize(_size).y;
  if (pixels <= 0) return null;
  return { x: height * lens.aspect, y: height, pixel: height / pixels };
}

function useViewSize(): ViewSize | null {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const [size, setSize] = useState<ViewSize | null>(() => measureView(camera, gl));
  useFrame(() => {
    const next = measureView(camera, gl);
    if (!next) return;
    setSize((prev) =>
      prev && Math.abs(prev.x - next.x) < 1e-3 && Math.abs(prev.y - next.y) < 1e-3 && Math.abs(prev.pixel - next.pixel) < 1e-7
        ? prev
        : next,
    );
  });
  return size;
}

function useLazyFollow(yawOffset: number) {
  const group = useRef<THREE.Group>(null);
  const yaw = useRef<number | null>(null);
  const turning = useRef(false);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    state.camera.matrixWorld.decompose(_head, _quat, _scale);
    const head = _euler.setFromQuaternion(_quat, "YXZ").y;
    if (yaw.current === null) yaw.current = head;
    const off = wrapAngle(head - yaw.current);
    if (Math.abs(off) > FOLLOW.startRadians) turning.current = true;
    if (turning.current) {
      yaw.current = wrapAngle(yaw.current + off * Math.min(1, delta * FOLLOW.ratePerSecond));
      if (Math.abs(wrapAngle(head - yaw.current)) < FOLLOW.stopRadians) turning.current = false;
    }
    const y = yaw.current + yawOffset;
    g.position.set(_head.x - Math.sin(y) * PANEL_DISTANCE, _head.y, _head.z - Math.cos(y) * PANEL_DISTANCE);
    g.rotation.set(0, y, 0);
    g.visible = true;
  });

  return group;
}

export function HeadLocked({
  children,
  yawOffset = 0,
  ...props
}: ComponentProps<typeof Container> & { yawOffset?: number }) {
  const size = useViewSize();
  const group = useLazyFollow(yawOffset);
  if (!size) return null;
  return (
    <group ref={group} visible={false}>
      <Container
        sizeX={size.x}
        sizeY={size.y}
        pixelSize={size.pixel}
        depthTest={false}
        renderOrder={RENDER_ORDER}
        pointerEvents="listener"
        {...props}
      >
        {children}
      </Container>
    </group>
  );
}

export function Glass({
  radius = RADIUS.panel,
  fill = COLOR.panel,
  fillOpacity = OPACITY.panel,
  border = COLOR.border,
  borderOpacity = OPACITY.border,
  borderWidth = 1.5,
}: {
  radius?: number;
  fill?: string;
  fillOpacity?: number;
  border?: string;
  borderOpacity?: number;
  borderWidth?: number;
}) {
  const layer = {
    positionType: "absolute",
    positionTop: 0,
    positionLeft: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    borderRadius: radius,
    zIndexOffset: -1,
  } as const;
  return (
    <>
      <Container {...layer} backgroundColor={fill} opacity={fillOpacity} />
      {borderOpacity > 0 && (
        <Container {...layer} borderWidth={borderWidth} borderColor={border} opacity={borderOpacity} />
      )}
    </>
  );
}

const TIP = {
  width: 320,
  gap: 12,
  padX: 16,
  padY: 8,
  text: 18,
  fill: 0.85,
  ring: 0.35,
  ringLit: 0.75,
  ringWidth: 2.5,
} as const;

export const CLOSE = {
  size: 32,
  inset: 12,
  fill: "#ff2b2b",
  hover: "#ff5c5c",
  icon: 18,
} as const;

export function RedClose({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Container
      positionType="absolute"
      positionTop={CLOSE.inset}
      positionRight={CLOSE.inset}
      width={CLOSE.size}
      height={CLOSE.size}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.dot}
      backgroundColor={hovered ? CLOSE.hover : CLOSE.fill}
      cursor="pointer"
      transformScaleX={hovered ? 1.08 : 1}
      transformScaleY={hovered ? 1.08 : 1}
      onHoverChange={(h: boolean) => setHovered(h)}
      onPointerDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <X pointerEvents="none" width={CLOSE.icon} height={CLOSE.icon} color="#ffffff" />
    </Container>
  );
}

export function Panel({
  children,
  width = "44%",
  maxHeight = "40%",
  align = "stretch",
  onDismiss,
}: {
  children: ReactNode;
  width?: `${number}%` | number;
  maxHeight?: `${number}%` | number;
  align?: "stretch" | "center";
  onDismiss: () => void;
}) {
  return (
    <HeadLocked alignItems="center" justifyContent="center" pointerEventsOrder={POINTER_ORDER.ui}>
      <Container positionType="absolute" width="100%" height="100%" onPointerDown={onDismiss} />
      <Container
        positionType="relative"
        flexDirection="column"
        alignItems={align}
        padding={SPACE.panel}
        gapRow={SPACE.section}
        width={width}
        maxHeight={maxHeight}
        borderRadius={RADIUS.panel}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Glass />
        {children}
        <RedClose onClose={onDismiss} />
      </Container>
    </HeadLocked>
  );
}

export function IconButton({
  icon,
  label,
  size = BAR_BUTTON,
  active = false,
  tone = "default",
  disabled = false,
  onSelect,
}: {
  icon: ReactNode;
  label?: string;
  size?: number;
  active?: boolean;
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const lit = hovered && !disabled;
  const fill = active ? COLOR.accent : lit && tone === "danger" ? COLOR.danger : COLOR.glass;
  const fillOpacity = active || (lit && tone === "danger") ? 1 : lit ? OPACITY.chipHover : OPACITY.chip;
  return (
    <Container
      width={size}
      height={size}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.dot}
      opacity={disabled ? OPACITY.disabled : 1}
      cursor={disabled ? "default" : "pointer"}
      onHoverChange={(h: boolean) => setHovered(h)}
      onPointerDown={disabled ? undefined : onSelect}
    >
      <Glass
        radius={RADIUS.dot}
        fill={fill}
        fillOpacity={fillOpacity}
        borderOpacity={lit ? TIP.ringLit : active ? OPACITY.activeBorder : OPACITY.chipBorder}
        borderWidth={lit ? TIP.ringWidth : 1.5}
      />
      <Container pointerEvents="none" flexDirection="row" alignItems="center" justifyContent="center">
        {icon}
      </Container>
      {lit && label && (
        <Container
          positionType="absolute"
          positionBottom={size + TIP.gap}
          positionLeft={(size - TIP.width) / 2}
          width={TIP.width}
          flexDirection="row"
          justifyContent="center"
          pointerEvents="none"
        >
          <Container
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            paddingX={TIP.padX}
            paddingY={TIP.padY}
            borderRadius={RADIUS.dot}
          >
            <Glass radius={RADIUS.dot} fill={COLOR.glass} fillOpacity={TIP.fill} borderOpacity={TIP.ring} />
            <VrText fontSize={TIP.text} fontWeight="semi-bold" color={COLOR.text}>
              {label}
            </VrText>
          </Container>
        </Container>
      )}
    </Container>
  );
}

export function Row({
  label,
  meta,
  icon,
  trailing,
  active = false,
  disabled = false,
  compact = false,
  onSelect,
}: {
  label: string;
  meta?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const press = usePress(onSelect, disabled);
  const lit = hovered && !disabled;
  return (
    <Container
      width="100%"
      minHeight={compact ? ROW_HEIGHT - 12 : ROW_HEIGHT}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      gapColumn={SPACE.icon}
      paddingX={SPACE.rowX}
      paddingY={10}
      borderRadius={RADIUS.row}
      opacity={disabled ? OPACITY.disabled : 1}
      cursor={disabled ? "default" : "pointer"}
      onHoverChange={(h: boolean) => setHovered(h)}
      {...press}
    >
      <Glass
        radius={RADIUS.row}
        fill={active ? COLOR.accent : COLOR.tile}
        fillOpacity={active ? 1 : lit ? OPACITY.tileHover : OPACITY.tile}
        borderOpacity={active ? OPACITY.activeBorder : lit ? OPACITY.border : OPACITY.chipBorder}
      />
      {icon && <IconChip icon={icon} />}
      <Container pointerEvents="none" flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gapRow={2}>
        <VrText fontSize={compact ? TEXT.tile - 1 : TEXT.tile + 1} fontWeight="semi-bold" color={COLOR.text}>
          {label}
        </VrText>
        {meta && (
          <VrText fontSize={TEXT.meta} color={COLOR.text} opacity={OPACITY.muted}>
            {meta}
          </VrText>
        )}
      </Container>
      {trailing && (
        <Container pointerEvents="none" flexShrink={0} opacity={OPACITY.muted}>
          {trailing}
        </Container>
      )}
    </Container>
  );
}

export function IconChip({ icon, size = 40 }: { icon: ReactNode; size?: number }) {
  return (
    <Container
      pointerEvents="none"
      width={size}
      height={size}
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.dot}
    >
      <Glass radius={RADIUS.dot} fill={COLOR.tile} fillOpacity={OPACITY.tile} borderOpacity={0} />
      {icon}
    </Container>
  );
}

export function Tile({ icon, control, text }: { icon?: ReactNode; control?: string; text: string }) {
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      gapColumn={SPACE.icon}
      paddingX={SPACE.rowX}
      paddingY={SPACE.tile}
      borderRadius={RADIUS.tile}
      width="48.5%"
      flexShrink={0}
    >
      <Glass radius={RADIUS.tile} fill={COLOR.tile} fillOpacity={OPACITY.tile} borderOpacity={OPACITY.chipBorder} />
      {control ? (
        <Container width={118} flexShrink={0}>
          <VrText fontSize={TEXT.tile} fontWeight="semi-bold" color={COLOR.accentBright}>
            {control}
          </VrText>
        </Container>
      ) : (
        <IconChip icon={icon} />
      )}
      <VrText flexGrow={1} flexShrink={1} fontSize={TEXT.tile} fontWeight="semi-bold" color={COLOR.text}>
        {text}
      </VrText>
    </Container>
  );
}

export function GroupLabel({ children }: { children: string }) {
  return (
    <VrText
      fontSize={TEXT.group}
      fontWeight="semi-bold"
      letterSpacing={2}
      color={COLOR.text}
      opacity={OPACITY.muted}
    >
      {children.toUpperCase()}
    </VrText>
  );
}

export function GlassButton({ label, onSelect }: { label: string; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Container
      height={52}
      paddingX={40}
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.button}
      cursor="pointer"
      onHoverChange={(h: boolean) => setHovered(h)}
      onPointerDown={onSelect}
    >
      <Glass
        radius={RADIUS.button}
        fill={hovered ? COLOR.accent : COLOR.tile}
        fillOpacity={hovered ? 1 : OPACITY.tile}
        borderOpacity={hovered ? OPACITY.activeBorder : OPACITY.border}
      />
      <VrText pointerEvents="none" fontSize={TEXT.label + 2} fontWeight="semi-bold" color={COLOR.text}>
        {label}
      </VrText>
    </Container>
  );
}

export function PanelHeader({
  title,
  subtitle,
  onBack,
  backIcon,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon: ReactNode;
}) {
  return (
    <Container flexDirection="row" alignItems="center" gapColumn={14} flexShrink={0} paddingRight={CLOSE.size + CLOSE.inset}>
      {onBack && <IconButton size={44} icon={backIcon} onSelect={onBack} />}
      <Container flexDirection="column" flexGrow={1} flexShrink={1} gapRow={4}>
        <VrText fontSize={TEXT.title} fontWeight="semi-bold" color={COLOR.text}>
          {title}
        </VrText>
        {subtitle && (
          <VrText fontSize={TEXT.label} fontWeight="medium" color={COLOR.text} opacity={OPACITY.muted}>
            {subtitle}
          </VrText>
        )}
      </Container>
    </Container>
  );
}

export function List({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  const [scrollRef, onScrollHover, onScrollDrag] = useScrollArea();
  return (
    <Container
      ref={scrollRef}
      onHoverChange={onScrollHover}
      onScroll={onScrollDrag}
      flexDirection={wrap ? "row" : "column"}
      flexWrap={wrap ? "wrap" : "no-wrap"}
      justifyContent={wrap ? "space-between" : "flex-start"}
      gapRow={SPACE.row}
      width="100%"
      flexShrink={1}
      overflow="scroll"
      scrollbarWidth={6}
      scrollbarColor={COLOR.scrollbar}
      scrollbarBorderRadius={3}
      paddingRight={8}
    >
      {children}
    </Container>
  );
}

export function Divider() {
  return (
    <Container width="100%" height={1} flexShrink={0} backgroundColor={COLOR.border} opacity={OPACITY.divider} />
  );
}
