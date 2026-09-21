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
import { useSite } from "@/config/context";
import type { InstructionItemCopy } from "@/config/schema";
import { InstructionsOverlay } from "@/shared/ui/screens/instructions-overlay";

interface InstructionsCardProps {
  /** Which view's controls to teach. */
  mode: "dollhouse" | "firstPerson";
  visible: boolean;
  onDismiss: () => void;
  showFirstPerson?: boolean;
}

const ICON_CLASS = "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]";

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

export function InstructionsCard({ mode, visible, onDismiss, showFirstPerson }: InstructionsCardProps) {
  const copy = useSite().ui.instructions[mode];
  // By icon name, not by position, so reordering the tiles in the site file
  // cannot silently drop the wrong one.
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
