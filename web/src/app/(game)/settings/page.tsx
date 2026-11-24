import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Panel } from "@/components/dashboard/panel";
import { ChangePasswordForm, DeleteAccountForm, ExportDataButton } from "@/components/settings/settings-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Settings</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Account &amp; privacy</h1>
      </header>
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  const viewer = await getViewer();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? "—";

  return (
    <>
      <Panel title="Account">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Username</dt><dd className="font-medium">@{viewer.username}</dd></div>
          <div><dt className="text-xs text-muted-foreground">E-mail (private)</dt><dd className="font-medium">{email}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Your display name and avatar are on your <Link href="/profile" className="text-primary underline">profile</Link>. Your e-mail is never shown to other managers.
        </p>
      </Panel>

      <Panel title="Password">
        <ChangePasswordForm />
      </Panel>

      <Panel title="Your data">
        <p className="mb-3 text-sm text-muted-foreground">
          Download everything Football Legends stores about your account as a JSON file: profile, coins and every transaction,
          cards, squads, stadium, matches, packs, challenges and badges.
        </p>
        <ExportDataButton username={viewer.username} />
      </Panel>

      <Panel title="Fair play" className="text-sm">
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Football Coins are virtual, earned only by playing, and cannot be bought, sold or exchanged for money.</li>
          <li>Pack odds are published in full on every pack.</li>
          <li>All players, clubs and crests are fictional.</li>
        </ul>
      </Panel>

      <Panel title="Delete account" className="border-destructive/30">
        <DeleteAccountForm username={viewer.username} />
      </Panel>
    </>
  );
}
