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
  PersonStanding,
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
  /**
   * Is the First Person circle actually in the dock? Its tile is dropped when
   * it is not.
   *
   * The circle is conditional — it needs an authored `cameras.firstPerson` and
   * it is not drawn on the frozen `/` variant — so the copy cannot simply list
   * it. Passed in rather than re-derived here: the caller decides whether to
   * draw the circle, and the same value gates both, which is what stops the
   * card teaching a button that is not on screen.
   */
  showFirstPerson?: boolean;
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
 * `map` are the four bottom-dock circles (BottomBar) and `resources` is the
 * left edge tab. The rest (`stop`, `speed`, `turn`, `marker`, `walk`, …) are no
 * longer used by the shipped copy but stay mapped, so a tile can be added back
 * in `site.json` alone. Keep them in step with those components, so the card
 * teaches the glyph the viewer is actually looking at.
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
  firstPerson: PersonStanding,
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
 * The first-person card is deliberately short: the look gesture, the RESOURCES
 * tab, and one tile per bottom-bar button. Everything else (hotspot discs, the
 * walking dock, the turn banner) is discovered in place and no longer spelled
 * out here, so the card stays a glance rather than a manual. It is reopened at
 * any time from the dock's Instructions button.
 *
 * The copy describes the controls this engine actually binds. There is no
 * keyboard movement here — no WASD, no arrow keys. Looking is a pointer drag
 * (`use-pointer-drag`) and moving is a double-click on the floor
 * (`use-double-click-nav`).
 */
export function InstructionsCard({ mode, visible, onDismiss, showFirstPerson }: InstructionsCardProps) {
  const copy = uiCopy.instructions[mode];
  // By icon name, not by position, so reordering the tiles in site.json cannot
  // silently drop the wrong one.
  const items = showFirstPerson
    ? copy.items
    : copy.items?.filter((i) => i.icon !== "firstPerson");

  return (
    <InstructionsOverlay
      visible={visible}
      title={copy.title}
      subtitle={copy.subtitle}
      columns={copy.columns}
      instructions={items?.map(toItem)}
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
