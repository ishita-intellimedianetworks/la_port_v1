"use client";

import {
  Box,
  MapPin,
  MousePointerClick,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { ui as uiCopy } from "@/config";
import { InstructionsOverlay } from "@/shared/ui/screens/instructions-overlay";

interface InstructionsCardProps {
  /** Which view's controls to teach. */
  mode: "dollhouse" | "firstPerson";
  visible: boolean;
  onDismiss: () => void;
}

const ICON_CLASS = "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]";

/**
 * Icon name (as written in `ui.json`) → glyph.
 *
 * The copy lives in JSON so it can be reworded without a code change, but an
 * icon cannot be serialised — so JSON names one and this table resolves it.
 * An unknown name falls back rather than crashing the overlay.
 */
const ICONS: Record<string, LucideIcon> = {
  pointer: MousePointerClick,
  moveHorizontal: MoveHorizontal,
  moveVertical: MoveVertical,
  dollhouse: Box,
  marker: MapPin,
  rotate: RotateCcw,
};

/**
 * The instructions card, in one of two flavours.
 *
 * Each view gets only its own controls: the dollhouse card teaches orbiting
 * and the double-click that leads inside, and the first-person card teaches
 * drag-to-look and double-click-to-move.
 *
 * The copy is the admin viewer's, because it describes the controls this
 * engine actually binds. There is no keyboard movement here — no WASD, no
 * arrow keys. Looking is a pointer drag (`use-pointer-drag`) and moving is a
 * double-click on the floor (`use-double-click-nav`).
 */
export function InstructionsCard({ mode, visible, onDismiss }: InstructionsCardProps) {
  const copy = uiCopy.instructions[mode];

  return (
    <InstructionsOverlay
      visible={visible}
      title={copy.title}
      instructions={copy.items.map((item) => {
        const Icon = ICONS[item.icon] ?? MousePointerClick;
        return { icon: <Icon size={18} className={ICON_CLASS} />, text: item.text };
      })}
      actionLabel={copy.actionLabel}
      onAction={onDismiss}
      contained
      backdropClassName="bg-black/25 backdrop-blur-md"
      cardVariant="dark"
    />
  );
}
