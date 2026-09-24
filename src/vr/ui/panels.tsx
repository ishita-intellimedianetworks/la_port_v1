"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import {
  ArrowLeft,
  Box,
  ChevronRight,
  House,
  Info,
  Library,
  LogOut,
  MapPin,
  PersonStanding,
  X,
} from "@react-three/uikit-lucide";
import { useSite } from "@/config/context";
import type { HotspotField, Tone } from "@/config/schema";
import type { VrResourceGroup, VrView } from "../bridge";
import { exitVr } from "../xr-store";
import { Glass, HeadLocked, IconButton, List, Panel, PanelHeader, Row } from "./primitives";
import { VrText } from "./text";
import { COLOR, POINTER_ORDER, RADIUS, SPACE, TEXT } from "./tokens";

const ICON = { width: 26, height: 26, color: COLOR.text } as const;
const SMALL_ICON = { width: 20, height: 20, color: COLOR.text } as const;

export function BottomBar({
  view,
  onHome,
  onFirstPerson,
  onDollhouse,
  onResources,
  onInstructions,
}: {
  view: VrView;
  onHome: () => void;
  onFirstPerson: (() => void) | null;
  onDollhouse: () => void;
  onResources: () => void;
  onInstructions: () => void;
}) {
  const firstPerson = view === "firstPerson";
  return (
    <HeadLocked pointerEvents="none">
      <Container
        positionType="absolute"
        positionBottom="22%"
        width="100%"
        flexDirection="row"
        justifyContent="center"
      >
        <Container
          pointerEvents="auto"
          pointerEventsOrder={POINTER_ORDER.ui}
          flexDirection="row"
          alignItems="center"
          gapColumn={SPACE.dock}
          padding={SPACE.dock}
          borderRadius={RADIUS.dot}
        >
          <Glass radius={RADIUS.dot} />
          <IconButton icon={<House {...ICON} />} onSelect={onHome} />
          {firstPerson && onFirstPerson && (
            <IconButton icon={<PersonStanding {...ICON} />} onSelect={onFirstPerson} />
          )}
          {firstPerson && <IconButton icon={<Box {...ICON} />} onSelect={onDollhouse} />}
          <IconButton icon={<Info {...ICON} />} onSelect={onInstructions} />
          {firstPerson && <IconButton icon={<Library {...ICON} />} onSelect={onResources} />}
          <IconButton icon={<LogOut {...ICON} />} tone="danger" onSelect={exitVr} />
        </Container>
      </Container>
    </HeadLocked>
  );
}

export function ResourcesPanel({
  groups,
  label,
  onHotspot,
  onClose,
}: {
  groups: VrResourceGroup[];
  label: string;
  onHotspot: (id: string) => void;
  onClose: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = groups.find((g) => g.id === openId) ?? null;
  const close = <X {...SMALL_ICON} />;
  const back = <ArrowLeft {...SMALL_ICON} />;

  return (
    <Panel onDismiss={onClose}>
      <PanelHeader
        title={open ? open.name : label}
        subtitle={open ? `${open.hotspots.length} hotspots` : undefined}
        onBack={open ? () => setOpenId(null) : undefined}
        onClose={onClose}
        backIcon={back}
        closeIcon={close}
      />
      <List>
        {open ? (
          <>
            {open.travel && (
              <Row
                label={`Go to ${open.name}`}
                icon={<MapPin {...SMALL_ICON} />}
                active
                onSelect={() => {
                  open.travel?.();
                  onClose();
                }}
              />
            )}
            {open.hotspots.map((h) => (
              <Row
                key={h.id}
                label={h.name}
                meta={h.id}
                disabled={h.disabled}
                trailing={<ChevronRight {...SMALL_ICON} />}
                onSelect={() => {
                  onHotspot(h.id);
                  onClose();
                }}
              />
            ))}
          </>
        ) : (
          groups.map((g) => (
            <Row
              key={g.id}
              label={g.name}
              meta={`${g.hotspots.length} hotspots`}
              trailing={<ChevronRight {...SMALL_ICON} />}
              onSelect={() => setOpenId(g.id)}
            />
          ))
        )}
      </List>
    </Panel>
  );
}

const TONE_COLOR: Record<Tone, string> = {
  ok: COLOR.ok,
  warn: COLOR.warn,
  alert: COLOR.alert,
};

function formatValue(field: HotspotField): string {
  const { type, value, unit } = field;
  if (field.pending || value === "" || value === null || value === undefined) return "-";
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

export function HotspotPanel({
  title,
  subtitle,
  alert,
  fields,
  onClose,
}: {
  title: string;
  subtitle: string | null;
  alert?: { level: "danger" | "caution"; title: string; detail?: string };
  fields: HotspotField[];
  onClose: () => void;
}) {
  const site = useSite();
  const shown = useMemo(() => fields.filter((f) => !f.eventOnly), [fields]);
  const rows = useMemo(() => {
    const out: HotspotField[][] = [];
    for (let i = 0; i < shown.length; i += 2) out.push(shown.slice(i, i + 2));
    return out;
  }, [shown]);

  return (
    <Panel width="52%" maxHeight="62%" onDismiss={onClose}>
      <PanelHeader
        title={title}
        subtitle={subtitle ?? undefined}
        onClose={onClose}
        backIcon={null}
        closeIcon={<X {...SMALL_ICON} />}
      />
      {alert && (
        <Container
          flexDirection="column"
          gapRow={4}
          padding={14}
          borderRadius={RADIUS.row}
          backgroundColor={alert.level === "danger" ? "#6e1f19" : "#5a4210"}
          borderWidth={1}
          borderColor={alert.level === "danger" ? COLOR.alert : COLOR.warn}
          flexShrink={0}
        >
          <VrText fontSize={TEXT.label} fontWeight="bold" color={COLOR.text}>
            {alert.title.toUpperCase()}
          </VrText>
          {alert.detail && (
            <VrText fontSize={TEXT.body} color={COLOR.text}>
              {alert.detail}
            </VrText>
          )}
        </Container>
      )}
      <List>
        {rows.map((pair, i) => (
          <Container key={i} flexDirection="row" gapColumn={24} flexShrink={0}>
            {pair.map((f) => {
              const tone = f.pending ? undefined : site.toneFor(f.value, f.tone);
              return (
                <Container
                  key={f.name}
                  flexDirection="column"
                  gapRow={4}
                  width="48%"
                  paddingY={10}
                  borderBottomWidth={1}
                  borderColor={COLOR.divider}
                >
                  <VrText fontSize={TEXT.meta} fontWeight="semi-bold" color={COLOR.text}>
                    {f.label.toUpperCase()}
                  </VrText>
                  <VrText
                    fontSize={TEXT.value}
                    fontWeight="bold"
                    color={tone ? TONE_COLOR[tone] : COLOR.text}
                  >
                    {formatValue(f)}
                  </VrText>
                </Container>
              );
            })}
          </Container>
        ))}
      </List>
    </Panel>
  );
}

function InputLabel({ children }: { children: string }) {
  return (
    <Container width={170} flexShrink={0}>
      <VrText fontSize={TEXT.body} fontWeight="semi-bold" color={COLOR.accentBright}>
        {children}
      </VrText>
    </Container>
  );
}

function Chip({ icon }: { icon: ReactNode }) {
  return (
    <Container width={170} flexShrink={0}>
      <Container
        width={40}
        height={40}
        alignItems="center"
        justifyContent="center"
        borderRadius={RADIUS.dot}
        backgroundColor={COLOR.rowRest}
        borderWidth={1}
        borderColor={COLOR.rowBorder}
      >
        {icon}
      </Container>
    </Container>
  );
}

function InstructionRow({ control, text }: { control: ReactNode; text: string }) {
  return (
    <Container flexDirection="row" alignItems="center" gapColumn={SPACE.icon} width="100%" flexShrink={0} minHeight={40}>
      {control}
      <VrText flexGrow={1} flexShrink={1} fontSize={TEXT.body} color={COLOR.text}>
        {text}
      </VrText>
    </Container>
  );
}

export function PrimaryButton({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <Container
      width="100%"
      height={56}
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.row}
      backgroundColor={COLOR.accent}
      cursor="pointer"
      hover={{ backgroundColor: COLOR.accentBright }}
      onPointerDown={onSelect}
    >
      <VrText pointerEvents="none" fontSize={TEXT.body} fontWeight="semi-bold" color={COLOR.text}>
        {label}
      </VrText>
    </Container>
  );
}

const ACCENT_ICON = { width: 22, height: 22, color: COLOR.accentBright } as const;

export function InstructionsPanel({ view, onDismiss }: { view: VrView; onDismiss: () => void }) {
  const firstPerson = view === "firstPerson";
  return (
    <Panel width="52%" maxHeight="66%" onDismiss={onDismiss}>
      <VrText fontSize={TEXT.title} fontWeight="bold" color={COLOR.text}>
        {firstPerson ? "First Person View" : "Doll House View"}
      </VrText>
      <List>
        {firstPerson ? (
          <>
            <InstructionRow control={<InputLabel>Left stick</InputLabel>} text="Walk in the direction you are looking" />
            <InstructionRow control={<InputLabel>Left grip</InputLabel>} text="Hold while walking to run" />
            <InstructionRow control={<InputLabel>Right stick</InputLabel>} text="Turn left or right" />
            <InstructionRow control={<InputLabel>Trigger</InputLabel>} text="Press a hotspot, a button or a row the ray points at" />
            <InstructionRow control={<Chip icon={<House {...ACCENT_ICON} />} />} text="Back to the home position" />
            <InstructionRow control={<Chip icon={<PersonStanding {...ACCENT_ICON} />} />} text="The first person view" />
            <InstructionRow control={<Chip icon={<Box {...ACCENT_ICON} />} />} text="See the terminal from outside again" />
            <InstructionRow control={<Chip icon={<Library {...ACCENT_ICON} />} />} text="Resources - go to any layout or hotspot" />
          </>
        ) : (
          <>
            <InstructionRow control={<InputLabel>Look around</InputLabel>} text="See the whole terminal from above" />
            <InstructionRow control={<InputLabel>Trigger twice</InputLabel>} text="Go down to the home position" />
            <InstructionRow control={<Chip icon={<House {...ACCENT_ICON} />} />} text="Go down to the home position" />
          </>
        )}
        <InstructionRow control={<Chip icon={<Info {...ACCENT_ICON} />} />} text="Show these instructions again" />
        <InstructionRow control={<Chip icon={<LogOut {...ACCENT_ICON} />} />} text="Leave VR" />
      </List>
      <PrimaryButton label={firstPerson ? "Start walking" : "Start exploring"} onSelect={onDismiss} />
    </Panel>
  );
}
