"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle, RotateCcw, Save, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { saveLineup } from "@/app/(game)/team/actions";
import { Button } from "@/components/ui/button";
import type { BuilderCard } from "@/lib/data/team";
import {
  autoPick,
  bestStarter,
  BENCH_SLOTS,
  firstFreeBenchSlot,
  placeCard,
  positionFit,
  removeFromSlot,
  STARTER_SLOTS,
  summarize,
  validateLineup,
  type FormationSlot,
  type Lineup,
} from "@/lib/game/lineup";
import { POSITIONS } from "@/lib/validation/collection";
import { FORMATIONS, TACTIC_INFO, TACTICS } from "@/lib/validation/team";
import { cn } from "@/lib/utils";

import { PoolDropZone, PoolRow, POOL_DROP_ID, SlotToken } from "./tokens";

type Formation = (typeof FORMATIONS)[number];
type Tactic = (typeof TACTICS)[number];

type Props = {
  teamId: string;
  initial: { formation: Formation; tactic: Tactic; captain: string | null; lineup: Lineup };
  formations: Record<Formation, FormationSlot[]>;
  cards: BuilderCard[];
};

const snapshot = (s: { formation: string; tactic: string; captain: string | null; lineup: Lineup }) =>
  JSON.stringify([s.formation, s.tactic, s.captain, Object.entries(s.lineup).sort(([a], [b]) => Number(a) - Number(b))]);

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background/60 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function TeamBuilder({ teamId, initial, formations, cards }: Props) {
  const [formation, setFormation] = useState<Formation>(initial.formation);
  const [tactic, setTactic] = useState<Tactic>(initial.tactic);
  const [lineup, setLineup] = useState<Lineup>(initial.lineup);
  const [captain, setCaptain] = useState<string | null>(initial.captain);
  const [picked, setPicked] = useState<string | null>(null); // ownershipId selected by tap
  const [dragging, setDragging] = useState<string | null>(null);
  const [poolFilter, setPoolFilter] = useState<string>("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const byId = useMemo(() => new Map(cards.map((c) => [c.ownershipId, c])), [cards]);
  const slots = formations[formation];
  const summary = useMemo(() => summarize(lineup, slots, byId), [lineup, slots, byId]);
  const problems = validateLineup(lineup, captain, byId);
  const dirty = snapshot({ formation, tactic, captain, lineup }) !== snapshot(initial);

  const slotOf = (ownershipId: string) => {
    const entry = Object.entries(lineup).find(([, id]) => id === ownershipId);
    return entry ? Number(entry[0]) : null;
  };
  const inSquad = new Set(Object.values(lineup));
  const squadPlayers = new Set(Object.values(lineup).map((id) => byId.get(id)?.playerId));
  const pool = cards.filter((c) => !inSquad.has(c.ownershipId) && (!poolFilter || c.position === poolFilter));

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // A captain who leaves the XI loses the armband.
  const apply = (next: Lineup) => {
    setLineup(next);
    setStatus(null);
    if (captain && !Object.entries(next).some(([s, id]) => id === captain && Number(s) < STARTER_SLOTS)) setCaptain(null);
  };

  const place = (slot: number, ownershipId: string) => apply(placeCard(lineup, slot, ownershipId, byId));
  const remove = (ownershipId: string) => {
    const slot = slotOf(ownershipId);
    if (slot !== null) apply(removeFromSlot(lineup, slot));
  };

  /** "Add" from the pool: best empty natural slot, else related, else bench. */
  const addToSquad = (card: BuilderCard) => {
    const empty = slots.filter((s) => !lineup[s.slot]).sort((a, b) => positionFit(b.position, card.position) - positionFit(a.position, card.position));
    const target = empty[0] && positionFit(empty[0].position, card.position) > 0 ? empty[0].slot : firstFreeBenchSlot(lineup);
    if (target === null) {
      setStatus({ ok: false, text: "Your squad is full. Remove a player first." });
      return;
    }
    place(target, card.ownershipId);
    setPicked(null);
  };

  /** Tap-to-place: tap a card, then tap a slot (or another card to swap). */
  const activateSlot = (slot: number) => {
    const occupant = lineup[slot];
    if (picked) {
      if (picked !== occupant) place(slot, picked);
      setPicked(null);
    } else if (occupant) {
      setPicked(occupant);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const onDragStart = (e: DragStartEvent) => {
    setDragging(String(e.active.id).replace("card:", ""));
    setPicked(null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const id = String(e.active.id).replace("card:", "");
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    if (over === POOL_DROP_ID) remove(id);
    else if (over.startsWith("slot:")) place(Number(over.slice(5)), id);
  };

  const save = () =>
    startSaving(async () => {
      const result = await saveLineup({
        teamId,
        formation,
        tactic,
        captain,
        slots: Object.entries(lineup).map(([slot, ownershipId]) => ({ slot: Number(slot), ownershipId })),
      });
      setStatus({ ok: result.ok, text: result.message ?? (result.ok ? "Saved." : "Could not save.") });
    });

  const reset = () => {
    setFormation(initial.formation);
    setTactic(initial.tactic);
    setLineup(initial.lineup);
    setCaptain(initial.captain);
    setPicked(null);
    setStatus(null);
  };

  const autoFill = () => {
    const next = autoPick(slots, cards);
    apply(next);
    setCaptain(bestStarter(summarize(next, slots, byId).starters));
    setPicked(null);
  };

  const pickedCard = picked ? byId.get(picked) : undefined;
  const pickedSlot = picked ? slotOf(picked) : null;
  const draggedCard = dragging ? byId.get(dragging) : undefined;
  const chemColor = summary.chemistry.team >= 70 ? "text-primary" : summary.chemistry.team >= 40 ? "text-gold" : "text-destructive";

  return (
    <DndContext id="team-builder" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        {/* ----------------------------------------------------- pitch column */}
        <div className="min-w-0 space-y-4">
          {/* Summary bar */}
          <section aria-label="Team summary" className="grid grid-cols-2 gap-3 rounded-2xl border bg-card/70 p-3 backdrop-blur sm:grid-cols-4 sm:p-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Rating</p>
              <p className="text-3xl font-black tabular-nums" aria-live="polite">{summary.overall}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Chemistry</p>
              <p className={cn("text-3xl font-black tabular-nums", chemColor)} aria-live="polite">{summary.chemistry.team}</p>
            </div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Formation
              <select value={formation} onChange={(e) => { setFormation(e.target.value as Formation); setStatus(null); }} className={cn(selectClass, "mt-1 normal-case tracking-normal text-foreground")}>
                {FORMATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Tactic
              <select value={tactic} onChange={(e) => { setTactic(e.target.value as Tactic); setStatus(null); }} className={cn(selectClass, "mt-1 normal-case tracking-normal text-foreground")}>
                {TACTICS.map((t) => <option key={t} value={t}>{TACTIC_INFO[t].label}</option>)}
              </select>
            </label>
          </section>

          {/* Pitch */}
          <section aria-label={`Pitch, ${formation}`} className="group/pitch relative mx-auto aspect-[68/100] w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(180deg,#1f7a3c_0_10%,#1b6e36_10%_20%)]" />
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(255_255_255/0.12),transparent_60%)]" />
            <svg aria-hidden viewBox="0 0 68 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" stroke="rgb(255 255 255 / 0.45)" strokeWidth="0.35">
              <rect x="2" y="2" width="64" height="96" />
              <line x1="2" y1="50" x2="66" y2="50" />
              <circle cx="34" cy="50" r="8.5" />
              <rect x="14" y="2" width="40" height="15" />
              <rect x="25" y="2" width="18" height="5.5" />
              <rect x="14" y="83" width="40" height="15" />
              <rect x="25" y="92.5" width="18" height="5.5" />
            </svg>
            {slots.map((s) => {
              const id = lineup[s.slot];
              const card = id ? byId.get(id) : undefined;
              return (
                <div key={s.slot} className="absolute w-[18%] min-w-[3.5rem] max-w-[5.5rem] -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-500 motion-reduce:transition-none" style={{ left: `${s.x}%`, top: `${100 - s.y}%` }}>
                  <SlotToken
                    slot={s.slot}
                    slotPosition={s.position}
                    card={card}
                    chem={card ? summary.chemistry.perPlayer.get(card.ownershipId) : undefined}
                    captain={Boolean(card && card.ownershipId === captain)}
                    picked={Boolean(card && card.ownershipId === picked)}
                    highlight={Boolean(pickedCard && !card)}
                    onActivate={() => activateSlot(s.slot)}
                    onRemove={card ? () => remove(card.ownershipId) : undefined}
                  />
                </div>
              );
            })}
          </section>

          {/* Bench */}
          <section aria-labelledby="bench-heading" className="rounded-2xl border bg-card/70 p-3 backdrop-blur sm:p-4">
            <h2 id="bench-heading" className="mb-3 text-sm font-semibold">
              Substitutes <span className="font-normal text-muted-foreground">({Object.keys(lineup).filter((s) => Number(s) >= STARTER_SLOTS).length}/{BENCH_SLOTS})</span>
            </h2>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {Array.from({ length: BENCH_SLOTS }, (_, i) => STARTER_SLOTS + i).map((slot) => {
                const id = lineup[slot];
                const card = id ? byId.get(id) : undefined;
                return (
                  <SlotToken
                    key={slot}
                    slot={slot}
                    card={card}
                    compact
                    picked={Boolean(card && card.ownershipId === picked)}
                    highlight={Boolean(pickedCard && !card)}
                    onActivate={() => activateSlot(slot)}
                    onRemove={card ? () => remove(card.ownershipId) : undefined}
                  />
                );
              })}
            </div>
          </section>
        </div>

        {/* ----------------------------------------------------- side column */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section aria-label="Actions" className="space-y-3 rounded-2xl border bg-card/70 p-4 backdrop-blur">
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={!dirty || saving || problems.length > 0} className="flex-1 gap-2">
                <Save className="size-4" /> {saving ? "Saving…" : "Save line-up"}
              </Button>
              <Button variant="outline" onClick={reset} disabled={!dirty || saving} aria-label="Discard changes">
                <RotateCcw className="size-4" />
              </Button>
            </div>
            <Button variant="outline" onClick={autoFill} className="w-full gap-2">
              <Sparkles className="size-4" /> Auto-pick best XI
            </Button>
            <label className="block text-xs font-medium text-muted-foreground">
              Captain
              <select value={captain ?? ""} onChange={(e) => setCaptain(e.target.value || null)} className={cn(selectClass, "mt-1 text-foreground")}>
                <option value="">— No captain —</option>
                {summary.starters.map((s) => (
                  <option key={s.card.ownershipId} value={s.card.ownershipId}>
                    {s.card.name} ({s.card.overall} {s.card.position})
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">{TACTIC_INFO[tactic].description}</p>
            {status && (
              <p role={status.ok ? "status" : "alert"} className={cn("rounded-md px-3 py-2 text-sm", status.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
                {status.text}
              </p>
            )}
            {dirty && !status && <p className="text-xs text-gold">You have unsaved changes.</p>}
          </section>

          <section aria-label="Line ratings and warnings" className="rounded-2xl border bg-card/70 p-4 backdrop-blur">
            <dl className="grid grid-cols-4 gap-2 text-center">
              {(["GK", "DEF", "MID", "ATT"] as const).map((l) => (
                <div key={l} className="rounded-lg bg-background/40 py-2">
                  <dt className="text-[10px] font-semibold text-muted-foreground">{l}</dt>
                  <dd className="text-lg font-bold tabular-nums">{summary.lines[l] || "–"}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-3 space-y-1.5 text-xs">
              {summary.emptyStarterSlots > 0 && <Warning>{summary.emptyStarterSlots} empty starting slot(s) count as 0.</Warning>}
              {summary.outOfPosition > 0 && <Warning>{summary.outOfPosition} player(s) out of position — lower rating and chemistry.</Warning>}
              {problems.map((p, i) => (
                <Warning key={i}>
                  {p.code === "DUPLICATE_PLAYER" ? `${p.name} appears twice.` : p.code === "CAPTAIN_NOT_STARTER" ? "Captain must be a starter." : "Line-up contains an invalid entry."}
                </Warning>
              ))}
              {summary.emptyStarterSlots === 0 && summary.outOfPosition === 0 && problems.length === 0 && (
                <li className="flex items-center gap-1.5 text-primary"><Star className="size-3.5" /> Everyone is in a natural position.</li>
              )}
            </ul>
          </section>

          {/* Tap-to-place helper */}
          {pickedCard && (
            <div role="status" className="rounded-2xl border border-gold/40 bg-gold/10 p-3 text-sm">
              <p><span className="font-semibold">{pickedCard.name}</span> selected — tap a slot to place them{pickedSlot !== null ? " or swap" : ""}.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {pickedSlot !== null && pickedSlot < STARTER_SLOTS && (
                  <Button size="sm" variant="outline" onClick={() => { setCaptain(pickedCard.ownershipId); setPicked(null); }}>Make captain</Button>
                )}
                {pickedSlot !== null && (
                  <Button size="sm" variant="outline" onClick={() => { remove(pickedCard.ownershipId); setPicked(null); }}>Remove from squad</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>Cancel</Button>
              </div>
            </div>
          )}

          <section aria-labelledby="pool-heading" className="rounded-2xl border bg-card/70 p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="pool-heading" className="text-sm font-semibold">
                Your players <span className="font-normal text-muted-foreground">({pool.length})</span>
              </h2>
              <label>
                <span className="sr-only">Filter by position</span>
                <select value={poolFilter} onChange={(e) => setPoolFilter(e.target.value)} className={cn(selectClass, "h-8 w-auto")}>
                  <option value="">All</option>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <PoolDropZone active={Boolean(dragging && slotOf(dragging) !== null)}>
              {pool.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {dragging ? "Drop here to remove from the squad." : "Every card is in your squad."}
                </p>
              ) : (
                <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
                  {pool.map((c) => (
                    <PoolRow
                      key={c.ownershipId}
                      card={c}
                      picked={c.ownershipId === picked}
                      onActivate={() => setPicked(c.ownershipId === picked ? null : c.ownershipId)}
                      onAdd={() => addToSquad(c)}
                    />
                  ))}
                </ul>
              )}
              {squadPlayers.size > 0 && pool.some((c) => squadPlayers.has(c.playerId)) && (
                <p className="mt-2 text-[11px] text-muted-foreground">Duplicates of players already in the squad replace that copy.</p>
              )}
            </PoolDropZone>
          </section>
        </div>
      </div>

      {/* Phones/tablets: keep Save in reach while editing (sits above the tab bar). */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 px-4 py-2.5 backdrop-blur-lg lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <p className="flex-1 text-xs text-gold">{problems.length ? "Fix the warnings to save." : "Unsaved changes"}</p>
            <Button size="sm" variant="outline" onClick={reset} disabled={saving}>Discard</Button>
            <Button size="sm" onClick={save} disabled={saving || problems.length > 0} className="gap-1.5">
              <Save className="size-3.5" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}

      <DragOverlay dropAnimation={null}>
        {draggedCard && (
          <div className="flex w-20 flex-col items-center rounded-xl border border-gold bg-card px-1 py-2 text-center shadow-2xl">
            <span className="text-lg font-black">{draggedCard.overall}</span>
            <span className="w-full truncate text-[11px] font-semibold">{draggedCard.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5 text-gold">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}
