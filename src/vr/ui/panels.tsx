"use client";

import { useState, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import {
  ArrowLeft,
  Box,
  ChevronRight,
  EyeOff,
  House,
  Info,
  Map as MapIcon,
  Images,
  LogOut,
  MapPin,
  PersonStanding,
} from "@react-three/uikit-lucide";
import type { VrResourceGroup, VrView } from "../bridge";
import { exitVr } from "../xr-store";
import {
  Divider,
  GlassButton,
  GroupLabel,
  HeadLocked,
  List,
  Panel,
  PanelHeader,
  Row,
  Tile,
  IconButton,
} from "./primitives";
import { VrText } from "./text";
import { COLOR, DOCK, OPACITY, POINTER_ORDER, SPACE, TEXT } from "./tokens";

const ICON = { width: 26, height: 26, color: COLOR.text } as const;
const SMALL_ICON = { width: 20, height: 20, color: COLOR.text } as const;
const TILE_ICON = { width: 20, height: 20, color: COLOR.text } as const;

const HIDE_HINT = "B or Y brings them back";


interface BarItem {
  key: string;
  label: string;
  icon: ReactNode;
  tone?: "danger";
  active?: boolean;
  onSelect: () => void;
}

export function BottomBar({
  view,
  onHome,
  onFirstPerson,
  onDollhouse,
  onResources,
  onMap,
  onInstructions,
  onHide,
}: {
  view: VrView;
  onHome: () => void;
  onFirstPerson: (() => void) | null;
  onDollhouse: () => void;
  onResources: () => void;
  onMap: (() => void) | null;
  onInstructions: () => void;
  onHide: () => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const items: BarItem[] = [
    { key: "home", label: "Home", icon: <House {...ICON} />, onSelect: onHome },
    ...(onFirstPerson
      ? [{ key: "firstPerson", label: "First Person", icon: <PersonStanding {...ICON} />, onSelect: onFirstPerson }]
      : []),
    { key: "dollhouse", label: "Dollhouse", icon: <Box {...ICON} />, active: view === "dollhouse", onSelect: onDollhouse },
    { key: "info", label: "Instructions", icon: <Info {...ICON} />, onSelect: onInstructions },
    ...(onMap ? [{ key: "map", label: "Map", icon: <MapIcon {...ICON} />, onSelect: onMap }] : []),
    { key: "resources", label: "Resources", icon: <Images {...ICON} />, onSelect: onResources },
    { key: "hide", label: "Hide icons (B / Y to show)", icon: <EyeOff {...ICON} />, onSelect: onHide },
    { key: "exit", label: "Exit VR", icon: <LogOut {...ICON} />, tone: "danger", onSelect: exitVr },
  ];
  const label = items.find((i) => i.key === hovered)?.label ?? null;

  return (
    <HeadLocked pointerEvents="none">
      <Container
        positionType="absolute"
        positionBottom="30%"
        width="100%"
        flexDirection="column"
        alignItems="center"
      >
        <Container height={DOCK.labelHeight} alignItems="center" justifyContent="center">
          <VrText fontSize={DOCK.label} fontWeight="semi-bold" color={COLOR.text} visibility={label ? "visible" : "hidden"}>
            {label ?? " "}
          </VrText>
        </Container>
        <Container
          pointerEvents="auto"
          pointerEventsOrder={POINTER_ORDER.ui}
          flexDirection="row"
          alignItems="center"
          gapColumn={SPACE.dock}
        >
          {items.map((item) => (
            <IconButton
              key={item.key}
              icon={item.icon}
              tone={item.tone}
              active={item.active}
              onHover={(h) => setHovered((cur) => (h ? item.key : cur === item.key ? null : cur))}
              onSelect={item.onSelect}
            />
          ))}
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
  const back = <ArrowLeft {...SMALL_ICON} />;

  return (
    <Panel onDismiss={onClose}>
      <PanelHeader
        title={open ? open.name : label}
        subtitle={open ? `${open.hotspots.length} hotspots` : `${groups.length} layouts`}
        onBack={open ? () => setOpenId(null) : undefined}
        backIcon={back}
      />
      <Divider />
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

function TileGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Container flexDirection="column" gapRow={10} width="100%" flexShrink={0}>
      <GroupLabel>{label}</GroupLabel>
      <Container flexDirection="row" flexWrap="wrap" justifyContent="space-between" gapRow={SPACE.row} width="100%">
        {children}
      </Container>
    </Container>
  );
}

function ButtonTiles() {
  return (
    <TileGroup label="Buttons">
      <Tile icon={<House {...TILE_ICON} />} text="The home position" />
      <Tile icon={<PersonStanding {...TILE_ICON} />} text="The first person view" />
      <Tile icon={<Box {...TILE_ICON} />} text="See the terminal from outside" />
      <Tile icon={<Info {...TILE_ICON} />} text="Show these instructions again" />
      <Tile icon={<MapIcon {...TILE_ICON} />} text="Map - see where you are, teleport" />
      <Tile icon={<Images {...TILE_ICON} />} text="Resources - any layout or hotspot" />
      <Tile icon={<EyeOff {...TILE_ICON} />} text={`Hide the icons - ${HIDE_HINT}`} />
      <Tile icon={<LogOut {...TILE_ICON} />} text="Leave VR" />
    </TileGroup>
  );
}

export function InstructionsPanel({ view, onDismiss }: { view: VrView; onDismiss: () => void }) {
  const firstPerson = view === "firstPerson";
  return (
    <Panel width="56%" maxHeight="44%" align="center" onDismiss={onDismiss}>
      <Container flexDirection="column" alignItems="center" gapRow={6} flexShrink={0}>
        <VrText fontSize={TEXT.title} fontWeight="semi-bold" color={COLOR.text}>
          {firstPerson ? "First Person View" : "Doll House View"}
        </VrText>
        <VrText fontSize={TEXT.label} fontWeight="medium" color={COLOR.text} opacity={OPACITY.muted}>
          {firstPerson ? "Walk the terminal with your controllers" : "The whole terminal, seen from above"}
        </VrText>
      </Container>
      <List>
        <Container flexDirection="column" gapRow={SPACE.section} width="100%" flexShrink={0}>
          {firstPerson ? (
            <>
              <TileGroup label="Controllers">
                <Tile control="Left stick" text="Walk where you look" />
                <Tile control="Left grip" text="Hold while walking to run" />
                <Tile control="Right stick" text="Push left or right to turn" />
                <Tile control="Right stick" text="Push up or down to scroll a card" />
                <Tile control="Trigger" text="Press a hotspot, button or row" />
              </TileGroup>
              <ButtonTiles />
            </>
          ) : (
            <>
              <TileGroup label="Controllers">
                <Tile control="Stick" text="Push left or right to turn the terminal" />
                <Tile control="Trigger twice" text="Go down to the home position" />
                <Tile control="Trigger" text="Press a button" />
              </TileGroup>
              <ButtonTiles />
            </>
          )}
        </Container>
      </List>
      <GlassButton label={firstPerson ? "Start walking" : "Start exploring"} onSelect={onDismiss} />
    </Panel>
  );
}
