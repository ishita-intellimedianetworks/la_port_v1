"use client";

import {
  Box,
  CornerUpRight,
  Footprints,
  Gauge,
  Info,
  Map as MapIcon,
  MapPin,
  MousePointerClick,
  MoveHorizontal,
  MoveVertical,
  PanelLeft,
  RotateCcw,
  Square,
  Home,
  type LucideIcon,
} from "lucide-react";
import { ui as uiCopy } from "@/config";
import type { InstructionItemCopy } from "@/config/schema";
import { InstructionsOverlay } from "@/shared/ui/screens/instructions-overlay";

interface InstructionsCardProps {
  /** Which view's controls to teach. */
  mode: "dollhouse" | "firstPerson";
  visible: boolean;
  onDismiss: () => void;
}

const ICON_CLASS = "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]";

/**
 * Icon name (as written in `site.json` › `copy.instructions`) → glyph.
 *
 * The copy lives in JSON so it can be reworded without a code change, but an
 * icon cannot be serialised — so JSON names one and this table resolves it.
 * An unknown name falls back rather than crashing the overlay.
 *
 * The names mirror what is actually on screen: `home` / `dollhouse` / `info` /
 * `map` are the four bottom-dock circles (BottomBar), `stop` + `speed` are the
 * walking dock, `turn` is the NavHud banner, `resources` is the left edge tab
 * and `marker` is a hotspot disc in the 3D scene. Keep them in step with those
 * components, so the card teaches the glyph the viewer is actually looking at.
 */
const ICONS: Record<string, LucideIcon> = {
  pointer: MousePointerClick,
  moveHorizontal: MoveHorizontal,
  moveVertical: MoveVertical,
  dollhouse: Box,
  marker: MapPin,
  rotate: RotateCcw,
  home: Home,
  info: Info,
  map: MapIcon,
  resources: PanelLeft,
  stop: Square,
  speed: Gauge,
  turn: CornerUpRight,
  walk: Footprints,
};

/** JSON tile → overlay tile (icon name resolved to a rendered glyph). */
function toItem(item: InstructionItemCopy) {
  const Icon = ICONS[item.icon] ?? MousePointerClick;
  return { icon: <Icon size={18} className={ICON_CLASS} />, text: item.text };
}

/**
 * The instructions card, in one of two flavours.
 *
 * The dollhouse card teaches the two gestures that view has — orbiting, and
 * the double-click that leads inside — as a flat pair of tiles.
 *
 * The first-person card is a legend for the whole HUD: it walks through every
 * icon and every bar the viewer can see, grouped by where each one lives
 * (looking around, the scene itself, the walking dock, the bottom bar). It is
 * reopened at any time from the dock's Instructions button, so it doubles as
 * the app's only reference for what a glyph means.
 *
 * The copy describes the controls this engine actually binds. There is no
 * keyboard movement here — no WASD, no arrow keys. Looking is a pointer drag
 * (`use-pointer-drag`) and moving is a double-click on the floor
 * (`use-double-click-nav`).
 */
export function InstructionsCard({ mode, visible, onDismiss }: InstructionsCardProps) {
  const copy = uiCopy.instructions[mode];

  return (
    <InstructionsOverlay
      visible={visible}
      title={copy.title}
      subtitle={copy.subtitle}
      columns={copy.columns}
      instructions={copy.items?.map(toItem)}
      groups={copy.groups?.map((group) => ({
        label: group.label,
        items: group.items.map(toItem),
      }))}
      actionLabel={copy.actionLabel}
      onAction={onDismiss}
      contained
      backdropClassName="bg-black/25 backdrop-blur-md"
      cardVariant="dark"
    />
  );
}
