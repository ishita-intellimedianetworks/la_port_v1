"use client";

import { Children, useEffect, useState, type ReactNode } from "react";
import { Container, Image as Picture, Video } from "@react-three/uikit";
import { Pause, Play, TriangleAlert } from "@react-three/uikit-lucide";
import type { HotspotConfig, HotspotField, Tone } from "@/config/schema";
import { Glass, HeadLocked, RedClose } from "./primitives";
import { useStickScroll } from "./stick-scroll";
import { VrText } from "./text";
import { POINTER_ORDER } from "./tokens";

export const S = 1;
export const px = (n: number) => Math.round(n * S * 10) / 10;

export const INK = {
  text: "#f4f6f8",
  white: "#ffffff",
  close: "#e6eaef",
  glass: "#090b0f",
  plate: "#080b10",
  accent: "#0071e3",
  accentBright: "#2997ff",
  ok: "#30d158",
  warn: "#ffb020",
  alert: "#ff5c5c",
  alertSoft: "#ff9b93",
  critical: "#ff3bd4",
  menu: "#11151c",
} as const;

export const ALPHA = {
  card: 0.82,
  border: 0.14,
  divider: 0.08,
  faint: 0.6,
  dim: 0.82,
  tile: 0.05,
  tileSoft: 0.03,
  tileBorder: 0.1,
  closeFill: 0.14,
  closeBorder: 0.22,
  plate: 0.72,
} as const;

export function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const HAIRLINE = rgba(INK.white, ALPHA.divider);

export type CardTone = Record<Tone, string>;

export const TONE: CardTone = { ok: INK.ok, warn: INK.warn, alert: INK.alert };

export function formatValue(field: HotspotField): string {
  const { type, value, unit } = field;
  if (value === "" || value === null || value === undefined) return "-";
  if (type === "boolean") return value ? "Yes" : "No";
  let text: string;
  if (typeof value === "number") {
    if (field.decimals != null) text = value.toFixed(field.decimals);
    else text = Number.isInteger(value) ? value.toLocaleString() : String(value);
    if (type === "percentage") text += "%";
  } else {
    text = String(value);
  }
  return unit ? `${text} ${unit}` : text;
}

export function tonedColor(field: HotspotField, tone: Tone | undefined, palette: CardTone = TONE) {
  if (!tone) return undefined;
  return field.type === "enum" || field.tone != null ? palette[tone] : undefined;
}

export function meterOf(field: HotspotField): number | null {
  return field.render === "meter" && typeof field.value === "number"
    ? Math.max(0, Math.min(1, field.value / (field.max ?? 100)))
    : null;
}

type Layer = {
  fill?: string;
  fillOpacity?: number;
  border?: string;
  borderOpacity?: number;
  borderWidth?: number;
  radius: number;
};

export function Surface({ fill, fillOpacity = 1, border = INK.white, borderOpacity = 0, borderWidth = 1.5, radius }: Layer) {
  return (
    <Glass
      radius={radius}
      fill={fill ?? INK.white}
      fillOpacity={fill ? fillOpacity : 0}
      border={border}
      borderOpacity={borderOpacity}
      borderWidth={borderWidth}
    />
  );
}

export function CardShell({
  width,
  height,
  maxHeight,
  padding = px(24),
  radius = px(14),
  children,
  onDismiss,
  onClose,
}: {
  width: `${number}%` | number;
  height?: `${number}%` | number;
  maxHeight?: `${number}%` | number;
  padding?: number;
  radius?: number;
  children: ReactNode;
  onDismiss: () => void;
  onClose?: () => void;
}) {
  return (
    <HeadLocked alignItems="center" justifyContent="center" pointerEventsOrder={POINTER_ORDER.ui}>
      <Container positionType="absolute" width="100%" height="100%" onPointerDown={onDismiss} />
      <Container
        positionType="relative"
        flexDirection="column"
        width={width}
        height={height}
        maxHeight={maxHeight}
        padding={padding}
        borderRadius={radius}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Surface
          radius={radius}
          fill={INK.glass}
          fillOpacity={ALPHA.card}
          borderOpacity={ALPHA.border}
        />
        {children}
        <RedClose onClose={onClose ?? onDismiss} />
      </Container>
    </HeadLocked>
  );
}

export function CardHeader({
  title,
  subtitle,
  titleSize = 18,
  subtitleSize = 13,
}: {
  title: string;
  subtitle?: string | null;
  onClose?: () => void;
  titleSize?: number;
  subtitleSize?: number;
}) {
  return (
    <Container flexDirection="row" alignItems="flex-start" gapColumn={px(10)} flexShrink={0} paddingRight={px(18)}>
      <Container flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Container minHeight={px(30)} alignItems="center" flexDirection="row">
          <VrText fontSize={px(titleSize)} fontWeight="bold" color={INK.text} letterSpacing={-0.2}>
            {title}
          </VrText>
        </Container>
        {subtitle && (
          <VrText marginTop={px(2)} fontSize={px(subtitleSize)} fontWeight="medium" color={INK.text}>
            {subtitle}
          </VrText>
        )}
      </Container>
    </Container>
  );
}

export function Rule({ marginTop = px(16) }: { marginTop?: number }) {
  return (
    <Container
      width="100%"
      height={1}
      flexShrink={0}
      marginTop={marginTop}
      backgroundColor={INK.white}
      opacity={ALPHA.divider}
    />
  );
}

export function Scroll({ children, grow = true }: { children: ReactNode; grow?: boolean }) {
  const [scrollRef, onScrollHover] = useStickScroll();
  return (
    <Container
      ref={scrollRef}
      onHoverChange={onScrollHover}
      flexDirection="column"
      flexGrow={grow ? 1 : 0}
      flexShrink={1}
      minHeight={0}
      width="100%"
      overflow="scroll"
      scrollbarWidth={8}
      scrollbarColor="#8a95a5"
      scrollbarBorderRadius={4}
      paddingRight={px(10)}
    >
      {children}
    </Container>
  );
}

export function Meter({ value, color }: { value: number; color: string }) {
  return (
    <Container marginTop={px(6)} width="100%" height={px(3)} borderRadius={999} flexShrink={0}>
      <Surface radius={999} fill={INK.white} fillOpacity={0.15} />
      <Container width={`${value * 100}%`} height="100%" borderRadius={999} backgroundColor={color} />
    </Container>
  );
}

export function Grid({
  columns,
  gapX,
  gapY = 0,
  children,
}: {
  columns: number;
  gapX: number;
  gapY?: number;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <Container flexDirection="column" gapRow={gapY} width="100%" flexShrink={0}>
      {rows.map((row, i) => (
        <Container key={i} flexDirection="row" gapColumn={gapX} width="100%" alignItems="stretch">
          {Array.from({ length: columns }, (_, j) => (
            <Container key={j} flexBasis={0} flexGrow={1} minWidth={0} flexDirection="column">
              {row[j] ?? null}
            </Container>
          ))}
        </Container>
      ))}
    </Container>
  );
}

export function Label({
  children,
  size,
  weight = "semi-bold",
  upper = true,
  tracking = 0.08,
  opacity = 1,
  color = INK.text,
}: {
  children: string;
  size: number;
  weight?: "medium" | "semi-bold" | "bold";
  upper?: boolean;
  tracking?: number;
  opacity?: number;
  color?: string;
}) {
  const fontSize = px(size);
  return (
    <VrText
      fontSize={fontSize}
      fontWeight={weight}
      letterSpacing={upper ? fontSize * tracking : 0}
      color={color}
      opacity={opacity}
    >
      {upper ? children.toUpperCase() : children}
    </VrText>
  );
}

export function AlertBanner({
  alert,
  palette = TONE,
  marginBottom = px(20),
}: {
  alert: NonNullable<HotspotConfig["alert"]>;
  palette?: CardTone;
  marginBottom?: number;
}) {
  const danger = alert.level === "danger";
  const ink = danger ? palette.alert : palette.warn;
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      gapColumn={px(14)}
      paddingLeft={px(20)}
      paddingRight={px(16)}
      paddingY={px(14)}
      borderRadius={px(10)}
      marginBottom={marginBottom}
      flexShrink={0}
      width="100%"
    >
      <Surface
        radius={px(10)}
        fill={danger ? "#b62c22" : "#ffb020"}
        fillOpacity={danger ? 0.4 : 0.2}
        border={danger ? "#ff9b93" : "#ffb020"}
        borderOpacity={0.26}
        borderWidth={1}
      />
      <Container
        positionType="absolute"
        positionLeft={0}
        positionTop={0}
        width={px(4)}
        height="100%"
        borderTopLeftRadius={px(10)}
        borderBottomLeftRadius={px(10)}
        backgroundColor={ink}
      />
      <TriangleAlert width={px(19)} height={px(19)} color={ink} />
      <Container flexDirection="column" flexShrink={1} minWidth={0}>
        <Label size={11} weight="bold" tracking={0.14} color={ink}>
          {alert.title}
        </Label>
        {alert.detail && (
          <VrText marginTop={px(4)} fontSize={px(14)} fontWeight="semi-bold" color={INK.text}>
            {alert.detail}
          </VrText>
        )}
      </Container>
    </Container>
  );
}

export function Journey({
  title,
  steps,
  stageOpacity = ALPHA.faint,
  titleOpacity = ALPHA.dim,
}: {
  title: string;
  steps: NonNullable<HotspotConfig["journey"]>;
  stageOpacity?: number;
  titleOpacity?: number;
}) {
  return (
    <Container flexDirection="column" flexShrink={0} width="100%">
      <Rule />
      <Container paddingTop={px(12)} paddingBottom={px(4)}>
        <Label size={10} tracking={0.06} opacity={titleOpacity}>
          {title}
        </Label>
      </Container>
      {steps.map((step, i) => (
        <Container
          key={step.stage}
          flexDirection="row"
          alignItems="center"
          gapColumn={px(12)}
          paddingBottom={i < steps.length - 1 ? px(8) : 0}
        >
          <Container flexDirection="column" alignItems="center" alignSelf="stretch">
            <Container
              marginTop={px(8)}
              width={px(6)}
              height={px(6)}
              borderRadius={999}
              backgroundColor={INK.accentBright}
            />
            {i < steps.length - 1 && (
              <Container marginTop={px(4)} width={1} flexGrow={1} backgroundColor={INK.white} opacity={0.15} />
            )}
          </Container>
          <Container flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            <VrText fontSize={px(11.5)} fontWeight="medium" color={INK.text} opacity={stageOpacity}>
              {`${step.stage} - ${step.state}`}
            </VrText>
            <VrText fontSize={px(14)} fontWeight="semi-bold" color={INK.text}>
              {step.label}
            </VrText>
          </Container>
          <Container paddingX={px(8)} paddingY={px(2)} borderRadius={999} flexShrink={0}>
            <Surface radius={999} fill={INK.white} fillOpacity={0.06} borderOpacity={0.16} />
            <VrText fontSize={px(10.5)} fontWeight="medium" color={INK.text} opacity={ALPHA.dim}>
              {step.layoutId}
            </VrText>
          </Container>
        </Container>
      ))}
    </Container>
  );
}

export function Still({
  src,
  width,
  tilt = true,
  cover = false,
}: {
  src: string;
  width: number | `${number}%`;
  tilt?: boolean;
  cover?: boolean;
}) {
  return (
    <Picture
      src={src}
      width={width}
      flexShrink={0}
      keepAspectRatio
      objectFit={cover ? "cover" : "fill"}
      transformRotateY={tilt ? -13 : 0}
      transformRotateX={tilt ? 2 : 0}
    />
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <Container
      positionType="absolute"
      flexDirection="row"
      alignItems="center"
      gapColumn={px(6)}
      paddingX={px(8)}
      paddingY={px(4)}
      borderRadius={px(7)}
    >
      <Surface radius={px(7)} fill={INK.plate} fillOpacity={ALPHA.plate} borderOpacity={ALPHA.border} />
      {children}
    </Container>
  );
}

export function StillPanel({ src, tag }: { src: string; tag: string }) {
  return (
    <Container positionType="relative" width="100%" flexDirection="column" flexShrink={0}>
      <Still src={src} width="100%" tilt={false} />
      <Container positionType="absolute" positionLeft={px(12)} positionTop={px(12)}>
        <Badge>
          <Label size={11} weight="bold" tracking={0.06}>
            {tag}
          </Label>
        </Badge>
      </Container>
    </Container>
  );
}

function attachClip(video: HTMLVideoElement, url: string) {
  video.src = url;
  return () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
}

function useClipElement(url: string) {
  const [video] = useState(() => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.autoplay = true;
    v.preload = "auto";
    return v;
  });
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    const detach = attachClip(video, url);
    void video.play().catch(() => setPlaying(false));
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      detach();
    };
  }, [video, url]);
  const toggle = () => {
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };
  return { video, playing, toggle };
}

export function Clip({
  clip,
  camera,
  width = "100%",
}: {
  clip: NonNullable<HotspotConfig["clip"]>;
  camera: string | null;
  width?: number | `${number}%`;
}) {
  const { video, playing, toggle } = useClipElement(clip.url);
  const [hovered, setHovered] = useState(false);
  return (
    <Container positionType="relative" width={width} flexShrink={0} borderRadius={px(10)} overflow="hidden">
      <Video src={video} width="100%" keepAspectRatio aspectRatio={clip.width / clip.height} />
      <Container positionType="absolute" positionLeft={px(10)} positionTop={px(10)}>
        <Badge>
          <Container width={px(6)} height={px(6)} borderRadius={999} backgroundColor={INK.ok} />
          {camera && (
            <VrText fontSize={px(11.5)} fontWeight="bold" letterSpacing={0.5} color={INK.text}>
              {camera}
            </VrText>
          )}
          <VrText fontSize={px(10)} fontWeight="semi-bold" letterSpacing={1} color={INK.ok}>
            LIVE
          </VrText>
        </Badge>
      </Container>
      <Container
        positionType="absolute"
        positionLeft={px(10)}
        positionBottom={px(10)}
        width={px(30)}
        height={px(30)}
        alignItems="center"
        justifyContent="center"
        borderRadius={px(8)}
        cursor="pointer"
        onHoverChange={(h: boolean) => setHovered(h)}
        onPointerDown={toggle}
      >
        <Surface
          radius={px(8)}
          fill={hovered ? "#3a3f47" : INK.plate}
          fillOpacity={ALPHA.plate}
          borderOpacity={ALPHA.border}
        />
        {playing ? (
          <Pause width={px(12)} height={px(12)} color={INK.text} />
        ) : (
          <Play width={px(12)} height={px(12)} color={INK.text} />
        )}
      </Container>
    </Container>
  );
}

export function Poster({
  poster,
  onEnlarge,
}: {
  poster: NonNullable<HotspotConfig["poster"]>;
  onEnlarge?: () => void;
}) {
  return (
    <Container
      positionType="relative"
      width="100%"
      flexShrink={0}
      borderRadius={px(8)}
      overflow="hidden"
      cursor={onEnlarge ? "pointer" : "default"}
      onPointerDown={onEnlarge}
    >
      <Picture
        src={poster.url}
        width="100%"
        keepAspectRatio
        aspectRatio={poster.width / poster.height}
      />
      {onEnlarge && (
        <Container positionType="absolute" positionRight={px(14)} positionBottom={px(14)}>
          <Badge>
            <VrText fontSize={px(11)} fontWeight="semi-bold" color={INK.text}>
              Press to enlarge
            </VrText>
          </Badge>
        </Container>
      )}
    </Container>
  );
}

export function PosterCard({
  poster,
  zoomable = true,
  onClose,
}: {
  poster: NonNullable<HotspotConfig["poster"]>;
  zoomable?: boolean;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const aspect = poster.width / poster.height;
  const width = Math.min(zoomed ? 80 : 46, Math.round((zoomed ? 78 : 56) * aspect * 0.56));
  return (
    <CardShell width={`${width}%`} padding={zoomed ? 0 : px(10)} onDismiss={zoomed ? () => setZoomed(false) : onClose}>
      <Poster poster={poster} onEnlarge={zoomable && !zoomed ? () => setZoomed(true) : undefined} />
    </CardShell>
  );
}

export function Pill({
  children,
  color,
  radius = px(5),
}: {
  children: string;
  color: string;
  radius?: number;
}) {
  return (
    <Container paddingX={px(8)} paddingY={px(3)} borderRadius={radius} flexShrink={0}>
      <Surface radius={radius} fill={color} fillOpacity={0.18} />
      <VrText fontSize={px(11)} fontWeight="bold" letterSpacing={0.7} color={color}>
        {children}
      </VrText>
    </Container>
  );
}

export function ChipButton({
  label,
  on,
  dot,
  count,
  disabled = false,
  size = 12,
  offOpacity = 1,
  onSelect,
}: {
  label: string;
  on: boolean;
  dot?: string;
  count?: number;
  disabled?: boolean;
  size?: number;
  offOpacity?: number;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      gapColumn={px(6)}
      paddingX={px(12)}
      paddingY={px(5)}
      borderRadius={999}
      flexShrink={0}
      opacity={disabled ? 0.45 : 1}
      cursor={disabled ? "default" : "pointer"}
      onHoverChange={(h: boolean) => setHovered(h)}
      onPointerDown={disabled ? undefined : onSelect}
    >
      <Surface
        radius={999}
        fill={on ? INK.accent : INK.white}
        fillOpacity={on ? 1 : hovered && !disabled ? 0.12 : 0.06}
        borderOpacity={on ? 0.5 : ALPHA.border}
      />
      {dot && <Container width={px(6)} height={px(6)} borderRadius={999} backgroundColor={dot} />}
      <VrText fontSize={px(size)} fontWeight="semi-bold" color={on ? INK.white : INK.text} opacity={on ? 1 : offOpacity}>
        {label}
      </VrText>
      {count !== undefined && (
        <Container paddingX={px(6)} borderRadius={999}>
          <Surface radius={999} fill={INK.white} fillOpacity={on ? 0.22 : 0.08} />
          <VrText fontSize={px(11)} fontWeight="bold" color={on ? INK.white : INK.text}>
            {String(count)}
          </VrText>
        </Container>
      )}
    </Container>
  );
}

export function ActionButton({
  label,
  disabled = false,
  size = 12.5,
  onSelect,
}: {
  label: string;
  disabled?: boolean;
  size?: number;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Container
      paddingX={px(12)}
      paddingY={px(7)}
      borderRadius={px(8)}
      flexShrink={0}
      opacity={disabled ? 0.45 : 1}
      cursor={disabled ? "default" : "pointer"}
      onHoverChange={(h: boolean) => setHovered(h)}
      onPointerDown={disabled ? undefined : onSelect}
    >
      <Surface
        radius={px(8)}
        fill={INK.white}
        fillOpacity={hovered && !disabled ? 0.14 : 0.06}
        borderOpacity={ALPHA.border}
      />
      <VrText fontSize={px(size)} fontWeight="semi-bold" color={INK.text}>
        {label}
      </VrText>
    </Container>
  );
}

export function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <Container width={px(20)} height={px(20)} borderRadius={999} alignItems="center" justifyContent="center" flexShrink={0}>
      <Surface radius={999} fill={color} fillOpacity={0.26} border={color} borderOpacity={0.55} borderWidth={1} />
      <VrText fontSize={px(9)} fontWeight="semi-bold" color={color}>
        {initials}
      </VrText>
    </Container>
  );
}

export function EmptyNote({ children }: { children: string }) {
  return (
    <Container
      width="100%"
      alignItems="center"
      justifyContent="center"
      paddingY={px(14)}
      borderRadius={px(9)}
      flexShrink={0}
    >
      <Surface radius={px(9)} borderOpacity={ALPHA.divider * 2} borderWidth={1} />
      <VrText fontSize={px(13)} color={INK.text}>
        {children}
      </VrText>
    </Container>
  );
}

export function PressRow({
  children,
  active = false,
  activeFill = INK.accent,
  selectedRing = false,
  radius = px(10),
  paddingX = px(14),
  paddingY = px(10),
  gap = px(12),
  onSelect,
}: {
  children: ReactNode;
  active?: boolean;
  activeFill?: string;
  selectedRing?: boolean;
  radius?: number;
  paddingX?: number;
  paddingY?: number;
  gap?: number;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      gapColumn={gap}
      paddingX={paddingX}
      paddingY={paddingY}
      borderRadius={radius}
      width="100%"
      flexShrink={0}
      cursor="pointer"
      onHoverChange={(h: boolean) => setHovered(h)}
      onPointerDown={onSelect}
    >
      <Surface
        radius={radius}
        fill={active ? activeFill : INK.white}
        fillOpacity={active ? 0.16 : hovered ? 0.1 : 0.05}
        border={active ? activeFill : INK.white}
        borderOpacity={active ? 0.6 : selectedRing ? 0.45 : ALPHA.border}
      />
      {children}
    </Container>
  );
}
