import { ArrowLeft, ChevronRight, Search, Swords } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getChallengeActivity } from "@/lib/data/friendly";
import { getLeaderboard } from "@/lib/data/progression";
import { getViewer } from "@/lib/data/viewer";
import { usernameSchema } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Challenge a manager" };

export default function ChallengePickerPage({ searchParams }: PageProps<"/matches/challenge">) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Link href="/matches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Match Centre
      </Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Match Centre</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Challenge a manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Play against another manager&apos;s real squad. They don&apos;t need to be online — they&apos;ll see the result.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <PickerContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PickerContent({ searchParams }: Pick<PageProps<"/matches/challenge">, "searchParams">) {
  const viewer = await getViewer();
  const raw = (await searchParams).manager;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const invalid = query !== "" && !usernameSchema.safeParse(query).success;
  if (query && !invalid) redirect(`/matches/challenge/${encodeURIComponent(query)}`);

  const [activity, top] = await Promise.all([getChallengeActivity(viewer.userId), getLeaderboard("level", "all", 15)]);
  const managers = top.filter((m) => !m.is_me).slice(0, 12);

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
      <div className="space-y-4 sm:space-y-6">
        <Panel title="Find a manager">
          <form action="/matches/challenge" className="flex gap-2">
            <label htmlFor="manager" className="sr-only">Manager name</label>
            <Input id="manager" name="manager" placeholder="Manager name, e.g. alex_fc" defaultValue={query} autoComplete="off" className="h-10" />
            <Button type="submit" className="h-10 gap-1.5"><Search className="size-4" /> Find</Button>
          </form>
          {invalid && <p role="alert" className="mt-2 text-sm text-destructive">Manager names are 3–20 letters, numbers or _.</p>}
          <p className="mt-2 text-xs text-muted-foreground">Ask your friends for their manager name — it&apos;s shown on their profile.</p>
        </Panel>

        <Panel title="Recent opponents">
          {activity.recentOpponents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Managers you challenge will appear here for a quick rematch.</p>
          ) : (
            <ManagerList rows={activity.recentOpponents.map((o) => ({ username: o.username, sub: `${o.teamName} · Lv ${o.level}` }))} />
          )}
        </Panel>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <Panel title="Challenges against your club">
          {activity.againstMe.length === 0 ? (
            <EmptyState icon={<Swords className="size-5" />} title="No challenges yet" body="When another manager plays your club, the result shows up here." />
          ) : (
            <ul className="divide-y">
              {activity.againstMe.map((m) => {
                const r = m.myGoals > m.theirGoals ? "Won" : m.myGoals === m.theirGoals ? "Drew" : "Lost";
                return (
                  <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Link href={`/matches/${m.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                      <span className="font-semibold">{m.challenger}</span> challenged you · {r}{" "}
                      <span className="font-bold tabular-nums">{m.myGoals}–{m.theirGoals}</span>
                    </Link>
                    <Link href={`/matches/challenge/${encodeURIComponent(m.challenger)}`} className="shrink-0 text-xs font-medium text-primary hover:underline">
                      Challenge back
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Top managers">
          {managers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other managers yet — invite your friends!</p>
          ) : (
            <ManagerList rows={managers.map((m) => ({ username: m.username, sub: `Lv ${m.level}` }))} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function ManagerList({ rows }: { rows: { username: string; sub: string }[] }) {
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.username}>
          <Link href={`/matches/challenge/${encodeURIComponent(r.username)}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{r.username}</span> <span className="text-muted-foreground">· {r.sub}</span>
            </span>
            <span className="flex items-center gap-0.5 text-xs font-medium text-primary">Challenge <ChevronRight className="size-3.5" /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
