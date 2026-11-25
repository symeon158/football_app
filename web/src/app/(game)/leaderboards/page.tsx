import { Medal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/dashboard/panel";
import { Avatar } from "@/components/game/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { BOARDS, getAreaTable, getLeaderboard, type Board } from "@/lib/data/progression";
import { getViewer } from "@/lib/data/viewer";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboards" };

const isBoard = (v: unknown): v is Board => typeof v === "string" && v in BOARDS;

export default function LeaderboardsPage({ searchParams }: PageProps<"/leaderboards">) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Leaderboards</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Top managers</h1>
      </header>
      <Suspense fallback={<Skeleton className="h-[36rem] rounded-2xl" />}>
        <BoardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BoardContent({ searchParams }: Pick<PageProps<"/leaderboards">, "searchParams">) {
  await getViewer();
  const params = await searchParams;
  if (params.board === "areas") return <AreaBoard period={params.period === "all" ? "all" : "week"} />;
  const board: Board = isBoard(params.board) ? params.board : "level";
  const period = BOARDS[board].weekly && params.period === "week" ? "week" : "all";
  const rows = await getLeaderboard(board, period);
  const me = rows.find((r) => r.is_me);
  const href = (b: Board, p: "all" | "week") => `/leaderboards?board=${b}${p === "week" && BOARDS[b].weekly ? "&period=week" : ""}`;

  return (
    <>
      <nav aria-label="Leaderboard" className="flex flex-wrap gap-2">
        {(Object.keys(BOARDS) as Board[]).map((b) => (
          <Link
            key={b}
            href={href(b, period)}
            aria-current={b === board ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", b === board ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {BOARDS[b].label}
          </Link>
        ))}
        <Link href="/leaderboards?board=areas" className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          Neighbourhoods
        </Link>
      </nav>
      {BOARDS[board].weekly && (
        <nav aria-label="Period" className="flex gap-1 rounded-lg border bg-card/60 p-1 text-sm sm:w-fit">
          {(["week", "all"] as const).map((p) => (
            <Link key={p} href={href(board, p)} aria-current={p === period ? "page" : undefined}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-center", p === period ? "bg-accent font-medium text-foreground" : "text-muted-foreground")}>
              {p === "week" ? "This week" : "All time"}
            </Link>
          ))}
        </nav>
      )}

      {me && (
        <p className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          You&apos;re <span className="font-bold">#{me.rank}</span> with <span className="font-bold tabular-nums">{formatNumber(me.value)}</span> {BOARDS[board].unit}.
        </p>
      )}

      {rows.filter((r) => r.value > 0).length === 0 ? (
        <EmptyState icon={<Medal className="size-5" />} title="No scores yet" body="Play matches to get on the board." />
      ) : (
        <ol className="overflow-hidden rounded-2xl border bg-card/70 backdrop-blur">
          {rows.map((r) => (
            <li key={`${r.rank}-${r.username}`} className={cn("flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0", r.is_me && "bg-primary/10")}>
              <span className={cn("w-8 text-center font-black tabular-nums", r.rank === 1 ? "text-gold" : r.rank <= 3 ? "text-foreground" : "text-muted-foreground")}>
                {r.rank}
              </span>
              <Avatar avatarKey={r.avatar_key} name={r.display_name ?? r.username} className="size-9" />
              <Link href={`/managers/${encodeURIComponent(r.username)}`} className="min-w-0 flex-1 hover:text-primary">
                <span className="block truncate font-medium">{r.display_name ?? r.username}{r.is_me && <span className="ml-1.5 text-[10px] font-semibold uppercase text-primary">you</span>}</span>
                <span className="block truncate text-xs text-muted-foreground">@{r.username} · Lv. {r.level}</span>
              </Link>
              <span className="text-right">
                <span className="block font-bold tabular-nums">{formatNumber(r.value)}</span>
                <span className="block text-[11px] text-muted-foreground">{BOARDS[board].unit}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** Which neighbourhood wins most: every club that set the same area counts. */
async function AreaBoard({ period }: { period: "week" | "all" }) {
  const rows = await getAreaTable(period);
  const mine = rows.find((r) => r.is_mine);
  return (
    <>
      <nav aria-label="Leaderboard" className="flex flex-wrap gap-2">
        {(Object.keys(BOARDS) as Board[]).map((b) => (
          <Link key={b} href={`/leaderboards?board=${b}`} className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            {BOARDS[b].label}
          </Link>
        ))}
        <span aria-current="page" className="rounded-full border border-primary bg-primary px-3 py-1.5 text-sm text-primary-foreground">Neighbourhoods</span>
      </nav>
      <nav aria-label="Period" className="flex gap-1 rounded-lg border bg-card/60 p-1 text-sm sm:w-fit">
        {(["week", "all"] as const).map((p) => (
          <Link key={p} href={`/leaderboards?board=areas&period=${p}`} aria-current={p === period ? "page" : undefined}
            className={cn("flex-1 rounded-md px-3 py-1.5 text-center", p === period ? "bg-accent font-medium text-foreground" : "text-muted-foreground")}>
            {p === "week" ? "This week" : "All time"}
          </Link>
        ))}
      </nav>
      {mine ? (
        <p className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          📍 <span className="font-bold">{mine.area}</span> is <span className="font-bold">#{rows.indexOf(mine) + 1}</span> with{" "}
          <span className="font-bold tabular-nums">{formatNumber(mine.wins)}</span> wins from {mine.managers} {mine.managers === 1 ? "club" : "clubs"}.
        </p>
      ) : (
        <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          Represent your area: set your neighbourhood on your <Link href="/stadium" className="font-semibold underline">home ground</Link> page.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<Medal className="size-5" />} title="No neighbourhoods yet" body="Clubs appear here once they set their area." />
      ) : (
        <ol className="overflow-hidden rounded-2xl border bg-card/70 backdrop-blur">
          {rows.map((r, i) => (
            <li key={r.area.toLowerCase()} className={cn("flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0", r.is_mine && "bg-primary/10")}>
              <span className={cn("w-8 text-center font-black tabular-nums", i === 0 ? "text-gold" : i < 3 ? "text-foreground" : "text-muted-foreground")}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">📍 {r.area}{r.is_mine && <span className="ml-1.5 text-[10px] font-semibold uppercase text-primary">yours</span>}</span>
                <span className="block text-xs text-muted-foreground">{r.managers} {r.managers === 1 ? "club" : "clubs"} · {formatNumber(r.goals)} goals</span>
              </span>
              <span className="text-right">
                <span className="block font-bold tabular-nums">{formatNumber(r.wins)}</span>
                <span className="block text-[11px] text-muted-foreground">wins</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
