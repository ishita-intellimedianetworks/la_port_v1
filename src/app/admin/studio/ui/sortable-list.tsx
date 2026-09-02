"use client";

/**
 * Drag a row to where it goes.
 *
 * ORDER IS DATA in this file — `config/index.ts` derives each layout's child
 * list by filtering `hotspots[]` in array order, so the sequence of these rows
 * IS the sequence the Resources panel renders. Nudging a row with ↑/↓ made you
 * count the gap and click that many times; you drop it where you want it here.
 *
 * Modelled on the 3di admin's `SortableTable`, down to the nine-dot grip, but
 * built on the HTML drag-and-drop events rather than dnd-kit. The list is a
 * single vertical column of a few dozen rows, which is precisely the case the
 * native events handle well, and three packages plus a lockfile entry is a
 * poor trade for that.
 *
 * Three details that are easy to get wrong and are the whole feel of it:
 *
 *   - The ROW carries `draggable`, not the handle, because only a draggable
 *     element produces a drag image of itself. But a permanently draggable row
 *     swallows text selection and click-to-open everywhere inside it, so it is
 *     armed on pointerdown ON THE HANDLE and disarmed when the drag ends.
 *
 *   - The drop line is drawn from the pointer's position within the row it is
 *     over — top half means before, bottom half means after — so the insertion
 *     point is always the gap you can see, never a guess about direction.
 *
 *   - That line is positioned ABSOLUTELY, in the gap the `space-y` already
 *     leaves. In flow it would push the row it sits above down by its own
 *     height, out from under the pointer, into the previous row's half — which
 *     moves the line back up, and the two states flicker against each other
 *     for as long as you hover the boundary.
 */

import { useState, type ReactNode } from "react";

/** The nine-dot grip. Same glyph as the 3di admin's sortable rows, so a row
 *  reads as draggable to anyone who has used that tool. */
function Grip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {[6, 12, 18].map((y) =>
        [6, 12, 18].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />),
      )}
    </svg>
  );
}

function DropLine({ edge }: { edge: "top" | "bottom" }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-[#22c55e] ${
        edge === "top" ? "-top-1" : "-bottom-1"
      }`}
    />
  );
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  /** Both indices are into `items` as handed in. The caller maps them onto the
   *  underlying array — which is not always this one, since the resources step
   *  can be filtered to a single layout. */
  onReorder: (from: number, to: number) => void;
  /** `handle` must be rendered somewhere in the row; it is what arms the drag. */
  children: (item: T, index: number, handle: ReactNode) => ReactNode;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  /** Where the line is drawn: the index the row would land BEFORE. `items.length`
   *  means after the last row. */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const finish = () => {
    setDragging(null);
    setDropAt(null);
    setArmed(null);
  };

  const drop = () => {
    const from = items.findIndex((item) => item.id === dragging);
    if (from >= 0 && dropAt !== null) {
      // `dropAt` counts gaps, so removing the row first shifts every gap after
      // it down by one. Landing "before gap 5" from position 2 is landing at
      // index 4 once the row is out.
      const to = dropAt > from ? dropAt - 1 : dropAt;
      if (to !== from) onReorder(from, to);
    }
    finish();
  };

  return (
    <div className="space-y-2" onDragEnd={finish}>
      {items.map((item, index) => {
        const isDragging = dragging === item.id;
        const last = index === items.length - 1;
        return (
          <div key={item.id} className="relative">
            {dragging && dropAt === index && <DropLine edge="top" />}
            {dragging && last && dropAt === items.length && <DropLine edge="bottom" />}
            <div
              draggable={armed === item.id}
              onDragStart={(e) => {
                setDragging(item.id);
                e.dataTransfer.effectAllowed = "move";
                // Firefox will not start a drag without payload on the transfer.
                e.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const box = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientY < box.top + box.height / 2 ? index : index + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop();
              }}
              className={`transition-opacity ${isDragging ? "opacity-40" : ""}`}
            >
              {children(
                item,
                index,
                <span
                  // Arming on pointerdown rather than making the row eternally
                  // draggable: see the note at the top.
                  onPointerDown={() => setArmed(item.id)}
                  onPointerUp={() => setArmed(null)}
                  className="flex cursor-grab touch-none items-center px-1 text-slate-500 transition hover:text-slate-200 active:cursor-grabbing"
                  title="Drag to reorder"
                >
                  <Grip />
                </span>,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
