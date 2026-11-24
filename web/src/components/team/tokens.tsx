"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { X } from "lucide-react";

import type { BuilderCard } from "@/lib/data/team";
import { shortName } from "@/lib/format";
import type { PlayerChemistry } from "@/lib/game/lineup";
import { positionFit } from "@/lib/game/lineup";
import { RARITY_STYLE } from "@/lib/game/rarity";
import type { Position } from "@/lib/game/team-rating";
import { cn } from "@/lib/utils";

export const slotDropId = (slot: number) => `slot:${slot}`;
export const cardDragId = (ownershipId: string) => `card:${ownershipId}`;
export const POOL_DROP_ID = "pool";

function ChemDots({ dots, label }: { dots: number; label: string }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i < dots ? "bg-primary" : "bg-white/25")} />
      ))}
    </span>
  );
}

/** A squad slot (pitch or bench): droppable target holding an optional draggable card. */
export function SlotToken({
  slot,
  slotPosition,
  card,
  chem,
  captain,
  picked,
  highlight,
  compact,
  onActivate,
  onRemove,
}: {
  slot: number;
  slotPosition?: Position; // undefined on the bench
  card?: BuilderCard;
  chem?: PlayerChemistry;
  captain?: boolean;
  picked?: boolean;
  highlight?: boolean;
  compact?: boolean;
  onActivate: () => void;
  onRemove?: () => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slotDropId(slot) });
  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({
    id: card ? cardDragId(card.ownershipId) : `empty:${slot}`,
    disabled: !card,
  });
  const fit = card && slotPosition ? positionFit(slotPosition, card.position) : 4;
  const style = card ? RARITY_STYLE[card.rarity] : null;
  const label = card
    ? `${slotPosition ?? "Bench"}: ${card.name}, ${card.overall} ${card.position}${captain ? ", captain" : ""}${fit < 4 ? ", out of position" : ""}`
    : `Empty ${slotPosition ?? "bench"} slot`;

  return (
    <div ref={setDropRef} className="group/token relative w-full">
      <button
        ref={setDragRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={onActivate}
        aria-label={label}
        aria-pressed={picked}
        className={cn(
          "relative flex w-full touch-none flex-col items-center rounded-xl border text-center shadow-lg outline-none transition",
          "focus-visible:ring-3 focus-visible:ring-ring",
          card ? cn("bg-gradient-to-b", style?.face, style?.ink, "border-white/20") : "border-dashed border-white/40 bg-black/25 text-white/70",
          compact ? "px-1 py-1.5" : "px-1 py-1.5 sm:py-2",
          isOver && "scale-105 ring-3 ring-gold",
          highlight && !isOver && "ring-2 ring-primary/70",
          picked && "ring-3 ring-gold",
          isDragging && "opacity-30",
        )}
      >
        {card ? (
          <>
            <span className="flex w-full items-start justify-between px-0.5 leading-none">
              <span className="text-base font-black tabular-nums sm:text-lg">{card.overall}</span>
              <span className={cn("text-[9px] font-bold sm:text-[10px]", fit === 4 ? style?.accent : fit === 2 ? "text-amber-300" : "text-red-300")}>
                {card.position}
              </span>
            </span>
            <span className="mt-0.5 w-full truncate text-[10px] font-semibold sm:text-[11px]">{shortName(card.card.player)}</span>
            {chem && (
              <span className="mt-1">
                <ChemDots dots={chem.dots} label={`Chemistry ${chem.points} of 10`} />
              </span>
            )}
          </>
        ) : (
          <span className="py-2 text-[10px] font-bold sm:py-3 sm:text-xs">{slotPosition ?? "SUB"}</span>
        )}
        {captain && (
          <span className="absolute -left-1.5 -top-1.5 rounded-full bg-gold px-1.5 text-[10px] font-black leading-4 text-black ring-2 ring-background" aria-hidden>
            C
          </span>
        )}
      </button>
      {card && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${card.name} from squad`}
          // Pointer devices only: on touch, "tap → Remove from squad" is easier to hit.
          className="absolute -right-2 -top-2 z-10 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow hover:text-foreground focus-visible:flex [@media(hover:hover)]:group-focus-within/token:flex [@media(hover:hover)]:group-hover/token:flex"
        >
          <X className="size-3" />
        </button>
      )}
      {slotPosition && card && fit < 4 && (
        <span className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/60 px-1 text-[9px] font-semibold text-white/80">
          {slotPosition}
        </span>
      )}
    </div>
  );
}

/** A collection card that is not in the squad. */
export function PoolRow({
  card,
  picked,
  onActivate,
  onAdd,
}: {
  card: BuilderCard;
  picked: boolean;
  onActivate: () => void;
  onAdd: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: cardDragId(card.ownershipId) });
  const style = RARITY_STYLE[card.rarity];
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background/40 pr-1.5 transition",
        picked && "ring-2 ring-gold",
        isDragging && "opacity-30",
      )}
    >
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={onActivate}
        aria-pressed={picked}
        aria-label={`${card.name}, ${card.overall} ${card.position}. Select to place on the pitch.`}
        className="flex min-w-0 flex-1 touch-none items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <span className={cn("flex size-9 shrink-0 flex-col items-center justify-center rounded-md bg-gradient-to-b leading-none", style.face, style.ink)}>
          <span className="text-sm font-black tabular-nums">{card.overall}</span>
          <span className="text-[9px] font-bold">{card.position}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{card.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {card.club} · {card.nationality}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onAdd}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
        aria-label={`Add ${card.name} to the squad`}
      >
        Add
      </button>
    </li>
  );
}

export function PoolDropZone({ children, active }: { children: React.ReactNode; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_DROP_ID });
  return (
    <div ref={setNodeRef} className={cn("rounded-xl transition", active && "ring-2 ring-dashed ring-muted-foreground/40", isOver && "bg-destructive/10 ring-destructive/60")}>
      {children}
    </div>
  );
}
