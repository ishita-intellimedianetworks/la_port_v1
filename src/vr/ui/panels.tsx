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
  PersonStanding,
} from "@react-three/uikit-lucide";
import type { VrResourceGroup, VrView } from "../bridge";
import { exitVr } from "../xr-store";
import { CardShell, INK, Scroll, Surface, px } from "./card-kit";
import { HeadLocked, IconButton, RedClose } from "./primitives";
import { usePress } from "./stick-scroll";
import { VrText } from "./text";
import { COLOR, POINTER_ORDER, SPACE } from "./tokens";

const ICON = { width: 26, height: 26, color: COLOR.text } as const;

const HIDE_HINT = "B or Y brings them back";

const DOLLHOUSE_BAR = new Set(["home", "info", "hide", "exit"]);

const FLAP = {
  width: 340,
  maxHeight: "40%",
  radius: 14,
  headerHeight: 44,
  padX: 16,
  gap: 6,
  chevron: 32,
  chevronIcon: 18,
  indent: 52,
  textDim: 0.82,
} as const;

const TRAVEL = {
  radius: 16,
  pad: 14,
  text: 13.5,
  tracking: 0.4,
  fill: 0.05,
  fillHover: 0.09,
  border: 0.12,
  disabled: 0.4,
} as const;

const INSTR = {
  width: 640,
  maxHeight: "52%",
  radius: 24,
  pad: 36,
  gap: 14,
  title: 22,
  row: 44,
  labelCol: 180,
  chip: 34,
  chipIcon: 17,
  chipFill: 0.08,
  hairline: 0.18,
  control: 13,
  text: 13,
  panelFill: 0.62,
  panelBorder: 0.12,
  buttonHeight: 44,
  buttonRadius: 12,
  buttonText: 15,
  button: "#2997ff",
  buttonHover: "#4dabff",
} as const;

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
  const dollhouse = view === "dollhouse";
  const all: BarItem[] = [
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
  const items = dollhouse ? all.filter((i) => DOLLHOUSE_BAR.has(i.key)) : all;

  return (
    <HeadLocked pointerEvents="none">
      <Container
        positionType="absolute"
        positionBottom="30%"
        width="100%"
        flexDirection="column"
        alignItems="center"
      >
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
              label={item.label}
              tone={item.tone}
              active={item.active}
              onSelect={item.onSelect}
            />
          ))}
        </Container>
      </Container>
    </HeadLocked>
  );
}

function TravelRow({ name, disabled = false, onSelect }: { name: string; disabled?: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const press = usePress(onSelect, disabled);
  const lit = hovered && !disabled;
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      width="100%"
      padding={px(TRAVEL.pad)}
      borderRadius={px(TRAVEL.radius)}
      flexShrink={0}
      opacity={disabled ? TRAVEL.disabled : 1}
      cursor={disabled ? "default" : "pointer"}
      onHoverChange={(h: boolean) => setHovered(h)}
      {...press}
    >
      <Surface
        radius={px(TRAVEL.radius)}
        fill={INK.white}
        fillOpacity={lit ? TRAVEL.fillHover : TRAVEL.fill}
        borderOpacity={TRAVEL.border}
      />
      <VrText
        pointerEvents="none"
        flexGrow={1}
        flexShrink={1}
        fontSize={px(TRAVEL.text)}
        fontWeight="semi-bold"
        letterSpacing={TRAVEL.tracking}
        color={INK.text}
      >
        {name.toUpperCase()}
      </VrText>
    </Container>
  );
}

function ChevronToggle({ open, onSelect }: { open: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const press = usePress(onSelect);
  const size = px(FLAP.chevron);
  const icon = { width: px(FLAP.chevronIcon), height: px(FLAP.chevronIcon), color: INK.text, pointerEvents: "none" } as const;
  return (
    <Container
      width={size}
      height={size}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      borderRadius={px(8)}
      cursor="pointer"
      onHoverChange={(h: boolean) => setHovered(h)}
      {...press}
    >
      <Surface radius={px(8)} fill={INK.white} fillOpacity={hovered ? 0.08 : 0} />
      <Container pointerEvents="none" opacity={open ? 1 : FLAP.textDim}>
        {open ? <ChevronDown {...icon} /> : <ChevronRight {...icon} />}
      </Container>
    </Container>
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
  const gap = px(FLAP.gap);

  return (
    <CardShell width={px(FLAP.width)} maxHeight={FLAP.maxHeight} padding={0} radius={px(FLAP.radius)} onDismiss={onClose}>
      <Container
        height={px(FLAP.headerHeight)}
        flexDirection="row"
        alignItems="center"
        paddingX={px(FLAP.padX)}
        flexShrink={0}
      >
        <VrText fontSize={px(13)} fontWeight="semi-bold" color={INK.text} opacity={FLAP.textDim}>
          {label}
        </VrText>
      </Container>
      <Container flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0}>
        <Scroll>
          <Container flexDirection="column" gapRow={gap} paddingLeft={px(FLAP.padX)} paddingRight={px(FLAP.padX) - px(10)} paddingBottom={px(FLAP.padX)} flexShrink={0}>
            {groups.map((g) => {
              const open = g.id === openId;
              const hasChildren = g.hotspots.length > 0;
              const travel = g.travel;
              return (
                <Container key={g.id} flexDirection="column" gapRow={gap} width="100%" flexShrink={0}>
                  <Container flexDirection="row" alignItems="center" gapColumn={gap} width="100%">
                    {hasChildren ? (
                      <ChevronToggle open={open} onSelect={() => toggle(g.id)} />
                    ) : (
                      <Container width={px(FLAP.chevron)} height={px(FLAP.chevron)} flexShrink={0} />
                    )}
                    <Container flexGrow={1} flexShrink={1} minWidth={0}>
                      <TravelRow
                        name={g.name}
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
                      gapRow={gap}
                      marginLeft={px(FLAP.indent)}
                      marginTop={px(2)}
                      marginBottom={px(4)}
                      flexShrink={0}
                    >
                      {g.hotspots.map((h) => (
                        <TravelRow
                          key={h.id}
                          name={h.name}
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
          </Container>
        </Scroll>
      </Container>
    </CardShell>
  );
}

type InstructionRow = [string | typeof House, string];

const INSTRUCTIONS: Record<VrView, { title: string; rows: InstructionRow[]; dismiss: string }> = {
  dollhouse: {
    title: "The terminal",
    rows: [
      ["Stick left / right", "Turn the terminal round its centre"],
      ["Trigger twice", "Go down to the home position"],
      ["Trigger", "Press a button"],
      [House, "Go down to the home position"],
      [Info, "Show these instructions again"],
      [EyeOff, `Hide the bar - ${HIDE_HINT}`],
      [LogOut, "Leave VR"],
    ],
    dismiss: "Start exploring",
  },
  firstPerson: {
    title: "Walking the terminal",
    rows: [
      ["Left stick", "Walk where you look"],
      ["Left grip", "Hold while walking to run"],
      ["Right stick", "Turn left or right"],
      ["Right stick up / down", "Scroll a card or list"],
      ["Trigger", "Press a hotspot, button or row"],
      [MapIcon, "Press the plan to travel there"],
      [Images, "Go to any layout or hotspot"],
      [House, "Back to where you started"],
      [PersonStanding, "The first person view"],
      [Box, "See the terminal from outside"],
      [Info, "Show these instructions again"],
      [EyeOff, `Hide the bar - ${HIDE_HINT}`],
      [LogOut, "Leave VR"],
    ],
    dismiss: "Start walking",
  },
};

function ControlIcon({ icon: Icon }: { icon: typeof House }) {
  return <Icon pointerEvents="none" width={px(INSTR.chipIcon)} height={px(INSTR.chipIcon)} color={INK.accentBright} />;
}

function InstructionLine({ row }: { row: InstructionRow }) {
  const [control, what] = row;
  const chip = px(INSTR.chip);
  return (
    <Container flexDirection="row" alignItems="center" minHeight={px(INSTR.row)} width="100%" flexShrink={0}>
      <Container width={px(INSTR.labelCol)} flexShrink={0} flexDirection="row" alignItems="center">
        {typeof control === "string" ? (
          <VrText fontSize={px(INSTR.control)} fontWeight="semi-bold" color={INK.accentBright}>
            {control}
          </VrText>
        ) : (
          <Container
            width={chip}
            height={chip}
            flexShrink={0}
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            borderRadius={999}
          >
            <Surface radius={999} fill={INK.white} fillOpacity={INSTR.chipFill} borderOpacity={INSTR.hairline} />
            <ControlIcon icon={control} />
          </Container>
        )}
      </Container>
      <VrText flexGrow={1} flexShrink={1} minWidth={0} fontSize={px(INSTR.text)} fontWeight="medium" color={INK.white}>
        {what}
      </VrText>
    </Container>
  );
}

function InstructionAction({ label, onSelect }: { label: string; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const radius = px(INSTR.buttonRadius);
  return (
    <Container
      width="100%"
      height={px(INSTR.buttonHeight)}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      borderRadius={radius}
      flexShrink={0}
      cursor="pointer"
      backgroundColor={hovered ? INSTR.buttonHover : INSTR.button}
      onHoverChange={(h: boolean) => setHovered(h)}
      onPointerDown={onSelect}
    >
      <VrText pointerEvents="none" fontSize={px(INSTR.buttonText)} fontWeight="semi-bold" color={INK.white}>
        {label}
      </VrText>
    </Container>
  );
}

export function InstructionsPanel({ view, onDismiss }: { view: VrView; onDismiss: () => void }) {
  const { title, rows, dismiss } = INSTRUCTIONS[view];
  const radius = px(INSTR.radius);
  return (
    <HeadLocked alignItems="center" justifyContent="center" pointerEventsOrder={POINTER_ORDER.ui}>
      <Container positionType="absolute" width="100%" height="100%" onPointerDown={onDismiss} />
      <Container
        positionType="relative"
        flexDirection="column"
        gapRow={px(INSTR.gap)}
        width={px(INSTR.width)}
        maxHeight={INSTR.maxHeight}
        padding={px(INSTR.pad)}
        borderRadius={radius}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Surface
          radius={radius}
          fill={COLOR.panel}
          fillOpacity={INSTR.panelFill}
          borderOpacity={INSTR.panelBorder}
          borderWidth={1}
        />
        <Container flexShrink={0} paddingRight={px(40)}>
          <VrText fontSize={px(INSTR.title)} fontWeight="semi-bold" color={INK.white}>
            {title}
          </VrText>
        </Container>
        <Container flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} width="100%">
          <Scroll>
            <Container flexDirection="column" width="100%" flexShrink={0}>
              {rows.map((row, i) => (
                <InstructionLine key={i} row={row} />
              ))}
            </Container>
          </Scroll>
        </Container>
        <InstructionAction label={dismiss} onSelect={onDismiss} />
        <RedClose onClose={onDismiss} />
      </Container>
    </HeadLocked>
  );
}
