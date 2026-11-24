"use client";

import { Download, KeyRound, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { changePassword, deleteMyAccount, exportMyData, type SettingsResult } from "@/app/(game)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Status({ r }: { r: SettingsResult | null }) {
  if (!r?.message) return null;
  return (
    <p role={r.ok ? "status" : "alert"} className={cn("rounded-md px-3 py-2 text-sm", r.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
      {r.message}
    </p>
  );
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [r, setR] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await changePassword({ current, next });
          setR(res);
          if (res.ok) { setCurrent(""); setNext(""); }
        });
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">
          Current password
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="mt-1 h-10 text-foreground" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          New password
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} className="mt-1 h-10 text-foreground" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">8+ characters with at least one letter and one number.</p>
      <Status r={r} />
      <Button type="submit" disabled={pending} className="gap-1.5"><KeyRound className="size-4" /> {pending ? "Saving…" : "Change password"}</Button>
    </form>
  );
}

export function ExportDataButton({ username }: { username: string }) {
  const [r, setR] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={pending}
        className="gap-1.5"
        onClick={() =>
          start(async () => {
            const res = await exportMyData();
            if (res.ok && res.data) {
              const url = URL.createObjectURL(new Blob([res.data], { type: "application/json" }));
              const a = Object.assign(document.createElement("a"), { href: url, download: `football-legends-${username}.json` });
              a.click();
              URL.revokeObjectURL(url);
              setR({ ok: true, message: "Your data has been downloaded." });
            } else setR(res);
          })
        }
      >
        <Download className="size-4" /> {pending ? "Preparing…" : "Download my data"}
      </Button>
      <Status r={r} />
    </div>
  );
}

export function DeleteAccountForm({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [confirmUsername, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [r, setR] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button variant="outline" className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete my account…
      </Button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setR(await deleteMyAccount({ confirmUsername, password })));
      }}
      className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
    >
      <p className="text-sm">
        This permanently deletes your club, cards, coins, matches and badges. <strong>It cannot be undone.</strong> Type{" "}
        <code className="rounded bg-muted px-1">{username}</code> and your password to confirm.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">
          Username
          <Input value={confirmUsername} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required className="mt-1 h-10 text-foreground" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Password
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1 h-10 text-foreground" />
        </label>
      </div>
      <Status r={r} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || confirmUsername.trim().toLowerCase() !== username.toLowerCase()} className="gap-1.5 bg-destructive text-white hover:bg-destructive/90">
          <Trash2 className="size-4" /> {pending ? "Deleting…" : "Delete permanently"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
