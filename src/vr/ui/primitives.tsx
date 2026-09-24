"use client";

import { useCallback, useRef, type ComponentProps, type ReactNode } from "react";
import { Container, Fullscreen, VanillaFullscreen } from "@react-three/uikit";
import * as THREE from "three";
import { VrText } from "./text";
import {
  COLOR,
  OPACITY,
  PANEL_DISTANCE,
  POINTER_ORDER,
  RADIUS,
  RENDER_ORDER,
  ROW_HEIGHT,
  SPACE,
  TEXT,
} from "./tokens";

const guarded = new WeakSet<VanillaFullscreen>();

export function HeadLocked(props: ComponentProps<typeof Fullscreen>) {
  const ref = useCallback((node: VanillaFullscreen | null) => {
    if (!node || guarded.has(node)) return;
    guarded.add(node);
    const update = node.update.bind(node);
    node.update = (delta: number) => {
      if (node.parent?.parent == null) return;
      update(delta);
    };
  }, []);
  return (
    <Fullscreen
      ref={ref}
      distanceToCamera={PANEL_DISTANCE}
      depthTest={false}
      renderOrder={RENDER_ORDER}
      {...props}
    />
  );
}

export function Glass({ radius = RADIUS.panel, fillOpacity = OPACITY.panel }: { radius?: number; fillOpacity?: number }) {
  const fill = {
    positionType: "absolute",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  } as const;
  return (
    <>
      <Container {...fill} borderRadius={radius} backgroundColor={COLOR.panel} opacity={fillOpacity} />
      <Container
        {...fill}
        borderRadius={radius}
        borderWidth={1.5}
        borderColor={COLOR.border}
        opacity={OPACITY.border}
      />
    </>
  );
}

export function Panel({
  children,
  width = "44%",
  maxHeight = "58%",
  onDismiss,
}: {
  children: ReactNode;
  width?: `${number}%` | number;
  maxHeight?: `${number}%` | number;
  onDismiss: () => void;
}) {
  return (
    <HeadLocked alignItems="center" justifyContent="center" pointerEventsOrder={POINTER_ORDER.ui}>
      <Container positionType="absolute" width="100%" height="100%" onPointerDown={onDismiss} />
      <Container
        positionType="relative"
        flexDirection="column"
        padding={SPACE.panel}
        gapRow={SPACE.section}
        width={width}
        maxHeight={maxHeight}
        borderRadius={RADIUS.panel}
      >
        <Glass />
        {children}
      </Container>
    </HeadLocked>
  );
}

export function IconButton({
  icon,
  size = 60,
  active = false,
  tone = "default",
  disabled = false,
  onSelect,
}: {
  icon: ReactNode;
  size?: number;
  active?: boolean;
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}) {
  const danger = tone === "danger";
  const rest = danger ? COLOR.danger : active ? COLOR.accent : COLOR.rowRest;
  const hover = danger ? COLOR.dangerHover : active ? COLOR.accentBright : COLOR.rowHover;
  return (
    <Container
      width={size}
      height={size}
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.dot}
      borderWidth={1.5}
      borderColor={active ? COLOR.border : COLOR.rowBorder}
      backgroundColor={rest}
      opacity={disabled ? 0.45 : 1}
      cursor={disabled ? "default" : "pointer"}
      {...(disabled ? {} : { hover: { backgroundColor: hover } })}
      onPointerDown={disabled ? undefined : onSelect}
    >
      <Container pointerEvents="none" width="100%" height="100%" alignItems="center" justifyContent="center">
        {icon}
      </Container>
    </Container>
  );
}

const DRAG_SLOP = 0.02;

export function Row({
  label,
  meta,
  icon,
  trailing,
  active = false,
  disabled = false,
  onSelect,
}: {
  label: string;
  meta?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const pressed = useRef(new Map<number, THREE.Vector3>());
  return (
    <Container
      width="100%"
      minHeight={ROW_HEIGHT}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      gapColumn={SPACE.icon}
      paddingX={SPACE.rowX}
      paddingY={8}
      borderRadius={RADIUS.row}
      borderWidth={1}
      borderColor={active ? COLOR.accentBright : COLOR.rowBorder}
      backgroundColor={active ? COLOR.rowActive : COLOR.rowRest}
      opacity={disabled ? 0.45 : 1}
      cursor={disabled ? "default" : "pointer"}
      {...(disabled ? {} : { hover: { backgroundColor: COLOR.rowHover } })}
      onPointerDown={(e) => {
        if (disabled || e.pointerId == null) return;
        pressed.current.set(e.pointerId, e.point.clone());
      }}
      onPointerLeave={(e) => {
        if (e.pointerId != null) pressed.current.delete(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (e.pointerId == null) return;
        const from = pressed.current.get(e.pointerId);
        pressed.current.delete(e.pointerId);
        if (from && from.distanceTo(e.point) <= DRAG_SLOP) onSelect();
      }}
    >
      {icon && (
        <Container pointerEvents="none" flexShrink={0}>
          {icon}
        </Container>
      )}
      <Container pointerEvents="none" flexDirection="column" flexGrow={1} flexShrink={1} gapRow={2}>
        <VrText fontSize={TEXT.body} fontWeight="semi-bold" color={COLOR.text}>
          {label}
        </VrText>
        {meta && (
          <VrText fontSize={TEXT.meta} color={COLOR.text}>
            {meta}
          </VrText>
        )}
      </Container>
      {trailing && (
        <Container pointerEvents="none" flexShrink={0}>
          {trailing}
        </Container>
      )}
    </Container>
  );
}

export function PanelHeader({
  title,
  subtitle,
  onBack,
  onClose,
  backIcon,
  closeIcon,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose: () => void;
  backIcon: ReactNode;
  closeIcon: ReactNode;
}) {
  return (
    <Container flexDirection="row" alignItems="flex-start" gapColumn={12} flexShrink={0}>
      {onBack && <IconButton size={40} icon={backIcon} onSelect={onBack} />}
      <Container flexDirection="column" flexGrow={1} flexShrink={1} gapRow={4}>
        <VrText fontSize={TEXT.title} fontWeight="bold" color={COLOR.text}>
          {title}
        </VrText>
        {subtitle && (
          <VrText fontSize={TEXT.label} fontWeight="medium" color={COLOR.text}>
            {subtitle}
          </VrText>
        )}
      </Container>
      <IconButton size={40} icon={closeIcon} onSelect={onClose} />
    </Container>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <Container
      flexDirection="column"
      gapRow={SPACE.row}
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
