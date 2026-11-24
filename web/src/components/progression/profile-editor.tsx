"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { updateProfile, type ClaimResult } from "@/app/(game)/challenges/actions";
import { Avatar, AVATAR_KEYS } from "@/components/game/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProfileEditor({ displayName, avatarKey }: { displayName: string; avatarKey: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [avatar, setAvatar] = useState(avatarKey);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setResult(null); setOpen(true); }}>
          <Pencil className="size-3.5" /> Edit profile
        </Button>
        {result?.ok && <span role="status" className="text-sm text-primary">{result.message}</span>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateProfile({ displayName: name, avatarKey: avatar });
          setResult(r);
          if (r.ok) setOpen(false);
        });
      }}
      className="space-y-4 rounded-2xl border bg-card/70 p-4 backdrop-blur"
    >
      <label className="block max-w-sm text-xs font-medium text-muted-foreground">
        Display name
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className="mt-1 h-10 text-base text-foreground" />
      </label>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Avatar</legend>
        <div className="flex flex-wrap gap-2">
          {AVATAR_KEYS.map((k) => (
            <label key={k} className="cursor-pointer rounded-full p-0.5 ring-2 ring-transparent has-[:checked]:ring-primary has-[:focus-visible]:ring-ring">
              <input type="radio" name="avatar" value={k} checked={avatar === k} onChange={() => setAvatar(k)} className="sr-only" />
              <Avatar avatarKey={k} name={name || "?"} className="size-11" />
            </label>
          ))}
        </div>
      </fieldset>
      {result && !result.ok && <p role="alert" className="text-sm text-destructive">{result.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
