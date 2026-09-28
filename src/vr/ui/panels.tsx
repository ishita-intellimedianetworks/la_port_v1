"use client";

import { useState, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import {
  Box,
  ChevronDown,
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

const RESOURCE = { chevron: 48 } as const;


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
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <Panel onDismiss={onClose}>
      <PanelHeader title={label} subtitle={`${groups.length} groups`} backIcon={null} />
      <Divider />
      <List>
        {groups.map((g) => {
          const open = g.id === openId;
          const travel = g.travel;
          return (
            <Container key={g.id} flexDirection="column" gapRow={SPACE.row} width="100%" flexShrink={0}>
              <Container flexDirection="row" alignItems="center" gapColumn={SPACE.row} width="100%">
                <IconButton
                  size={RESOURCE.chevron}
                  active={open}
                  disabled={g.hotspots.length === 0}
                  icon={open ? <ChevronDown {...SMALL_ICON} /> : <ChevronRight {...SMALL_ICON} />}
                  onSelect={() => toggle(g.id)}
                />
                <Container flexGrow={1} flexShrink={1} minWidth={0}>
                  <Row
                    label={g.name}
                    meta={`${g.hotspots.length} hotspots`}
                    trailing={travel ? <MapPin {...SMALL_ICON} /> : undefined}
                    onSelect={
                      travel
                        ? () => {
                            travel();
                            onClose();
                          }
                        : () => toggle(g.id)
                    }
                  />
                </Container>
              </Container>
              {open && (
                <Container
                  flexDirection="column"
                  gapRow={SPACE.row / 1.5}
                  paddingLeft={RESOURCE.chevron + SPACE.row}
                  width="100%"
                  flexShrink={0}
                >
                  {g.hotspots.map((h) => (
                    <Row
                      key={h.id}
                      compact
                      label={h.name}
                      disabled={h.disabled}
                      onSelect={() => {
                        onHotspot(h.id);
                        onClose();
                      }}
                    />
                  ))}
                </Container>
              )}
            </Container>
          );
        })}
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
