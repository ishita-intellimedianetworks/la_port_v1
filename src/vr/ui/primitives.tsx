"use client";

import { useCallback, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Container, Fullscreen, VanillaFullscreen } from "@react-three/uikit";
import { X } from "@react-three/uikit-lucide";
import * as THREE from "three";
import { useStickScroll } from "./stick-scroll";
import { VrText } from "./text";
import {
  BAR_BUTTON,
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

const CLOSE = {
  size: 36,
  inset: -14,
  fill: "#e5484d",
  hover: "#f2555a",
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
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.dot}
      backgroundColor={hovered ? CLOSE.hover : CLOSE.fill}
      borderWidth={1.5}
      borderColor="rgba(255, 255, 255, 0.55)"
      cursor="pointer"
      transformScaleX={hovered ? 1.08 : 1}
      transformScaleY={hovered ? 1.08 : 1}
      onHoverChange={(h: boolean) => setHovered(h)}
      onPointerDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <X width={CLOSE.icon} height={CLOSE.icon} color={COLOR.text} />
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
  size = BAR_BUTTON,
  active = false,
  tone = "default",
  disabled = false,
  onHover,
  onSelect,
}: {
  icon: ReactNode;
  size?: number;
  active?: boolean;
  tone?: "default" | "danger";
  disabled?: boolean;
  onHover?: (hovered: boolean) => void;
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
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.dot}
      opacity={disabled ? OPACITY.disabled : 1}
      cursor={disabled ? "default" : "pointer"}
      transformScaleX={lit ? 1.06 : 1}
      transformScaleY={lit ? 1.06 : 1}
      onHoverChange={(h: boolean) => {
        setHovered(h);
        onHover?.(h);
      }}
      onPointerDown={disabled ? undefined : onSelect}
    >
      <Glass
        radius={RADIUS.dot}
        fill={fill}
        fillOpacity={fillOpacity}
        borderOpacity={active ? OPACITY.activeBorder : OPACITY.chipBorder}
      />
      <Container
        pointerEvents="none"
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent="center"
        opacity={active || lit ? 1 : OPACITY.icon}
      >
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
  const [hovered, setHovered] = useState(false);
  const lit = hovered && !disabled;
  return (
    <Container
      width="100%"
      minHeight={ROW_HEIGHT}
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
      <Glass
        radius={RADIUS.row}
        fill={active ? COLOR.accent : COLOR.tile}
        fillOpacity={active ? 1 : lit ? OPACITY.tileHover : OPACITY.tile}
        borderOpacity={active ? OPACITY.activeBorder : lit ? OPACITY.border : OPACITY.chipBorder}
      />
      {icon && <IconChip icon={icon} />}
      <Container pointerEvents="none" flexDirection="column" flexGrow={1} flexShrink={1} gapRow={2}>
        <VrText fontSize={TEXT.tile + 1} fontWeight="semi-bold" color={COLOR.text}>
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
    <Container flexDirection="row" alignItems="center" gapColumn={14} flexShrink={0} paddingRight={20}>
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
  const [scrollRef, onScrollHover] = useStickScroll();
  return (
    <Container
      ref={scrollRef}
      onHoverChange={onScrollHover}
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
