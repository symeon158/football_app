"use client";

import { Copy, Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { createSquad, deleteSquad, setActiveSquad, updateSquadIdentity } from "@/app/(game)/team/actions";
import { Crest } from "@/components/game/crest";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CREST_TEMPLATES, type ActionResult } from "@/lib/validation/team";

export type SquadView = {
  id: string;
  name: string;
  logoTemplate: string;
  primaryColor: string;
  secondaryColor: string;
  formation: string;
  tactic: string;
  isActive: boolean;
  overall: number;
  chemistry: number;
  players: number;
};

const MAX_SQUADS = 5;

type Identity = Pick<SquadView, "name" | "logoTemplate" | "primaryColor" | "secondaryColor">;

export function ClubManager({ squads: fromServer }: { squads: SquadView[] }) {
  // Saved identity edits are shown immediately, so the card never shows stale
  // values between the "updated" message and the refreshed server props.
  const [saved, setSaved] = useState<Record<string, Identity>>({});
  const squads = fromServer.map((s) => ({ ...s, ...saved[s.id] }));
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>(squads.find((s) => s.isActive)?.id ?? "");

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setStatus(r);
      if (r.ok) setEditing(null);
    });

  return (
    <div className="space-y-6">
      {status && (
        <p role={status.ok ? "status" : "alert"} className={cn("rounded-lg px-3 py-2 text-sm", status.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
          {status.message}
        </p>
      )}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {squads.map((s) => (
          <li key={s.id} className={cn("rounded-2xl border bg-card/70 p-4 backdrop-blur", s.isActive && "border-primary/50")}>
            {editing === s.id ? (
              <IdentityForm
                squad={s}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(v) =>
                  run(async () => {
                    const r = await updateSquadIdentity({ teamId: s.id, ...v });
                    if (r.ok) setSaved((prev) => ({ ...prev, [s.id]: { ...v, name: v.name.trim() } }));
                    return r;
                  })
                }
              />
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <Crest template={s.logoTemplate} primary={s.primaryColor} secondary={s.secondaryColor} name={s.name} className="size-14" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold">{s.name}</h2>
                    <p className="text-xs capitalize text-muted-foreground">{s.formation} · {s.tactic} · {s.players} players</p>
                    {s.isActive && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <Star className="size-3 fill-current" /> Active squad
                      </span>
                    )}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-background/40 py-2">
                    <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Rating</dt>
                    <dd className="text-xl font-black tabular-nums">{s.overall}</dd>
                  </div>
                  <div className="rounded-lg bg-background/40 py-2">
                    <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Chemistry</dt>
                    <dd className="text-xl font-black tabular-nums">{s.chemistry}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/team?team=${s.id}`} className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}>
                    <Users className="size-3.5" /> Line-up
                  </Link>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(s.id)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  {!s.isActive && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setActiveSquad(s.id))}>
                      Set active
                    </Button>
                  )}
                  {squads.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Delete “${s.name}”? Your cards stay in your collection.`)) run(() => deleteSquad(s.id));
                      }}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}

        {squads.length < MAX_SQUADS && (
          <li className="rounded-2xl border border-dashed p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => createSquad({ name: newName, copyFrom: copyFrom || null }));
              }}
              className="flex h-full flex-col gap-3"
            >
              <h2 className="flex items-center gap-2 font-semibold"><Plus className="size-4" /> New squad</h2>
              <label className="text-xs font-medium text-muted-foreground">
                Name
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} required minLength={3} maxLength={30} placeholder="e.g. Cup Squad" className="mt-1 h-9 text-foreground" />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5"><Copy className="size-3" /> Start from</span>
                <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-background/60 px-2.5 text-sm text-foreground">
                  <option value="">Empty squad</option>
                  {squads.map((s) => <option key={s.id} value={s.id}>Copy of {s.name}</option>)}
                </select>
              </label>
              <Button type="submit" disabled={pending || newName.trim().length < 3} className="mt-auto">
                Create squad
              </Button>
              <p className="text-[11px] text-muted-foreground">{squads.length} of {MAX_SQUADS} squads used.</p>
            </form>
          </li>
        )}
      </ul>
    </div>
  );
}

function IdentityForm({
  squad,
  pending,
  onSave,
  onCancel,
}: {
  squad: SquadView;
  pending: boolean;
  onSave: (v: { name: string; logoTemplate: (typeof CREST_TEMPLATES)[number]; primaryColor: string; secondaryColor: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(squad.name);
  const [logo, setLogo] = useState(squad.logoTemplate as (typeof CREST_TEMPLATES)[number]);
  const [primary, setPrimary] = useState(squad.primaryColor);
  const [secondary, setSecondary] = useState(squad.secondaryColor);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, logoTemplate: logo, primaryColor: primary, secondaryColor: secondary });
      }}
      className="space-y-3"
    >
      <div className="flex items-center gap-3">
        <Crest template={logo} primary={primary} secondary={secondary} name={name || "?"} className="size-14" />
        <label className="flex-1 text-xs font-medium text-muted-foreground">
          Squad name
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={30} className="mt-1 h-9 text-foreground" />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Crest</legend>
        <div className="grid grid-cols-6 gap-1.5">
          {CREST_TEMPLATES.map((t) => (
            <label key={t} className={cn("flex cursor-pointer justify-center rounded-lg border p-1 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring")}>
              <input type="radio" name={`crest-${squad.id}`} value={t} checked={logo === t} onChange={() => setLogo(t)} className="sr-only" />
              <Crest template={t} primary={primary} secondary={secondary} name={name || "?"} className="size-8" />
              <span className="sr-only">Crest style {t.slice(-1)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-4 text-xs font-medium text-muted-foreground">
        <label className="flex items-center gap-2">
          Primary
          <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent" />
        </label>
        <label className="flex items-center gap-2">
          Secondary
          <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent" />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
